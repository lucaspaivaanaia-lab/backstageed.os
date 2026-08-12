"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import {
  updateCardDescriptionAsEditorSchema,
  type UpdateCardDescriptionAsEditorInput,
} from "@/lib/validation/cards";
import { buildEditorCardUpdatePayload } from "@/lib/security/editor-card-write-scope";
import { isEditorCardWriteAuthorized } from "@/lib/security/editor-card-write-authz";

const CARD_NOT_FOUND_ERROR = "Card não encontrado.";
const NOT_AUTHENTICATED_ERROR = "Não autenticado.";
const CARD_SAVE_ERROR = "Não foi possível salvar a descrição. Tente novamente.";
const EDITOR_ONLY_ERROR = "Apenas um Editor aprovado pode editar a descrição deste card.";

/**
 * App-layer authorization — the PRIMARY boundary for
 * updateCardDescriptionAsEditor below (04-01 Task 5, third/final revision).
 * Re-reads the caller's own profiles row and delegates to
 * isEditorCardWriteAuthorized (lib/security/editor-card-write-authz.ts) --
 * byte-identical shape to app/pm/board/actions.ts's own local
 * assertPmOrAdminCaller (re-read profile, delegate to the pure predicate,
 * fail closed on any error), a fresh, parallel local helper, not an import
 * of that unexported function. cards_update_scoped's media_assignee_id
 * branch (migration 0031) is defense in depth here, never the primary
 * gate -- see isEditorCardWriteAuthorized's own doc comment for the exact
 * bypass this closes (migration 0032's Client branch). Fails closed: any
 * error reading the profile (including "no row") is treated as
 * unauthorized.
 */
async function assertEditorCaller(
  supabase: Awaited<ReturnType<typeof createClient>>,
  userId: string
): Promise<boolean> {
  const { data: profile, error } = await supabase
    .from("profiles")
    .select("role, status")
    .eq("id", userId)
    .single();
  if (error) return false;
  return isEditorCardWriteAuthorized(profile);
}

export type UpdateCardDescriptionAsEditorResult = { error?: string };

/**
 * The ONLY write path an Editor account (item 3, 260811-oe0-CONTEXT.md) has
 * on a card. Deliberately separate from app/pm/board/actions.ts's
 * updateCardDetails -- that action's schema requires assigneeId/
 * mediaAssigneeId/channel as part of its contract and would either force an
 * Editor caller to round-trip the card's current values (fragile, racy
 * against a concurrent PM edit) or need Editor-specific branching bolted
 * onto a PM/Admin-facing action, mixing two trust levels in one function
 * (260811-oe0-RESEARCH.md Section 3, Design C, rejected).
 *
 * cards_update_scoped's media_assignee_id branch (migration 0031) is the
 * ROW boundary -- re-reading the card through RLS below is what proves the
 * caller is actually its media_assignee_id, never trusted from the
 * argument alone. buildEditorCardUpdatePayload (lib/security/
 * editor-card-write-scope.ts) is the COLUMN boundary -- its hardcoded
 * {description, updated_at} shape is the only thing ever written,
 * regardless of what RLS's row-level check would otherwise allow (Pitfall
 * 1, 260811-oe0-RESEARCH.md: RLS's with check only re-validates the ROW
 * predicate, never which columns changed).
 *
 * 04-01 Task 5 (third/final revision): migration 0032's Client branch on
 * cards_update_scoped would otherwise let an authenticated Client caller
 * reach this action directly and overwrite `description` on their own
 * client's aprovacao_cliente card, bypassing approveCard/requestAdjustment's
 * hardcoded payload builders entirely -- the app-layer guard just above
 * this function is the PRIMARY boundary closing it, positioned before any
 * card read.
 */
export async function updateCardDescriptionAsEditor(
  input: UpdateCardDescriptionAsEditorInput
): Promise<UpdateCardDescriptionAsEditorResult> {
  const parsed = updateCardDescriptionAsEditorSchema.safeParse(input);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Dados inválidos." };
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: NOT_AUTHENTICATED_ERROR };

  // App-layer authorization — the PRIMARY boundary (04-01 Task 5, closes
  // the live write-boundary bypass migration 0032's Client branch on
  // cards_update_scoped would otherwise open). See the local helper's own
  // doc comment above.
  if (!(await assertEditorCaller(supabase, user.id))) {
    return { error: EDITOR_ONLY_ERROR };
  }

  // Re-read the card through RLS -- never trust that cardId is one of the
  // caller's assigned cards; cards_select_scoped's media_assignee_id
  // branch is the real boundary.
  const { data: card } = await supabase
    .from("cards")
    .select("id")
    .eq("id", parsed.data.cardId)
    .single();
  if (!card) return { error: CARD_NOT_FOUND_ERROR };

  const { error } = await supabase
    .from("cards")
    .update(buildEditorCardUpdatePayload(parsed.data.description))
    .eq("id", parsed.data.cardId);

  if (error) {
    return { error: CARD_SAVE_ERROR };
  }

  revalidatePath("/editor");
  return {};
}
