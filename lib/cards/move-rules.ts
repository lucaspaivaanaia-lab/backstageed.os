import { STAGE_ORDER, type CardStage } from "./stages.ts";
import {
  isGateBlocked,
  GATE_BLOCKED_MESSAGE,
  type ChecklistItemState,
} from "./checklist-gate.ts";

/**
 * Pure move-legality predicate for content cards (KAN-02, CHK-03, D-12,
 * D-13). Intentionally free of any Supabase/React import or I/O so this
 * module can be imported by its sibling `move-rules.test.ts` via a relative
 * path and exercised with Node's built-in test runner -- no live DB, no
 * Docker (mirrors lib/chat/stale-response-guard.ts's convention).
 *
 * This module is imported by BOTH the drag handler in
 * `app/pm/board/board-panel.tsx` (plan 03-08, for instant snap-back
 * feedback on an illegal drop) AND the `moveCard` Server Action (the actual
 * security boundary) -- so the two can never disagree about what is legal.
 * This is the same shared-predicate discipline `lib/cards/checklist-gate.ts`
 * already established for the gate itself: one implementation, multiple
 * callers, zero drift.
 */
export type MoveDecision =
  | { allowed: true }
  | { allowed: false; reason: string };

/**
 * Verbatim UI-SPEC copy -- shown whenever a forward move would jump over
 * revisão interna without ever landing on it, which is exactly the gesture
 * CHK-03 exists to prevent (D-13: drag-and-drop must never become a
 * one-gesture bypass of the internal-review gate).
 */
export const MOVE_SKIPS_REVIEW_MESSAGE =
  "Um card precisa passar pela revisão interna antes de seguir para as etapas seguintes.";

/**
 * Decides whether a card may move from `from` to `to`, given its current
 * checklist items. Order of checks is deliberate and must not be
 * reordered:
 *   1. A no-op move (from === to) is always allowed.
 *   2. A FORWARD move that jumps over revisão interna (never lands on it)
 *      is rejected outright -- this is the rule that stops drag-and-drop
 *      from becoming a one-gesture bypass of the entire CHK-03 gate.
 *   3. A forward move LEAVING revisão interna is gated on its checklist
 *      state, identically to the "Avançar" button path (D-13) -- reuses
 *      the imported `isGateBlocked`/`GATE_BLOCKED_MESSAGE` so the drag path
 *      shows the byte-identical message the button already shows.
 *   4. Everything else (including every BACKWARD move) is allowed --
 *      going back out of revisão interna never skips a review.
 */
export function evaluateMove(
  from: CardStage,
  to: CardStage,
  items: ChecklistItemState[]
): MoveDecision {
  if (from === to) return { allowed: true };

  const fromIdx = STAGE_ORDER.indexOf(from);
  const toIdx = STAGE_ORDER.indexOf(to);
  const revIdx = STAGE_ORDER.indexOf("revisao_interna");

  // A forward move that never lands on revisão interna at all -- the drag
  // equivalent of skipping straight from Briefing to Aprovação do cliente.
  if (fromIdx < revIdx && toIdx > revIdx) {
    return { allowed: false, reason: MOVE_SKIPS_REVIEW_MESSAGE };
  }

  // D-13: leaving revisão interna forward is gated exactly like the
  // "Avançar" button -- the gate applies identically regardless of trigger.
  if (fromIdx === revIdx && toIdx > revIdx && isGateBlocked(items)) {
    return { allowed: false, reason: GATE_BLOCKED_MESSAGE };
  }

  return { allowed: true };
}
