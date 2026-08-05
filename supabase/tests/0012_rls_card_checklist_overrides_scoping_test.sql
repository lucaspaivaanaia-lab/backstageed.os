-- Phase 3: Content Production Kanban -- CHK-04, D-11.
--
-- Numbering note: this test was originally reserved as 0011 by the plan
-- (03-05-PLAN.md), written before quick task 260805-kio consumed 0011 for
-- rls_pm_status_defense_test.sql during the P0/P1/P2 pivot. This file is
-- therefore 0012, the next genuinely free test number.
--
-- Proves, at the Postgres RLS layer, that a PM assigned to client_a can READ
-- an override row on their own client's card but cannot INSERT one -- even
-- for their OWN assigned client (T-03-24: read access to an override does
-- not imply the right to log a bypass). Admin can insert freely. Nothing
-- shipped in 0022_card_checklist_overrides.sql is redefined here.

begin;
select plan(4);

\ir rls_helpers.sql

-- Seed one card per client as the session-owner role (bypasses RLS), each
-- already sitting in revisao_interna so a card_checklist_overrides row on
-- it is a plausible fixture, plus one override row per card.
insert into public.cards (id, client_id, card_type, title, stage, created_by)
values
  ('d1111111-1111-1111-1111-111111111111', '11111111-1111-1111-1111-111111111111', 'single', 'Card cliente A', 'revisao_interna', 'cccccccc-cccc-cccc-cccc-cccccccccccc'),
  ('d2222222-2222-2222-2222-222222222222', '22222222-2222-2222-2222-222222222222', 'single', 'Card cliente B', 'revisao_interna', 'cccccccc-cccc-cccc-cccc-cccccccccccc');

insert into public.card_checklist_overrides (card_id, overridden_by, unchecked_item_labels, from_stage, to_stage)
values
  ('d1111111-1111-1111-1111-111111111111', 'cccccccc-cccc-cccc-cccc-cccccccccccc', array['Revisar copy'], 'revisao_interna', 'aprovacao_cliente'),
  ('d2222222-2222-2222-2222-222222222222', 'cccccccc-cccc-cccc-cccc-cccccccccccc', array['Revisar imagem'], 'revisao_interna', 'aprovacao_cliente');

-- Autentica como pm_a (atribuido apenas ao client_a, conforme o fixture).
select tests.set_auth('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa');

-- 1. pm_a ve exatamente 1 linha de override para o card do client_a atribuido.
select results_eq(
  $$ select count(*) from public.card_checklist_overrides where card_id = 'd1111111-1111-1111-1111-111111111111' $$,
  $$ values (1::bigint) $$,
  'pm_a ve exatamente 1 override row para o card do client_a atribuido'
);

-- 2. pm_a nao ve nenhuma linha de override do card do client_b nao-atribuido.
select results_eq(
  $$ select count(*) from public.card_checklist_overrides where card_id = 'd2222222-2222-2222-2222-222222222222' $$,
  $$ values (0::bigint) $$,
  'pm_a nao ve override rows do card do client_b nao-atribuido'
);

-- 3. pm_a NAO consegue inserir uma linha de override mesmo para o card do
--    SEU PROPRIO client_a atribuido -- leitura nao implica o direito de
--    registrar um bypass (T-03-24, a crux desta suite).
select throws_like(
  $$ insert into public.card_checklist_overrides (card_id, overridden_by, unchecked_item_labels, from_stage, to_stage)
     values ('d1111111-1111-1111-1111-111111111111', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', array['x'], 'revisao_interna', 'aprovacao_cliente') $$,
  '%row-level security%',
  'pm_a nao consegue inserir override mesmo no proprio client_a atribuido'
);

-- De-autentica pm_a antes de re-autenticar como admin.
reset role;
select set_config('request.jwt.claims', '', true);

-- 4. admin_user consegue inserir uma linha de override livremente.
select tests.set_auth('cccccccc-cccc-cccc-cccc-cccccccccccc');

select lives_ok(
  $$ insert into public.card_checklist_overrides (card_id, overridden_by, unchecked_item_labels, from_stage, to_stage)
     values ('d2222222-2222-2222-2222-222222222222', 'cccccccc-cccc-cccc-cccc-cccccccccccc', array['Revisar video'], 'revisao_interna', 'aprovacao_cliente') $$,
  'admin_user consegue inserir override row livremente'
);

-- De-autentica antes do rollback da transacao.
reset role;
select set_config('request.jwt.claims', '', true);

select * from finish();
rollback;
