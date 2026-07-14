-- Phase 5: Access & Roles -- AUTH-07.
--
-- Proves, at the Postgres RLS layer, that a Client user scoped to client_a
-- sees only their own client row (client_a) and no other client's data
-- (client_b), and sees only their own profile row -- no cross-client profile
-- leakage.
--
-- Exercises the actual clients_select_scoped and profiles_select_own_or_admin
-- RLS policies shipped in 05-01's migrations (0004_rls_policies.sql). Nothing
-- is redefined here.

begin;
select plan(4);

\i supabase/tests/rls_helpers.sql

-- Authenticate as client_a_user (client_id = client_a per the fixture).
select tests.set_auth('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb');

-- AUTH-07: Client sees exactly their own client row (client_a).
select results_eq(
  $$ select count(*) from public.clients where id = '11111111-1111-1111-1111-111111111111' $$,
  $$ values (1::bigint) $$,
  'AUTH-07: Client sees own client (client_a)'
);

-- AUTH-07: Client does NOT see another client's row (client_b).
select results_eq(
  $$ select count(*) from public.clients where id = '22222222-2222-2222-2222-222222222222' $$,
  $$ values (0::bigint) $$,
  'AUTH-07: Client is blocked from another client (client_b)'
);

-- AUTH-07: Client sees only ONE profile row total -- proves no cross-client
-- or cross-actor profile leakage.
select results_eq(
  $$ select count(*) from public.profiles $$,
  $$ values (1::bigint) $$,
  'AUTH-07: Client sees only one profile row (no cross-client profile leakage)'
);

-- AUTH-07: the single visible profile row is the Client's own.
select results_eq(
  $$ select id from public.profiles limit 1 $$,
  $$ values ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb'::uuid) $$,
  'AUTH-07: the single visible profile row is the Client''s own'
);

-- De-authenticate before the transaction rolls back.
reset role;
select set_config('request.jwt.claims', '', true);

select * from finish();
rollback;
