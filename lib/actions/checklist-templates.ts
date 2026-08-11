"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import {
  checklistTemplateSchema,
  assignTemplateSchema,
  type ChecklistTemplateInput,
  type AssignTemplateInput,
} from "@/lib/validation/checklist";
import { runStructuredExtraction } from "@/lib/ai/structured-extraction";

type CreateTemplateResult =
  | { success: true; templateId: string }
  | { error: string };
type ActionResult = { error?: string };

export type ClientChecklistSummary = {
  id: string;
  name: string;
  itemCount: number;
};

/**
 * Read-only lookup used by both /admin/clients/[id] and /pm/clients/[id]
 * (client-detail-form.tsx's "Checklist de revisão" section, Admin-only) to
 * show which template — if any — is currently assigned to a client, and
 * how many items it has. RLS-scoped only; a null `checklist_template_id`
 * or a template the caller can't see both simply resolve to `null` here.
 */
export async function getClientChecklistTemplate(
  clientId: string
): Promise<ClientChecklistSummary | null> {
  const supabase = await createClient();

  const { data: client } = await supabase
    .from("clients")
    .select("checklist_template_id")
    .eq("id", clientId)
    .single();
  if (!client?.checklist_template_id) return null;

  const { data: template } = await supabase
    .from("checklist_templates")
    .select("id, name, checklist_template_items(id)")
    .eq("id", client.checklist_template_id)
    .single();
  if (!template) return null;

  return {
    id: template.id,
    name: template.name,
    itemCount: (template.checklist_template_items ?? []).length,
  };
}

/**
 * Admin-only checklist-template CRUD + per-client assignment (CHK-01,
 * CHK-02). Every exported action below starts with the same app-layer
 * authorization block copied from `lib/actions/clients.ts` /
 * `app/admin/approvals/actions.ts`: `createClient()` -> `auth.getUser()` ->
 * read `profiles.role, status` -> require an approved profile with the
 * admin role. This app-layer check is the PRIMARY boundary; the admin-only
 * RLS policies
 * shipped in 0013_checklist_templates.sql (`checklist_templates_admin_write`
 * / `checklist_template_items_admin_write`) are defense in depth, proved by
 * the pgTAP `throws_like` assertions in
 * 0006_rls_checklist_templates_scoping_test.sql.
 *
 * All writes use the RLS-scoped `createClient()` — the admin write policies
 * already permit these operations for an authenticated admin, so there is
 * no need to reach for `createAdminClient()` here.
 */

/**
 * Create a new checklist template with its ordered items (CHK-01). D-03:
 * templates are reusable and admin-authored, not defined per client.
 * `sort_order` is derived from the submitted array's index, never an
 * editable field — it is never taken from client input directly.
 */
export async function createTemplate(
  input: ChecklistTemplateInput
): Promise<CreateTemplateResult> {
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
    return { error: "Sem permissão para gerenciar checklists." };
  }

  const parsed = checklistTemplateSchema.safeParse(input);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Dados inválidos." };
  }

  const { data: template, error: insertError } = await supabase
    .from("checklist_templates")
    .insert({ name: parsed.data.name })
    .select("id")
    .single();
  if (insertError || !template) {
    return { error: "Não foi possível criar o checklist." };
  }

  const { error: itemsError } = await supabase
    .from("checklist_template_items")
    .insert(
      parsed.data.items.map((item, i) => ({
        template_id: template.id,
        label: item.label,
        sort_order: i,
      }))
    );
  if (itemsError) {
    return { error: "Não foi possível salvar os itens do checklist." };
  }

  revalidatePath("/admin/checklist-templates");
  return { success: true, templateId: template.id };
}

/**
 * Rename a template and replace its full item set (delete-then-insert,
 * index-derived `sort_order`). Deleting `checklist_template_items` rows
 * here never touches `card_checklist_items` — those are independent
 * snapshot copies made by the (later plan's) `advanceStage` Server Action
 * at the moment a card enters revisão interna (D-04), so editing a
 * template after that moment cannot silently mutate an in-progress card's
 * checklist.
 */
