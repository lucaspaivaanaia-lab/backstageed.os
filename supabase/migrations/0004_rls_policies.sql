-- Phase 1: Access & Roles
-- SECURITY DEFINER helper functions (is_admin, pm_assigned_clients) plus RLS
-- policies for the three tables this phase owns: profiles, pm_clients,
-- clients.
--
-- Source: pattern from
-- https://supabase.com/docs/guides/troubleshooting/rls-performance-and-best-practices-Z5Jjwv
-- and https://supabase.com/docs/guides/database/postgres/row-level-security
--
-- Hard rule (Pitfall 1): these functions must use the plpgsql procedural
-- language, not the plain SQL function language — Postgres may inline
-- SQL-language functions and lose the security definer context,
-- reintroducing "infinite recursion detected in policy" risk. Every
-- cross-table RLS check routes through one of these two functions — never
-- an inline subquery against a different RLS-enabled table.

-- is_admin(): OR-ed into every policy for full admin access (AUTH-08).
create or replace function public.is_admin()
returns boolean
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  return exists (
    select 1 from public.profiles
    where id = (select auth.uid()) and role = 'admin' and status = 'approved'
  );
end;
$$;

-- pm_assigned_clients(): returns the set of client_ids a PM can see (AUTH-06).
create or replace function public.pm_assigned_clients()
returns setof uuid
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  return query select client_id from public.pm_clients where pm_id = (select auth.uid());
end;
$$;

-- ===========================================================================
-- profiles policies
-- ===========================================================================
-- Column-level protection (role/status immutability) is enforced by the
-- prevent_profile_privilege_escalation() BEFORE UPDATE trigger in
-- 0001_profiles.sql, NOT by RLS — RLS is row-granular and cannot restrict
-- individual columns within an allowed row.

create policy "profiles_select_own_or_admin"
on public.profiles
for select
to authenticated
using (
  id = (select auth.uid())
  or (select public.is_admin())
);

create policy "profiles_update_own_or_admin"
on public.profiles
for update
to authenticated
using (
  id = (select auth.uid())
  or (select public.is_admin())
)
with check (
  id = (select auth.uid())
  or (select public.is_admin())
);

create policy "profiles_admin_insert"
on public.profiles
for insert
to authenticated
with check ((select public.is_admin()));

create policy "profiles_admin_delete"
on public.profiles
for delete
to authenticated
using ((select public.is_admin()));

-- ===========================================================================
-- pm_clients policies
-- ===========================================================================

create policy "pm_clients_select_own_or_admin"
on public.pm_clients
for select
to authenticated
using (
  (select public.is_admin())
  or pm_id = (select auth.uid())
);

create policy "pm_clients_insert_admin_only"
on public.pm_clients
for insert
to authenticated
with check ((select public.is_admin()));

create policy "pm_clients_delete_admin_only"
on public.pm_clients
for delete
to authenticated
using ((select public.is_admin()));

-- ===========================================================================
-- clients policies
-- ===========================================================================
-- Insert/update are admin-only for this phase — full client CRUD is a
-- Phase 2 deliverable.

create policy "clients_select_scoped"
on public.clients
for select
to authenticated
using (
  (select public.is_admin())
  or id in (select public.pm_assigned_clients())
  or id = (select client_id from public.profiles where id = (select auth.uid()))
);

create policy "clients_insert_admin_only"
on public.clients
for insert
to authenticated
with check ((select public.is_admin()));

create policy "clients_update_admin_only"
on public.clients
for update
to authenticated
using ((select public.is_admin()))
with check ((select public.is_admin()));
