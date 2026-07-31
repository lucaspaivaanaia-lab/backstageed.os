-- Phase 3: Content Production Kanban -- Plan 03-01.
-- CHK-01 (reusable checklist templates) + CHK-02 (per-client template
-- assignment, added in the follow-up migration 0014).
--
-- Decisions: D-03 (templates are reusable, not defined from scratch per
-- client -- Admin creates named templates, e.g. "Padrao", "Cliente Premium",
-- and assigns one per client) and D-04 (a card's checklist is SNAPSHOTTED at
-- the moment it enters revisao_interna, not live-bound to the template --
-- these two tables are the live, admin-editable source; the snapshot copy
-- table, card_checklist_items, is a later plan's concern (03-03), not this
-- one).
--
-- Source: 03-RESEARCH.md Pattern 2 (lines 303-401) -- DDL below is copied
-- verbatim from that authoritative pattern, minus the card_checklist_items
-- table (out of scope for this plan).
--
-- Pitfall 2 (GRANT-same-migration rule, repeated lesson across Phases 1, 2,
-- 5): the GRANT to `authenticated` ships in THIS SAME FILE as the RLS
-- policies below. Hosted Supabase auto-grants base table privileges on
-- creation, but `supabase start` local does NOT -- a deferred GRANT would
-- reproduce the exact local-vs-hosted gap that 0008/0009 had to fix
-- retroactively for clients/profiles/pm_clients. Do not defer this.

create table public.checklist_templates (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  created_at timestamptz not null default now()
);

create table public.checklist_template_items (
  id uuid primary key default gen_random_uuid(),
  template_id uuid not null references public.checklist_templates(id) on delete cascade,
  label text not null,
  sort_order int not null default 0
);

alter table public.checklist_templates enable row level security;
alter table public.checklist_template_items enable row level security;

-- Templates: admin-managed, but PMs need read access to know what a
-- client's gate will require (e.g. to preview a checklist before a card
-- reaches revisao_interna).
create policy "checklist_templates_select_all_authenticated"
on public.checklist_templates
for select
to authenticated
using (true);

create policy "checklist_templates_admin_write"
on public.checklist_templates
for all
to authenticated
using ((select public.is_admin()))
with check ((select public.is_admin()));

create policy "checklist_template_items_select_all_authenticated"
on public.checklist_template_items
for select
to authenticated
using (true);

create policy "checklist_template_items_admin_write"
on public.checklist_template_items
for all
to authenticated
using ((select public.is_admin()))
with check ((select public.is_admin()));

grant select, insert, update, delete on public.checklist_templates to authenticated;
grant select, insert, update, delete on public.checklist_template_items to authenticated;
