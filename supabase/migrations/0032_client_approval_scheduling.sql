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
--
-- Deviation (Rule 1 auto-fix, found live against the local Postgres
-- instance during Task 3's verification gate -- pgTAP 0018 assertions 5/6
-- failed against the first version of this file):
--   (a) cards_update_scoped's WITH CHECK Client branch below now allows
--       'agendamento' in addition to 'aprovacao_cliente'/'producao'. The
--       first version of this file omitted it -- but approveCard's own
--       transition (aprovacao_cliente -> agendamento, Pattern 2,
--       04-RESEARCH.md) needs to land there, and Postgres's WITH CHECK
--       evaluates the ROW AFTER the update, so the target stage must be
--       explicitly listed.
--   (b) A brand-new, Postgres-level discovery: for UPDATE, when a table
--       also has a SELECT policy, Postgres additionally requires the
--       POST-image row to satisfy that SELECT policy's USING expression --
--       not merely the UPDATE policy's own WITH CHECK. Verified empirically
--       (isolated repro against this exact local DB, unrelated to any bug
--       in the policy text itself: even a trivial `using (true) with check
--       (true)` override on cards_update_scoped alone still rejected a
--       transition INTO 'producao', and only succeeded once
--       cards_select_scoped's own Client branch was ALSO widened to permit
--       'producao'). Since a Client must NEVER select a 'producao' card
--       (internal WIP, this plan's own locked must-have, proven by pgTAP
--       0018 assertion 2), cards_select_scoped's stage set cannot be
--       widened to fix this -- the requestAdjustment transition (Pattern 2,
--       aprovacao_cliente -> producao) is therefore STRUCTURALLY
--       unreachable via a plain RLS-scoped `.update()` call, no matter how
--       cards_update_scoped itself is worded. Section 4 below adds a
--       SECURITY DEFINER RPC, `client_request_adjustment`, as the one
--       Client write this migration's own design cannot express as a plain
--       table UPDATE -- it re-implements the row/stage boundary explicitly
--       inside the function body (bypassing RLS internally, since a
--       SECURITY DEFINER function runs as its owner, which is not subject
--       to RLS on this table -- relforcerowsecurity is false), then
--       performs the write. approveCard's OWN transition (agendamento) is
--       unaffected by this gotcha (agendamento IS in cards_select_scoped's
--       Client branch) and remains a plain `.update()`, exactly as
--       04-RESEARCH.md Pattern 2 drafted -- Wave 2's 04-02 must call the
--       RPC (`select client_request_adjustment(cardId, comment)`) for
--       requestAdjustment specifically, and a plain `.update()` for
--       approveCard.

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
    and stage in ('aprovacao_cliente', 'producao', 'agendamento')
  )
);
-- Note (mirrors 04-RESEARCH.md Pattern 1's own explanation): the `using`
-- clause restricts the updatable row SET to only a currently-queued
-- (aprovacao_cliente) card -- that is the actual write boundary a Client
-- may target. The `with check` clause evaluates the row AFTER the update,
-- so it must allow ALL THREE legal post-write stages this phase's two
-- Client write paths can ever produce: 'aprovacao_cliente' (a no-op edge
-- case, never actually produced), 'producao' (requestAdjustment's target --
-- reachable ONLY via the client_request_adjustment RPC below, section 4,
-- never via a plain `.update()`, see this file's own header comment), and
-- 'agendamento' (approveCard's target, reachable via a plain `.update()`
-- since 'agendamento' is also in cards_select_scoped's own Client branch).
-- app/client/actions.ts's own re-read-then-hardcoded-payload discipline
-- (Wave 2, 04-02) remains the real state-machine boundary for approveCard;
-- this policy is defense in depth for that one path, consistent with this
-- codebase's established division of labor.

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

-- ===========================================================================
-- 4. client_request_adjustment -- SECURITY DEFINER RPC, the ONE Client
--    write this migration's RLS design cannot express as a plain
--    `.update()` (see this file's own header comment, deviation (b)).
--    Bypasses RLS internally (owner-run, cards is not FORCE ROW LEVEL
--    SECURITY) and re-implements, explicitly, every boundary
--    cards_update_scoped's Client branch would otherwise enforce:
--      - caller must be an approved Client (role/status re-read from
--        public.profiles, mirrors every other Client/PM re-check in this
--        codebase, e.g. 0021's pm_assigned_clients() hardening)
--      - the target card must belong to THAT Client's own client_id
--        (never trusted from the argument alone)
--      - the target card must currently be in 'aprovacao_cliente' (the
--        exact `using`-clause boundary cards_update_scoped's Client branch
--        already enforces for every OTHER Client write)
--      - comment must be non-empty (mirrors requestAdjustmentSchema's own
--        Zod min(1) -- this is a second, independent enforcement at the
--        data layer, not a substitute for the Zod check in Wave 2's Server
--        Action)
--    Deliberately narrow: writes ONLY stage/client_adjustment_comment/
--    updated_at, the exact CLIENT_ADJUST_UPDATE_KEYS shape
--    lib/security/client-card-write-scope.ts's buildClientAdjustPayload
--    documents -- the "RLS decides rows, the Server Action decides columns"
--    split still holds, it is just enforced INSIDE this function body
--    instead of by cards_update_scoped's own WITH CHECK for this one path.
--    approveCard is NOT routed through an RPC -- its target stage
--    ('agendamento') is already inside cards_select_scoped's own Client
--    branch, so a plain `.update()` (04-RESEARCH.md Pattern 2) works
--    unmodified and needs no bypass.
-- ===========================================================================
create or replace function public.client_request_adjustment(
  p_card_id uuid,
  p_comment text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_caller_role public.user_role;
  v_caller_status public.approval_status;
  v_caller_client_id uuid;
  v_card_client_id uuid;
  v_card_stage public.card_stage;
begin
  select role, status, client_id
    into v_caller_role, v_caller_status, v_caller_client_id
  from public.profiles
  where id = (select auth.uid());

  if v_caller_role is distinct from 'client'
     or v_caller_status is distinct from 'approved'
     or v_caller_client_id is null then
    raise exception 'not_client_or_not_approved' using errcode = '42501';
  end if;

  if p_comment is null or length(btrim(p_comment)) = 0 then
    raise exception 'comment_required' using errcode = '22023';
  end if;

  select client_id, stage into v_card_client_id, v_card_stage
  from public.cards
  where id = p_card_id;

  if v_card_client_id is null or v_card_client_id <> v_caller_client_id then
    raise exception 'card_not_found_or_wrong_client' using errcode = '42501';
  end if;

  if v_card_stage is distinct from 'aprovacao_cliente' then
    raise exception 'card_not_in_aprovacao_cliente' using errcode = '42501';
  end if;

  update public.cards
  set stage = 'producao',
      client_adjustment_comment = p_comment,
      updated_at = now()
  where id = p_card_id;
end;
$$;

grant execute on function public.client_request_adjustment(uuid, text) to authenticated;
