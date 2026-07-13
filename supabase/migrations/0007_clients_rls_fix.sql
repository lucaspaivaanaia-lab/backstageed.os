-- Phase 1: Client Records & Isolated RAG Setup
-- Fixes the two `clients` RLS conflicts flagged by 01-CONTEXT.md and
-- 01-RESEARCH.md as hard blockers: `clients_insert_admin_only` and
-- `clients_update_admin_only` (from 0004_rls_policies.sql) reject every
-- PM-initiated create/edit, which blocks CLI-01 (PM can create a client)
-- and CLI-04 (PM can edit briefing).
--
-- Hard rule (Pitfall 1, 05-RESEARCH.md, still binding): is_pm() must use
-- the plpgsql procedural language, not the plain SQL function language —
-- Postgres may inline SQL-language functions and lose the security
-- definer context, reintroducing "infinite recursion detected in policy"
-- risk.
--
-- IMPORTANT: this migration MUST NOT touch pm_clients policies.
-- pm_clients_insert_admin_only stays exactly as defined in
-- 0004_rls_policies.sql. The creating PM's self-link write is handled by
-- Plan 01-03's privileged admin-client transaction (Pattern 2), never by
-- a broadened RLS self-insert policy on pm_clients (Pitfall 3 / the
-- Anti-Patterns section of 01-RESEARCH.md).

create or replace function public.is_pm()
returns boolean
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  return exists (
    select 1 from public.profiles
    where id = (select auth.uid()) and role = 'pm' and status = 'approved'
  );
end;
$$;

drop policy if exists "clients_insert_admin_only" on public.clients;
create policy "clients_insert_admin_or_pm"
on public.clients
for insert
to authenticated
with check ((select public.is_admin()) or (select public.is_pm()));

drop policy if exists "clients_update_admin_only" on public.clients;
create policy "clients_update_scoped"
on public.clients
for update
to authenticated
using (
  (select public.is_admin())
  or id in (select public.pm_assigned_clients())
)
with check (
  (select public.is_admin())
  or id in (select public.pm_assigned_clients())
);
