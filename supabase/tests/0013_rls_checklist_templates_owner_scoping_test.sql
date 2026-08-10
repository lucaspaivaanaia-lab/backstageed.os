-- Quick task 260808-ci5: Repensar como a IA participa do ciclo de
-- checklist do cliente -- item 1 (geracao automatica + aprovacao PM-ou-
-- Admin do checklist gerado pela IA).
--
-- Proves, at the Postgres RLS layer, that the NEW owner-scoped write
-- policies shipped in 0023_checklist_templates_owner_scoping.sql
-- (checklist_templates_owner_write / checklist_template_items_owner_write)
-- let pm_a write ONLY a draft template owned by pm_a's own assigned client
-- (client_a), block pm_a from writing a template/item owned by a client
-- pm_a is NOT assigned to (client_b), and -- critically -- block pm_a from
-- writing a template with `owner_client_id` omitted/null (the shared/
-- library case), which is a regression proof that 0006's original
-- admin-only guarantee for non-owned rows still holds unchanged. Also
-- proves admin_user stays fully unrestricted for owner-scoped rows.
--
-- Does not modify rls_helpers.sql or 0006_rls_checklist_templates_
-- scoping_test.sql -- both are exercised exactly as shipped elsewhere in
-- the suite as regression controls.

begin;
select plan(7);

\ir rls_helpers.sql

-- Seeds one client_b-owned DRAFT template plus one item under it, as the
-- session-owner role (before any tests.set_auth), so the row already
-- exists to be read/attempted-against as soon as the RLS-scoped pm_a
-- session begins.
insert into public.checklist_templates (id, name, status, owner_client_id)
values (
  '44444444-4444-4444-4444-444444444444',
  'Rascunho IA -- Client B (fixture)',
  'draft',
  '22222222-2222-2222-2222-222222222222'
);

insert into public.checklist_template_items (template_id, label, sort_order)
values (
  '44444444-4444-4444-4444-444444444444',
  'Item pre-existente do rascunho client_b',
  0
);

-- Autentica como pm_a (atribuido SOMENTE a client_a).
select tests.set_auth('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa');

-- 1. pm_a consegue inserir um novo template DRAFT dono do seu proprio
-- cliente (client_a) -- prova que a nova policy owner_write libera escrita
-- escopada, nao so leitura.
select lives_ok(
  $$ insert into public.checklist_templates (id, name, status, owner_client_id)
     values ('55555555-5555-5555-5555-555555555555', 'Rascunho IA -- Client A (fixture)', 'draft', '11111111-1111-1111-1111-111111111111') $$,
  'pm_a consegue inserir um checklist_templates draft dono de client_a (owner-scoped write)'
);

-- 2. pm_a consegue inserir um item sob esse mesmo template.
select lives_ok(
  $$ insert into public.checklist_template_items (template_id, label, sort_order)
     values ('55555555-5555-5555-5555-555555555555', 'Item novo do rascunho client_a', 0) $$,
  'pm_a consegue inserir um checklist_template_items sob seu proprio template draft'
);

-- 3. pm_a consegue confirmar (atualizar status) esse mesmo template --
-- prova que UPDATE, nao so INSERT, e liberado pela policy `for all`.
select lives_ok(
  $$ update public.checklist_templates set status = 'confirmed' where id = '55555555-5555-5555-5555-555555555555' $$,
  'pm_a consegue atualizar o status do seu proprio template draft (confirmar)'
);

-- 4. pm_a NAO consegue inserir um NOVO template dono de client_b (cliente
-- ao qual pm_a nao esta atribuido) -- bloqueado pela RLS.
select throws_like(
  $$ insert into public.checklist_templates (name, status, owner_client_id)
     values ('PM tentando criar para client_b', 'draft', '22222222-2222-2222-2222-222222222222') $$,
  '%row-level security%',
  'pm_a nao consegue inserir um checklist_templates dono de client_b'
);

-- 5. pm_a NAO consegue inserir um item sob o template PRE-EXISTENTE dono de
-- client_b (id 44444444...) -- mesma garantia na tabela de itens.
select throws_like(
  $$ insert into public.checklist_template_items (template_id, label, sort_order)
     values ('44444444-4444-4444-4444-444444444444', 'PM tentando inserir item em client_b', 1) $$,
  '%row-level security%',
  'pm_a nao consegue inserir um checklist_template_items sob o template dono de client_b'
);

-- 6. pm_a NAO consegue inserir um template com owner_client_id omitido
-- (default null -- o caso de biblioteca compartilhada) -- prova de
-- regressao de que a garantia original admin-only de 0006 continua valendo
-- para linhas nao-owned.
select throws_like(
  $$ insert into public.checklist_templates (name) values ('PM tentando criar template compartilhado') $$,
  '%row-level security%',
  'pm_a nao consegue inserir um checklist_templates sem owner_client_id (biblioteca compartilhada, admin-only)'
);

-- De-autentica pm_a antes de trocar de identidade.
reset role;
select set_config('request.jwt.claims', '', true);

-- Autentica como admin_user.
select tests.set_auth('cccccccc-cccc-cccc-cccc-cccccccccccc');

-- 7. admin_user consegue inserir um template dono de client_b -- prova que
-- admin continua irrestrito tambem para linhas owner-scoped, nao so para
-- linhas compartilhadas.
select lives_ok(
  $$ insert into public.checklist_templates (name, status, owner_client_id)
     values ('Rascunho IA -- Client B via admin (fixture)', 'draft', '22222222-2222-2222-2222-222222222222') $$,
  'admin_user consegue inserir um checklist_templates dono de client_b (admin irrestrito)'
);

-- De-autentica antes do rollback da transacao.
reset role;
select set_config('request.jwt.claims', '', true);

select * from finish();
rollback;
