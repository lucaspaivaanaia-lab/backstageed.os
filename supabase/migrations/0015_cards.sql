-- Phase 3: Content Production Kanban -- KAN-01, KAN-02, KAN-03.
-- Decisions: D-01 (package parent + independent sub-cards), D-02 (no
-- package-level stage/checklist), D-05 (explicit "Avançar" button, no
-- drag-and-drop -- this migration only shapes the data, not the UI).
--
-- Pitfall 2 (repeated lesson, Phases 1/2/5): the GRANT to `authenticated`
-- ships in THIS SAME migration -- hosted Supabase auto-grants base table
-- privileges at provisioning while local `supabase start` does NOT, so a
-- deferred GRANT reproduces the exact same local-vs-hosted privilege gap
-- every prior phase already hit.
--
-- Pitfall 1 (self-referencing RLS recursion): `cards` is this codebase's
-- first self-referencing table (`parent_card_id -> cards.id`). A policy
-- that tries to infer a sub-card's client via a subquery back into
-- `public.cards` throws "infinite recursion detected in policy" at query
-- time (passes migration apply silently, fails on first real query). The
-- fix applied below: `client_id` is denormalized onto EVERY row (parent,
-- single-post card, and every sub-card/piece), so every policy is a flat,
-- non-recursive `client_id in (...)` check with ZERO subqueries into
-- `public.cards` itself. No policy in this file may contain
-- `from public.cards` in any form.
--
-- Source: pattern derived from Supabase community guidance on
-- self-referencing RLS (https://github.com/orgs/supabase/discussions/3328)
-- plus this codebase's own established denormalization precedent
-- (messages.client_id, client_files.client_id both store client_id
-- directly rather than joining) -- see 03-RESEARCH.md Pattern 1.

create type public.card_type as enum ('single', 'package', 'piece');
create type public.card_stage as enum (
  'briefing', 'producao', 'revisao_interna', 'aprovacao_cliente', 'agendamento'
);

create table public.cards (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.clients(id) on delete cascade,
  parent_card_id uuid references public.cards(id) on delete cascade,
  card_type public.card_type not null default 'single',
  title text not null,
  -- Package parents don't have their own stage (D-02: no package-level
  -- checklist gate, and by extension no package-level stage progression) --
  -- enforced by the check constraint below, not left to convention.
  stage public.card_stage,
  created_by uuid not null references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint cards_package_has_no_stage
    check (
      (card_type = 'package' and stage is null)
      or (card_type in ('single', 'piece') and stage is not null)
    ),
  constraint cards_piece_requires_parent
    check (
      (card_type = 'piece' and parent_card_id is not null)
      or (card_type in ('single', 'package'))
    )
);

alter table public.cards enable row level security;

-- Flat, non-recursive policies -- client_id lives on THIS row, never a
-- subquery back into cards itself (Pitfall 1 above).
create policy "cards_select_scoped"
on public.cards
for select
to authenticated
using (
  (select public.is_admin())
  or client_id in (select public.pm_assigned_clients())
);

create policy "cards_insert_scoped"
on public.cards
for insert
to authenticated
with check (
  (select public.is_admin())
  or client_id in (select public.pm_assigned_clients())
);

create policy "cards_update_scoped"
on public.cards
for update
to authenticated
using (
  (select public.is_admin())
  or client_id in (select public.pm_assigned_clients())
)
with check (
  (select public.is_admin())
  or client_id in (select public.pm_assigned_clients())
);

grant select, insert, update on public.cards to authenticated;
