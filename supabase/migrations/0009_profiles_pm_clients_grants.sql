-- Quick task 260716-b8w: close the second layer of the runtime blocker.
-- 260716-au8 added the missing base-table GRANT on public.clients
-- (0008_clients_grants.sql) but the subsequent re-run of
-- `npx supabase test db` failed one layer beneath it, with
-- `permission denied for table profiles` fired inside `tests.set_auth()`
-- before RLS policy evaluation ever ran.
--
-- Root cause: same class of gap as 0008 -- no migration in this repo
-- (0001-0008) ever issued a base-table `GRANT` on `public.profiles` or
-- `public.pm_clients` to the `authenticated` role. This is independent of
-- the RLS policies already defined in 0004_rls_policies.sql
-- (profiles_select_own_or_admin, profiles_update_own_or_admin,
-- profiles_admin_insert, profiles_admin_delete, pm_clients_select_own_or_admin,
-- pm_clients_insert_admin_only, pm_clients_delete_admin_only), which were
-- already correct by static review.
--
-- This migration is additive only -- it does not modify any existing
-- migration or RLS policy.
--
-- public.profiles: grant exactly the four privileges gated by its four
-- existing policies (select/insert/update/delete).
grant select, insert, update, delete on public.profiles to authenticated;

-- public.pm_clients: grant select/insert/delete only. `update` is
-- intentionally NOT granted -- 0004_rls_policies.sql defines no update
-- policy on pm_clients, so update remains out of scope.
grant select, insert, delete on public.pm_clients to authenticated;
