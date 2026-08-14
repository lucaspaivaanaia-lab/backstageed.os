import { STAGE_ORDER, type CardStage } from "./stages.ts";

/**
 * Pure workload-aggregation module (ADM-03/D-04). Intentionally free of any
 * Supabase/React/Next import or I/O so this module can be imported by its
 * sibling `workload.test.ts` via a relative path and exercised with Node's
 * built-in test runner -- no live DB, no Docker (mirrors
 * lib/cards/package-rollup.ts's convention).
 *
 * Like package-rollup, this is COMPUTED at render time from the current
 * `cards` rows and never stored -- a stored per-person count would drift
 * the instant a card's stage or assignment changes.
 *
 * Attribution rule (locked, 06-UI-SPEC.md line 67): a `role: "pm"` person
 * is matched against `assignee_id` ONLY; a `role: "editor"` person is
 * matched against `media_assignee_id` ONLY. This is intentional and NOT
 * symmetric -- a PM occasionally holds a card as Designer/Mídia
 * (`media_assignee_id`, migration 0029), and counting that card under both
 * their PM row and their would-be Editor row would double-count it and
 * misrepresent who is actually overloaded.
 */

export type WorkloadPerson = {
  id: string;
  email: string;
  role: "pm" | "editor";
};

export type WorkloadCard = {
  stage: CardStage;
  assignee_id: string | null;
  media_assignee_id: string | null;
};

export type WorkloadRow = {
  id: string;
  email: string;
  role: "pm" | "editor";
  total: number;
  byStage: { stage: CardStage; count: number }[];
};

/**
 * Returns one row per person in `people` who holds at least one matching
 * card in `cards` -- a person with zero matching cards is omitted
 * entirely, never returned as a zero-total row. `byStage` lists only
 * stages with count > 0, in `STAGE_ORDER` order, so chip order is stable
 * regardless of card insertion order. Rows are sorted by `total`
 * descending, ties broken by `email` ascending.
 */
export function computeWorkload(
  people: WorkloadPerson[],
  cards: WorkloadCard[]
): WorkloadRow[] {
  const rows: WorkloadRow[] = [];

  for (const person of people) {
    const countsByStage = new Map<CardStage, number>();
    for (const card of cards) {
      const holdsCard =
        person.role === "pm"
          ? card.assignee_id === person.id
          : card.media_assignee_id === person.id;
      if (!holdsCard) continue;
      countsByStage.set(card.stage, (countsByStage.get(card.stage) ?? 0) + 1);
    }

    const byStage = STAGE_ORDER.filter((stage) =>
      countsByStage.has(stage)
    ).map((stage) => ({ stage, count: countsByStage.get(stage)! }));

    const total = byStage.reduce((sum, entry) => sum + entry.count, 0);
    if (total === 0) continue;

    rows.push({
      id: person.id,
      email: person.email,
      role: person.role,
      total,
      byStage,
    });
  }

  return rows.sort((a, b) => {
    if (b.total !== a.total) return b.total - a.total;
    return a.email.localeCompare(b.email);
  });
}
