-- Phase 3: Content Production Kanban -- Plan 03-01. CHK-01, CHK-02.
--
-- Proves, at the Postgres RLS layer, that any authenticated PM can READ
-- checklist templates and their items (pm_a needs this to preview a
-- client's gate) but is BLOCKED from writing to either table -- only an
-- admin can create/edit/delete templates. Exercises the
-- checklist_templates_select_all_authenticated / _admin_write and
-- checklist_template_items_select_all_authenticated / _admin_write policies
-- shipped in 0013_checklist_templates.sql. Nothing is redefined here.

begin;
select plan(4);

\ir rls_helpers.sql

-- Seeds one template plus two items as the session-owner role (postgres),
-- before authenticating as pm_a, so the row already exists to be read back
-- as soon as the RLS-scoped pm_a session begins.
insert into public.checklist_templates (id, name)
values ('33333333-3333-3333-3333-333333333333', 'Padrao (fixture)');

insert into public.checklist_template_items (template_id, label, sort_order)
values
  ('33333333-3333-3333-3333-333333333333', 'Ortografia revisada', 0),
  ('33333333-3333-3333-3333-333333333333', 'CTA presente', 1);

-- Autentica como pm_a.
select tests.set_auth('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa');

-- 1. pm_a ve o template semeado (leitura liberada a todo authenticated).
select results_eq(
  $$ select count(*) from public.checklist_templates where id = '33333333-3333-3333-3333-333333333333' $$,
  $$ values (1::bigint) $$,
  'pm_a ve o template semeado (select liberado a todo authenticated)'
);

-- 2. pm_a nao consegue criar um template -- bloqueado pela RLS de escrita
-- admin-only.
select throws_like(
  $$ insert into public.checklist_templates (name) values ('PM tentando criar') $$,
  '%row-level security%',
  'pm_a nao consegue inserir um checklist_templates (admin-only write)'
);

-- 3. pm_a nao consegue criar um item de checklist -- mesma garantia na
-- tabela de itens.
select throws_like(
  $$ insert into public.checklist_template_items (template_id, label) values ('33333333-3333-3333-3333-333333333333', 'PM tentando criar item') $$,
  '%row-level security%',
  'pm_a nao consegue inserir um checklist_template_items (admin-only write)'
);

-- De-autentica pm_a antes de trocar de identidade.
reset role;
select set_config('request.jwt.claims', '', true);

-- Autentica como admin_user.
select tests.set_auth('cccccccc-cccc-cccc-cccc-cccccccccccc');

-- 4. admin_user consegue criar um template -- prova que a policy
-- admin_write nao esta bloqueando escrita legitima.
select lives_ok(
  $$ insert into public.checklist_templates (name) values ('Cliente Premium (admin fixture)') $$,
  'admin_user consegue inserir um checklist_templates'
);

-- De-autentica antes do rollback da transacao.
reset role;
select set_config('request.jwt.claims', '', true);

select * from finish();
rollback;
