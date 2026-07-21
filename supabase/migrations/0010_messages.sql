-- Phase 2: Client-Isolated AI Chat -- CTX-01, CTX-02.
--
-- Persists a single ongoing chat history per client (D-03) -- no threads
-- table this phase. thread_id is left out entirely rather than stubbed with
-- a fake default, since adding a nullable column later is a trivial
-- additive migration if multi-thread support ever lands (deferred idea,
-- not built now).
--
-- RLS scoping reuses the existing is_admin()/pm_assigned_clients() helper
-- functions from 0004_rls_policies.sql (Pitfall 1: never inline a
-- cross-table subquery against pm_clients directly in a policy).
--
-- Pitfall #4: the GRANT to `authenticated` ships in THIS SAME migration --
-- hosted Supabase auto-grants base table privileges at provisioning while
-- local `supabase start` does NOT, so a deferred GRANT (like 0008/0009 had
-- to be for clients/profiles/pm_clients in Phase 5) would reproduce the
-- exact same local-vs-hosted privilege gap for this table.

create table public.messages (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.clients(id) on delete cascade,
  role text not null check (role in ('user', 'assistant')),
  content text not null,
  created_at timestamptz not null default now()
);

alter table public.messages enable row level security;

create policy "messages_select_scoped"
on public.messages
for select
to authenticated
using (
  (select public.is_admin())
  or client_id in (select public.pm_assigned_clients())
);

create policy "messages_insert_scoped"
on public.messages
for insert
to authenticated
with check (
  (select public.is_admin())
  or client_id in (select public.pm_assigned_clients())
);

grant select, insert on public.messages to authenticated;
