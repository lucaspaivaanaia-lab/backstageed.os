"use server";

import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  clientCreateSchema,
  briefingSchema,
  type BriefingInput,
} from "@/lib/validation/clients";
import { runStructuredExtraction } from "@/lib/ai/structured-extraction";

type CreateClientResult = { success: true; clientId: string } | { error: string };

/**
 * Privileged multi-step client-creation transaction: clients insert +
 * pm_clients insert.
 *
 * Authorization is an APP-LAYER check (profiles.status === "approved" &&
 * role in ("admin","pm")) performed via the RLS-scoped `createClient()`
 * BEFORE any `createAdminClient()` privileged write — this check, not RLS,
 * is the actual security boundary for this transaction (01-03-PLAN.md
 * threat T-01-09; 01-RESEARCH.md Architecture Patterns Pattern 2).
 *
 * `pm_clients` is only ever written to here, via `createAdminClient()` —
 * never through a broadened RLS policy (01-RESEARCH.md Pitfall 3).
 */
export async function createClientRecord(
  formData: FormData
): Promise<CreateClientResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Não autenticado." };

  const { data: profile } = await supabase
    .from("profiles")
    .select("role, status")
    .eq("id", user.id)
    .single();

  const isAuthorized =
    profile?.status === "approved" &&
    (profile.role === "admin" || profile.role === "pm");
  if (!isAuthorized) return { error: "Sem permissão para criar clientes." };

  const parsed = clientCreateSchema.safeParse({
    name: formData.get("name"),
    pmIds: formData.getAll("pmIds"),
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Dados inválidos." };
  }

  const admin = createAdminClient();

  const { data: client, error: insertError } = await admin
    .from("clients")
    .insert({ name: parsed.data.name })
    .select("id, name")
    .single();
  if (insertError || !client) {
    return { error: "Não foi possível criar o cliente." };
  }

  // Open Question 1 (RESOLVED): always include the creating PM/Admin, plus
  // whoever they explicitly selected — never silently drop the creator even
  // if they deselected themselves, since Sub-phase 1A's own definition of
  // done requires the creating PM to see their own client afterward.
  const pmIds =
    parsed.data.pmIds.length > 0
      ? Array.from(new Set([...parsed.data.pmIds, user.id]))
      : [user.id];
  await admin
    .from("pm_clients")
    .insert(pmIds.map((pm_id) => ({ pm_id, client_id: client.id })));

  return { success: true, clientId: client.id };
}

/**
 * Read-only roster of approved PMs, used to populate the D-13 multi-select
 * picker for BOTH Admin and PM callers. Closes the `profiles_select_own_or_admin`
 * RLS gap (a PM can only read their OWN profile row) via a privileged,
 * display-only `createAdminClient()` read — never used for a write.
 */
export async function listPmRoster(): Promise<{ id: string; email: string }[]> {
  const admin = createAdminClient();
  const { data } = await admin
    .from("profiles")
    .select("id, email")
    .eq("role", "pm")
    .eq("status", "approved");

  return (data ?? []).map((row) => ({ id: row.id, email: row.email ?? "" }));
}

/**
 * Read-only resolution of PM ids -> display email, used by the list pages
 * (Task 2) to render PM names on clients the viewer is already
 * RLS-authorized to see via `clients_select_scoped`. Closes the
 * `pm_clients_select_own_or_admin` RLS gap the same way as `listPmRoster()`.
 */
export async function resolvePmNames(
  pmIds: string[]
): Promise<Record<string, string>> {
  if (pmIds.length === 0) return {};

  const admin = createAdminClient();
  const { data } = await admin
    .from("profiles")
    .select("id, email")
    .in("id", pmIds);

  const map: Record<string, string> = {};
  for (const row of data ?? []) {
    map[row.id] = row.email ?? "";
  }
  return map;
}

/**
 * Read-only roster of a specific client's assigned PMs, used by plan
 * 03-09's assignee picker (D-19). Closes the same RLS gap listPmRoster/
 * resolvePmNames close -- `pm_clients_select_own_or_admin` lets a PM read
 * only their OWN assignment rows, so the roster of a client's OTHER PMs is
 * unreachable through RLS -- but scoped to one client and, unlike
 * listPmRoster (which takes no scoping argument at all), gated by an
 * RLS-scoped visibility check FIRST: a caller not assigned to `clientId`
 * gets an empty list, never a roster, so this cannot become a cross-client
 * membership oracle. Display-only, never used for a write.
 */
