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
--   * client_a_user CAN move a card from aprovacao_cliente to producao
--     with a comment via the client_request_adjustment RPC (requestAdjustment's
--     real write path -- a plain `.update()` is structurally impossible for
--     this ONE transition, see migration 0032's own header comment,
--     deviation (b): Postgres additionally requires the POST-image row to
--     satisfy cards_select_scoped's own USING clause for UPDATE, and
--     'producao' is deliberately never in that clause)
--   * client_a_user CAN move a DIFFERENT card from aprovacao_cliente to
--     agendamento via a plain `.update()` (approveCard's real write path --
--     'agendamento' IS in cards_select_scoped's Client branch, so no RPC
--     bypass is needed for this transition, unlike producao above)
--   * client_a_user CANNOT write against a same-client card NOT currently
--     in aprovacao_cliente (the `using` clause's stage gate), whether via a
--     plain update OR via client_request_adjustment's own internal re-check
--   * client_a_user CANNOT call client_request_adjustment against another
--     client's card (the RPC's own internal cross-client re-check)
--   * card_attachments: read-only Client visibility, no insert
--   * cards: Client never gets an insert branch at all
-- Exercises migration 0032_client_approval_scheduling.sql. Nothing is
-- redefined here.

begin;
select plan(14);

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
--   card_queue_a         client_a, aprovacao_cliente -- visible; mutated by
--                        the client_request_adjustment RPC test (5/6 below)
--   card_queue_a2        client_a, aprovacao_cliente -- visible; mutated by
--                        the plain-update approve-transition test (13 below)
--   card_producao_a      client_a, producao -- NOT visible (internal WIP);
--                        never mutated, used to prove BOTH write paths
--                        reject it
--   card_agendamento_a   client_a, agendamento -- visible (D-01 history)
--   card_queue_b         client_b, aprovacao_cliente -- NOT visible to
--                        client_a_user (cross-client isolation); never
--                        mutated, used to prove the RPC's own cross-client
--                        re-check
insert into public.cards (id, client_id, card_type, title, stage, created_by)
values (
  'c1c1c1c1-c1c1-c1c1-c1c1-c1c1c1c1c1c1',
  '11111111-1111-1111-1111-111111111111',
  'single', 'Card na fila de aprovacao (client_a)', 'aprovacao_cliente',
  'cccccccc-cccc-cccc-cccc-cccccccccccc'
);

