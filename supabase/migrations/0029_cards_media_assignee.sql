-- Quick task 260811-n0i: Item 4 of the 2026-08-05 Juliano action plan's P3
-- ("segundo campo de atribuicao no card", 260811-lp5-CONTEXT.md Item 4
-- decision) -- a SECOND, purely informative assignment field on
-- public.cards, e.g. "Designer/Midia", alongside (never replacing) the
-- existing assignee_id/"Responsavel" field from
-- 0017_cards_description_assignee.sql.
--
-- Explicitly NO gating logic: this column never blocks checklist
-- completion, stage advance, or drag-and-drop -- it is read-only metadata
-- surfaced on the card, same as assignee_id already is.
--
-- Column name chosen (Claude's Discretion per 260811-lp5-CONTEXT.md, Item
-- 4): media_assignee_id -- matches the action plan's own example
-- ("Designer/Midia") more literally than a generic "secondary_assignee_id"
-- would.
--
-- RLS is already enabled on public.cards (0015_cards.sql). ADD COLUMN does
-- not disable it, and cards_select_scoped/cards_insert_scoped/
-- cards_update_scoped are row-level with no column list, so they
-- automatically cover this new column exactly like every other column on
-- this table -- same precedent as 0025_clients_tag.sql/
-- 0027_clients_briefing_text.sql/0028_cards_channel.sql. No new policy, no
-- new grant.
--
-- Membership enforcement: extended, not skipped. "Purely informative" (no
-- checklist/stage gating) describes the ABSENCE of workflow gating -- it
-- says nothing about referential integrity. This column still identifies a
-- real person who must actually be on the client's team, the exact same
-- real-world constraint D-19 already enforces for assignee_id. So
-- enforce_card_assignee_membership() (0017) is extended below (CREATE OR
-- REPLACE, same function/trigger names -- cards_assignee_membership_trg
-- keeps firing BEFORE INSERT OR UPDATE only, never DELETE, so it can never
-- obstruct the D-15 compensating delete in createCard) to check
-- media_assignee_id with the SAME pm_clients membership rule, using a
-- DISTINCT exception token (media_assignee_not_on_roster) so app code can
-- tell the two violations apart -- deliberately NOT a suffix/prefix of the
-- existing 'assignee_not_assigned_to_client' token, to avoid a substring
-- match accidentally conflating the two in app/pm/board/actions.ts's error
-- mapping.

alter table public.cards
  add column media_assignee_id uuid references public.profiles(id) on delete set null;

-- `on delete set null` mirrors assignee_id (0017) -- deleting a PM profile
-- must orphan this assignment too, never cascade-delete the card.
create index idx_cards_media_assignee_id on public.cards (media_assignee_id);

-- CREATE OR REPLACE keeps the exact same function name/signature/trigger --
-- only the body grows a second, independent check.
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

  -- Quick task 260811-n0i (Item 4): same membership rule, same client_id
  -- comparison, applied to the second assignment field. Distinct exception
  -- token (media_assignee_not_on_roster) -- see header comment above for
  -- why it must never be a substring of the token above.
  if new.media_assignee_id is not null
     and not exists (
       select 1 from public.pm_clients
       where client_id = new.client_id and pm_id = new.media_assignee_id
     ) then
    raise exception 'media_assignee_not_on_roster'
      using errcode = 'check_violation';
  end if;

  return new;
end;
$$;