export async function listClientPmRoster(
  clientId: string
): Promise<{ id: string; email: string }[]> {
  const supabase = await createClient();
  const { data: client } = await supabase
    .from("clients")
    .select("id")
    .eq("id", clientId)
    .single();
  if (!client) return [];

  const admin = createAdminClient();

  const { data: rows } = await admin
    .from("pm_clients")
    .select("pm_id")
    .eq("client_id", clientId);
  const ids = (rows ?? []).map((r) => r.pm_id);
  if (ids.length === 0) return [];

  const { data: profiles } = await admin
    .from("profiles")
    .select("id, email")
    .in("id", ids)
    .eq("role", "pm")
    .eq("status", "approved");

  return (profiles ?? [])
    .map((p) => ({ id: p.id, email: p.email ?? "" }))
    .sort((a, b) => a.email.localeCompare(b.email));
}

type ActionResult = { success: true } | { error: string };

/**
 * Update a client's strategic briefing (CLI-04). D-10: works regardless of
 * RAG/context readiness — this function never reads/writes any client-files
 * or context-related column.
 *
 * Uses the RLS-SCOPED `createClient()` (NOT `createAdminClient()`) — the
 * `clients_update_scoped` policy (Plan 01-02) is the actual security
 * boundary here, correctly allowing Admin OR any PM already in
 * `pm_assigned_clients()` for this client. Only the zod-parsed fields are
 * ever passed to `.update()` — never a raw `formData` spread — so a caller
 * cannot smuggle unexpected columns/`id` into the payload (T-01-15).
 */
