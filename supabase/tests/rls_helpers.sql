-- Phase 5: Access & Roles -- pgTAP shared fixture + role-simulation helpers.
--
-- This file is included (via psql's \i) at the top of every
-- supabase/tests/*_test.sql file in this suite. It seeds deterministic
-- fixture data and defines a role-simulation helper. It does NOT define
-- (or touch the behavior of) any table, RLS policy, or the profiles
-- column-immutability BEFORE UPDATE trigger shipped in 05-01's migrations
-- (0001_profiles.sql / 0004_rls_policies.sql) -- those are the system under
-- test and are exercised exactly as shipped.
--
-- Fixture population approach (documented per 05-03-PLAN.md Task 1's second
-- option: "insert profiles directly if the trigger is not desired in the
-- fixture"):
--   The on_auth_user_created trigger (0001_profiles.sql) auto-creates a
--   public.profiles row via handle_new_user() whenever a row is inserted
--   into auth.users, but handle_new_user() always sets status='pending' for
--   any non-'client' role. Getting a PM/Admin actor to status='approved'
--   would otherwise require a follow-up UPDATE on profiles -- but the
--   column-immutability BEFORE UPDATE trigger (the actual subject under
--   test in 0001_rls_pm_scoping_test.sql) rejects any role/status change
--   made by a non-admin, and no admin exists yet during fixture bootstrap
--   (a bootstrap ordering problem). To avoid ever needing to touch that
--   trigger for fixture setup, this file temporarily disables ONLY
--   on_auth_user_created (a different trigger, on auth.users, not the one
--   under test) around the auth.users insert, then inserts the desired
--   final public.profiles rows directly via a single INSERT (never an
--   UPDATE) -- so the column-immutability trigger is never invoked, weakened,
--   or bypassed by this fixture. on_auth_user_created is re-enabled
--   immediately afterward. Every test file wraps its own run in
--   begin;/rollback;, so none of this persists beyond a single test file's
--   transaction regardless.
--
-- Fixed literal actor/client uuids (referenced by name in every test file):
--   client_a       = 11111111-1111-1111-1111-111111111111
--   client_b       = 22222222-2222-2222-2222-222222222222
--   pm_a           = aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa  (role=pm,     status=approved)
--   client_a_user  = bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb  (role=client, status=approved, client_id=client_a)
--   admin_user     = cccccccc-cccc-cccc-cccc-cccccccccccc  (role=admin,  status=approved)

-- ---------------------------------------------------------------------------
-- 1. Clients: two fixed-uuid clients.
-- ---------------------------------------------------------------------------
insert into public.clients (id, name)
values
  ('11111111-1111-1111-1111-111111111111', 'RLS Test Client A (client_a)'),
  ('22222222-2222-2222-2222-222222222222', 'RLS Test Client B (client_b)')
on conflict (id) do nothing;

-- ---------------------------------------------------------------------------
-- 2. auth.users fixture rows for three actors (fixed uuids). The
--    on_auth_user_created trigger is disabled for this block only so the
--    subsequent direct profiles insert (step 3) is the sole source of each
--    actor's role/status -- never an UPDATE, so the column-immutability
--    trigger under test is never invoked by fixture setup.
-- ---------------------------------------------------------------------------
alter table auth.users disable trigger on_auth_user_created;

insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password,
  email_confirmed_at, recovery_sent_at, last_sign_in_at,
  raw_app_meta_data, raw_user_meta_data,
  created_at, updated_at,
  confirmation_token, email_change, email_change_token_new, recovery_token
) values
  ('00000000-0000-0000-0000-000000000000',
   'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
   'authenticated', 'authenticated', 'pm_a@rls-fixture.local', '',
   now(), now(), now(),
   '{"provider":"email","providers":["email"]}', '{}',
   now(), now(),
   '', '', '', ''),
  ('00000000-0000-0000-0000-000000000000',
   'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb',
   'authenticated', 'authenticated', 'client_a_user@rls-fixture.local', '',
   now(), now(), now(),
   '{"provider":"email","providers":["email"]}', '{}',
   now(), now(),
   '', '', '', ''),
  ('00000000-0000-0000-0000-000000000000',
   'cccccccc-cccc-cccc-cccc-cccccccccccc',
   'authenticated', 'authenticated', 'admin_user@rls-fixture.local', '',
   now(), now(), now(),
   '{"provider":"email","providers":["email"]}', '{}',
   now(), now(),
   '', '', '', '')
on conflict (id) do nothing;

alter table auth.users enable trigger on_auth_user_created;

-- ---------------------------------------------------------------------------
-- 3. public.profiles fixture rows -- a direct INSERT (not an UPDATE), so the
--    column-immutability trigger from 0001_profiles.sql is never invoked by
--    this fixture. Final, already-approved state for all three actors.
-- ---------------------------------------------------------------------------
insert into public.profiles (id, email, role, status, must_change_password, client_id)
values
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'pm_a@rls-fixture.local', 'pm', 'approved', false, null),
  ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'client_a_user@rls-fixture.local', 'client', 'approved', false, '11111111-1111-1111-1111-111111111111'),
  ('cccccccc-cccc-cccc-cccc-cccccccccccc', 'admin_user@rls-fixture.local', 'admin', 'approved', false, null)
on conflict (id) do nothing;

-- ---------------------------------------------------------------------------
-- 4. pm_clients assignment -- pm_a assigned to client_a ONLY, never
--    client_b. This single row is the crux of AUTH-06.
-- ---------------------------------------------------------------------------
insert into public.pm_clients (pm_id, client_id)
values ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '11111111-1111-1111-1111-111111111111')
on conflict (pm_id, client_id) do nothing;

-- ---------------------------------------------------------------------------
-- Role-simulation helper: simulate a signed-in user's verified JWT for RLS
-- purposes by setting the request.jwt.claims GUC (read by auth.uid()) and
-- switching the active Postgres role to `authenticated` -- matching the
-- pattern in 05-RESEARCH.md's Validation Architecture / this plan's
-- <interfaces> section ("set role authenticated; set request.jwt.claims = ...").
--
-- Only called BEFORE any role switch (i.e. while still the session-owner
-- role), so no extra grants are required for it to run. To de-authenticate,
-- test files call `reset role;` + clear the claim directly (plain SQL, no
-- wrapper function) rather than invoking a function while impersonating
-- `authenticated`, which would require extra schema grants.
-- ---------------------------------------------------------------------------
create schema if not exists tests;

create or replace function tests.set_auth(uid uuid)
returns void
language plpgsql
as $$
begin
  perform set_config(
    'request.jwt.claims',
    json_build_object('sub', uid, 'role', 'authenticated')::text,
    true
  );
  set local role authenticated;
end;
$$;
