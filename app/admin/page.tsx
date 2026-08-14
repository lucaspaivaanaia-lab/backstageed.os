import { createClient } from "@/lib/supabase/server";
import { resolvePmNames, listPmRoster, listEditorRoster } from "@/lib/actions/clients";
import type { CardStage } from "@/lib/cards/stages";
import { daysSinceUpdate } from "@/lib/cards/staleness";
import { parseOversightFilters } from "@/lib/cards/oversight-filters";
import { computeWorkload, type WorkloadRow } from "@/lib/cards/workload";
import { OversightPanel } from "./oversight-panel";

export type OversightClient = { id: string; name: string };

export type OversightPerson = { id: string; email: string; role: "pm" | "editor" };

export type OversightCard = {
  id: string;
  client_id: string;
  title: string;
  stage: CardStage;
  assignee_id: string | null;
  updated_at: string;
  daysSinceUpdate: number;
};

type RawCardRow = {
  id: string;
  client_id: string;
  title: string;
  stage: CardStage | null;
  assignee_id: string | null;
  updated_at: string;
};

type RawWorkloadCardRow = {
  client_id: string;
  stage: CardStage | null;
  assignee_id: string | null;
  media_assignee_id: string | null;
};

/**
 * Admin cross-client oversight dashboard (ADM-01/ADM-02/ADM-03, D-01/D-02/
 * D-03) — replaces the prior "under construction" placeholder. Reads
 * through the RLS-scoped `createClient()` only — no service-role/
 * privileged Supabase client for `cards`/`clients` — since `is_admin()`
 * already grants the Admin unrestricted reads across every client's cards,
 * exactly as app/admin/cards/page.tsx already documents for the same pair
 * of tables.
 *
 * Staleness is computed HERE, server-side, not in the client panel: this
 * keeps the panel a pure presentational component and removes any
 * SSR-vs-hydration clock mismatch on a day boundary. A single `now` read
 * for the whole page means two rows updated in the same second can never
 * disagree.
 */
export default async function AdminPage({
  searchParams,
}: {
  searchParams: Promise<{ client?: string; pm?: string }>;
}) {
  const { client: clientParam, pm: pmParam } = await searchParams;
  const { clientId, pmId, hasActiveFilter } = parseOversightFilters({
    client: clientParam,
    pm: pmParam,
  });

  const supabase = await createClient();

  const [
    { data: clients },
    { data: cards, error: cardsError },
    [pmRoster, editorRoster],
    { data: workloadCardsRaw },
  ] = await Promise.all([
    supabase
      .from("clients")
      .select("id, name")
      .is("archived_at", null)
      .order("name", { ascending: true }),
    (() => {
      let query = supabase
        .from("cards")
        .select("id, client_id, title, stage, assignee_id, updated_at")
        .in("card_type", ["single", "piece"])
        .order("updated_at", { ascending: true });
      if (clientId) {
        query = query.eq("client_id", clientId);
      }
      if (pmId) {
        // `pmId` reaching this template literal is already UUID-validated
        // by `parseOversightFilters` (T-06-06) -- both columns are
        // checked because a person can hold a card either as Responsável
        // (`assignee_id`) or as Designer/Mídia (`media_assignee_id`,
        // migration 0029); filtering only the first would hide an
        // Editor's entire queue.
        query = query.or(
          `assignee_id.eq.${pmId},media_assignee_id.eq.${pmId}`
        );
      }
      return query;
    })(),
    Promise.all([listPmRoster(), listEditorRoster()]),
    // Deliberately independent of `?client=`/`?pm=` -- the workload panel
    // answers "who is overloaded across the whole operation", not "within
    // the current filter", so it must NOT apply clientId/pmId here. This is
    // the one behaviour on this page a reader would otherwise assume was a
    // bug (T-06-09).
    supabase
      .from("cards")
      .select("client_id, stage, assignee_id, media_assignee_id")
      .in("card_type", ["single", "piece"])
      .is("publish_at", null),
  ]);

  const loadError = Boolean(cardsError);

  // Single combined roster feeds both the PM filter's Select options here
  // and the workload panel (06-02 Task 2) -- loaded exactly once.
  const people: OversightPerson[] = [
    ...pmRoster.map((p) => ({ ...p, role: "pm" as const })),
    ...editorRoster.map((p) => ({ ...p, role: "editor" as const })),
  ].sort((a, b) => a.email.localeCompare(b.email));

  // Cards belonging to a soft-archived client (clients.archived_at,
  // migration 0019) are operational noise on a triage screen, so they are
  // excluded here rather than surfaced. This also narrows `stage` to
  // non-null (a `package` row has `stage = null`, already excluded by the
  // card_type filter above, but the predicate double-guards it) without a
  // second query. Shared between the main query and the workload query
  // below, since both need the same non-archived-client narrowing.
  const activeClientIds = new Set((clients ?? []).map((c) => c.id));
  function isActiveStage(clientId: string, stage: CardStage | null): boolean {
    return activeClientIds.has(clientId) && stage !== null;
  }
  function isActiveCard(
    card: RawCardRow
  ): card is RawCardRow & { stage: CardStage } {
    return isActiveStage(card.client_id, card.stage);
  }

  const now = new Date();
  const oversightCards: OversightCard[] = ((cards ?? []) as RawCardRow[])
    .filter(isActiveCard)
    .map((card) => ({
      id: card.id,
      client_id: card.client_id,
      title: card.title,
      stage: card.stage,
      assignee_id: card.assignee_id,
      updated_at: card.updated_at,
      daysSinceUpdate: daysSinceUpdate(card.updated_at, now),
    }));

  const assigneeIds = oversightCards
    .map((card) => card.assignee_id)
    .filter((id): id is string => Boolean(id));
  const idsToResolve = Array.from(new Set(assigneeIds));
  const pmNames = await resolvePmNames(idsToResolve);

  const workloadCards = ((workloadCardsRaw ?? []) as RawWorkloadCardRow[])
    .filter((card): card is RawWorkloadCardRow & { stage: CardStage } =>
      isActiveStage(card.client_id, card.stage)
    )
    .map((card) => ({
      stage: card.stage,
      assignee_id: card.assignee_id,
      media_assignee_id: card.media_assignee_id,
    }));
  const workloadRows: WorkloadRow[] = computeWorkload(people, workloadCards);

  return (
    <OversightPanel
      clients={(clients ?? []) as OversightClient[]}
      cards={oversightCards}
      pmNames={pmNames}
      loadError={loadError}
      people={people}
      activeClientId={clientId}
      activePersonId={pmId}
      hasActiveFilter={hasActiveFilter}
      workloadRows={workloadRows}
    />
  );
}