export async function updateBriefing(
  clientId: string,
  formData: FormData
): Promise<ActionResult> {
  const parsed = briefingSchema.safeParse({
    objective: formData.get("objective"),
    toneOfVoice: formData.get("toneOfVoice"),
    targetAudience: formData.get("targetAudience"),
    contentPillars: formData.getAll("contentPillars"),
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Dados inválidos." };
  }

  const supabase = await createClient();
  const { error } = await supabase
    .from("clients")
    .update({
      objective: parsed.data.objective,
      tone_of_voice: parsed.data.toneOfVoice,
      target_audience: parsed.data.targetAudience,
      content_pillars: parsed.data.contentPillars,
      updated_at: new Date().toISOString(),
    })
    .eq("id", clientId);

  if (error) {
    return {
      error:
        "Não foi possível salvar as alterações. Verifique sua conexão e tente novamente.",
    };
  }

  return { success: true };
}

const AUTOFILL_NO_FILES_ERROR =
  "Nenhum arquivo de referência encontrado para este cliente. Envie um arquivo primeiro.";
const AUTOFILL_INVALID_RESULT_ERROR =
  "A IA retornou um resultado inesperado. Preencha o briefing manualmente.";

export type AutofillBriefingResult =
  | { success: true; briefing: BriefingInput }
  | { error: string };

/**
 * AI auto-fill for the strategic briefing (P0 pivot 2026-08-04, item 5).
 * Triggered client-side right after a successful client_files upload
 * (components/clients/client-files-section.tsx) — reads ALL of this
 * client's files (not just the newly uploaded one, so the proposal
 * reflects the client's full available context), proposes briefing field
 * values, and returns them WITHOUT writing to the database. The PM/Admin
 * reviews the pre-filled form and clicks "Salvar briefing" (updateBriefing,
 * above) themselves — this action never persists anything on its own,
 * matching the same "AI proposes, human confirms" pattern as checklist
 * generation (lib/actions/checklist-templates.ts's generateChecklistFromFiles).
 *
 * Reuses the SAME shared engine (lib/ai/structured-extraction.ts) that
 * checklist generation and card validation use — never a second
 * Anthropic-calling implementation for this feature.
 */
export async function autofillBriefingFromFiles(
  clientId: string
): Promise<AutofillBriefingResult> {
  const supabase = await createClient();

  // Re-read the client through RLS — never trust that clientId belongs to
  // a client the caller can reach; clients_select_scoped is the real
  // boundary, this call is also where the client's name for the prompt
  // comes from.
  const { data: client } = await supabase
    .from("clients")
    .select("id, name")
    .eq("id", clientId)
    .single();
  if (!client) {
    return { error: "Cliente não encontrado ou sem permissão." };
  }

  const { data: files } = await supabase
    .from("client_files")
    .select("filename, content")
    .eq("client_id", clientId);

  if (!files || files.length === 0) {
    return { error: AUTOFILL_NO_FILES_ERROR };
  }

  const result = await runStructuredExtraction({
    clientName: client.name,
    files,
    instruction:
      "Leia os arquivos de referência acima e proponha o briefing estratégico " +
      "deste cliente para uma operação de social media. Preencha: Objetivo " +
      "(o que o cliente quer alcançar nas redes sociais, 1-2 frases), Tom de " +
      "voz (como a marca se comunica, 1-2 frases), Público-alvo (quem o " +
      "conteúdo busca atingir, 1-2 frases), e Pilares de conteúdo (uma lista " +
      "curta de 3 a 6 temas/categorias recorrentes de conteúdo, cada um como " +
      "uma frase curta, não um parágrafo). Se um arquivo não trouxer " +
      "informação suficiente para algum campo, retorne uma string vazia " +
      "para ele em vez de inventar conteúdo.",
    toolName: "propose_briefing",
    toolDescription:
      "Registra a proposta de briefing estratégico extraída dos arquivos do cliente.",
    inputSchema: {
      type: "object",
      properties: {
        objective: { type: "string", description: "Objetivo do cliente nas redes sociais." },
        toneOfVoice: { type: "string", description: "Tom de voz da marca." },
        targetAudience: { type: "string", description: "Público-alvo do conteúdo." },
        contentPillars: {
          type: "array",
          items: { type: "string" },
          description: "3 a 6 pilares/temas de conteúdo recorrentes, cada um curto.",
        },
      },
      required: ["objective", "toneOfVoice", "targetAudience", "contentPillars"],
    },
  });

  if (!result.ok) {
    return { error: result.error };
  }

  const parsed = briefingSchema.safeParse(result.data);
  if (!parsed.success) {
    console.error(
      "[autofillBriefingFromFiles] AI output failed briefingSchema validation",
      parsed.error
    );
    return { error: AUTOFILL_INVALID_RESULT_ERROR };
  }

  return { success: true, briefing: parsed.data };
}

/**
 * Replace the full set of PMs assigned to an existing client (CLI-02's
 * literal "Admin can assign" scoping — deliberately stricter than Plan
 * 01-03's creation-time picker, which allows PM self-inclusion only for the
 * client THEY are creating). Authorization is re-checked HERE, server-side,
 * regardless of UI state (T-01-16) — the `viewerIsAdmin`-gated rendering in
 * `client-detail-form.tsx` is a convenience only, never the security
 * boundary.
 */
export async function assignPms(
  clientId: string,
  pmIds: string[]
): Promise<ActionResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Não autenticado." };

  const { data: profile } = await supabase
    .from("profiles")
    .select("role, status")
    .eq("id", user.id)
    .single();

  const isAuthorized =
    profile?.status === "approved" && profile.role === "admin";
  if (!isAuthorized) {
    return { error: "Sem permissão para alterar PMs atribuídos." };
  }

  const admin = createAdminClient();

  const { error: deleteError } = await admin
    .from("pm_clients")
    .delete()
    .eq("client_id", clientId);
  if (deleteError) {
    return {
      error:
        "Não foi possível salvar as alterações. Verifique sua conexão e tente novamente.",
    };
  }

  if (pmIds.length > 0) {
    const { error: insertError } = await admin
      .from("pm_clients")
      .insert(pmIds.map((pm_id) => ({ pm_id, client_id: clientId })));
    if (insertError) {
      return {
        error:
          "Não foi possível salvar as alterações. Verifique sua conexão e tente novamente.",
      };
    }
  }

  return { success: true };
}
