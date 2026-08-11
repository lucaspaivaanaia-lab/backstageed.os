"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import {
  updateCardDescriptionAsEditorSchema,
  type UpdateCardDescriptionAsEditorInput,
} from "@/lib/validation/cards";
import { buildEditorCardUpdatePayload } from "@/lib/security/editor-card-write-scope";

const CARD_NOT_FOUND_ERROR = "Card não encontrado.";
const NOT_AUTHENTICATED_ERROR = "Não autenticado.";
const CARD_SAVE_ERROR = "Não foi possível salvar a descrição. Tente novamente.";

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
