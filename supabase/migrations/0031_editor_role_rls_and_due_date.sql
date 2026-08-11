-- Item 3 of the 2026-08-05 Juliano action plan's P3 ("novo papel de acesso
-- Editor", 260811-lp5-CONTEXT.md item 3; full design in
-- 260811-oe0-RESEARCH.md/-CONTEXT.md). Everything that USES the 'editor'
-- enum value added by 0030_user_role_add_editor.sql lives here -- that
-- migration commits strictly before this one runs (Postgres 55P04,
-- 0030's own header comment).
--
-- Scope of this file:
--   1. cards_select_scoped / cards_update_scoped: a THIRD, Editor-specific
--      OR-branch, scoped ONLY by media_assignee_id = auth.uid() -- NEVER
--      client_id/pm_assigned_clients(), which would leak every card of
--      every client the Editor happens to have one assignment on (the
--      exact class of leak this task exists to prevent,
--      260811-oe0-CONTEXT.md). Row-level only for UPDATE -- Postgres RLS
--      has no column-level policy, so "Editor may only ever write
--      description" is enforced entirely by
--      app/editor/actions.ts's updateCardDescriptionAsEditor Server Action
--      (its hardcoded {description, updated_at} payload), never by this
--      policy (260811-oe0-RESEARCH.md Section 3, Design A).
--   2. card_checklist_items: the existing `for all` write policy is SPLIT
--      into update (Editor-includable) and insert/delete (kept
--      PM/Admin-only, unchanged predicate) -- an Editor must never
--      insert/delete/relabel a checklist item, only toggle completion via
--      the existing, unmodified toggleChecklistItem Server Action
--      (app/pm/board/actions.ts).
--   3. clients_select_scoped: a narrow Editor branch -- only clients with
--      at least one card assigned to the caller via media_assignee_id,
--      never pm_assigned_clients() (which would be client-wide). Needed so
--      the Editor's queue (app/editor/page.tsx) can display each card's
--      client name.
--   4. card_attachments_select_scoped: a read-only Editor branch, same
--      media_assignee_id -> cards shape. card_attachments_insert_scoped/
--      _delete_scoped (0018) are UNTOUCHED -- Editor never writes an
--      attachment.
--   5. enforce_card_assignee_membership() (0017/0029): a real gap found
--      during planning, not merely cosmetic -- this trigger currently
--      accepts a media_assignee_id ONLY if it is a member of the target
--      client's public.pm_clients roster. An Editor account is
--      DELIBERATELY never given a pm_clients row (260811-oe0-RESEARCH.md
--      Section 5 point 3 -- Editor works across whichever cards it gets
--      assigned to, not one owning client), so WITHOUT this extension a
--      PM/Admin could never actually assign an Editor as a card's
--      Designer/Mídia at all -- the entire feature would be unreachable
--      through the UI. The fix: media_assignee_id is now valid if EITHER
--      the existing pm_clients membership rule holds, OR the referenced
--      profile is role='editor' and status='approved' (cross-client,
--      exactly like every other Editor eligibility check in this file).
--      assignee_id/"Responsável" is UNCHANGED -- an Editor can never become
--      a card's Responsável, consistent with 260811-oe0-CONTEXT.md's
--      locked scope.
--   6. handle_new_user() (0001_profiles.sql): the status-mapping CASE
--      branch is extended so a freshly created 'editor' account lands
--      'approved' immediately, exactly like 'client' already does --
--      without this an Editor account would land 'pending' and be stuck
--      behind the /pending gate (middleware.ts) despite being
--      PM/Admin-provisioned with no separate approval step
--      (260811-oe0-RESEARCH.md Pitfall 3).
--   7. public.cards.due_date: a nullable timestamptz + index, purely so the
--      Editor's queue has something real to order by (260811-oe0-CONTEXT.md
--      "campo de prazo" scope addition). Editable ONLY via PM/Admin's
--      existing updateCardDetailsSchema/updateCardDetails (never by
--      Editor) -- no RLS change needed for this column itself, a plain ADD
--      COLUMN is automatically covered by the row-level policies above,
--      same precedent as every prior single-column addition in this repo
--      (0025/0027/0028/0029).
--
-- Deliberately NOT added: an is_editor() helper mirroring is_admin()'s
-- convention. Every Editor-inclusive branch below scopes by
-- `media_assignee_id = (select auth.uid())` directly -- eligibility for
-- WHO can ever become a media_assignee_id is fully decided at INSERT/
-- UPDATE time by enforce_card_assignee_membership() (point 5 above), so no
-- RLS policy in this file ever needs to re-derive "is the CALLER an
-- editor" as a separate check. A standalone is_editor() would have zero
-- call site and be dead code -- if a future feature needs it, add it then.

-- ===========================================================================
-- 1. cards -- add the media_assignee_id branch to SELECT and UPDATE.
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
)
with check (
  (select public.is_admin())
  or client_id in (select public.pm_assigned_clients())
  or media_assignee_id = (select auth.uid())
);

-- ===========================================================================
-- 2. card_checklist_items -- extend SELECT, split the old `for all` write
--    policy into update (Editor-includable) + insert/delete (PM/Admin-only,
--    unchanged predicate, kept as their own explicit policies rather than
--    folded back into one `for all`).
-- ===========================================================================
drop policy "card_checklist_items_select_scoped" on public.card_checklist_items;
create policy "card_checklist_items_select_scoped"
on public.card_checklist_items for select to authenticated
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
);

