import { createClient } from "@/lib/supabase/server";
import { STAGE_ORDER, type CardStage } from "@/lib/cards/stages";
import { resolvePmNames, listClientPmRoster } from "@/lib/actions/clients";
import { BoardPanel } from "./board-panel";

export type BoardCardType = "single" | "package" | "piece";

export type BoardChecklistItem = {
  id: string;
  card_id: string;
  label: string;
  sort_order: number;
  completed_at: string | null;
  completed_by: string | null;
};

export type BoardAttachment = {
  id: string;
  card_id: string;
  url: string;
  label: string | null;
  link_type: "image" | "video" | "pdf" | "other";
  created_at: string;
};

export type BoardCard = {
  id: string;
  title: string;
  card_type: BoardCardType;
  stage: CardStage | null;
  parent_card_id: string | null;
  description: string | null;
  assignee_id: string | null;
  created_at: string;
  checklistItems: BoardChecklistItem[];
  attachments: BoardAttachment[];
};

export type BoardColumn = {
  stage: CardStage;
  cards: BoardCard[];
};

export type BoardClient = { id: string; name: string };

export type BoardPmRosterEntry = { id: string; email: string };

/**
 * PM Kanban board loader (KAN-01, KAN-02, KAN-03, CHK-03). D-10: the active
 * client lives in the URL (`?client=<id>`), matching the dedicated-screen-
 * with-client-switcher pattern established for chat (02-CONTEXT.md D-01).
 * RLS already scopes both queries — `clients` IS the roster (zero
 * additional app-layer filtering, mirrors app/pm/clients/page.tsx), and
 * `cards` is scoped to the caller's assigned clients via
 * `cards_select_scoped`.
 *
 * Package parents (`stage === null`, per the `cards_package_has_no_stage`
 * check constraint) are deliberately excluded from every stage column and
 * collected separately — rendering them is plan 03-06's slice
 * (03-RESEARCH.md Pitfall 4). The panel never crashes on a null stage
 * because grouping happens here, server-side, via STAGE_ORDER — never an
 * inline literal stage array.
 *
 * Checklist completion (CHK-03/D-06) is computed here, server-side, and is
 * the ONLY source of truth for the "Avançar" disabled attribute — the
 * panel must not recompute it from its own state (03-RESEARCH.md
 * Anti-Patterns, first bullet). A single combined id-resolution call turns
 * both each checked item's `completed_by` id AND each card's `assignee_id`
 * (D-19) into display emails for the per-item audit line and the board
 * card's meta line respectively — `listClientPmRoster` (lib/actions/
 * clients.ts) covers the normal assignee-picker case, this combined call is
 * only the fallback for a card whose assignee has since been unassigned
 * from the client and therefore no longer appears in the roster.
 */
export default async function PmBoardPage({
  searchParams,
}: {
  searchParams: Promise<{ client?: string }>;
}) {
  const { client: clientId } = await searchParams;
  const supabase = await createClient();

  const [{ data: clients }, { data: cards }, { data: activeClient }, pmRoster] =
    await Promise.all([
      supabase
        .from("clients")
        .select("id, name")
        .order("name", { ascending: true }),
      clientId
        ? supabase
            .from("cards")
            .select(
              "id, title, card_type, stage, parent_card_id, description, assignee_id, created_at"
            )
            .eq("client_id", clientId)
            .order("created_at", { ascending: true })
        : Promise.resolve({ data: [] as Omit<BoardCard, "checklistItems">[] }),
      clientId
        ? supabase
            .from("clients")
            .select("checklist_template_id")
            .eq("id", clientId)
            .single()
        : Promise.resolve({ data: null as { checklist_template_id: string | null } | null }),
      clientId
        ? listClientPmRoster(clientId)
        : Promise.resolve([] as BoardPmRosterEntry[]),
    ]);

  const cardIds = (cards ?? []).map((c) => c.id);

  const { data: checklistItems } =
    cardIds.length > 0
      ? await supabase
          .from("card_checklist_items")
          .select("id, card_id, label, sort_order, completed_at, completed_by")
          .in("card_id", cardIds)
          .order("sort_order", { ascending: true })
      : { data: [] as BoardChecklistItem[] };

  const { data: attachments } =
    cardIds.length > 0
      ? await supabase
          .from("card_attachments")
          .select("id, card_id, url, label, link_type, created_at")
          .in("card_id", cardIds)
          .order("created_at", { ascending: true })
      : { data: [] as BoardAttachment[] };

  const completedByIds = (checklistItems ?? [])
    .map((item) => item.completed_by)
    .filter((id): id is string => Boolean(id));
  const assigneeIds = (cards ?? [])
    .map((card) => card.assignee_id)
    .filter((id): id is string => Boolean(id));
  const idsToResolve = Array.from(new Set([...completedByIds, ...assigneeIds]));
  const pmNames = await resolvePmNames(idsToResolve);

  const itemsByCardId = new Map<string, BoardChecklistItem[]>();
  for (const item of checklistItems ?? []) {
    const existing = itemsByCardId.get(item.card_id) ?? [];
    existing.push(item);
    itemsByCardId.set(item.card_id, existing);
  }

  const attachmentsByCardId = new Map<string, BoardAttachment[]>();
  for (const attachment of attachments ?? []) {
    const existing = attachmentsByCardId.get(attachment.card_id) ?? [];
    existing.push(attachment);
    attachmentsByCardId.set(attachment.card_id, existing);
  }

  const allCards: BoardCard[] = (cards ?? []).map((card) => ({
    ...card,
    checklistItems: itemsByCardId.get(card.id) ?? [],
    attachments: attachmentsByCardId.get(card.id) ?? [],
  }));
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
      pmNames={pmNames}
      pmRoster={pmRoster}
      hasChecklistTemplate={Boolean(activeClient?.checklist_template_id)}
    />
  );
}
