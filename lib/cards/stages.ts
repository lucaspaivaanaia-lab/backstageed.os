/**
 * Pure stage-progression module for content cards (KAN-02, KAN-03, D-05).
 * Intentionally free of any Supabase/React import or I/O so this module can
 * be imported by its sibling `stages.test.ts` via a relative path and
 * exercised with Node's built-in test runner -- no live DB, no Docker
 * (mirrors lib/chat/stale-response-guard.ts's convention).
 *
 * `nextStage` is the ONLY place stage progression is expressed in this
 * codebase -- app/pm/board/page.tsx, board-panel.tsx, and actions.ts must
 * all import STAGE_ORDER/STAGE_LABELS/nextStage from here rather than
 * inlining their own ordered stage array.
 */
export type CardStage =
  | "briefing"
  | "producao"
  | "revisao_interna"
  | "aprovacao_cliente"
  | "agendamento";

export const STAGE_ORDER: readonly CardStage[] = [
  "briefing",
  "producao",
  "revisao_interna",
  "aprovacao_cliente",
  "agendamento",
] as const;

export const STAGE_LABELS: Record<CardStage, string> = {
  briefing: "Briefing",
  producao: "Produção",
  revisao_interna: "Revisão interna",
  aprovacao_cliente: "Aprovação do cliente",
  agendamento: "Agendamento",
};

/**
 * Returns the stage immediately after `current` in STAGE_ORDER, or `null`
 * when `current` is already the last stage (agendamento) -- there is
 * nothing after it, and callers must treat that as "Avançar" being
 * disabled/rejected, never wrapping or throwing.
 */
export function nextStage(current: CardStage): CardStage | null {
  const currentIndex = STAGE_ORDER.indexOf(current);
  const next = STAGE_ORDER[currentIndex + 1];
  return next ?? null;
}
