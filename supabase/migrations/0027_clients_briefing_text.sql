-- Quick task 260811-kl3: abandon the 4 fixed strategic-briefing columns in
-- favor of a single free-text Markdown field, with the AI proposing its
-- own document structure instead of fixed JSON keys (P2 of the 2026-08-05
-- Juliano action plan, direction "b", user decision 2026-08-11).
--
-- No backfill: every current client row is confirmed test/fake data (user
-- decision, 2026-08-11, CONTEXT.md) -- old objective/tone_of_voice/
-- target_audience/content_pillars content is intentionally discarded, not
-- migrated into the new column. Client ROWS themselves are untouched --
-- only these 4 columns are dropped and replaced with one new column.
--
-- RLS is already enabled on public.clients (0002_clients_stub.sql). Neither
-- DROP COLUMN nor ADD COLUMN disables RLS or requires a new policy --
-- clients_select_scoped/clients_update_scoped (0004/0007) are row-level,
-- with no column list, so they automatically cover the new column exactly
-- like every other column on this table (same precedent noted in
-- 0025_clients_tag.sql). The original 0006_clients_full_record.sql
-- migration that introduced these 4 columns is NOT edited (history
-- preserved), same precedent as 0012_drop_tropicalia_project_id.sql.

alter table public.clients
  drop column objective,
  drop column tone_of_voice,
  drop column target_audience,
  drop column content_pillars,
  add column briefing text;
