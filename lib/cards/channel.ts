/**
 * Pure "canal" (work-track) module for content cards -- quick task
 * 260811-m0t, Item 1 of the 2026-08-05 Juliano action plan's P3 ("dois
 * canais por cliente", 260811-lp5-CONTEXT.md). A card's `channel`
 * classifies whether it represents "Planejamento" (planning) or "Conteúdo"
 * (content) work -- a label on the SAME single board/columns every client
 * already has, never a second board. Deliberately orthogonal to
 * `card_type` (single/package/piece, KAN-01, lib/cards/package-rollup.ts)
 * -- do not conflate the two.
 *
 * "channel" here is this codebase's translation of the action plan's own
 * wording ("canais"), NOT a social media platform (LinkedIn/Instagram/etc)
 * -- no such concept exists elsewhere in this codebase.
 *
 * Free of any Supabase/React import, mirroring lib/cards/stages.ts's own
 * convention -- app/pm/board/page.tsx, board-panel.tsx, and
 * lib/validation/cards.ts must all import CardChannel/CHANNEL_LABELS from
 * here rather than inlining their own copies. lib/validation/cards.ts
 * additionally keeps its OWN literal-tuple mirror (`CARD_CHANNEL_VALUES`),
 * for the exact same reason `CARD_STAGE_VALUES` already does -- `z.enum`
 * requires a literal tuple, not an imported `readonly T[]`.
 */
export type CardChannel = "planejamento" | "conteudo";

export const CHANNEL_LABELS: Record<CardChannel, string> = {
  planejamento: "Planejamento",
  conteudo: "Conteúdo",
};
