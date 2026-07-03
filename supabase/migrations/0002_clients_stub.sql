-- Phase 1: Access & Roles
-- Minimal clients stub table. Phase 2 will ALTER this table to add the full
-- strategic-briefing + Tropicalia project_id columns. This phase only needs
-- enough of a clients table to (a) satisfy the FK from profiles.client_id
-- and pm_clients.client_id, and (b) provide one seeded row for manual
-- AUTH-09/10/11 testing.

create table public.clients (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  created_at timestamptz not null default now()
);

-- CVE-2025-48757 class of bug — RLS must be enabled in the same migration
-- as the CREATE TABLE, never as a follow-up step.
alter table public.clients enable row level security;

-- Seed one row so a client_id exists for manual AUTH-09/10/11 testing.
insert into public.clients (name) values ('Cliente Demo');

-- Add the FK from profiles.client_id -> clients(id) now that clients exists.
alter table public.profiles
  add constraint profiles_client_id_fkey
  foreign key (client_id) references public.clients(id);
