-- Phase 3: Content Production Kanban -- Plan 03-07. KAN-01, KAN-02, D-19, D-15.
--
-- Proves, at the Postgres layer, that:
--   (a) an assignee outside the client's pm_clients rows is rejected on
--       both INSERT and UPDATE (cards_assignee_membership_trg, D-19), and
--   (b) an authenticated PM can actually DELETE a card in their own client
--       (the D-15 compensating-delete fail-safe path) -- proving the
--       `grant delete on public.cards to authenticated` + `cards_delete_
--       scoped` policy shipped in 0017_cards_description_assignee.sql are
--       a real, working operation and not merely present in the file.
-- Exercises migration 0017. Nothing is redefined here.

begin;
select plan(7);

\ir rls_helpers.sql

-- Authenticate as pm_a (assigned to client_a ONLY per the fixture).
select tests.set_auth('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa');

-- 1. Inserting a single card for client_a with assignee_id = pm_a succeeds
-- -- pm_a IS in pm_clients for client_a.
select lives_ok(
  $$ insert into public.cards (id, client_id, card_type, title, stage, created_by, assignee_id)
     values (
       '77777777-7777-7777-7777-777777777777',
       '11111111-1111-1111-1111-111111111111',
       'single',
       'Card com assignee valido',
       'briefing',
       'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
       'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'
     ) $$,
  'insert com assignee_id pertencente ao pm_clients do client_a sucede'
);

-- 2. Inserting the same shape with assignee_id = null succeeds (D-19: the
-- assignee is optional). This is the card later targeted by assertions 4,
-- 6 and 7.
select lives_ok(
  $$ insert into public.cards (id, client_id, card_type, title, stage, created_by, assignee_id)
     values (
       '88888888-8888-8888-8888-888888888888',
       '11111111-1111-1111-1111-111111111111',
       'single',
       'Card sem assignee',
       'briefing',
       'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
       null
     ) $$,
  'insert com assignee_id null sucede (D-19: assignee opcional)'
);

-- 3. Inserting the same shape with assignee_id = admin_user (a real
-- profile that is NOT in pm_clients for client_a) is rejected by the
-- trigger.
select throws_like(
  $$ insert into public.cards (id, client_id, card_type, title, stage, created_by, assignee_id)
     values (
       '99999999-9999-9999-9999-999999999999',
       '11111111-1111-1111-1111-111111111111',
       'single',
       'Card com assignee invalido',
       'briefing',
       'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
       'cccccccc-cccc-cccc-cccc-cccccccccccc'
     ) $$,
  '%assignee_not_assigned_to_client%',
  'insert com assignee_id fora do pm_clients do client_a e rejeitado'
);

-- 4. Assigning admin_user to the assertion-2 card via UPDATE is also
-- rejected -- the trigger fires on UPDATE as well as INSERT, so an
-- assignment cannot be smuggled in after creation.
select throws_like(
  $$ update public.cards set assignee_id = 'cccccccc-cccc-cccc-cccc-cccccccccccc'
     where id = '88888888-8888-8888-8888-888888888888' $$,
  '%assignee_not_assigned_to_client%',
  'update com assignee_id fora do pm_clients do client_a e rejeitado'
);

-- 5. The D-15 compensating delete has a real GRANT behind it. Without this
-- the fail-safe in createCard is a silent no-op.
select ok(
  has_table_privilege('authenticated', 'public.cards', 'DELETE'),
  'authenticated tem privilegio DELETE em public.cards (D-15 fail-safe)'
);

-- 6. Still authenticated as pm_a, delete the assertion-2 card. This proves
-- cards_delete_scoped actually admits a PM deleting a card in their own
-- client, not just that the grant exists.
select lives_ok(
  $$ delete from public.cards where id = '88888888-8888-8888-8888-888888888888' $$,
  'pm_a consegue deletar um card do proprio client_a (cards_delete_scoped)'
);

-- 7. The row is genuinely gone, not silently filtered away by a policy
-- that matched nothing.
select is(
  (select count(*) from public.cards where id = '88888888-8888-8888-8888-888888888888')::int,
  0,
  'o card deletado nao existe mais (delete real, nao apenas filtrado pela RLS)'
);

-- De-authenticate before the transaction rolls back.
reset role;
select set_config('request.jwt.claims', '', true);

select * from finish();
rollback;
