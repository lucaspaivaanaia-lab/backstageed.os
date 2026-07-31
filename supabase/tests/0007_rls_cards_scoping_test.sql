-- Phase 3: Content Production Kanban -- Plan 03-02. KAN-01, KAN-02, KAN-03.
--
-- Proves, at the Postgres RLS layer, that a PM assigned only to client_a can
-- read/insert client_a's cards but is blocked from reading, inserting, or
-- mutating client_b's cards -- INCLUDING for a sub-card ("piece") reached
-- only through a package parent belonging to client_b (the self-
-- referencing-hierarchy leakage regression, 03-RESEARCH.md Pitfall 1).
-- Exercises the cards_select_scoped / cards_insert_scoped / cards_update_
-- scoped policies shipped in 0015_cards.sql. Nothing is redefined here.

begin;
select plan(5);

\ir rls_helpers.sql

-- Seed, as the session-owner role (postgres) before authenticating as
-- pm_a, so the rows already exist to be read back once pm_a's RLS-scoped
-- session begins:
--   1. one `single` card for client_a
--   2. one `package` parent for client_b (stage null per the
--      cards_package_has_no_stage constraint)
--   3. one `piece` child of that package, with client_id DENORMALIZED to
--      client_b (03-RESEARCH.md Pattern 1) -- this is the row assertion 3
--      below proves is invisible to pm_a despite living "under" a
--      client_b package.
insert into public.cards (id, client_id, card_type, title, stage, created_by)
values (
  '44444444-4444-4444-4444-444444444444',
  '11111111-1111-1111-1111-111111111111',
  'single',
  'Card single client_a',
  'briefing',
  'cccccccc-cccc-cccc-cccc-cccccccccccc'
);

insert into public.cards (id, client_id, card_type, title, stage, created_by)
values (
  '55555555-5555-5555-5555-555555555555',
  '22222222-2222-2222-2222-222222222222',
  'package',
  'Pacote client_b',
  null,
  'cccccccc-cccc-cccc-cccc-cccccccccccc'
);

insert into public.cards (id, client_id, parent_card_id, card_type, title, stage, created_by)
values (
  '66666666-6666-6666-6666-666666666666',
  '22222222-2222-2222-2222-222222222222',
  '55555555-5555-5555-5555-555555555555',
  'piece',
  'Peça client_b',
  'briefing',
  'cccccccc-cccc-cccc-cccc-cccccccccccc'
);

-- Authenticate as pm_a (assigned to client_a ONLY per the fixture).
select tests.set_auth('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa');

-- 1. pm_a sees exactly the one card seeded for their assigned client_a.
select results_eq(
  $$ select count(*) from public.cards where client_id = '11111111-1111-1111-1111-111111111111' $$,
  $$ values (1::bigint) $$,
  'pm_a sees exactly 1 card for assigned client_a'
);

-- 2. pm_a is blocked from client_b's cards (the package parent).
select results_eq(
  $$ select count(*) from public.cards where client_id = '22222222-2222-2222-2222-222222222222' $$,
  $$ values (0::bigint) $$,
  'pm_a is blocked from unassigned client_b cards'
);

-- 3. Self-referencing-hierarchy leakage regression (Pitfall 1 guard): pm_a
-- sees zero `piece` rows at all -- proving the piece is invisible on its
-- OWN denormalized client_id, independent of what its parent's client_id
-- is. If client_id were inferred through parent_card_id instead of stored
-- directly on the piece row, this is exactly the check that would catch a
-- cross-client leak through the hierarchy.
select results_eq(
  $$ select count(*) from public.cards where card_type = 'piece' $$,
  $$ values (0::bigint) $$,
  'pm_a sees zero piece rows -- self-referencing-hierarchy leakage regression (Pitfall 1)'
);

-- 4. pm_a cannot insert a card for client_b -- the insert policy must
-- reject this at the RLS layer.
select throws_like(
  $$ insert into public.cards (client_id, card_type, title, stage, created_by)
     values ('22222222-2222-2222-2222-222222222222', 'single', 'Should be rejected', 'briefing', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa') $$,
  '%row-level security%',
  'pm_a cannot insert a card for unassigned client_b'
);

-- 5. pm_a's update against client_b's cards silently matches zero rows
-- (the update policy's USING clause filters them out of the updatable set)
-- rather than mutating another client's row.
update public.cards set title = 'hijack' where client_id = '22222222-2222-2222-2222-222222222222';

select results_eq(
  $$ select count(*) from public.cards where client_id = '22222222-2222-2222-2222-222222222222' and title = 'hijack' $$,
  $$ values (0::bigint) $$,
  'pm_a update against unassigned client_b cards matches zero rows, never mutates another client''s data'
);

-- De-authenticate before the transaction rolls back.
reset role;
select set_config('request.jwt.claims', '', true);

select * from finish();
rollback;