drop policy "card_checklist_items_write_scoped" on public.card_checklist_items;

create policy "card_checklist_items_update_scoped"
on public.card_checklist_items for update to authenticated
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
)
with check (
  (select public.is_admin())
  or card_id in (
    select id from public.cards
    where client_id in (select public.pm_assigned_clients())
  )
  or card_id in (
    select id from public.cards
    where media_assignee_id = (select auth.uid())
  )
);

-- PM/Admin-only, unchanged predicate from the old `for all` policy -- an
-- Editor never appears in either of these. No GRANT DELETE exists on this
-- table (0016 only granted select/insert/update, and this file does not
-- add one) -- this policy documents the row-level rule for completeness
-- but DELETE stays unreachable at the privilege layer for every role,
-- exactly as it already was before this migration (checklist items are
-- cascade-deleted via cards' own ON DELETE CASCADE, never deleted
-- directly).
create policy "card_checklist_items_insert_scoped"
on public.card_checklist_items for insert to authenticated
with check (
  (select public.is_admin())
  or card_id in (
    select id from public.cards
    where client_id in (select public.pm_assigned_clients())
  )
);

create policy "card_checklist_items_delete_scoped"
on public.card_checklist_items for delete to authenticated
using (
  (select public.is_admin())
  or card_id in (
    select id from public.cards
    where client_id in (select public.pm_assigned_clients())
  )
);

-- ===========================================================================
-- 3. clients -- narrow Editor branch, scoped through cards it can already
--    see, never pm_assigned_clients() (client-wide).
-- ===========================================================================
drop policy "clients_select_scoped" on public.clients;
create policy "clients_select_scoped"
on public.clients
for select
to authenticated
using (
  (select public.is_admin())
  or id in (select public.pm_assigned_clients())
  or id = (select client_id from public.profiles where id = (select auth.uid()))
  or id in (
    select client_id from public.cards
    where media_assignee_id = (select auth.uid())
  )
);

-- ===========================================================================
-- 4. card_attachments -- read-only Editor branch. insert/delete (0018)
--    stay untouched, PM/Admin-only.
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
);

-- ===========================================================================
-- 5. enforce_card_assignee_membership() -- extend the media_assignee_id
--    check to also accept an approved Editor (cross-client, no pm_clients
--    row needed). assignee_id's check is byte-for-byte UNCHANGED.
-- ===========================================================================
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

  -- Item 3 (260811-oe0): media_assignee_id is now valid if EITHER the
  -- existing pm_clients membership rule holds (unchanged, first exists()
  -- below) OR the referenced profile is an approved Editor (second
  -- exists()) -- an Editor is deliberately never given a pm_clients row
  -- (it is not scoped to one client), so without this second branch no
  -- Editor could ever be assigned to a card at all, making the whole
  -- feature unreachable.
  if new.media_assignee_id is not null
     and not exists (
       select 1 from public.pm_clients
       where client_id = new.client_id and pm_id = new.media_assignee_id
     )
     and not exists (
       select 1 from public.profiles
       where id = new.media_assignee_id and role = 'editor' and status = 'approved'
     ) then
    raise exception 'media_assignee_not_on_roster'
      using errcode = 'check_violation';
  end if;

  return new;
end;
$$;

-- ===========================================================================
-- 6. handle_new_user() -- extend the status CASE branch so a freshly
--    created Editor account is 'approved' immediately, exactly like
--    'client' already is (never 'pending').
-- ===========================================================================
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = ''
as $$
begin
  insert into public.profiles (id, email, role, status, must_change_password, client_id)
  values (
    new.id,
    new.email,
    coalesce((new.raw_user_meta_data->>'role')::public.user_role, 'pm'),
    -- Deviation (Rule 1 auto-fix, found during Task 2's pgTAP run): a bare
    -- `case ... in (...) then 'approved' else 'pending' end` resolves to
    -- Postgres type `text` here (unlike migration 0001's original single-
    -- branch `= 'client'` form, which resolved to the unknown-literal type
    -- that implicitly casts to the target column) -- `text` has no implicit
    -- cast to `public.approval_status`, so every INSERT through this
    -- trigger failed with "column status is of type approval_status but
    -- expression is of type text" for EVERY new signup, not just Editor.
    -- The explicit cast below removes the ambiguity regardless of
    -- surrounding literal context.
    (case
      when (new.raw_user_meta_data->>'role') in ('client', 'editor') then 'approved'
      else 'pending'
    end)::public.approval_status,
    coalesce((new.raw_user_meta_data->>'must_change_password')::boolean, false),
    (new.raw_user_meta_data->>'client_id')::uuid
  );
  return new;
end;
$$;

-- ===========================================================================
-- 7. cards.due_date -- nullable timestamptz + index. No RLS/GRANT change
--    needed: a plain ADD COLUMN is automatically covered by the row-level
--    policies above, same as every prior single-column addition in this
--    repo (0025/0027/0028/0029). Editable ONLY via PM/Admin's existing
--    updateCardDetailsSchema/updateCardDetails (app/pm/board), never by
--    the Editor -- updateCardDescriptionAsEditorSchema (app/editor) has no
--    dueDate field at all.
-- ===========================================================================
alter table public.cards
  add column due_date timestamptz;

create index idx_cards_due_date on public.cards (due_date);
