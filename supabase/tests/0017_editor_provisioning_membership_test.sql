-- Item 3 of the 2026-08-05 Juliano action plan's P3 ("novo papel de acesso
-- Editor"). Proves two things NOT covered by
-- 0016_rls_editor_scoping_test.sql:
--   (a) handle_new_user() (0001_profiles.sql, status CASE branch extended
--       by 0031) lands a freshly created 'editor' account 'approved'
--       immediately, never 'pending' -- Pitfall 3, 260811-oe0-RESEARCH.md.
--   (b) enforce_card_assignee_membership() (0017/0029, extended by 0031)
--       accepts an approved Editor as media_assignee_id even though the
--       Editor has NO public.pm_clients row -- and that this new branch
--       does NOT loosen the check for a genuinely ineligible id (regression
--       control against the pre-existing assignee_not_assigned_to_client/
--       media_assignee_not_on_roster guarantees, 0009/0015).
-- Exercises migration 0031_editor_role_rls_and_due_date.sql. Nothing is
-- redefined here.

begin;
select plan(7);

\ir rls_helpers.sql

-- New Editor account, created the same way rls_helpers.sql creates every
-- other fixture actor -- via an auth.users insert carrying role='editor' in
-- raw_user_meta_data, letting on_auth_user_created/handle_new_user() run
-- normally. Deliberately a NEW id, not editor_a/editor_b from
-- 0016_rls_editor_scoping_test.sql (each test file is its own isolated
-- transaction, but distinct ids keep this file self-contained/readable on
-- its own).
insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password,
  email_confirmed_at, recovery_sent_at, last_sign_in_at,
  raw_app_meta_data, raw_user_meta_data,
  created_at, updated_at,
  confirmation_token, email_change, email_change_token_new, recovery_token
) values (
  '00000000-0000-0000-0000-000000000000',
  '66666666-6666-6666-6666-666666666666',
  'authenticated', 'authenticated', 'editor_c@rls-fixture.local', '',
  now(), now(), now(),
  '{"provider":"email","providers":["email"]}', '{"role":"editor"}',
  now(), now(),
  '', '', '', ''
) on conflict (id) do nothing;

-- 1. handle_new_user(): the new Editor profile is 'approved' immediately --
-- never 'pending' (Pitfall 3).
select results_eq(
  $$ select status::text from public.profiles where id = '66666666-6666-6666-6666-666666666666' $$,
  $$ values ('approved'::text) $$,
  'conta Editor recem-criada fica approved imediatamente (handle_new_user), nunca pending'
);

-- 2. Sanity: the profile's role really is 'editor' -- proves the enum
-- value + coalesce() mapping in handle_new_user() both work end-to-end.
select results_eq(
  $$ select role::text from public.profiles where id = '66666666-6666-6666-6666-666666666666' $$,
  $$ values ('editor'::text) $$,
  'conta recem-criada tem role = editor'
);

-- Authenticate as pm_a (assigned to client_a ONLY per the fixture) to
-- exercise enforce_card_assignee_membership() from an app-realistic caller
-- (the same actor updateCardDetails/createCard run as).
select tests.set_auth('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa');

-- 3. pm_a CAN assign editor_c as media_assignee_id on a client_a card, even
-- though editor_c has NO pm_clients row for client_a -- the new Editor
-- eligibility branch (migration 0031, point 5).
select lives_ok(
  $$ insert into public.cards (id, client_id, card_type, title, stage, created_by, media_assignee_id)
     values (
       '61616161-6161-6161-6161-616161616161',
       '11111111-1111-1111-1111-111111111111',
       'single', 'Card atribuido ao editor_c', 'briefing',
       'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
       '66666666-6666-6666-6666-666666666666'
     ) $$,
  'pm_a consegue atribuir um Editor aprovado como media_assignee_id, sem linha em pm_clients'
);

-- 4. Regression control: admin_user (role=admin, NOT an editor, NOT in
-- pm_clients for client_a) is STILL rejected -- the new branch did not
-- accidentally loosen the check for a genuinely ineligible id.
select throws_like(
  $$ insert into public.cards (id, client_id, card_type, title, stage, created_by, media_assignee_id)
     values (
       '62626262-6262-6262-6262-626262626262',
       '11111111-1111-1111-1111-111111111111',
       'single', 'Card com media_assignee invalido', 'briefing',
       'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
       'cccccccc-cccc-cccc-cccc-cccccccccccc'
     ) $$,
  '%media_assignee_not_on_roster%',
  'admin_user (nao-editor, fora do pm_clients) continua rejeitado como media_assignee_id'
);

-- 5. Setup for the UPDATE case below: a plain client_a card with no
-- media_assignee yet.
select lives_ok(
  $$ insert into public.cards (id, client_id, card_type, title, stage, created_by)
     values (
       '63636363-6363-6363-6363-636363636363',
       '11111111-1111-1111-1111-111111111111',
       'single', 'Card sem media_assignee ainda', 'briefing',
       'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'
     ) $$,
  'insert do card auxiliar (sem media_assignee ainda) sucede'
);

-- 6. The trigger fires on UPDATE too, not just INSERT: assigning editor_c
-- to the EXISTING card above via UPDATE also succeeds.
select lives_ok(
  $$ update public.cards set media_assignee_id = '66666666-6666-6666-6666-666666666666'
     where id = '63636363-6363-6363-6363-636363636363' $$,
  'pm_a consegue atribuir o Editor via UPDATE tambem, nao so INSERT'
);

-- 7. Cross-client eligibility: as admin_user (who can write to ANY
-- client), editor_c is ALSO valid as media_assignee_id on client_b -- an
-- Editor's eligibility is genuinely role-based, never tied to one
-- client's pm_clients roster.
--
-- Deviation (Rule 1 auto-fix, found running this file): tests.set_auth
-- does `set local role authenticated` -- calling it a SECOND time while
-- already impersonating `authenticated` (from assertion 3's pm_a call
-- above) fails with "permission denied for schema tests", since
-- `authenticated` has no USAGE on the tests schema (rls_helpers.sql's own
-- doc comment: "Only called BEFORE any role switch, i.e. while still the
-- session-owner role"). No existing test file in this suite switches
-- identity mid-file, so this is the first exercise of that path -- a
-- `reset role` first returns to the session-owner role before
-- re-authenticating as a different actor.
reset role;
select tests.set_auth('cccccccc-cccc-cccc-cccc-cccccccccccc');

select lives_ok(
  $$ insert into public.cards (id, client_id, card_type, title, stage, created_by, media_assignee_id)
     values (
       '64646464-6464-6464-6464-646464646464',
       '22222222-2222-2222-2222-222222222222',
       'single', 'Card do editor_c em outro cliente', 'briefing',
       'cccccccc-cccc-cccc-cccc-cccccccccccc',
       '66666666-6666-6666-6666-666666666666'
     ) $$,
  'editor_c e valido como media_assignee_id em client_b tambem -- elegibilidade e cross-client, nunca ligada a um pm_clients de um cliente especifico'
);

-- De-authenticate before the transaction rolls back.
reset role;
select set_config('request.jwt.claims', '', true);

select * from finish();
rollback;
