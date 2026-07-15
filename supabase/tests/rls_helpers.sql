-- Phase 5: Access & Roles -- pgTAP shared fixture + role-simulation helpers.
--
-- This file is included (via psql's \ir) at the top of every
-- supabase/tests/*_test.sql file in this suite. It seeds deterministic
-- fixture data and defines a role-simulation helper. It does NOT define
-- (or touch the behavior of) any table or RLS policy shipped in 05-01's
-- migrations (0001_profiles.sql / 0004_rls_policies.sql) -- those are the
-- system under test and are exercised exactly as shipped.
--
-- Fixture population approach (round 2, quick task 260715-cut, follow-up to
-- 260715-ca2): the previous approach temporarily disabled the
-- on_auth_user_created trigger on the auth schema's users table by first
-- switching into the auth-admin role, so a direct public.profiles INSERT
-- could set each actor's final role/status without ever invoking the
-- column-immutability BEFORE UPDATE trigger (prevent_profile_privilege_
-- escalation_trg, the actual subject under test in
-- 0001_rls_pm_scoping_test.sql). That role switch fails at runtime with a
-- "permission denied to set role" error naming the auth-admin role -- the
-- local `postgres` role connecting for tests is not a member of that admin
-- role, so it cannot even switch into it (nor is it the owner of the
-- auth schema's users table).
--
-- This version never touches auth.users' triggers or role at all. Instead:
--   1. Each auth.users fixture row carries the actor's intended role (and,
--      for the client actor, client_id) in raw_user_meta_data. The
--      on_auth_user_created trigger fires normally and handle_new_user()
--      (0001_profiles.sql) creates each actor's public.profiles row already
--      set to the right role/client_id. handle_new_user() hardcodes
--      status='approved' only when role='client', else status='pending' --
--      so client_a_user's profile is already fully correct with no further
--      touch needed, while pm_a and admin_user land at status='pending'.
--   2. A single UPDATE corrects pm_a's and admin_user's status to
--      'approved' (client_a_user is deliberately excluded -- it needs no
--      correction). Because that UPDATE changes the `status` column, it
--      would normally be rejected by prevent_profile_privilege_escalation_
--      trg (a non-admin change to role/status) -- but no admin profile
--      exists yet this early in fixture bootstrap to authorize it. Unlike
--      auth.users, public.profiles IS owned by the local `postgres` role,
--      so this file scopes a plain `alter table public.profiles disable/
--      enable trigger prevent_profile_privilege_escalation_trg` pair around
--      just that one UPDATE -- no role switch required, and the trigger is
--      re-enabled before any test assertions run, so 0001_rls_pm_scoping_
--      test.sql's Blocker-1 assertions (which exercise the trigger under a
--      simulated PM identity, not during fixture bootstrap) are unaffected.
-- Every test file wraps its own run in begin;/rollback;, so none of this
-- persists beyond a single test file's transaction regardless.
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
-- 2. auth.users fixture rows for three actors (fixed uuids). Each row's
--    raw_user_meta_data carries the actor's role (and client_id for the
--    client actor) so the on_auth_user_created trigger fires normally and
--    handle_new_user() (0001_profiles.sql) creates the matching
--    public.profiles row. No trigger is disabled and no role switch is
--    attempted here -- auth.users is owned by supabase_auth_admin, which the
--    local postgres role is not a member of.
-- ---------------------------------------------------------------------------
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
   '{"provider":"email","providers":["email"]}', '{"role":"pm"}',
   now(), now(),
   '', '', '', ''),
  ('00000000-0000-0000-0000-000000000000',
   'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb',
   'authenticated', 'authenticated', 'client_a_user@rls-fixture.local', '',
   now(), now(), now(),
   '{"provider":"email","providers":["email"]}', '{"role":"client","client_id":"11111111-1111-1111-1111-111111111111"}',
   now(), now(),
   '', '', '', ''),
  ('00000000-0000-0000-0000-000000000000',
   'cccccccc-cccc-cccc-cccc-cccccccccccc',
   'authenticated', 'authenticated', 'admin_user@rls-fixture.local', '',
   now(), now(), now(),
   '{"provider":"email","providers":["email"]}', '{"role":"admin"}',
   now(), now(),
   '', '', '', '')
on conflict (id) do nothing;

-- ---------------------------------------------------------------------------
-- 3. public.profiles status correction -- handle_new_user() (triggered by
--    the auth.users insert above) already created all three profiles with
--    the right role and client_id, but it hardcodes status='approved' only
--    when role='client' (else 'pending'). client_a_user is therefore already
--    fully correct and is NOT touched here. pm_a and admin_user need a
--    status correction to 'approved', which requires a scoped disable of
--    prevent_profile_privilege_escalation_trg (public.profiles IS owned by
--    the local postgres role, so this ALTER TABLE succeeds without any role
--    switch) around a single UPDATE, re-enabled immediately after.
-- ---------------------------------------------------------------------------
alter table public.profiles disable trigger prevent_profile_privilege_escalation_trg;

update public.profiles
set status = 'approved'
where id in ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'cccccccc-cccc-cccc-cccc-cccccccccccc');

alter table public.profiles enable trigger prevent_profile_privilege_escalation_trg;

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
