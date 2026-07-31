-- Phase 3: Content Production Kanban -- KAN-01, KAN-02.
-- Decisions: D-16/D-17/D-18 (optional plain-text description, detail-view
-- only, no markdown), D-19 (single optional assignee scoped to the
-- client's assigned PMs), D-15 (a card created directly in revisão interna
-- or a later stage must always carry its checklist snapshot -- which
-- requires a working compensating delete, see Body part 2 below).
--
-- RLS is ALREADY enabled on public.cards (0015_cards.sql) -- this is an
-- ALTER TABLE, it must NOT re-enable row level security.

-- ===========================================================================
-- Body, part 1 -- the columns.
-- ===========================================================================
alter table public.cards
  add column description text,
  add column assignee_id uuid references public.profiles(id) on delete set null;

-- `on delete set null` is deliberate: deleting a PM profile must orphan the
-- assignment, never cascade-delete the card.
create index idx_cards_assignee_id on public.cards (assignee_id);

-- The existing `grant select, insert, update on public.cards to
-- authenticated` from 0015_cards.sql already covers these new columns --
-- column-level grants are not needed.

-- ===========================================================================
-- Body, part 2 -- the D-15 DELETE capability.
-- ===========================================================================
-- This is NOT optional and NOT contingent on anything a later plan task
-- discovers. public.cards currently has NO delete grant (0015 grants only
-- select, insert, update), and D-15's fail-safe (app/pm/board/actions.ts's
-- createCard) is a compensating delete: when a card is created directly in
-- revisão interna or later and its checklist snapshot fails, the card row
-- MUST be removed, because a card sitting in a gated column with zero
-- checklist items passes isGateBlocked([]) vacuously -- a silently ungated
-- card with no audit trail, which is precisely what CHK-04 forbids. Without
-- this grant the compensating delete fails with "42501 permission denied
-- for table cards" and the fail-safe is a no-op. Because a migration
-- version already recorded in the remote migration history is never
-- re-executed by `db push`, this grant cannot be retrofitted into this file
-- later -- it ships now, unconditionally.
--
-- D-15 fail-safe: createCard's compensating delete (app/pm/board/actions.ts)
-- must be able to remove a card whose checklist snapshot failed. Mirrors
-- cards_update_scoped exactly -- same flat, non-recursive client_id check,
-- no subquery back into public.cards (Pitfall 1).
create policy "cards_delete_scoped"
on public.cards
for delete
to authenticated
using (
  (select public.is_admin())
  or client_id in (select public.pm_assigned_clients())
);

-- ADDITIVE grant -- not an edit to 0015's `grant select, insert, update
-- ...` line. 0015 is already applied to the remote database and its file
-- must not be touched; the effective privilege set after this migration is
-- select, insert, update, delete. `cards_delete_scoped` is the only `create
-- policy` statement in this migration -- 0015's three existing policies
-- already cover the two new columns above.
grant delete on public.cards to authenticated;

-- ===========================================================================
-- Body, part 3 -- the D-19 enforcement.
-- ===========================================================================
-- A plain CHECK constraint cannot be used because the rule needs a
-- subquery, and a trigger function running as the invoking user cannot see
-- another PM's pm_clients rows (pm_clients_select_own_or_admin restricts a
-- PM to pm_id = auth.uid()), which would make every legitimate cross-PM
-- assignment fail. So this is a single `security definer` trigger function
-- with the membership check inlined -- deliberately NOT a separate
-- callable helper function, because a standalone "is this PM on this
-- client" function would be an authenticated-callable membership oracle.
--
-- Every reference inside this function is schema-qualified because
-- search_path is empty -- the exact convention is_admin()/
-- pm_assigned_clients() follow in 0004_rls_policies.sql. The literal token
-- `assignee_not_assigned_to_client` is the contract the Server Actions
-- match on to produce a Portuguese message -- do not rework this exception
-- text. The trigger is BEFORE INSERT OR UPDATE only -- it deliberately does
-- not fire on DELETE, so it can never obstruct the D-15 compensating
-- delete above.
create or replace function public.enforce_card_assignee_membership()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.assignee_id is not null
     and not exists (
       select 1 from public.pm_clients
       where client_id = new.client_id and pm_id = new.assignee_id
     ) then
    raise exception 'assignee_not_assigned_to_client'
      using errcode = 'check_violation';
  end if;
  return new;
end;
$$;

create trigger cards_assignee_membership_trg
before insert or update on public.cards
for each row execute function public.enforce_card_assignee_membership();
