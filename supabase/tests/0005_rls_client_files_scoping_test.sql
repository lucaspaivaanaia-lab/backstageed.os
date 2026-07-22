-- Quick task 260722-hnm: Migrar RAG de Tropicalia para Supabase -- CLI-03, CTX-01/CTX-02.
--
-- Prova, na camada de RLS do Postgres, que um PM atribuido apenas ao client_a
-- consegue ver/inserir/deletar arquivos do proprio client_a mas e bloqueado
-- de ver OU inserir arquivos do client_b (isolamento estrutural), exercitando
-- as policies client_files_select_scoped / client_files_insert_scoped /
-- client_files_delete_scoped shipadas em 0011_client_files.sql. Nada e
-- redefinido aqui.

begin;
select plan(4);

\ir rls_helpers.sql

-- Semeia um arquivo fixture para client_a, inserido como o role dono da
-- sessao (postgres) ANTES de autenticar como pm_a, para ja existir para ser
-- lido de volta assim que a sessao RLS-scoped de pm_a comecar.
insert into public.client_files (client_id, filename, file_type, content)
values ('11111111-1111-1111-1111-111111111111', 'briefing.txt', 'txt', 'Fixture content for client_a');

-- Autentica como pm_a (atribuido apenas ao client_a, conforme o fixture).
select tests.set_auth('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa');

-- pm_a ve exatamente 1 arquivo semeado para o client_a atribuido.
select results_eq(
  $$ select count(*) from public.client_files where client_id = '11111111-1111-1111-1111-111111111111' $$,
  $$ values (1::bigint) $$,
  'pm_a ve exatamente 1 arquivo para o client_a atribuido'
);

-- pm_a e bloqueado de ler arquivos do client_b (nao ha nenhum para ver, mas
-- a garantia central e que a linha seria invisivel mesmo que existisse --
-- provado junto com a rejeicao de insert abaixo).
select results_eq(
  $$ select count(*) from public.client_files where client_id = '22222222-2222-2222-2222-222222222222' $$,
  $$ values (0::bigint) $$,
  'pm_a e bloqueado de arquivos do client_b nao-atribuido'
);

-- pm_a nao consegue inserir um arquivo para client_b -- a policy de insert
-- precisa rejeitar isso na camada de RLS.
select throws_like(
  $$ insert into public.client_files (client_id, filename, file_type, content) values ('22222222-2222-2222-2222-222222222222', 'x.txt', 'txt', 'Should be rejected') $$,
  '%row-level security%',
  'pm_a nao consegue inserir arquivo para client_b nao-atribuido'
);

-- pm_a consegue deletar seu proprio arquivo de client_a -- o delete afeta a
-- 1 linha semeada acima; um delete equivalente mirando client_b nao afeta
-- nenhuma linha (nao ha nenhuma visivel/pertencente a pm_a la).
delete from public.client_files where client_id = '11111111-1111-1111-1111-111111111111';

select results_eq(
  $$ select count(*) from public.client_files where client_id = '11111111-1111-1111-1111-111111111111' $$,
  $$ values (0::bigint) $$,
  'pm_a consegue deletar seu proprio arquivo de client_a (delete scoped)'
);

-- De-autentica antes do rollback da transacao.
reset role;
select set_config('request.jwt.claims', '', true);

select * from finish();
rollback;