insert into public.cards (id, client_id, card_type, title, stage, created_by)
values (
  'c6c6c6c6-c6c6-c6c6-c6c6-c6c6c6c6c6c6',
  '11111111-1111-1111-1111-111111111111',
  'single', 'Segundo card na fila de aprovacao (client_a)', 'aprovacao_cliente',
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

-- 5. card_attachments: client_a_user ve exatamente 1 anexo do proprio card
-- na fila de aprovacao. Executado ANTES de qualquer mutacao em card_queue_a
-- (assertion 8 abaixo move seu stage para producao, o que o tiraria do
-- branch de leitura do Cliente).
select results_eq(
  $$ select count(*) from public.card_attachments where card_id = 'c1c1c1c1-c1c1-c1c1-c1c1-c1c1c1c1c1c1' $$,
  $$ values (1::bigint) $$,
  'client_a_user ve exatamente 1 anexo do proprio card na fila de aprovacao'
);

-- 6. card_attachments: client_a_user NAO CONSEGUE inserir um anexo novo --
-- a policy de insert continua PM/Admin-only, inalterada.
select throws_like(
  $$ insert into public.card_attachments (card_id, url, link_type, created_by)
     values ('c1c1c1c1-c1c1-c1c1-c1c1-c1c1c1c1c1c1', 'https://drive.google.com/file/d/x', 'other', 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb') $$,
  '%row-level security%',
  'client_a_user NAO consegue inserir um anexo, mesmo no proprio card'
);

-- 7. cards: client_a_user NAO CONSEGUE inserir um card novo -- Client nunca
-- ganha um branch de insert (cards_insert_scoped, 0015, inalterada).
select throws_like(
  $$ insert into public.cards (client_id, card_type, title, stage, created_by)
     values ('11111111-1111-1111-1111-111111111111', 'single', 'Card inserido pelo client_a_user', 'aprovacao_cliente', 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb') $$,
  '%row-level security%',
  'client_a_user NAO consegue inserir um card novo'
);

-- 8. client_a_user CONSEGUE fazer o pedido de ajuste (requestAdjustment's
-- real write path) contra seu proprio card em aprovacao_cliente, via a RPC
-- client_request_adjustment -- um `.update()` direto e estruturalmente
-- impossivel para esta transicao especifica (migracao 0032, comentario de
-- cabecalho, desvio (b)).
select lives_ok(
  $$ select public.client_request_adjustment('c1c1c1c1-c1c1-c1c1-c1c1-c1c1c1c1c1c1'::uuid, 'Ajustar o CTA') $$,
  'client_a_user consegue pedir ajuste (client_request_adjustment) no proprio card em aprovacao_cliente'
);

-- 9. Confirma que a escrita acima realmente persistiu. De-autentica
-- primeiro (volta pro role dono da sessao) porque o proprio card_queue_a
-- agora esta em stage='producao' -- fora do branch de leitura do Cliente
-- (por desenho, assertion 2 acima prova o mesmo para outro card) -- entao
-- uma leitura AINDA como client_a_user simplesmente nao encontraria a
-- linha. Mirrors rls_helpers.sql's own documented "reset role; + clear the
-- claim" de-authentication idiom (its set_auth() docstring: "to
-- de-authenticate ... rather than invoking a function while impersonating
-- authenticated, which would require extra schema grants").
reset role;
select set_config('request.jwt.claims', '', true);

select results_eq(
  $$ select stage, client_adjustment_comment from public.cards where id = 'c1c1c1c1-c1c1-c1c1-c1c1-c1c1c1c1c1c1' $$,
  $$ values ('producao'::public.card_stage, 'Ajustar o CTA'::text) $$,
  'o pedido de ajuste persistiu (stage=producao, client_adjustment_comment setado)'
);

-- Re-authenticate as client_a_user for the remaining client_a_user-scoped
-- assertions (10, 11, 12, 13).
select tests.set_auth('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb');

-- 10. client_a_user NAO CONSEGUE escrever (update direto) contra um card do
-- mesmo cliente que NAO esta em aprovacao_cliente -- a clausula `using`
-- bloqueia a escrita (idioma "UPDATE sem guarda + results_eq zero linhas",
-- mirrors 0007). card_producao_a nunca e mutado por este teste.
update public.cards
set client_adjustment_comment = 'tentativa invalida'
where id = 'c2c2c2c2-c2c2-c2c2-c2c2-c2c2c2c2c2c2';

select results_eq(
  $$ select count(*) from public.cards where id = 'c2c2c2c2-c2c2-c2c2-c2c2-c2c2c2c2c2c2' and client_adjustment_comment = 'tentativa invalida' $$,
  $$ values (0::bigint) $$,
  'client_a_user NAO consegue escrever em card do mesmo cliente fora de aprovacao_cliente (clausula using bloqueia)'
);

-- 11. client_request_adjustment tambem rejeita um card fora de
-- aprovacao_cliente -- o proprio re-check interno da RPC, independente da
-- RLS (a RPC roda como SECURITY DEFINER e contorna a RLS internamente).
select throws_like(
  $$ select public.client_request_adjustment('c2c2c2c2-c2c2-c2c2-c2c2-c2c2c2c2c2c2'::uuid, 'tentativa invalida') $$,
  '%card_not_in_aprovacao_cliente%',
  'client_request_adjustment rejeita um card que nao esta em aprovacao_cliente'
);

-- 12. client_request_adjustment rejeita um card de OUTRO cliente -- o
-- re-check de cross-client interno da RPC.
select throws_like(
  $$ select public.client_request_adjustment('c4c4c4c4-c4c4-c4c4-c4c4-c4c4c4c4c4c4'::uuid, 'tentativa cross-client') $$,
  '%card_not_found_or_wrong_client%',
  'client_request_adjustment rejeita um card de outro cliente'
);

-- 13. client_a_user CONSEGUE aprovar (approveCard's real write path) um
-- SEGUNDO card em aprovacao_cliente via `.update()` DIRETO -- 'agendamento'
-- esta dentro do branch de leitura do Cliente em cards_select_scoped, entao
-- nenhuma RPC e necessaria para esta transicao (ao contrario da 8 acima).
select lives_ok(
  $$ update public.cards
     set stage = 'agendamento', updated_at = now()
     where id = 'c6c6c6c6-c6c6-c6c6-c6c6-c6c6c6c6c6c6' $$,
  'client_a_user consegue aprovar (update direto) o segundo card em aprovacao_cliente'
);

-- De-authenticate before re-authenticating as client_b_user (same idiom as
-- before assertion 9 above -- tests.set_auth's own docstring in
-- rls_helpers.sql requires a `reset role` first, calling it again while
-- still impersonating `authenticated` is not its supported contract).
reset role;
select set_config('request.jwt.claims', '', true);

-- Re-authenticate as client_b_user to prove cross-client isolation in the
-- reverse direction.
select tests.set_auth('99999999-9999-9999-9999-999999999999');

-- 14. client_b_user NAO ve o card de client_a na fila -- isolamento
-- cross-client, direcao reversa.
select ok(
  not exists(select 1 from public.cards where id = 'c6c6c6c6-c6c6-c6c6-c6c6-c6c6c6c6c6c6'),
  'client_b_user NAO ve o card de client_a na fila de aprovacao (direcao reversa)'
);

-- De-authenticate before the transaction rolls back.
reset role;
select set_config('request.jwt.claims', '', true);

select * from finish();
rollback;