export async function updateTemplate(
  templateId: string,
  input: ChecklistTemplateInput
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
    return { error: "Sem permissão para gerenciar checklists." };
  }

  const parsed = checklistTemplateSchema.safeParse(input);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Dados inválidos." };
  }

  const { error: updateError } = await supabase
    .from("checklist_templates")
    .update({ name: parsed.data.name })
    .eq("id", templateId);
  if (updateError) {
    return { error: "Não foi possível salvar as alterações." };
  }

  const { error: deleteError } = await supabase
    .from("checklist_template_items")
    .delete()
    .eq("template_id", templateId);
  if (deleteError) {
    return { error: "Não foi possível salvar as alterações." };
  }

  const { error: itemsError } = await supabase
    .from("checklist_template_items")
    .insert(
      parsed.data.items.map((item, i) => ({
        template_id: templateId,
        label: item.label,
        sort_order: i,
      }))
    );
  if (itemsError) {
    return { error: "Não foi possível salvar as alterações." };
  }

  revalidatePath("/admin/checklist-templates");
  return {};
}

const GENERATE_NO_FILES_ERROR =
  "Nenhum arquivo de referência encontrado para este cliente. Envie um arquivo primeiro.";
const GENERATE_INVALID_RESULT_ERROR =
  "A IA retornou um resultado inesperado. Preencha o checklist manualmente.";

export type GenerateChecklistResult =
  | { success: true; proposal: ChecklistTemplateInput }
  | { error: string };

/**
 * Shared AI-proposal core (quick task 260808-ci5, extracted from the
 * original `generateChecklistFromFiles` body so BOTH the admin-only manual
 * regenerate flow AND the new automatic-on-upload draft flow
 * (`generateChecklistDraftFromFiles`) call the exact same generation logic
 * — no duplicated prompt/schema/parsing between the two callers). Reads
 * ALL of a client's `client_files`, proposes a template name + ordered
 * checklist items via the shared structured-extraction engine
 * (lib/ai/structured-extraction.ts — the SAME engine briefing auto-fill
 * and card validation use), and returns the proposal WITHOUT writing
 * anything to the database. Callers are responsible for their own
 * authorization checks and for deciding what to do with the proposal.
 */
async function proposeChecklistFromFiles(client: {
  id: string;
  name: string;
  tag: string;
}): Promise<GenerateChecklistResult> {
  const supabase = await createClient();

  const { data: files } = await supabase
    .from("client_files")
    .select("filename, content")
    .eq("client_id", client.id);

  if (!files || files.length === 0) {
    return { error: GENERATE_NO_FILES_ERROR };
  }

  // Quick task 260811-imw: unfiltered select — shared_knowledge_files has
  // no client_id column; shared_knowledge_files_select_all_authenticated
  // (open to any authenticated role by design) is the real boundary here,
  // via the SAME RLS-scoped supabase client already in scope above.
  const { data: sharedKnowledgeFiles } = await supabase
    .from("shared_knowledge_files")
    .select("filename, content");
  const sharedFiles = sharedKnowledgeFiles ?? [];

  const result = await runStructuredExtraction({
    clientName: client.name,
    clientTag: client.tag,
    files,
    sharedFiles,
    instruction:
      "Leia os arquivos de referência acima (manual de marca, briefing, " +
      "regras de conteúdo, etc.) e proponha um checklist de revisão para " +
      "conteúdo deste cliente antes de ele ser aprovado internamente. Cada " +
      "item deve ser uma regra objetiva e verificável por um revisor humano " +
      "em poucos segundos — por exemplo 'Não usar a palavra X', 'Máximo de " +
      "3 parágrafos', 'CTA presente no final', 'Paleta de cores da marca " +
      "respeitada'. Proponha entre 3 e 10 itens, cada um curto (uma frase). " +
      "Proponha também um nome curto para este checklist, ex: " +
      `'Checklist — ${client.name}'.`,
    toolName: "propose_checklist",
    toolDescription:
      "Registra a proposta de checklist de revisão extraída dos arquivos do cliente.",
    inputSchema: {
      type: "object",
      properties: {
        templateName: { type: "string", description: "Nome curto do checklist." },
        items: {
          type: "array",
          items: { type: "string" },
          description: "3 a 10 regras de revisão curtas e verificáveis.",
        },
      },
      required: ["templateName", "items"],
    },
  });

  if (!result.ok) {
    return { error: result.error };
  }

  const raw = result.data as { templateName?: unknown; items?: unknown };
  const parsed = checklistTemplateSchema.safeParse({
    name: raw.templateName,
    items: Array.isArray(raw.items)
      ? raw.items.map((label) => ({ label }))
      : [],
  });
  if (!parsed.success) {
    console.error(
      "[proposeChecklistFromFiles] AI output failed checklistTemplateSchema validation",
      parsed.error
    );
    return { error: GENERATE_INVALID_RESULT_ERROR };
  }

  return { success: true, proposal: parsed.data };
}

