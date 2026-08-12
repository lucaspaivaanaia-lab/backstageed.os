import { createClient } from "@/lib/supabase/server";
import { STAGE_ORDER, type CardStage } from "@/lib/cards/stages";
import type { CardChannel } from "@/lib/cards/channel";
import { resolvePmNames, listClientPmRoster, listEditorRoster } from "@/lib/actions/clients";
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

/**
 * A D-11 force-advance audit row (CHK-04, plan 03-05). `unchecked_item_labels`
 * is a frozen snapshot taken at override time — never re-derived from the
 * card's CURRENT checklist state, which may have since changed.
 */
export type BoardOverride = {
  id: string;
  card_id: string;
  overridden_by: string;
  occurred_at: string;
  unchecked_item_labels: string[];
  from_stage: CardStage;
  to_stage: CardStage;
};

export type BoardCard = {
  id: string;
  title: string;
  card_type: BoardCardType;
  stage: CardStage | null;
  parent_card_id: string | null;
  description: string | null;
  assignee_id: string | null;
  media_assignee_id: string | null;
  channel: CardChannel;
  due_date: string | null;
  created_at: string;
  checklistItems: BoardChecklistItem[];
  attachments: BoardAttachment[];
  overrides: BoardOverride[];
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

  const [{ data: clients }, { data: cards }, { data: activeClient }, pmRoster, editorRoster] =
    await Promise.all([
      supabase
        .from("clients")
        .select("id, name")
        // P1 pivot 2026-08-04: excludes soft-deleted ("Excluir cliente")
        // clients from the board switcher roster.
        .is("archived_at", null)
        .order("name", { ascending: true }),
      clientId
        ? supabase
            .from("cards")
            .select(
              "id, title, card_type, stage, parent_card_id, description, assignee_id, media_assignee_id, channel, due_date, created_at"
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
      listEditorRoster(),
    ]);

  const mediaAssigneeRoster: BoardPmRosterEntry[] = [...pmRoster, ...editorRoster];

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

  // D-11 override audit rows (CHK-04) — the PM-facing half of the "never
  // silent" guarantee. Same batched-read/cardIds.length guard shape as the
  // checklist/attachment reads above.
  const { data: overrides } =
    cardIds.length > 0
      ? await supabase
          .from("card_checklist_overrides")
          .select(
            "id, card_id, overridden_by, occurred_at, unchecked_item_labels, from_stage, to_stage"
          )
          .in("card_id", cardIds)
          .order("occurred_at", { ascending: true })
      : { data: [] as BoardOverride[] };

  const completedByIds = (checklistItems ?? [])
    .map((item) => item.completed_by)
    .filter((id): id is string => Boolean(id));
  const assigneeIds = (cards ?? [])
    .map((card) => card.assignee_id)
    .filter((id): id is string => Boolean(id));
  // Item 4, 260811-n0i: same batched-resolve treatment as assigneeIds above
  // -- pmNames must cover media_assignee_id too, so BoardCardItem's meta
  // line and the detail dialog's stale-id fallback can display a name
  // instead of a raw uuid.
  const mediaAssigneeIds = (cards ?? [])
    .map((card) => card.media_assignee_id)
    .filter((id): id is string => Boolean(id));
  const overriddenByIds = (overrides ?? []).map((o) => o.overridden_by);
  const idsToResolve = Array.from(
    new Set([...completedByIds, ...assigneeIds, ...mediaAssigneeIds, ...overriddenByIds])
  );
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

  const overridesByCardId = new Map<string, BoardOverride[]>();
  for (const override of overrides ?? []) {
    const existing = overridesByCardId.get(override.card_id) ?? [];
    existing.push(override);
    overridesByCardId.set(override.card_id, existing);
  }

  const allCards: BoardCard[] = (cards ?? []).map((card) => ({
    ...card,
    checklistItems: itemsByCardId.get(card.id) ?? [],
    attachments: attachmentsByCardId.get(card.id) ?? [],
    overrides: overridesByCardId.get(card.id) ?? [],
  }));

  // Plan 03-06 (KAN-01 package half, D-01/D-02): split into three groups by
  // `card_type` server-side. `packages` (stage === null per
  // cards_package_has_no_stage) never populate a stage column — a package
  // row has no stage of its own and would either crash the stage filter or
  // silently vanish (03-RESEARCH.md Pitfall 4). `pieces` and `standalone`
  // ("single") cards both populate the five stage columns exactly like
  // before this plan, since only a null stage is excluded below.
  const packages = allCards.filter(
    (c) => c.card_type === "package" && c.stage === null
  );
  const pieces = allCards.filter((c) => c.card_type === "piece");

  const columns: BoardColumn[] = STAGE_ORDER.map((stage) => ({
    stage,
    cards: allCards.filter((c) => c.stage === stage),
  }));

  // Per-package, the ordered list of its pieces' CURRENT stages — feeds
  // `packageRollupLabel`, computed at render time in the panel, never
  // stored (D-02, 03-RESEARCH.md Anti-Patterns).
  const piecesByPackageId: Record<string, CardStage[]> = {};
  for (const piece of pieces) {
    if (!piece.parent_card_id || !piece.stage) continue;
    piecesByPackageId[piece.parent_card_id] = [
      ...(piecesByPackageId[piece.parent_card_id] ?? []),
      piece.stage,
    ];
  }

  // A piece names its package on the board (Task 2, action E) without a
  // client-side lookup.
  const parentTitleById: Record<string, string> = {};
  for (const pkg of packages) {
    parentTitleById[pkg.id] = pkg.title;
  }

  return (
    <BoardPanel
      clients={(clients ?? []) as BoardClient[]}
      activeClientId={clientId ?? null}
      columns={columns}
      packages={packages}
      piecesByPackageId={piecesByPackageId}
      parentTitleById={parentTitleById}
      pmNames={pmNames}
      pmRoster={pmRoster}
      mediaAssigneeRoster={mediaAssigneeRoster}
      hasChecklistTemplate={Boolean(activeClient?.checklist_template_id)}
    />
  );
}
