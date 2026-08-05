import { STAGE_LABELS, STAGE_ORDER, type CardStage } from "./stages.ts";

/**
 * Pure package-rollup module (KAN-01 package half, D-01/D-02). Intentionally
 * free of any Supabase/React import or I/O so this module can be imported by
 * its sibling `package-rollup.test.ts` via a relative path and exercised
 * with Node's built-in test runner -- no live DB, no Docker (mirrors
 * lib/chat/stale-response-guard.ts's convention).
 *
 * A package's aggregate status is COMPUTED at render time from its pieces'
 * CURRENT stages and is NEVER stored as a column on the parent row (D-02).
 * A stored rollup drifts the moment a child's stage changes -- and with
 * drag-and-drop (D-12) a child's stage can now change without any dialog
 * ever being opened, which makes a stored rollup even more obviously wrong
 * (03-RESEARCH.md Anti-Patterns, second bullet: "Storing a package's rollup
 * status as a column on the parent card").
 */

/**
 * Returns the Portuguese rollup summary for a package's pieces, given their
 * current stages.
 *
 * - Empty package -> "Nenhuma peça".
 * - Otherwise, the stage holding the STRICT MAJORITY (more than half) of the
 *   pieces becomes the reported cluster, e.g. "3/5 em Revisão interna".
 * - When no stage holds a strict majority (including an exact 50/50 split),
 *   the pieces are considered spread out and the label falls back to a
 *   plain count, e.g. "3 peças".
 *
 * Ties for the highest count resolve to whichever stage appears earliest in
 * `STAGE_ORDER`, so the output is deterministic regardless of input
 * ordering -- a tie can never itself produce a majority, so this only
 * matters for internal consistency, but it is implemented explicitly rather
 * than relying on object/Map key iteration order.
 */
export function packageRollupLabel(pieceStages: CardStage[]): string {
  const total = pieceStages.length;
  if (total === 0) {
    return "Nenhuma peça";
  }

  const countsByStage = new Map<CardStage, number>();
  for (const stage of pieceStages) {
    countsByStage.set(stage, (countsByStage.get(stage) ?? 0) + 1);
  }

  let bestStage: CardStage | null = null;
  let bestCount = 0;
  for (const stage of STAGE_ORDER) {
    const count = countsByStage.get(stage) ?? 0;
    if (count > bestCount) {
      bestCount = count;
      bestStage = stage;
    }
  }

  if (bestStage !== null && bestCount > total / 2) {
    return `${bestCount}/${total} em ${STAGE_LABELS[bestStage]}`;
  }

  return `${total} peças`;
}
