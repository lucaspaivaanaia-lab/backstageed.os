-- Phase 3: Content Production Kanban -- CHK-04, D-11.
--
-- Numbering note: the plan (03-05-PLAN.md) originally reserved 0019/0011 for
-- this table+test pair, written before the 2026-08-04/05 P0/P1/P2 pivot
-- consumed 0019 (clients.archived_at), 0020 (client_files update grant),
-- 0021 (pm_assigned_clients status check) and test 0011
-- (rls_pm_status_defense_test.sql). This migration is therefore 0022 and its
-- test is 0012 -- the next genuinely free numbers, confirmed by listing
-- supabase/migrations/ and supabase/tests/ immediately before writing this
-- file. No other content in the plan changes.
--
-- Pitfall 2 (repeated lesson, Phases 1/2/5): the GRANT to `authenticated`
-- ships in THIS SAME migration -- hosted Supabase auto-grants base table
-- privileges at provisioning while local `supabase start` does NOT, so a
-- deferred GRANT reproduces the exact same local-vs-hosted privilege gap
-- every prior phase already hit.
--
-- Why `unchecked_item_labels` is a frozen text[] rather than a set of FKs
-- into card_checklist_items: those rows can be checked later (a checklist
-- item does not freeze once a card moves on), but the audit record must
-- preserve what was TRUE AT OVERRIDE TIME, not what is true now. A FK set
-- would silently "heal" as items get checked after the fact, destroying the
-- very evidence this table exists to keep (03-RESEARCH.md Pattern 3).
--
-- Why this is its own narrow, single-purpose table and NOT a generic
-- audit_events/event_type table: every existing table in this schema
-- (messages, client_files, pm_clients, card_checklist_items,
-- card_attachments) is single-purpose and typed -- there is no precedent
-- anywhere in this codebase for a polymorphic event log, and introducing one
-- here for exactly one event type (the D-11 override) would be premature
-- generalization (03-RESEARCH.md Anti-Patterns). If Phase 6 (Admin
-- Oversight) later needs a broader activity feed, that is that phase's own
-- schema decision to make with its own requirements in hand.
--
-- This table is append-only by construction: no update policy, no delete
-- policy, and the GRANT below is select+insert only (T-03-27, Tampering).

create table public.card_checklist_overrides (
  id uuid primary key default gen_random_uuid(),
  card_id uuid not null references public.cards(id) on delete cascade,
  overridden_by uuid not null references public.profiles(id),
  occurred_at timestamptz not null default now(),
  unchecked_item_labels text[] not null default '{}',
  from_stage public.card_stage not null,
  to_stage public.card_stage not null
);

-- The Admin audit screen and the PM board both batch a read across every
-- card id on screen -- index the FK it filters on.
create index card_checklist_overrides_card_id_idx on public.card_checklist_overrides (card_id);

alter table public.card_checklist_overrides enable row level security;

-- The assigned PM must be able to READ the override, otherwise a bypass
-- would be invisible on their own board -- CHK-04's "never silent" half.
create policy "card_checklist_overrides_select_scoped"
on public.card_checklist_overrides for select to authenticated
using (
  (select public.is_admin())
  or card_id in (
    select id from public.cards
    where client_id in (select public.pm_assigned_clients())
  )
);

-- Insert is admin-only: only an Admin can perform (and thus log) an
-- override, per D-11. There is deliberately no update and no delete policy
-- here -- an audit row is append-only.
create policy "card_checklist_overrides_admin_insert"
on public.card_checklist_overrides for insert to authenticated
with check ((select public.is_admin()));

grant select, insert on public.card_checklist_overrides to authenticated;
