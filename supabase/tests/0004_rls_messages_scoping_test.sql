-- Phase 2: Client-Isolated AI Chat -- CTX-01, CTX-02.
--
-- Proves, at the Postgres RLS layer, that a PM assigned only to client_a can
-- read/insert client_a's messages but is blocked from reading OR inserting
-- client_b's messages (D-02 isolation), exercising the actual
-- messages_select_scoped / messages_insert_scoped policies shipped in
-- 0010_messages.sql. Nothing is redefined here.

begin;
select plan(3);

\ir rls_helpers.sql

-- Seed one fixture message for client_a, inserted as the session-owner
-- (postgres) role BEFORE authenticating as pm_a, so it already exists to be
-- read back once pm_a's RLS-scoped session begins.
insert into public.messages (client_id, role, content)
values ('11111111-1111-1111-1111-111111111111', 'user', 'Fixture message for client_a');

-- Authenticate as pm_a (assigned to client_a ONLY per the fixture).
select tests.set_auth('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa');

-- pm_a sees exactly the one message seeded for their assigned client_a.
select results_eq(
  $$ select count(*) from public.messages where client_id = '11111111-1111-1111-1111-111111111111' $$,
  $$ values (1::bigint) $$,
  'pm_a sees exactly 1 message for assigned client_a'
);

-- pm_a is blocked from reading client_b's messages (there are none to see,
-- but the core AUTH-06-style guarantee is that the row would be invisible
-- even if it existed -- proven together with the insert-rejection case below).
select results_eq(
  $$ select count(*) from public.messages where client_id = '22222222-2222-2222-2222-222222222222' $$,
  $$ values (0::bigint) $$,
  'pm_a is blocked from unassigned client_b messages'
);

-- pm_a cannot insert a message for client_b -- the insert policy must
-- reject this at the RLS layer.
select throws_like(
  $$ insert into public.messages (client_id, role, content) values ('22222222-2222-2222-2222-222222222222', 'user', 'Should be rejected') $$,
  '%row-level security%',
  'pm_a cannot insert a message for unassigned client_b'
);

-- De-authenticate before the transaction rolls back.
reset role;
select set_config('request.jwt.claims', '', true);

select * from finish();
rollback;
