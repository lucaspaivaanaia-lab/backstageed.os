-- Phase 3, Plan 03-03: card checklist snapshot RLS proof -- CHK-03, CHK-04.
--
-- Proves, at the Postgres RLS layer, that card_checklist_items inherits its
-- per-client scoping through cards.client_id (a cross-table subquery, NOT
-- self-referential -- see 0016_card_checklist_items.sql's header comment):
-- a PM assigned only to client_a can read/write checklist items on
-- client_a's card but is blocked from client_b's card's items, exercising
-- card_checklist_items_select_scoped / card_checklist_items_write_scoped
-- shipped in 0016_card_checklist_items.sql. Nothing is redefined here.

begin;
select plan(4);

\ir rls_helpers.sql

-- Seed as session owner (postgres): one single card for client_a with two
-- checklist items, and one single card for client_b with one checklist
-- item -- inserted BEFORE authenticating as pm_a so they already exist to
-- be read back once the RLS-scoped session begins.
insert into public.cards (id, client_id, card_type, title, stage, created_by)
values
  ('33333333-3333-3333-3333-333333333333', '11111111-1111-1111-1111-111111111111', 'single', 'Card A (client_a)', 'revisao_interna', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'),
  ('44444444-4444-4444-4444-444444444444', '22222222-2222-2222-2222-222222222222', 'single', 'Card B (client_b)', 'revisao_interna', 'cccccccc-cccc-cccc-cccc-cccccccccccc');

insert into public.card_checklist_items (card_id, label, sort_order)
values
  ('33333333-3333-3333-3333-333333333333', 'Item A1', 0),
  ('33333333-3333-3333-3333-333333333333', 'Item A2', 1),
  ('44444444-4444-4444-4444-444444444444', 'Item B1', 0);

-- Authenticate as pm_a (assigned only to client_a, per the fixture).
select tests.set_auth('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa');

-- 1. pm_a sees exactly the 2 items seeded for the client_a card.
select results_eq(
  $$ select count(*) from public.card_checklist_items where card_id = '33333333-3333-3333-3333-333333333333' $$,
  $$ values (2::bigint) $$,
  'pm_a ve exatamente 2 itens de checklist do card do client_a atribuido'
);

-- 2. pm_a sees 0 items for the client_b card -- scoping travels through
--    cards.client_id, not a direct client_id column on this table.
select results_eq(
  $$ select count(*) from public.card_checklist_items where card_id = '44444444-4444-4444-4444-444444444444' $$,
  $$ values (0::bigint) $$,
  'pm_a e bloqueado dos itens de checklist do card do client_b nao-atribuido'
);

-- 3. pm_a cannot insert an item for the client_b card.
select throws_like(
  $$ insert into public.card_checklist_items (card_id, label, sort_order) values ('44444444-4444-4444-4444-444444444444', 'Should be rejected', 0) $$,
  '%row-level security%',
  'pm_a nao consegue inserir item de checklist para o card do client_b nao-atribuido'
);

-- 4. An update targeting the client_b card's items silently matches zero
--    rows (rather than mutating them) -- the write policy scopes the
--    UPDATE the same way it scopes the INSERT above.
update public.card_checklist_items
set completed_at = now()
where card_id = '44444444-4444-4444-4444-444444444444';

select results_eq(
  $$ select count(*) from public.card_checklist_items where card_id = '44444444-4444-4444-4444-444444444444' and completed_at is not null $$,
  $$ values (0::bigint) $$,
  'update do card_id do client_b nao-atribuido nao afeta nenhuma linha (write policy nao deu match)'
);

-- De-authenticate before the transaction rollback.
reset role;
select set_config('request.jwt.claims', '', true);

select * from finish();
rollback;
