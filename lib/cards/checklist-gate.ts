/**
 * Pure checklist-gate predicate for content cards (CHK-03, D-06).
 * Intentionally free of any Supabase/React import or I/O so this module can
 * be imported by its sibling `checklist-gate.test.ts` via a relative path
 * and exercised with Node's built-in test runner -- no live DB, no Docker
 * (mirrors lib/chat/stale-response-guard.ts's convention).
 *
 * This module is imported by THREE call sites that must never disagree:
 * the RSC render (to compute the "Avançar" button's disabled attribute),
 * the `advanceStage` Server Action (server-side re-enforcement, T-03-12),
 * and -- from plan 03-08 -- the drag-and-drop handler and `moveCard`
 * action, because D-13 locks that the gate applies identically regardless
 * of which trigger (button click or drag) attempts the transition out of
 * revisão interna.
 */
export type ChecklistItemState = { completed_at: string | null };

/**
 * Counts total items and how many are checked (`completed_at` non-null).
 * An empty list returns `{ total: 0, checked: 0 }` -- used both for the
 * board's per-card progress badge and as the input to `isGateBlocked`.
 */
export function checklistProgress(
  items: ChecklistItemState[]
): { total: number; checked: number } {
  return {
    total: items.length,
    checked: items.filter((item) => item.completed_at !== null).length,
  };
}

/**
 * True when at least one item is unchecked (`completed_at === null`).
 * An empty array returns `false` -- a card with no checklist items (a
 * client with no assigned template) must not become permanently stuck;
 * this is the documented fail-safe (03-RESEARCH.md Pitfall 3).
 */
export function isGateBlocked(items: ChecklistItemState[]): boolean {
  return items.some((item) => item.completed_at === null);
}

/**
 * Verbatim UI-SPEC copy (Copywriting Contract) -- every surface (button
 * helper text, Server Action error) renders this exact string, never a
 * paraphrase (D-13 requires the drag path in 03-08 to show this identical
 * message).
 */
export const GATE_BLOCKED_MESSAGE =
  "Existem itens do checklist não concluídos. Marque todos os itens antes de avançar.";
