"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import {
  checklistTemplateSchema,
  assignTemplateSchema,
  type ChecklistTemplateInput,
  type AssignTemplateInput,
} from "@/lib/validation/checklist";

type CreateTemplateResult =
  | { success: true; templateId: string }
  | { error: string };
type ActionResult = { error?: string };

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
