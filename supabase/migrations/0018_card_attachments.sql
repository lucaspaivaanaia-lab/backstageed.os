-- Phase 3: Content Production Kanban -- KAN-05.
-- Decisions: D-07 (attach a Google Drive link to a card without leaving the
-- platform), D-08 (icon + label only, no thumbnail/preview, no Drive API
-- call), D-09 (links only, no cap on the number of links per card).
--
-- Pitfall 2 (repeated lesson, Phases 1/2/5): the GRANT to `authenticated`
-- ships in THIS SAME migration -- hosted Supabase auto-grants base table
-- privileges at provisioning while local `supabase start` does NOT, so a
-- deferred GRANT reproduces the exact same local-vs-hosted privilege gap
-- every prior phase already hit.
--
-- Link validation (isLikelyDriveLink, lib/attachments/drive-url.ts) is
-- enforced in the Server Action (app/pm/board/actions.ts's `addAttachment`),
-- not as a database CHECK constraint -- D-09 scopes it as a paste-mistake
-- catcher whose accepted URL shape is expected to evolve as Google's own
-- share-link formats change, which a CHECK constraint would make far more
-- expensive to update than a TypeScript module.

create table public.card_attachments (
  id uuid primary key default gen_random_uuid(),
  card_id uuid not null references public.cards(id) on delete cascade,
  url text not null,
  label text,
  link_type text not null default 'other'
    constraint card_attachments_link_type_valid
    check (link_type in ('image', 'video', 'pdf', 'other')),
  created_by uuid not null references public.profiles(id),
  created_at timestamptz not null default now()
);

-- The board batches a read across every card id on screen (one query per
-- page load, not per card) -- index the FK it filters on. There is
-- deliberately no per-card row-count limit on this table -- D-09 sets no
-- cap.
create index card_attachments_card_id_idx on public.card_attachments (card_id);

alter table public.card_attachments enable row level security;

-- card_attachments inherits scoping through cards.client_id -- the same
-- two-hop cross-table subquery shape already proven safe by
-- card_checklist_items -> cards (0016_card_checklist_items.sql), never a
-- self-referencing recursion (Pitfall 1).
create policy "card_attachments_select_scoped"
on public.card_attachments for select to authenticated
using (
  (select public.is_admin())
  or card_id in (
    select id from public.cards
    where client_id in (select public.pm_assigned_clients())
  )
);

create policy "card_attachments_insert_scoped"
on public.card_attachments for insert to authenticated
with check (
  (select public.is_admin())
  or card_id in (
    select id from public.cards
    where client_id in (select public.pm_assigned_clients())
  )
);

create policy "card_attachments_delete_scoped"
on public.card_attachments for delete to authenticated
using (
  (select public.is_admin())
  or card_id in (
    select id from public.cards
    where client_id in (select public.pm_assigned_clients())
  )
);

grant select, insert, delete on public.card_attachments to authenticated;