/**
 * AI checklist generation/regeneration (P0 pivot 2026-08-04, item 1;
 * behavior/signature/callers unchanged by quick task 260808-ci5). Returns
 * the proposal WITHOUT writing anything to the database. The caller renders
 * it inside `TemplateForm` (`mode="create"` when the client has no template
 * yet, `mode="edit"` with `templateId` pre-set when it does) so the Admin
 * reviews/edits every item before `createTemplate`/`updateTemplate`
 * actually persists it — same "AI proposes, human confirms" pattern as
 * `autofillBriefingFromFiles` (lib/actions/clients.ts). Re-runnable at
 * will: every call re-reads the client's CURRENT files, so an Admin can
 * regenerate after the base file changes without this action needing any
 * "has it changed" tracking of its own.
 */
export async function generateChecklistFromFiles(
  clientId: string
): Promise<GenerateChecklistResult> {
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
    return { error: "Sem permissão para gerenciar checklists." };
  }

  // Re-read the client through RLS — never trust that clientId is valid on
  // its own; clients_select_scoped is the real boundary (an Admin can
  // reach any client, so this also confirms the id genuinely exists).
  const { data: client } = await supabase
    .from("clients")
    .select("id, name, tag")
    .eq("id", clientId)
    .single();
  if (!client) {
    return { error: "Cliente não encontrado." };
  }

  return proposeChecklistFromFiles({
    id: client.id,
    name: client.name,
    tag: client.tag,
  });
}

/**
 * Automatic checklist-draft generation, fired silently after every
 * successful client-file upload batch (quick task 260808-ci5, item 1 —
 * same trigger as `autofillBriefingFromFiles`, no manual click required).
 * Intentionally usable by a PM, NOT admin-only: the RLS-scoped client
 * re-read below (`clients_select_scoped`) is the real authorization
 * boundary — it already resolves to "admin, or a PM assigned to this
 * client" — so no separate `profiles.role` check is added here on purpose.
 *
 * Writes ONLY a `status = 'draft'` row (or updates an existing one this
 * client owns), and NEVER touches `clients.checklist_template_id` — a
 * draft only ever becomes the client's active/gating checklist via
 * `confirmChecklistDraft`, on an explicit confirm click. Idempotent per
 * client: re-running this (e.g. on a second file upload) updates the
 * SAME draft in place rather than creating a second one, using an
 * upsert-like find-then-update/insert against `owner_client_id +
 * status = 'draft'`.
 *
 * On any write error, returns a generic error WITHOUT rolling back partial
 * writes — a template row with 0 items is inert (never gates anything on
 * its own, since `clients.checklist_template_id` is never touched here),
 * and the next upload's regeneration run reconciles it in place.
 */
