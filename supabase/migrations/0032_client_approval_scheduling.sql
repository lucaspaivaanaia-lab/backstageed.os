-- Phase 4 (Client Approval & Scheduling), Wave 0 (04-01-PLAN.md, Task 1).
-- Requirements: KAN-04, APR-01, APR-02, APR-03, SCH-01, SCH-02.
--
-- Scope of this file:
--   1. cards_select_scoped / cards_update_scoped: a FOURTH, Client-specific
--      OR-branch, stage-filtered (never client-wide) -- mirrors 0031's own
--      drop/recreate style exactly, reproducing the existing 3 branches
--      (is_admin(), pm_assigned_clients(), media_assignee_id) verbatim and
--      adding one more.
--   2. card_attachments_select_scoped: a matching read-only Client branch.
--      The write-side attachment policies (0018) are UNTOUCHED -- a Client
--      never writes an attachment.
--   3. Two new nullable columns on public.cards: client_adjustment_comment
--      (the Client's free-text feedback on an adjustment request, KAN-04/
--      APR-03) and publish_at (the PM-registered publish date/time, SCH-01),
--      plus one index on publish_at (never on client_adjustment_comment --
--      it is never filtered/sorted on).
--
-- Deliberately NOT done, mirroring 0031's own stated non-goals:
--   * No is_client() helper mirroring is_admin()'s convention -- every
--     Client-inclusive branch below inlines the predicate directly, exactly
--     like clients_select_scoped's own Client branch (0004_rls_policies.sql,
--     unchanged since Phase 1) already does, and exactly like 0031
--     deliberately did NOT add an is_editor() helper. A standalone
--     is_client() would have zero call sites beyond this file.
--   * No 2-migration enum split -- unlike the Editor role (0030/0031), this
--     phase adds NO new user_role enum value ('client' already exists since
--     0001_profiles.sql) and NO new card_stage enum value (D-04: "Pronto
--     para publicar" is a pure render-time computation over stage +
--     publish_at, never a stored status) -- so there is no Postgres 55P04
--     ordering constraint to satisfy here.
--   * No touch to checklist-snapshot.ts / card_checklist_items --
--     snapshotChecklistForCard's existing idempotency already makes
--     re-entry into revisão interna (the adjustment bounce-back, KAN-04)
--     correct with zero further schema/RLS change.
--   * No new GRANT statement -- `grant select, insert, update on
--     public.cards to authenticated` (0015_cards.sql) already covers the
--     two new columns; a plain ADD COLUMN is automatically covered by
--     existing table-level GRANTs and by the row-level policies below (same
--     precedent as 0025/0027/0028/0029/0031's own due_date addition).
--
-- Hardening included (optional per 04-RESEARCH.md Pitfall 5, included here
-- for consistency with 0021's own "database layer independently correct"
-- philosophy): the new Client branches re-derive `status = 'approved'` from
-- public.profiles on every evaluation, mirroring
-- 0021_pm_assigned_clients_status_check.sql's own hardening for the PM
-- case -- middleware.ts's redirect-to-/rejected gate remains the PRIMARY
-- boundary (unchanged by this migration), this is defense in depth only.

-- ===========================================================================
-- 1. cards -- add the Client, stage-filtered branch to SELECT and UPDATE.
-- ===========================================================================
drop policy "cards_select_scoped" on public.cards;
create policy "cards_select_scoped"
on public.cards
for select
to authenticated
using (
  (select public.is_admin())
  or client_id in (select public.pm_assigned_clients())
  or media_assignee_id = (select auth.uid())
  or (
    client_id = (
      select client_id from public.profiles
      where id = (select auth.uid()) and status = 'approved'
    )
    and stage in ('aprovacao_cliente', 'agendamento')
  )
);

drop policy "cards_update_scoped" on public.cards;
create policy "cards_update_scoped"
on public.cards
for update
to authenticated
using (
  (select public.is_admin())
  or client_id in (select public.pm_assigned_clients())
  or media_assignee_id = (select auth.uid())
  or (
    client_id = (
      select client_id from public.profiles
      where id = (select auth.uid()) and status = 'approved'
    )
    and stage = 'aprovacao_cliente'
  )
)
with check (
  (select public.is_admin())
  or client_id in (select public.pm_assigned_clients())
  or media_assignee_id = (select auth.uid())
  or (
    client_id = (
      select client_id from public.profiles
      where id = (select auth.uid()) and status = 'approved'
    )
    and stage in ('aprovacao_cliente', 'producao')
  )
);
-- Note (mirrors 04-RESEARCH.md Pattern 1's own explanation): the `using`
-- clause restricts the updatable row SET to only a currently-queued
-- (aprovacao_cliente) card -- that is the actual write boundary a Client
-- may target. The `with check` clause evaluates the row AFTER the update,
-- so it must allow BOTH legal post-write stages this phase's two Client
-- actions (approveCard -> agendamento, requestAdjustment -> producao) can
-- ever produce -- app/client/actions.ts's own re-read-then-hardcoded-payload
-- discipline (Wave 2, 04-02) is the real state-machine boundary; this
-- policy is defense in depth, consistent with this codebase's established
-- division of labor.

-- ===========================================================================
-- 2. card_attachments -- read-only Client branch, mirrors 0031's own Editor
--    read-only extension exactly. insert/delete (0018) stay UNTOUCHED -- a
--    Client never writes an attachment.
-- ===========================================================================
drop policy "card_attachments_select_scoped" on public.card_attachments;
create policy "card_attachments_select_scoped"
on public.card_attachments for select to authenticated
using (
  (select public.is_admin())
  or card_id in (
    select id from public.cards
    where client_id in (select public.pm_assigned_clients())
  )
  or card_id in (
    select id from public.cards
    where media_assignee_id = (select auth.uid())
  )
  or card_id in (
    select id from public.cards
    where client_id = (
      select client_id from public.profiles
      where id = (select auth.uid()) and status = 'approved'
    )
    and stage in ('aprovacao_cliente', 'agendamento')
  )
);

-- ===========================================================================
-- 3. cards -- two new nullable columns. No RLS/GRANT change needed beyond
--    section 1 above (Pitfall 3): a plain ADD COLUMN is automatically
--    covered by the row-level policies just recreated and by the existing
--    table-level GRANT (0015_cards.sql).
-- ===========================================================================
alter table public.cards
  add column client_adjustment_comment text,
  add column publish_at timestamptz;

create index idx_cards_publish_at on public.cards (publish_at);
-- No index on client_adjustment_comment -- never filtered/sorted on.
