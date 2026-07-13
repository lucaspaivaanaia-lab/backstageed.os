"use server";

import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { clientCreateSchema, briefingSchema } from "@/lib/validation/clients";
import { createTropicaliaProject } from "@/lib/tropicalia/client";

type CreateClientResult = { success: true; clientId: string } | { error: string };

/**
 * Privileged multi-step client-creation transaction: clients insert +
 * pm_clients insert + conditional Tropicalia provisioning.
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

  // D-11: null-check the key first — silent skip if absent, no attempt,
  // no error. D-08: a Tropicalia failure never rolls back client creation.
  if (process.env.TROPICALIA_API_KEY) {
    try {
      const project = await createTropicaliaProject(client.name);
      await admin
        .from("clients")
        .update({ tropicalia_project_id: project.public_id })
        .eq("id", client.id);
    } catch {
      // D-08: tropicalia_project_id stays null; UI shows "Pendente" + retry.
    }
  }

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

type ActionResult = { success: true } | { error: string };

/**
 * Update a client's strategic briefing (CLI-04). D-10: works regardless of
 * RAG readiness — this function never reads/writes `tropicalia_project_id`.
 *
 * Uses the RLS-SCOPED `createClient()` (NOT `createAdminClient()`) — the
 * `clients_update_scoped` policy (Plan 01-02) is the actual security
 * boundary here, correctly allowing Admin OR any PM already in
 * `pm_assigned_clients()` for this client. Only the zod-parsed fields are
 * ever passed to `.update()` — never a raw `formData` spread — so a caller
 * cannot smuggle `tropicalia_project_id`/`id` into the payload (T-01-15).
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

/**
 * Manual retry of Tropicalia project provisioning (D-09 — never an
 * automatic background job, only a user-triggered button click). Uses the
 * RLS-scoped `createClient()`, relying on `clients_update_scoped` to already
 * grant the caller access — never `createAdminClient()`.
 *
 * D-11: null-checks `process.env.TROPICALIA_API_KEY` BEFORE ever calling
 * `createTropicaliaProject()` — key-absent returns early with a distinct
 * message, never attempting the call. D-08: any provisioning failure once
 * the key IS present returns the exact catch-block error string below.
 */
export async function retryTropicaliaProvisioning(
  clientId: string
): Promise<ActionResult> {
  const supabase = await createClient();
  const { data: client, error: fetchError } = await supabase
    .from("clients")
    .select("id, name")
    .eq("id", clientId)
    .single();
  if (fetchError || !client) return { error: "Cliente não encontrado." };

  if (!process.env.TROPICALIA_API_KEY) return { error: "RAG setup pendente." };

  try {
    const project = await createTropicaliaProject(client.name);
    const { error: updateError } = await supabase
      .from("clients")
      .update({ tropicalia_project_id: project.public_id })
      .eq("id", clientId);
    if (updateError) {
      return {
        error:
          "Não foi possível salvar as alterações. Verifique sua conexão e tente novamente.",
      };
    }
    return { success: true };
  } catch {
    return {
      error:
        "Não foi possível provisionar o projeto Tropicalia agora. O cliente foi criado normalmente — tente novamente quando quiser.",
    };
  }
}
