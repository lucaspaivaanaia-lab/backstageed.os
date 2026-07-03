-- Phase 1: Access & Roles
-- pm_clients join table (PM -> assigned clients scoping, AUTH-06) plus the
-- D-10 partial unique index enforcing "at most one Client login per client
-- company in v1".
--
-- Source: pattern from
-- https://supabase.com/docs/guides/troubleshooting/rls-performance-and-best-practices-Z5Jjwv

create table public.pm_clients (
  pm_id uuid not null references public.profiles(id) on delete cascade,
  client_id uuid not null references public.clients(id) on delete cascade,
  primary key (pm_id, client_id)
);

-- CVE-2025-48757 class of bug — RLS must be enabled in the same migration
-- as the CREATE TABLE, never as a follow-up step.
alter table public.pm_clients enable row level security;

create index idx_pm_clients_pm_id on public.pm_clients (pm_id);
create index idx_profiles_client_id on public.profiles (client_id);

-- D-10 (Blocker 3): at most one Client login per client company in v1.
-- Email-uniqueness alone does NOT prevent two different emails both
-- pointing at the same client_id — this partial unique index is the actual
-- enforcement. Rejected/deactivated rows are excluded so a client whose
-- access was cut off (or whose signup was rejected) can be re-provisioned
-- with a fresh login later.
create unique index uq_profiles_one_client_login_per_client
  on public.profiles (client_id)
  where role = 'client' and status not in ('rejected', 'deactivated');
