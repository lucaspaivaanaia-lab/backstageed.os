-- Quick task 260810-g3f: unique client tag (nome fantasia/codigo curto),
-- distinct from `name` (nome de exibicao) -- built as the key a LATER quick
-- task will use to identify a client when assembling AI prompts, instead of
-- `name`. Motivated by a real production bug: a client's own reference file
-- mentioned more than one company/person by name, and the AI could not tell
-- which client's data was actually in scope. This migration only adds the
-- column/constraint/backfill -- the prompt-assembly change that actually
-- uses `tag` as an isolation key is a separate, later quick task.
--
-- RLS is already enabled on public.clients (0002_clients_stub.sql) and an
-- ALTER TABLE ADD COLUMN does not disable it (CVE-2025-48757 discipline only
-- applies to new CREATE TABLE statements, per the precedent comment in
-- 0006/0014_clients_checklist_template.sql) -- the existing
-- clients_select_scoped/clients_update_scoped policies already cover
-- reads/writes of this new column like every other column on this table.
-- No new policy needed.

alter table public.clients
  add column tag text;

-- Postgres has no native case-insensitive UNIQUE constraint on a plain
-- column -- a functional unique index on lower(tag) is the standard
-- workaround (same reasoning as clients_archived_at_idx in
-- 0019_clients_archived_at.sql: index the exact predicate the app relies
-- on).
create unique index clients_tag_key on public.clients (lower(tag));

-- Backfill: every row that existed before this migration gets a tag
-- derived from its current `name` -- uppercase, every run of
-- non-alphanumeric characters collapsed to a single hyphen, leading/
-- trailing hyphens trimmed. This matches the format
-- lib/validation/clients.ts enforces for every NEW client tag from here on
-- (letters/numbers/hyphen only, no spaces). A row-number suffix
-- (-2, -3, ...) breaks any collision after normalization, ordered by
-- created_at so the suffix assignment is deterministic. The 5 real rows at
-- the time of writing ("Cliente Demo", "eduardo", "Juliano", "juju",
-- "Lucas Paiva") do not actually collide, but this suffix logic is not
-- conditional on that -- it must hold generically.
with normalized as (
  select
    id,
    created_at,
    regexp_replace(
      regexp_replace(upper(name), '[^A-Z0-9]+', '-', 'g'),
      '(^-+|-+$)', '', 'g'
    ) as base_tag
  from public.clients
),
numbered as (
  select
    id,
    base_tag,
    row_number() over (partition by base_tag order by created_at, id) as rn
  from normalized
)
update public.clients c
set tag = case when n.rn = 1 then n.base_tag else n.base_tag || '-' || n.rn end
from numbered n
where c.id = n.id;

-- Every existing row now has a non-null tag (backfilled above) -- safe to
-- enforce NOT NULL for every client from here on. lib/validation/clients.ts
-- (clientCreateSchema) requires `tag` at the app layer too; this is the
-- DB-level backstop, same division of labor as every other required
-- column on this table.
alter table public.clients
  alter column tag set not null;
