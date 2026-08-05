"use server";

/**
 * Admin-only D-11 "manual override" — force-advances a card past a blocked
 * revisão-interna gate, writing an append-only audit row in the same
 * action (CHK-04, T-03-25/T-03-26/T-03-29).
 *
 * `forceAdvanceOverride` is the ONLY code path in this codebase permitted
 * to advance a card FORWARD out of `revisao_interna` with unchecked items.
 * `advanceStage` (app/pm/board/actions.ts) must never gain a bypass
 * parameter, and `moveCard` (same file, plan 03-07's drag path) already
 * rejects the identical forward transition via `evaluateMove` and must
 * never be loosened to permit it — a second forward-bypass path, logged or
 * not, is a regression against CHK-04 (T-03-26/T-03-30b). `moveCard`
 * permitting a BACKWARD move out of revisão interna with unchecked items
 * is NOT a bypass: a card going back to produção has skipped no review and
 * will be gated again on its way forward.
 *
 * This is a NEW file, not an addition to app/pm/board/actions.ts, so the
 * Admin-only privileged path is never co-located with the PM action
 * surface (T-03-24 boundary).
 */

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { nextStage } from "@/lib/cards/stages";
import { isGateBlocked } from "@/lib/cards/checklist-gate";
import {
  forceAdvanceSchema,
  type ForceAdvanceInput,
} from "@/lib/validation/cards";

const NOT_AUTHENTICATED_ERROR = "Não autenticado.";
const ADMIN_ONLY_ERROR = "Apenas um Admin pode forçar o avanço de um card.";
const CARD_NOT_FOUND_ERROR = "Card não encontrado.";
const NOT_IN_REVIEW_ERROR =
  "Só é possível forçar o avanço a partir de revisão interna.";
const LAST_STAGE_ERROR = "Este card já está na última etapa.";
const NOT_BLOCKED_ERROR = "Este card não está bloqueado — use Avançar.";
const OVERRIDE_WRITE_FAILED_ERROR =
  "Não foi possível registrar o avanço forçado. Tente novamente.";
const ADVANCE_FAILED_ERROR = "Não foi possível avançar o card. Tente novamente.";

export type ForceAdvanceResult = { error?: string };

/**
 * `forceAdvanceOverride(input)`: re-authorizes as Admin, re-reads the card
 * and its checklist server-side (never trusting a caller claim), writes the
 * audit row FIRST, and only then advances the card's stage.
 *
 * Ordering is deliberate (T-03-25, Repudiation): the audit insert runs
 * BEFORE the stage update and its error aborts the whole action, so a
 * mid-request failure leaves a record of an ATTEMPTED override with no
 * advance, never an advance with no record. `overridden_by` always comes
 * from `auth.getUser()`, never from a client argument.
 */
export async function forceAdvanceOverride(
  input: ForceAdvanceInput
): Promise<ForceAdvanceResult> {
  const parsed = forceAdvanceSchema.safeParse(input);
  if (!parsed.success) {
    return { error: CARD_NOT_FOUND_ERROR };
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: NOT_AUTHENTICATED_ERROR };

  // App-layer authorization — the PRIMARY boundary. Stricter than every PM
  // action in app/pm/board/actions.ts: role must be exactly "admin", not
  // merely "approved". card_checklist_overrides_admin_insert (migration
  // 0022) is defense in depth, not the primary gate.
  const { data: profile } = await supabase
    .from("profiles")
    .select("role, status")
    .eq("id", user.id)
    .single();

  const isAuthorized = profile?.status === "approved" && profile.role === "admin";
  if (!isAuthorized) return { error: ADMIN_ONLY_ERROR };

  // Re-read the card through the RLS-scoped client — never trust that
  // cardId belongs to a real, reachable card. A null stage (a package
  // parent, D-02) is treated the same as "not found" — it is never
  // advance-able, same rule advanceStage/moveCard already apply.
  const { data: card } = await supabase
    .from("cards")
    .select("id, client_id, stage")
    .eq("id", parsed.data.cardId)
    .single();
  if (!card || !card.stage) {
    return { error: CARD_NOT_FOUND_ERROR };
  }

  // This action exists solely to bypass the revisão-interna gate — it must
  // never become a general-purpose stage jumper (T-03-29).
  if (card.stage !== "revisao_interna") {
    return { error: NOT_IN_REVIEW_ERROR };
  }

  const target = nextStage(card.stage);
  if (target === null) {
    return { error: LAST_STAGE_ERROR };
  }

  // Never accept a completion claim from the caller — re-read the
  // checklist server-side, exactly like advanceStage/moveCard do.
  const { data: items } = await supabase
    .from("card_checklist_items")
    .select("label, completed_at")
    .eq("card_id", card.id)
    .order("sort_order", { ascending: true });

  const checklist = items ?? [];
  if (!isGateBlocked(checklist)) {
    // An override with nothing to override must not create a misleading
    // audit row.
    return { error: NOT_BLOCKED_ERROR };
  }

  const uncheckedLabels = checklist
    .filter((item) => item.completed_at === null)
    .map((item) => item.label);

  // Write the audit row FIRST (T-03-25) — abort on failure, before ever
  // touching cards.stage.
  const { error: overrideError } = await supabase
    .from("card_checklist_overrides")
    .insert({
      card_id: card.id,
      overridden_by: user.id,
      unchecked_item_labels: uncheckedLabels,
      from_stage: card.stage,
      to_stage: target,
    });
  if (overrideError) {
    return { error: OVERRIDE_WRITE_FAILED_ERROR };
  }

  const { error: updateError } = await supabase
    .from("cards")
    .update({ stage: target, updated_at: new Date().toISOString() })
    .eq("id", card.id);
  if (updateError) {
    return { error: ADVANCE_FAILED_ERROR };
  }

  revalidatePath("/admin/cards");
  revalidatePath("/pm/board");
  return {};
}
