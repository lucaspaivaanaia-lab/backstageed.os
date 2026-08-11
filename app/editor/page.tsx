import { createClient } from "@/lib/supabase/server";
import { STAGE_LABELS, type CardStage } from "@/lib/cards/stages";
import { resolvePmNames } from "@/lib/actions/clients";
import { EditorQueuePanel } from "./editor-queue-panel";

export type EditorChecklistItem = {
  id: string;
  card_id: string;
  label: string;
  sort_order: number;
  completed_at: string | null;
  completed_by: string | null;
};

export type EditorAttachment = {
  id: string;
  card_id: string;
  url: string;
  label: string | null;
  link_type: "image" | "video" | "pdf" | "other";
  created_at: string;
};

export type EditorQueueCard = {
  id: string;
  title: string;
  stage: CardStage | null;
  description: string | null;
  client_id: string;
  clientName: string;
  due_date: string | null;
  created_at: string;
  checklistItems: EditorChecklistItem[];
  attachments: EditorAttachment[];
};

/**
 * Editor's landing/queue screen (item 3, 260811-oe0-CONTEXT.md) -- ALL cards
 * where the caller is media_assignee_id, across EVERY client, ordered by
 * due_date (nulls last). Unlike app/pm/board/page.tsx, this is
 * DELIBERATELY cross-client -- no ?client= param, no client switcher --
 * media_assignee_id has no client boundary (260811-oe0-RESEARCH.md Code
 * Examples). cards_select_scoped's media_assignee_id branch (migration
 * 0031) is the ENTIRE filter -- no .eq("media_assignee_id", ...) needed
 * client-side, RLS already returns only the caller's own assigned cards.
 */
export default async function EditorQueuePage() {
  const supabase = await createClient();

  const { data: cards } = await supabase
    .from("cards")
    .select("id, title, stage, description, client_id, due_date, created_at")
    .order("due_date", { ascending: true, nullsFirst: false });

  const clientIds = Array.from(new Set((cards ?? []).map((c) => c.client_id)));
  const { data: clients } =
    clientIds.length > 0
      ? await supabase.from("clients").select("id, name").in("id", clientIds)
      : { data: [] as { id: string; name: string }[] };
  const clientNameById = new Map((clients ?? []).map((c) => [c.id, c.name]));

  const cardIds = (cards ?? []).map((c) => c.id);

  const { data: checklistItems } =
    cardIds.length > 0
      ? await supabase
          .from("card_checklist_items")
          .select("id, card_id, label, sort_order, completed_at, completed_by")
          .in("card_id", cardIds)
          .order("sort_order", { ascending: true })
      : { data: [] as EditorChecklistItem[] };

  const { data: attachments } =
    cardIds.length > 0
      ? await supabase
          .from("card_attachments")
          .select("id, card_id, url, label, link_type, created_at")
          .in("card_id", cardIds)
          .order("created_at", { ascending: true })
      : { data: [] as EditorAttachment[] };

  const completedByIds = (checklistItems ?? [])
    .map((item) => item.completed_by)
    .filter((id): id is string => Boolean(id));
  const pmNames = await resolvePmNames(Array.from(new Set(completedByIds)));

  const itemsByCardId = new Map<string, EditorChecklistItem[]>();
  for (const item of checklistItems ?? []) {
    const existing = itemsByCardId.get(item.card_id) ?? [];
    existing.push(item);
    itemsByCardId.set(item.card_id, existing);
  }

  const attachmentsByCardId = new Map<string, EditorAttachment[]>();
  for (const attachment of attachments ?? []) {
    const existing = attachmentsByCardId.get(attachment.card_id) ?? [];
    existing.push(attachment);
    attachmentsByCardId.set(attachment.card_id, existing);
  }

  const queueCards: EditorQueueCard[] = (cards ?? []).map((card) => ({
    ...card,
    clientName: clientNameById.get(card.client_id) ?? card.client_id,
    checklistItems: itemsByCardId.get(card.id) ?? [],
    attachments: attachmentsByCardId.get(card.id) ?? [],
  }));

  return <EditorQueuePanel cards={queueCards} pmNames={pmNames} />;
}
