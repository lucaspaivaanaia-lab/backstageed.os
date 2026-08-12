import type { CardStage } from "./stages.ts";

/**
 * Pure "Pronto para publicar" computation (SCH-02, D-04). Mirrors
 * package-rollup.ts's own "computed at render time, never a column"
 * precedent: a card is ready to publish exactly when it is currently in
 * `agendamento` AND carries a non-null `publish_at` -- this is NEVER stored
 * as a column or a 6th `card_stage` enum value (D-04), it is recomputed on
 * every render from the two source-of-truth fields, so it can never drift
 * the way a stored status would the moment either field changes.
 *
 * Free of any Supabase/React import or I/O, so this module can be exercised
 * by its sibling publish-status.test.ts with Node's built-in test runner --
 * no live DB, mirrors package-rollup.ts's own convention.
 */
export function isReadyToPublish(card: {
  stage: CardStage | null;
  publish_at: string | null;
}): boolean {
  return card.stage === "agendamento" && card.publish_at !== null;
}
