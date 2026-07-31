-- Phase 3: Content Production Kanban -- CHK-03, CHK-04.
-- Decisions: D-02 (no package-level checklist), D-04 (snapshot-at-entry,
-- never live-bound to the template).
--
-- Pitfall 2 (repeated lesson, Phases 1/2/5): the GRANT to `authenticated`
-- ships in THIS SAME migration -- hosted Supabase auto-grants base table
-- privileges at provisioning while local `supabase start` does NOT, so a
-- deferred GRANT reproduces the exact same local-vs-hosted privilege gap
-- every prior phase already hit.
--
-- Note on this table's RLS shape: unlike 0015_cards.sql's self-referencing
-- `cards` table, this table's RLS subquery targets `public.cards` -- a
-- DIFFERENT table -- so it is NOT the Pitfall 1 self-referencing-recursion
-- case. A cross-table subquery (card_checklist_items -> cards) is exactly
-- the shape already proven safe by client_files -> clients (0011).
--
-- This table is a COPY, never live-bound to `checklist_template_items` --
-- there is deliberately no `template_id`/`template_item_id` foreign key on
-- it (D-04: editing a template must not retroactively alter an in-progress
-- card's checklist).

create table public.card_checklist_items (
  id uuid primary key default gen_random_uuid(),
  card_id uuid not null references public.cards(id) on delete cascade,
  label text not null,
  sort_order int not null default 0,
  completed_at timestamptz,
  completed_by uuid references public.profiles(id),
  created_at timestamptz not null default now()
);

-- The board batches a read across every card id on screen (one query per
-- page load, not per card) -- index the FK it filters on.
create index card_checklist_items_card_id_idx on public.card_checklist_items (card_id);

alter table public.card_checklist_items enable row level security;

-- card_checklist_items inherits scoping through cards.client_id -- flat
-- subquery into cards (a DIFFERENT table, not self-referential).
create policy "card_checklist_items_select_scoped"
on public.card_checklist_items for select to authenticated
using (
  (select public.is_admin())
  or card_id in (
    select id from public.cards
    where client_id in (select public.pm_assigned_clients())
  )
);

create policy "card_checklist_items_write_scoped"
on public.card_checklist_items for all to authenticated
using (
  (select public.is_admin())
  or card_id in (
    select id from public.cards
    where client_id in (select public.pm_assigned_clients())
  )
)
with check (
  (select public.is_admin())
  or card_id in (
    select id from public.cards
    where client_id in (select public.pm_assigned_clients())
  )
);

grant select, insert, update on public.card_checklist_items to authenticated;
