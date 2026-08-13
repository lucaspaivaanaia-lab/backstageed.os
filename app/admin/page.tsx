import { createClient } from "@/lib/supabase/server";
import { resolvePmNames } from "@/lib/actions/clients";
import type { CardStage } from "@/lib/cards/stages";
import { daysSinceUpdate } from "@/lib/cards/staleness";
import { OversightPanel } from "./oversight-panel";

export type OversightClient = { id: string; name: string };

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
export default async function AdminPage() {
  const supabase = await createClient();

  const [{ data: clients }, { data: cards, error: cardsError }] = await Promise.all([
    supabase
      .from("clients")
      .select("id, name")
      .is("archived_at", null)
      .order("name", { ascending: true }),
    supabase
      .from("cards")
      .select("id, client_id, title, stage, assignee_id, updated_at")
      .in("card_type", ["single", "piece"])
      .order("updated_at", { ascending: true }),
  ]);

  const loadError = Boolean(cardsError);

  // Cards belonging to a soft-archived client (clients.archived_at,
  // migration 0019) are operational noise on a triage screen, so they are
  // excluded here rather than surfaced. This also narrows `stage` to
  // non-null (a `package` row has `stage = null`, already excluded by the
  // card_type filter above, but the predicate double-guards it) without a
  // second query.
  const activeClientIds = new Set((clients ?? []).map((c) => c.id));
  function isActiveCard(
    card: RawCardRow
  ): card is RawCardRow & { stage: CardStage } {
    return activeClientIds.has(card.client_id) && card.stage !== null;
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

  return (
    <OversightPanel
      clients={(clients ?? []) as OversightClient[]}
      cards={oversightCards}
      pmNames={pmNames}
      loadError={loadError}
    />
  );
}
