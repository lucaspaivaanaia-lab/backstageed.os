-- Quick task 260811-imw: base de conhecimento comum a todos os clientes,
-- item 9 do plano de acao de 2026-08-05.
--
-- Prova, na camada de RLS do Postgres, que QUALQUER authenticated (PM,
-- Admin, ou Client) consegue LER shared_knowledge_files, mas so um Admin
-- consegue escrever (insert/update/delete) -- exercita as policies
-- shared_knowledge_files_select_all_authenticated / _admin_write shipadas
-- em 0026_shared_knowledge_files.sql. Nada e redefinido aqui.

begin;
select plan(6);

\ir rls_helpers.sql

-- Seeds one shared-knowledge row como o role dono da sessao (postgres),
-- antes de autenticar como qualquer actor, para ja existir para leitura.
insert into public.shared_knowledge_files (id, filename, file_type, content)
values ('44444444-4444-4444-4444-444444444444', 'guia-marca.md', 'md', 'Conteudo de teste (fixture).');

-- Autentica como pm_a.
select tests.set_auth('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa');

-- 1. pm_a ve o arquivo semeado (leitura liberada a todo authenticated, NAO
-- escopada por cliente -- ao contrario de client_files).
select results_eq(
  $$ select count(*) from public.shared_knowledge_files where id = '44444444-4444-4444-4444-444444444444' $$,
  $$ values (1::bigint) $$,
  'pm_a ve o arquivo de conhecimento comum semeado (select liberado a todo authenticated)'
);

-- 2. pm_a nao consegue inserir -- bloqueado pela RLS de escrita admin-only.
select throws_like(
  $$ insert into public.shared_knowledge_files (filename, file_type, content) values ('teste.txt', 'txt', 'PM tentando criar') $$,
  '%row-level security%',
  'pm_a nao consegue inserir um shared_knowledge_files (admin-only write)'
);

-- 3. pm_a nao consegue atualizar o arquivo semeado. Ao contrario de INSERT
-- (cuja violacao de WITH CHECK lanca uma excecao "row-level security"),
-- Postgres trata a linha como invisivel para fins de UPDATE quando a
-- clausula USING da policy admin_write falha para um nao-admin -- o UPDATE
-- roda sem erro mas afeta 0 linhas, entao o conteudo permanece
-- byte-a-byte inalterado (verificado abaixo em vez de esperar excecao,
-- corrigido apos reproducao empirica: throws_like falhava com "no
-- exception thrown").
update public.shared_knowledge_files set content = 'PM tentando editar' where id = '44444444-4444-4444-4444-444444444444';
select results_eq(
  $$ select content from public.shared_knowledge_files where id = '44444444-4444-4444-4444-444444444444' $$,
  $$ values ('Conteudo de teste (fixture).'::text) $$,
  'pm_a nao consegue atualizar um shared_knowledge_files (admin-only write, RLS exclui a linha silenciosamente do UPDATE)'
);

-- 4. pm_a nao consegue excluir o arquivo semeado. Mesmo raciocinio do
-- teste 3 -- DELETE tambem so filtra silenciosamente pela clausula USING,
-- sem lancar excecao, entao a linha continua existindo apos a tentativa.
delete from public.shared_knowledge_files where id = '44444444-4444-4444-4444-444444444444';
select results_eq(
  $$ select count(*) from public.shared_knowledge_files where id = '44444444-4444-4444-4444-444444444444' $$,
  $$ values (1::bigint) $$,
  'pm_a nao consegue excluir um shared_knowledge_files (admin-only write, RLS exclui a linha silenciosamente do DELETE)'
);

-- De-autentica pm_a antes de trocar de identidade.
reset role;
select set_config('request.jwt.claims', '', true);

-- Autentica como client_a_user (role=client) -- prova que a leitura e
-- REALMENTE liberada a QUALQUER authenticated, nao so PM/Admin.
select tests.set_auth('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb');

-- 5. client_a_user tambem ve o arquivo semeado.
select results_eq(
  $$ select count(*) from public.shared_knowledge_files where id = '44444444-4444-4444-4444-444444444444' $$,
  $$ values (1::bigint) $$,
  'client_a_user tambem ve o arquivo de conhecimento comum (select liberado a qualquer authenticated)'
);

-- De-autentica antes de trocar de identidade.
reset role;
select set_config('request.jwt.claims', '', true);

-- Autentica como admin_user.
select tests.set_auth('cccccccc-cccc-cccc-cccc-cccccccccccc');

-- 6. admin_user consegue inserir -- prova que a policy admin_write nao
-- esta bloqueando escrita legitima.
select lives_ok(
  $$ insert into public.shared_knowledge_files (filename, file_type, content) values ('guia-admin.md', 'md', 'Conteudo de teste (admin fixture).') $$,
  'admin_user consegue inserir um shared_knowledge_files'
);

-- De-autentica antes do rollback da transacao.
reset role;
select set_config('request.jwt.claims', '', true);

select * from finish();
rollback;
