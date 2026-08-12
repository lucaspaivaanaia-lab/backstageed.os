-- Phase 4 (Client Approval & Scheduling), Wave 0 (04-01-PLAN.md, Task 2).
--
-- Proves, at the Postgres RLS layer, the Client role's stage-filtered
-- visibility and write-boundary guarantees shipped by migration
-- 0032_client_approval_scheduling.sql:
--   * client_a_user sees ONLY their own client's cards currently in
--     aprovacao_cliente/agendamento -- NOT an earlier-stage card of the
--     same client (internal WIP must never leak, mirrors why Editor
--     doesn't see messages/client_files either)
--   * client_a_user does NOT see client_b's own aprovacao_cliente card
--     (cross-client isolation), and client_b_user does NOT see client_a's
--     (same proof, reverse direction)
--   * client_a_user CAN write the exact requestAdjustment payload shape
--     (stage -> producao, client_adjustment_comment set) against a card
--     currently in aprovacao_cliente, and it persists
--   * client_a_user CANNOT write against a same-client card NOT currently
--     in aprovacao_cliente (the `using` clause's stage gate)
--   * card_attachments: read-only Client visibility, no insert
--   * cards: Client never gets an insert branch at all
-- Exercises migration 0032_client_approval_scheduling.sql. Nothing is
-- redefined here.

begin;
select plan(11);

\ir rls_helpers.sql

-- ---------------------------------------------------------------------------
-- Fixture, local to this file (rls_helpers.sql itself is never edited):
--   client_b_user = 99999999-9999-9999-9999-999999999999 (role=client,
--     client_id=client_b) -- needed to prove cross-client isolation in both
--     directions; rls_helpers.sql's own client_a_user is client_a-scoped.
-- client_b_user auto-lands status='approved' via handle_new_user() (same as
-- client_a_user already does) -- no manual status correction needed.
-- ---------------------------------------------------------------------------
insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password,
  email_confirmed_at, recovery_sent_at, last_sign_in_at,
  raw_app_meta_data, raw_user_meta_data,
  created_at, updated_at,
  confirmation_token, email_change, email_change_token_new, recovery_token
) values (
  '00000000-0000-0000-0000-000000000000',
  '99999999-9999-9999-9999-999999999999',
  'authenticated', 'authenticated', 'client_b_user@rls-fixture.local', '',
  now(), now(), now(),
  '{"provider":"email","providers":["email"]}', '{"role":"client","client_id":"22222222-2222-2222-2222-222222222222"}',
  now(), now(),
  '', '', '', ''
)
on conflict (id) do nothing;

-- Cards, seeded as the session-owner role (postgres), before authenticating
-- as client_a_user:
--   card_queue_a         client_a, aprovacao_cliente -- visible, writable
--   card_producao_a      client_a, producao -- NOT visible (internal WIP)
--   card_agendamento_a   client_a, agendamento -- visible (D-01 history)
--   card_queue_b         client_b, aprovacao_cliente -- NOT visible to
--                        client_a_user (cross-client isolation)
insert into public.cards (id, client_id, card_type, title, stage, created_by)
values (
  'c1c1c1c1-c1c1-c1c1-c1c1-c1c1c1c1c1c1',
  '11111111-1111-1111-1111-111111111111',
  'single', 'Card na fila de aprovacao (client_a)', 'aprovacao_cliente',
  'cccccccc-cccc-cccc-cccc-cccccccccccc'
);

insert into public.cards (id, client_id, card_type, title, stage, created_by)
values (
  'c2c2c2c2-c2c2-c2c2-c2c2-c2c2c2c2c2c2',
  '11111111-1111-1111-1111-111111111111',
  'single', 'Card em producao (client_a)', 'producao',
  'cccccccc-cccc-cccc-cccc-cccccccccccc'
);

insert into public.cards (id, client_id, card_type, title, stage, created_by)
values (
  'c3c3c3c3-c3c3-c3c3-c3c3-c3c3c3c3c3c3',
  '11111111-1111-1111-1111-111111111111',
  'single', 'Card agendado (client_a)', 'agendamento',
  'cccccccc-cccc-cccc-cccc-cccccccccccc'
);

insert into public.cards (id, client_id, card_type, title, stage, created_by)
values (
  'c4c4c4c4-c4c4-c4c4-c4c4-c4c4c4c4c4c4',
  '22222222-2222-2222-2222-222222222222',
  'single', 'Card na fila de aprovacao (client_b)', 'aprovacao_cliente',
  'cccccccc-cccc-cccc-cccc-cccccccccccc'
);

insert into public.card_attachments (id, card_id, url, link_type, created_by)
values (
  'c5c5c5c5-c5c5-c5c5-c5c5-c5c5c5c5c5c5',
  'c1c1c1c1-c1c1-c1c1-c1c1-c1c1c1c1c1c1',
  'https://drive.google.com/file/d/client-a-anexo', 'other',
  'cccccccc-cccc-cccc-cccc-cccccccccccc'
);

-- Authenticate as client_a_user.
select tests.set_auth('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb');

-- 1. client_a_user ve o proprio card na fila de aprovacao.
select ok(
  exists(select 1 from public.cards where id = 'c1c1c1c1-c1c1-c1c1-c1c1-c1c1c1c1c1c1'),
  'client_a_user ve seu proprio card em aprovacao_cliente'
);

-- 2. client_a_user NAO ve o proprio card em producao -- WIP interno nunca
-- vaza, prova que o branch e filtrado por stage, nao so por cliente.
select ok(
  not exists(select 1 from public.cards where id = 'c2c2c2c2-c2c2-c2c2-c2c2-c2c2c2c2c2c2'),
  'client_a_user NAO ve seu proprio card em producao (WIP interno)'
);

-- 3. client_a_user ve o proprio card agendado (D-01 historico).
select ok(
  exists(select 1 from public.cards where id = 'c3c3c3c3-c3c3-c3c3-c3c3-c3c3c3c3c3c3'),
  'client_a_user ve seu proprio card em agendamento (historico D-01)'
);

-- 4. client_a_user NAO ve o card de client_b na fila -- isolamento
-- cross-client.
select ok(
  not exists(select 1 from public.cards where id = 'c4c4c4c4-c4c4-c4c4-c4c4-c4c4c4c4c4c4'),
  'client_a_user NAO ve o card de client_b na fila de aprovacao'
);

-- 5. client_a_user CONSEGUE escrever o payload exato de requestAdjustment
-- contra seu proprio card em aprovacao_cliente.
select lives_ok(
  $$ update public.cards
     set stage = 'producao', client_adjustment_comment = 'Ajustar o CTA'
     where id = 'c1c1c1c1-c1c1-c1c1-c1c1-c1c1c1c1c1c1' $$,
  'client_a_user consegue escrever o payload de requestAdjustment no proprio card em aprovacao_cliente'
);

-- 6. Confirma que a escrita acima realmente persistiu.
select results_eq(
  $$ select stage, client_adjustment_comment from public.cards where id = 'c1c1c1c1-c1c1-c1c1-c1c1-c1c1c1c1c1c1' $$,
  $$ values ('producao'::public.card_stage, 'Ajustar o CTA'::text) $$,
  'a escrita de requestAdjustment persistiu (stage=producao, client_adjustment_comment setado)'
);

-- 7. client_a_user NAO CONSEGUE escrever contra um card do mesmo cliente que
-- NAO esta em aprovacao_cliente -- a clausula `using` bloqueia a escrita
-- (idioma "UPDATE sem guarda + results_eq zero linhas", mirrors 0007).
update public.cards
set client_adjustment_comment = 'tentativa invalida'
where id = 'c2c2c2c2-c2c2-c2c2-c2c2-c2c2c2c2c2c2';

select results_eq(
  $$ select count(*) from public.cards where id = 'c2c2c2c2-c2c2-c2c2-c2c2-c2c2c2c2c2c2' and client_adjustment_comment = 'tentativa invalida' $$,
  $$ values (0::bigint) $$,
  'client_a_user NAO consegue escrever em card do mesmo cliente fora de aprovacao_cliente (clausula using bloqueia)'
);

-- 8. card_attachments: client_a_user ve exatamente 1 anexo do proprio card
-- na fila de aprovacao.
select results_eq(
  $$ select count(*) from public.card_attachments where card_id = 'c1c1c1c1-c1c1-c1c1-c1c1-c1c1c1c1c1c1' $$,
  $$ values (1::bigint) $$,
  'client_a_user ve exatamente 1 anexo do proprio card na fila de aprovacao'
);

-- 9. card_attachments: client_a_user NAO CONSEGUE inserir um anexo novo --
-- a policy de insert continua PM/Admin-only, inalterada.
select throws_like(
  $$ insert into public.card_attachments (card_id, url, link_type, created_by)
     values ('c1c1c1c1-c1c1-c1c1-c1c1-c1c1c1c1c1c1', 'https://drive.google.com/file/d/x', 'other', 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb') $$,
  '%row-level security%',
  'client_a_user NAO consegue inserir um anexo, mesmo no proprio card'
);

-- 10. cards: client_a_user NAO CONSEGUE inserir um card novo -- Client nunca
-- ganha um branch de insert (cards_insert_scoped, 0015, inalterada).
select throws_like(
  $$ insert into public.cards (client_id, card_type, title, stage, created_by)
     values ('11111111-1111-1111-1111-111111111111', 'single', 'Card inserido pelo client_a_user', 'aprovacao_cliente', 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb') $$,
  '%row-level security%',
  'client_a_user NAO consegue inserir um card novo'
);

-- Re-authenticate as client_b_user to prove cross-client isolation in the
-- reverse direction.
select tests.set_auth('99999999-9999-9999-9999-999999999999');

-- 11. client_b_user NAO ve o card de client_a na fila -- isolamento
-- cross-client, direcao reversa.
select ok(
  not exists(select 1 from public.cards where id = 'c1c1c1c1-c1c1-c1c1-c1c1-c1c1c1c1c1c1'),
  'client_b_user NAO ve o card de client_a na fila de aprovacao (direcao reversa)'
);

-- De-authenticate before the transaction rolls back.
reset role;
select set_config('request.jwt.claims', '', true);

select * from finish();
rollback;
