-- Quick task 260811-m0t: Item 1 of the 2026-08-05 Juliano action plan's P3
-- ("dois canais por cliente") -- NOT two separate Kanban boards. A single
-- new `channel` column on the existing `public.cards` table lets every card
-- (single/package/piece alike) carry a "Planejamento" vs "Conteúdo" label,
-- reusing the one board/columns/RLS each client already has instead of
-- duplicating any of it (260811-lp5-CONTEXT.md, Item 1 decision).
--
-- Deliberately orthogonal to `card_type` (single/package/piece, KAN-01,
-- 0015_cards.sql) -- this column classifies WHAT KIND OF WORK the card
-- represents, not its structural role in the package/piece hierarchy. Do
-- not confuse the two, and do not touch lib/cards/package-rollup.ts, which
-- stays keyed purely on pieces' stages.
--
-- Naming note: "channel" here is this codebase's translation of the action
-- plan's own wording ("canais"), NOT a social media platform (LinkedIn/
-- Instagram/etc, this project's CLAUDE.md domain vocabulary) -- no such
-- concept exists elsewhere in this codebase today (confirmed by repo-wide
-- grep during planning).
--
-- Default 'conteudo': every card that exists today represents finished
-- content-production work, not a planning document, so the default
-- preserves today's implicit meaning for every pre-existing row with zero
-- backfill script needed -- unlike 0025_clients_tag.sql (no natural
-- default existed for `tag`), this column always has a value from a plain
-- DEFAULT, safe to add NOT NULL in the same statement.
--
-- RLS is already enabled on public.cards (0015_cards.sql). ADD COLUMN does
-- not disable it, and cards_select_scoped/cards_insert_scoped/
-- cards_update_scoped are row-level with no column list, so they
-- automatically cover this new column exactly like every other column on
-- this table -- same precedent as 0025_clients_tag.sql/
-- 0027_clients_briefing_text.sql. No new policy, no new grant, no new
-- pgTAP test file (grepped during planning -- no existing test references a
-- `channel` column or does full-row/`select *` equality on `cards`).

create type public.card_channel as enum ('planejamento', 'conteudo');

alter table public.cards
  add column channel public.card_channel not null default 'conteudo';
