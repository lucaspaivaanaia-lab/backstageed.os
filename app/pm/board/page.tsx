import { createClient } from "@/lib/supabase/server";
import { STAGE_ORDER, type CardStage } from "@/lib/cards/stages";
import { BoardPanel } from "./board-panel";

export type BoardCardType = "single" | "package" | "piece";

export type BoardCard = {
  id: string;
  title: string;
  card_type: BoardCardType;
  stage: CardStage | null;
  parent_card_id: string | null;
  created_at: string;
};

export type BoardColumn = {
  stage: CardStage;
  cards: BoardCard[];
};

export type BoardClient = { id: string; name: string };

/**
 * PM Kanban board loader (KAN-01, KAN-02, KAN-03). D-10: the active client
 * lives in the URL (`?client=<id>`), matching the dedicated-screen-with-
 * client-switcher pattern established for chat (02-CONTEXT.md D-01). RLS
 * already scopes both queries — `clients` IS the roster (zero additional
 * app-layer filtering, mirrors app/pm/clients/page.tsx), and `cards` is
 * scoped to the caller's assigned clients via `cards_select_scoped`.
 *
 * Package parents (`stage === null`, per the `cards_package_has_no_stage`
 * check constraint) are deliberately excluded from every stage column and
 * collected separately — rendering them is plan 03-06's slice
 * (03-RESEARCH.md Pitfall 4). The panel never crashes on a null stage
 * because grouping happens here, server-side, via STAGE_ORDER — never an
 * inline literal stage array.
 */
export default async function PmBoardPage({
  searchParams,
}: {
  searchParams: Promise<{ client?: string }>;
}) {
  const { client: clientId } = await searchParams;
  const supabase = await createClient();

  const [{ data: clients }, { data: cards }] = await Promise.all([
    supabase
      .from("clients")
      .select("id, name")
      .order("name", { ascending: true }),
    clientId
      ? supabase
          .from("cards")
          .select("id, title, card_type, stage, parent_card_id, created_at")
          .eq("client_id", clientId)
          .order("created_at", { ascending: true })
      : Promise.resolve({ data: [] as BoardCard[] }),
  ]);

  const allCards = (cards ?? []) as BoardCard[];
  const packages = allCards.filter((c) => c.stage === null);

  const columns: BoardColumn[] = STAGE_ORDER.map((stage) => ({
    stage,
    cards: allCards.filter((c) => c.stage === stage),
  }));

  return (
    <BoardPanel
      clients={(clients ?? []) as BoardClient[]}
      activeClientId={clientId ?? null}
      columns={columns}
      packages={packages}
    />
  );
}