export async function generateChecklistDraftFromFiles(
  clientId: string
): Promise<{ success: true } | { error: string }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Não autenticado." };

  // Re-read the client through RLS — clients_select_scoped is the real
  // boundary here (admin-or-assigned-PM), deliberately NOT gated further by
  // a profiles.role check, since this function must be PM-usable.
  const { data: client } = await supabase
    .from("clients")
    .select("id, name, tag")
    .eq("id", clientId)
    .single();
  if (!client) {
    return { error: "Cliente não encontrado." };
  }

  const proposalResult = await proposeChecklistFromFiles({
    id: client.id,
    name: client.name,
    tag: client.tag,
  });
  if ("error" in proposalResult) {
    return { error: proposalResult.error };
  }
  const { proposal } = proposalResult;

  const { data: existingDraft } = await supabase
    .from("checklist_templates")
    .select("id")
    .eq("owner_client_id", clientId)
    .eq("status", "draft")
    .maybeSingle();

  const templateId = existingDraft?.id;

  if (templateId) {
    const { error: updateError } = await supabase
      .from("checklist_templates")
      .update({ name: proposal.name })
      .eq("id", templateId);
    if (updateError) {
      return { error: "Não foi possível gerar o rascunho do checklist." };
    }

    const { error: deleteError } = await supabase
      .from("checklist_template_items")
      .delete()
      .eq("template_id", templateId);
    if (deleteError) {
      return { error: "Não foi possível gerar o rascunho do checklist." };
    }

    const { error: itemsError } = await supabase
      .from("checklist_template_items")
      .insert(
        proposal.items.map((item, i) => ({
          template_id: templateId,
          label: item.label,
          sort_order: i,
        }))
      );
    if (itemsError) {
      return { error: "Não foi possível gerar o rascunho do checklist." };
    }

    return { success: true };
  }

  const { data: newTemplate, error: insertError } = await supabase
    .from("checklist_templates")
    .insert({
      name: proposal.name,
      status: "draft",
      owner_client_id: clientId,
    })
    .select("id")
    .single();
  if (insertError || !newTemplate) {
    return { error: "Não foi possível gerar o rascunho do checklist." };
  }

  const { error: itemsError } = await supabase
    .from("checklist_template_items")
    .insert(
      proposal.items.map((item, i) => ({
        template_id: newTemplate.id,
        label: item.label,
        sort_order: i,
      }))
    );
  if (itemsError) {
    return { error: "Não foi possível gerar o rascunho do checklist." };
  }

  return { success: true };
}

/**
 * Read-only lookup of a client's pending DRAFT checklist (if any), used by
 * `ClientChecklistSection` (both PM and Admin) to render the "Rascunho
 * gerado pela IA — aguardando revisão" review/confirm affordance. Same
 * shape/pattern as `getClientChecklistTemplate`, but selects
 * `checklist_templates` directly by `owner_client_id` + `status = 'draft'`
 * rather than following `clients.checklist_template_id` (a draft is never
 * assigned there until confirmed).
 */
export async function getClientChecklistDraft(
  clientId: string
): Promise<ClientChecklistSummary | null> {
  const supabase = await createClient();

  const { data: template } = await supabase
    .from("checklist_templates")
    .select("id, name, checklist_template_items(id)")
    .eq("owner_client_id", clientId)
    .eq("status", "draft")
    .maybeSingle();
  if (!template) return null;

  return {
    id: template.id,
    name: template.name,
    itemCount: (template.checklist_template_items ?? []).length,
  };
}

/**
 * RLS-scoped read of a single template's full editable shape (name +
 * ordered items), used to pre-fill `TemplateForm mode="confirm-draft"`
 * when a PM or Admin clicks "Revisar e confirmar". Returns `null` if the
 * template doesn't exist or isn't visible to the caller (the existing
 * `checklist_templates_select_all_authenticated` policy already lets any
 * authenticated user read any template, but this stays defensive about a
 * bad/stale id).
 */
export async function getChecklistTemplateForEdit(
  templateId: string
): Promise<ChecklistTemplateInput | null> {
  const supabase = await createClient();

  const { data: template } = await supabase
    .from("checklist_templates")
    .select("name, checklist_template_items(label, sort_order)")
    .eq("id", templateId)
    .maybeSingle();
  if (!template) return null;

  const items = (template.checklist_template_items ?? [])
    .slice()
    .sort((a, b) => a.sort_order - b.sort_order);

  return {
    name: template.name,
    items: items.map((item) => ({ label: item.label })),
  };
}

