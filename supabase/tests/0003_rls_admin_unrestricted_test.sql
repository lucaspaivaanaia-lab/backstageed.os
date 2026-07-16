-- Phase 5: Access & Roles -- AUTH-08.
--
-- Proves, at the Postgres RLS layer, that an admin is unrestricted and sees
-- every clients/profiles/pm_clients row regardless of assignment.
--
-- Exercises the actual is_admin()-backed RLS policies (clients_select_scoped,
-- profiles_select_own_or_admin, pm_clients_select_own_or_admin) shipped in
-- 05-01's migrations (0004_rls_policies.sql). Nothing is redefined here.

begin;
select plan(3);

\ir rls_helpers.sql

-- Authenticate as admin_user.
select tests.set_auth('cccccccc-cccc-cccc-cccc-cccccccccccc');

-- AUTH-08: admin sees both fixture clients (client_a and client_b), unrestricted.
select results_eq(
  $$ select count(*) from public.clients where id in ('11111111-1111-1111-1111-111111111111', '22222222-2222-2222-2222-222222222222') $$,
  $$ values (2::bigint) $$,
  'AUTH-08: admin sees both fixture clients (unrestricted)'
);

-- AUTH-08: admin sees all pm_clients assignment rows.
select results_eq(
  $$ select count(*) from public.pm_clients $$,
  $$ values (1::bigint) $$,
  'AUTH-08: admin sees all pm_clients assignment rows'
);

-- AUTH-08: admin sees all profiles rows (all three fixture actors).
select results_eq(
  $$ select count(*) from public.profiles $$,
  $$ values (3::bigint) $$,
  'AUTH-08: admin sees all profiles rows (all three fixture actors)'
);

-- De-authenticate before the transaction rolls back.
reset role;
select set_config('request.jwt.claims', '', true);

select * from finish();
rollback;
