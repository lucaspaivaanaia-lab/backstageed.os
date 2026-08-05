-- Phase 5: Access & Roles -- defense-in-depth hardening for pm_assigned_clients().
--
-- This is NOT a live exploit fix. middleware.ts is the primary gate and is
-- already comprehensive, and listPmRoster() (lib/actions/clients.ts) already
-- filters .eq("status", "approved") before a PM can ever be assigned to a
-- client -- so no application code path can create a pm_clients row for a
-- non-approved PM.
--
-- The gap this closes: pm_assigned_clients() (0004_rls_policies.sql) trusted
-- a public.pm_clients row alone, with no independent re-verification that the
-- caller's profile is still role = 'pm' and status = 'approved'. Sibling
-- helpers is_admin() (0004) and is_pm() (0007) both already perform that
-- check -- pm_assigned_clients() was the one that did not. The predicate
-- added here mirrors is_pm() exactly.
--
-- The real motivator is out-of-band manual SQL (a hand-written
-- `insert into pm_clients`, or a `profiles.status`/`profiles.role` change
-- applied directly against the database) bypassing listPmRoster()'s
-- .eq("status", "approved") filter entirely -- RLS alone should still catch
-- such a slip, making the database layer independently correct rather than
-- relying solely on the application-layer invariant.
--
-- clients_select_scoped (0004_rls_policies.sql) and clients_update_scoped
-- (0007_clients_rls_fix.sql) are deliberately NOT touched here -- they
-- already call public.pm_assigned_clients() and inherit the stricter
-- behavior automatically, with zero policy churn.
create or replace function public.pm_assigned_clients()
returns setof uuid
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  return query
    select pc.client_id
    from public.pm_clients pc
    join public.profiles p on p.id = pc.pm_id
    where pc.pm_id = (select auth.uid())
      and p.role = 'pm'
      and p.status = 'approved';
end;
$$;
