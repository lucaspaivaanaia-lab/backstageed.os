import { createClient } from "@/lib/supabase/server";
import { resolvePmNames } from "@/lib/actions/clients";
import type { CardStage } from "@/lib/cards/stages";
import { CardAuditPanel } from "./card-audit-panel";

export type AuditCardType = "single" | "package" | "piece";

export type AuditChecklistItem = {
  id: string;
  card_id: string;
  label: string;
  sort_order: number;
  completed_at: string | null;
  completed_by: string | null;
};

export type AuditAttachment = {
  id: string;
  card_id: string;
  url: string;
  label: string | null;
  link_type: "image" | "video" | "pdf" | "other";
  created_at: string;
};

export type AuditOverride = {
  id: string;
  card_id: string;
  overridden_by: string;
  occurred_at: string;
  unchecked_item_labels: string[];
  from_stage: CardStage;
  to_stage: CardStage;
};

export type AuditCard = {
  id: string;
  client_id: string;
  title: string;
  card_type: AuditCardType;
  stage: CardStage | null;
  description: string | null;
  assignee_id: string | null;
  created_at: string;
  checklistItems: AuditChecklistItem[];
  attachments: AuditAttachment[];
  overrides: AuditOverride[];
};

export type AuditClient = { id: string; name: string };

/**
 * Admin cross-client card audit screen (CHK-04). Reads through the
 * RLS-scoped `createClient()` — `is_admin()` already grants the Admin
 * unrestricted reads across every client's cards, so no service-role/
 * privileged Supabase client is warranted here. This is the Admin-side
 * home for the D-11 override trigger (03-UI-SPEC.md's "Forçar avanço"
 * placement in `/pm/board`'s Dialog is unreachable for an Admin —
 * middleware.ts role-routes Admin away from every `/pm/*` path).
 */
export default async function AdminCardsPage({
  searchParams,
}: {
  searchParams: Promise<{ client?: string }>;
}) {
  const { client: clientFilter } = await searchParams;
  const supabase = await createClient();

  const [{ data: clients }, { data: cards }] = await Promise.all([
    supabase
      .from("clients")
      .select("id, name")
      // Matches the established convention (app/admin/clients/page.tsx,
      // app/pm/board/page.tsx) of excluding soft-deleted clients from an
      // active-selection roster.
      .is("archived_at", null)
      .order("name", { ascending: true }),
    (() => {
      let query = supabase
        .from("cards")
        .select(
          "id, client_id, title, card_type, stage, description, assignee_id, created_at"
        )
        .order("created_at", { ascending: false });
      if (clientFilter) {
        query = query.eq("client_id", clientFilter);
      }
      return query;
    })(),
  ]);

  const cardIds = (cards ?? []).map((c) => c.id);

  const [{ data: checklistItems }, { data: attachments }, { data: overrides }] =
    await Promise.all([
      cardIds.length > 0
        ? supabase
            .from("card_checklist_items")
            .select("id, card_id, label, sort_order, completed_at, completed_by")
            .in("card_id", cardIds)
            .order("sort_order", { ascending: true })
        : Promise.resolve({ data: [] as AuditChecklistItem[] }),
      cardIds.length > 0
        ? supabase
            .from("card_attachments")
            .select("id, card_id, url, label, link_type, created_at")
            .in("card_id", cardIds)
            .order("created_at", { ascending: true })
        : Promise.resolve({ data: [] as AuditAttachment[] }),
      cardIds.length > 0
        ? supabase
            .from("card_checklist_overrides")
            .select(
              "id, card_id, overridden_by, occurred_at, unchecked_item_labels, from_stage, to_stage"
            )
            .in("card_id", cardIds)
            .order("occurred_at", { ascending: true })
        : Promise.resolve({ data: [] as AuditOverride[] }),
    ]);

  const completedByIds = (checklistItems ?? [])
    .map((item) => item.completed_by)
    .filter((id): id is string => Boolean(id));
  const assigneeIds = (cards ?? [])
    .map((card) => card.assignee_id)
    .filter((id): id is string => Boolean(id));
  const overriddenByIds = (overrides ?? []).map((o) => o.overridden_by);
  const idsToResolve = Array.from(
    new Set([...completedByIds, ...assigneeIds, ...overriddenByIds])
  );
  const pmNames = await resolvePmNames(idsToResolve);

  const itemsByCardId = new Map<string, AuditChecklistItem[]>();
  for (const item of checklistItems ?? []) {
    const existing = itemsByCardId.get(item.card_id) ?? [];
    existing.push(item);
    itemsByCardId.set(item.card_id, existing);
  }

  const attachmentsByCardId = new Map<string, AuditAttachment[]>();
  for (const attachment of attachments ?? []) {
    const existing = attachmentsByCardId.get(attachment.card_id) ?? [];
    existing.push(attachment);
    attachmentsByCardId.set(attachment.card_id, existing);
  }

  const overridesByCardId = new Map<string, AuditOverride[]>();
  for (const override of overrides ?? []) {
    const existing = overridesByCardId.get(override.card_id) ?? [];
    existing.push(override);
    overridesByCardId.set(override.card_id, existing);
  }

  const auditCards: AuditCard[] = (cards ?? []).map((card) => ({
    ...card,
    checklistItems: itemsByCardId.get(card.id) ?? [],
    attachments: attachmentsByCardId.get(card.id) ?? [],
    overrides: overridesByCardId.get(card.id) ?? [],
  }));

  return (
    <CardAuditPanel
      clients={(clients ?? []) as AuditClient[]}
      activeClientId={clientFilter ?? null}
      cards={auditCards}
      pmNames={pmNames}
    />
  );
}
