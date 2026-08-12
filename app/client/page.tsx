import { createClient } from "@/lib/supabase/server";
import type { CardStage } from "@/lib/cards/stages";
import { ClientBoardPanel } from "./client-board-panel";

export type ClientCardAttachment = {
  id: string;
  card_id: string;
  url: string;
  label: string | null;
  link_type: "image" | "video" | "pdf" | "other";
};

export type ClientBoardCard = {
  id: string;
  title: string;
  stage: CardStage;
  description: string | null;
  client_adjustment_comment: string | null;
  publish_at: string | null;
  created_at: string;
  updated_at: string;
  attachments: ClientCardAttachment[];
};

const CLIENT_CARD_SELECT =
  "id, title, stage, description, client_adjustment_comment, publish_at, created_at, updated_at";

/**
 * Client's landing screen (APR-01, D-01) — replaces the "Em construção"
 * placeholder. RLS IS the entire filter here, mirroring app/editor/page.tsx's
 * own "no ?client= param, no client-side client_id filter" convention:
 * migration 0032's fourth, stage-filtered Client branch on
 * cards_select_scoped already scopes every row returned below to the
 * caller's own client_id AND to exactly the two stages ('aprovacao_cliente',
 * 'agendamento') a Client may ever see — no .eq("client_id", ...) is added
 * client-side, and no other stage value is ever queried.
 */
export default async function ClientPage() {
  const supabase = await createClient();

  const { data: queueCardsRaw } = await supabase
    .from("cards")
    .select(CLIENT_CARD_SELECT)
    .eq("stage", "aprovacao_cliente")
    .order("created_at", { ascending: true });

  const { data: historyCardsRaw } = await supabase
    .from("cards")
    .select(CLIENT_CARD_SELECT)
    .eq("stage", "agendamento")
    .order("updated_at", { ascending: false });

  const allCardIds = [
    ...(queueCardsRaw ?? []).map((card) => card.id),
    ...(historyCardsRaw ?? []).map((card) => card.id),
  ];

  const { data: attachments } =
    allCardIds.length > 0
      ? await supabase
          .from("card_attachments")
          .select("id, card_id, url, label, link_type")
          .in("card_id", allCardIds)
          .order("created_at", { ascending: true })
      : { data: [] as ClientCardAttachment[] };

  const attachmentsByCardId = new Map<string, ClientCardAttachment[]>();
  for (const attachment of attachments ?? []) {
    const existing = attachmentsByCardId.get(attachment.card_id) ?? [];
    existing.push(attachment);
    attachmentsByCardId.set(attachment.card_id, existing);
  }

  const queueCards: ClientBoardCard[] = (queueCardsRaw ?? []).map((card) => ({
    ...card,
    attachments: attachmentsByCardId.get(card.id) ?? [],
  }));

  const historyCards: ClientBoardCard[] = (historyCardsRaw ?? []).map((card) => ({
    ...card,
    attachments: attachmentsByCardId.get(card.id) ?? [],
  }));

  return <ClientBoardPanel queueCards={queueCards} historyCards={historyCards} />;
}
