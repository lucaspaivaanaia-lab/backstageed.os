-- Quick task 260811-n0i: Item 4 of the 2026-08-05 Juliano action plan's P3
-- ("segundo campo de atribuicao no card"). Proves, at the Postgres layer,
-- that enforce_card_assignee_membership() (extended by migration
-- 0029_cards_media_assignee.sql) enforces the SAME pm_clients membership
-- rule on media_assignee_id that 0009_cards_assignee_membership_test.sql
-- already proves for assignee_id -- on both INSERT and UPDATE, with a
-- DISTINCT exception token (media_assignee_not_on_roster). Does not
-- re-test assignee_id itself (already covered by 0009) or the D-15
-- delete/grant path (unrelated to this column).

begin;
select plan(4);

\ir rls_helpers.sql

-- Authenticate as pm_a (assigned to client_a ONLY per the fixture).
select tests.set_auth('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa');

-- 1. Inserting a card for client_a with media_assignee_id = pm_a succeeds
-- -- pm_a IS in pm_clients for client_a.
select lives_ok(
  $$ insert into public.cards (id, client_id, card_type, title, stage, created_by, media_assignee_id)
     values (
       'dddddddd-dddd-dddd-dddd-dddddddddddd',
       '11111111-1111-1111-1111-111111111111',
       'single',
       'Card com media_assignee valido',
       'briefing',
       'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
       'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'
     ) $$,
  'insert com media_assignee_id pertencente ao pm_clients do client_a sucede'
);

-- 2. Inserting the same shape with media_assignee_id = null succeeds --
-- Item 4 decision: purely informative, optional field, same as
-- assignee_id.
select lives_ok(
  $$ insert into public.cards (id, client_id, card_type, title, stage, created_by, media_assignee_id)
     values (
       'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee',
       '11111111-1111-1111-1111-111111111111',
       'single',
       'Card sem media_assignee',
       'briefing',
       'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
       null
     ) $$,
  'insert com media_assignee_id null sucede (opcional)'
);

-- 3. Inserting the same shape with media_assignee_id = admin_user (a real
-- profile that is NOT in pm_clients for client_a) is rejected by the
-- extended trigger, with the DISTINCT token.
select throws_like(
  $$ insert into public.cards (id, client_id, card_type, title, stage, created_by, media_assignee_id)
     values (
       'ffffffff-ffff-ffff-ffff-ffffffffffff',
       '11111111-1111-1111-1111-111111111111',
       'single',
       'Card com media_assignee invalido',
       'briefing',
       'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
       'cccccccc-cccc-cccc-cccc-cccccccccccc'
     ) $$,
  '%media_assignee_not_on_roster%',
  'insert com media_assignee_id fora do pm_clients do client_a e rejeitado'
);

-- 4. Assigning admin_user to the assertion-2 card via UPDATE is also
-- rejected -- the trigger fires on UPDATE as well as INSERT.
select throws_like(
  $$ update public.cards set media_assignee_id = 'cccccccc-cccc-cccc-cccc-cccccccccccc'
     where id = 'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee' $$,
  '%media_assignee_not_on_roster%',
  'update com media_assignee_id fora do pm_clients do client_a e rejeitado'
);

-- De-authenticate before the transaction rolls back.
reset role;
select set_config('request.jwt.claims', '', true);

select * from finish();
rollback;
