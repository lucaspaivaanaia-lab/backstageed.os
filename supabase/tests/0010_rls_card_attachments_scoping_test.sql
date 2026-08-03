-- Phase 3, Plan 03-04: card attachment RLS proof -- KAN-05.
--
-- Proves, at the Postgres RLS layer, that card_attachments inherits its
-- per-client scoping through cards.client_id (a cross-table subquery, NOT
-- self-referential -- see 0018_card_attachments.sql's header comment): a PM
-- assigned only to client_a can read/insert/delete attachments on client_a's
-- card but is blocked from client_b's card's attachments, exercising
-- card_attachments_select_scoped / card_attachments_insert_scoped /
-- card_attachments_delete_scoped shipped in 0018_card_attachments.sql.
-- Nothing is redefined here.

begin;
select plan(4);

\ir rls_helpers.sql

-- Seed as session owner (postgres): one single card for client_a with one
-- attachment, and one single card for client_b with one attachment --
-- inserted BEFORE authenticating as pm_a so they already exist to be read
-- back once the RLS-scoped session begins.
insert into public.cards (id, client_id, card_type, title, stage, created_by)
values
  ('55555555-5555-5555-5555-555555555555', '11111111-1111-1111-1111-111111111111', 'single', 'Card A (client_a)', 'producao', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'),
  ('66666666-6666-6666-6666-666666666666', '22222222-2222-2222-2222-222222222222', 'single', 'Card B (client_b)', 'producao', 'cccccccc-cccc-cccc-cccc-cccccccccccc');

insert into public.card_attachments (card_id, url, link_type, created_by)
values
  ('55555555-5555-5555-5555-555555555555', 'https://drive.google.com/file/d/AAA/view', 'other', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'),
  ('66666666-6666-6666-6666-666666666666', 'https://drive.google.com/file/d/BBB/view', 'other', 'cccccccc-cccc-cccc-cccc-cccccccccccc');

-- Authenticate as pm_a (assigned only to client_a, per the fixture).
select tests.set_auth('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa');

-- 1. pm_a sees exactly the 1 attachment seeded for the client_a card.
select results_eq(
  $$ select count(*) from public.card_attachments where card_id = '55555555-5555-5555-5555-555555555555' $$,
  $$ values (1::bigint) $$,
  'pm_a ve exatamente 1 anexo do card do client_a atribuido'
);

-- 2. pm_a sees 0 attachments for the client_b card -- scoping travels
--    through cards.client_id, not a direct client_id column on this table.
select results_eq(
  $$ select count(*) from public.card_attachments where card_id = '66666666-6666-6666-6666-666666666666' $$,
  $$ values (0::bigint) $$,
  'pm_a e bloqueado dos anexos do card do client_b nao-atribuido'
);

-- 3. pm_a cannot insert an attachment for the client_b card.
select throws_like(
  $$ insert into public.card_attachments (card_id, url, link_type, created_by) values ('66666666-6666-6666-6666-666666666666', 'https://drive.google.com/file/d/CCC/view', 'other', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa') $$,
  '%row-level security%',
  'pm_a nao consegue inserir anexo para o card do client_b nao-atribuido'
);

-- 4. A delete targeting the client_b card's attachment silently matches
--    zero rows (rather than removing it) -- the delete policy scopes the
--    DELETE the same way it scopes the INSERT above. Verified by the
--    session owner (after de-authenticating) still seeing the 1 attachment
--    seeded for client_b.
delete from public.card_attachments where card_id = '66666666-6666-6666-6666-666666666666';

reset role;
select set_config('request.jwt.claims', '', true);

select results_eq(
  $$ select count(*) from public.card_attachments where card_id = '66666666-6666-6666-6666-666666666666' $$,
  $$ values (1::bigint) $$,
  'delete do card_id do client_b nao-atribuido nao afeta nenhuma linha (pm_a delete nao deu match)'
);

select * from finish();
rollback;