/**
 * Confirms a PM-or-Admin-reviewed draft checklist (quick task 260808-ci5,
 * item 1) — the ONLY place a draft becomes a client's ACTIVE/gating
 * checklist (`clients.checklist_template_id`), and only ever on this
 * explicit confirm click, never silently on generation.
 *
 * The owning client is derived from the RE-READ template row
 * (`owner_client_id`), never from any caller-supplied clientId — there is
 * none in this function's signature on purpose. A `null` owner_client_id
 * means the template is a shared/library row (CHK-01's original model);
 * those must go through the existing admin-only `updateTemplate` flow, not
 * this one, so that case is rejected here.
 *
 * Authorization is enforced by the NEW `checklist_templates_owner_write` /
 * `checklist_template_items_owner_write` RLS policies (migration 0023) —
 * no separate `profiles.role` check is added here, matching
 * `updateCardDetails`'s established re-read-via-RLS pattern.
 */
export async function confirmChecklistDraft(
  templateId: string,
  input: ChecklistTemplateInput
): Promise<{ success: true } | { error: string }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Não autenticado." };

  const parsed = checklistTemplateSchema.safeParse(input);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Dados inválidos." };
  }

  const { data: template } = await supabase
    .from("checklist_templates")
    .select("id, owner_client_id")
    .eq("id", templateId)
    .single();
  if (!template || !template.owner_client_id) {
    return { error: "Rascunho de checklist não encontrado." };
  }

  const { error: updateError } = await supabase
    .from("checklist_templates")
    .update({ name: parsed.data.name, status: "confirmed" })
    .eq("id", templateId);
  if (updateError) {
    return { error: "Não foi possível confirmar o checklist." };
  }

  const { error: deleteError } = await supabase
    .from("checklist_template_items")
    .delete()
    .eq("template_id", templateId);
  if (deleteError) {
    return { error: "Não foi possível confirmar o checklist." };
  }

  const { error: itemsError } = await supabase
    .from("checklist_template_items")
    .insert(
      parsed.data.items.map((item, i) => ({
        template_id: templateId,
        label: item.label,
        sort_order: i,
      }))
    );
  if (itemsError) {
    return { error: "Não foi possível confirmar o checklist." };
  }

  // The only place a draft becomes the client's active/gating checklist —
  // runs unconditionally here, after the template/item writes above
  // succeed, and only ever on this explicit confirm.
  const { error: assignError } = await supabase
    .from("clients")
    .update({ checklist_template_id: templateId })
    .eq("id", template.owner_client_id);
  if (assignError) {
    return { error: "Não foi possível atribuir o checklist ao cliente." };
  }

  revalidatePath("/admin/clients");
  revalidatePath("/pm/clients");
  return { success: true };
}

/**
 * Delete a template (its items cascade via `on delete cascade`). Clients
 * pointing at this template are unassigned first so the
 * `clients.checklist_template_id` FK does not block the delete.
 */
export async function deleteTemplate(
  templateId: string
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
    return { error: "Sem permissão para gerenciar checklists." };
  }

  const { error: unassignError } = await supabase
    .from("clients")
    .update({ checklist_template_id: null })
    .eq("checklist_template_id", templateId);
  if (unassignError) {
    return { error: "Não foi possível remover o checklist." };
  }

  const { error: deleteError } = await supabase
    .from("checklist_templates")
    .delete()
    .eq("id", templateId);
  if (deleteError) {
    return { error: "Não foi possível remover o checklist." };
  }

  revalidatePath("/admin/checklist-templates");
  return {};
}

/**
 * Assign (or unassign, when `templateId` is null) a single template to a
 * client (CHK-02, D-03: strict 1:1 assignment). A single nullable FK
 * column, not a join table, so there is no delete-then-insert step here.
 */
export async function assignTemplateToClient(
  input: AssignTemplateInput
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
    return { error: "Sem permissão para gerenciar checklists." };
  }

  const parsed = assignTemplateSchema.safeParse(input);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Dados inválidos." };
  }

  const { error } = await supabase
    .from("clients")
    .update({ checklist_template_id: parsed.data.templateId })
    .eq("id", parsed.data.clientId);
  if (error) {
    return { error: "Não foi possível salvar a atribuição." };
  }

  revalidatePath("/admin/checklist-templates");
  return {};
}
