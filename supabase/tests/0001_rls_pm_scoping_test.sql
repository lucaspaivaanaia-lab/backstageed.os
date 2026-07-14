-- Phase 5: Access & Roles -- AUTH-06 + Blocker 1.
--
-- Proves, at the Postgres RLS layer, that a PM assigned only to client_a can
-- see client_a but NOT client_b (AUTH-06), and that a PM cannot self-escalate
-- their own role to admin or self-alter their own approval status (Blocker
-- 1), while remaining able to update other, non-role/non-status columns on
-- their own row (proving the column-immutability trigger is column-scoped,
-- not a blanket self-update ban).
--
-- Exercises the actual clients_select_scoped RLS policy (backed by
-- is_admin()/pm_assigned_clients()) and the profiles column-immutability
-- BEFORE UPDATE trigger shipped in 05-01's migrations
-- (0001_profiles.sql / 0004_rls_policies.sql). Nothing is redefined here.

begin;
select plan(6);

\i supabase/tests/rls_helpers.sql

-- Authenticate as pm_a (assigned to client_a ONLY per the fixture).
select tests.set_auth('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa');

-- AUTH-06: PM sees the client they are assigned to (client_a).
select results_eq(
  $$ select count(*) from public.clients where id = '11111111-1111-1111-1111-111111111111' $$,
  $$ values (1::bigint) $$,
  'AUTH-06: PM sees assigned client_a'
);

-- AUTH-06: PM does NOT see a client they are not assigned to (client_b) --
-- the core AUTH-06 block guarantee.
select results_eq(
  $$ select count(*) from public.clients where id = '22222222-2222-2222-2222-222222222222' $$,
  $$ values (0::bigint) $$,
  'AUTH-06: PM is blocked from unassigned client_b'
);

-- AUTH-06: PM's total visible client count is exactly the one assigned
-- client -- proves scoping is exclusive, not merely "at least" the assigned one.
select results_eq(
  $$ select count(*) from public.clients $$,
  $$ values (1::bigint) $$,
  'AUTH-06: PM total visible client count equals exactly 1 (only client_a)'
);

-- Blocker 1: PM cannot self-escalate role to admin -- the column-immutability
-- trigger from 0001_profiles.sql must reject this.
select throws_like(
  $$ update public.profiles set role = 'admin' where id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa' $$,
  '%Only an admin can change role or status%',
  'Blocker 1: PM cannot self-escalate role to admin'
);

-- Blocker 1: PM cannot self-alter their own approval status (attempting to
-- move away from 'approved' is still a status change and must be rejected).
select throws_like(
  $$ update public.profiles set status = 'rejected' where id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa' $$,
  '%Only an admin can change role or status%',
  'Blocker 1: PM cannot self-alter own approval status'
);

-- Positive control: PM CAN update a non-role/non-status column on their own
-- row -- proves the trigger is column-scoped, not a blanket self-update ban.
select lives_ok(
  $$ update public.profiles set must_change_password = true where id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa' $$,
  'Blocker 1 control: PM CAN update own non-role/non-status column (must_change_password)'
);

-- De-authenticate before the transaction rolls back.
reset role;
select set_config('request.jwt.claims', '', true);

select * from finish();
rollback;
