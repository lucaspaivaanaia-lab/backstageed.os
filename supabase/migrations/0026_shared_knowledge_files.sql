-- Quick task 260811-imw: base de conhecimento comum a todos os clientes
-- (item 9, o ultimo, do plano de acao de 2026-08-05 com Juliano) -- tabela
-- estrutural, deliberadamente SEPARADA de client_files (0011): sem
-- client_id, sempre injetada no prompt de IA de QUALQUER cliente,
-- independente de qual esta ativo. Deixada vazia de proposito ate um
-- documento do Juliano chegar -- so a estrutura (schema/RLS/actions/UI/
-- injecao no prompt) e entregue agora.
--
-- Espelha 0011_client_files.sql MENOS a coluna client_id (mesmas colunas
-- restantes: id/filename/file_type/content/created_at, mesmo padrao de
-- extracao de texto no upload). A RLS, porem, segue o padrao de
-- 0013_checklist_templates.sql, nao o de 0011: SELECT liberado a QUALQUER
-- authenticated (todo PM/Admin/Client precisa que isso entre no prompt de
-- qualquer cliente, nao e escopado), escrita (insert/update/delete)
-- restrita a is_admin() via uma unica policy `for all`.
--
-- GRANT nesta MESMA migration (licao repetida em toda tabela nova deste
-- projeto -- 0008/0009/0011/0013/0020/0022/0025 etc.): hosted Supabase
-- auto-concede privilegios de tabela base na provisao, `supabase start`
-- local NAO concede -- um GRANT diferido reproduziria o mesmo gap
-- local-vs-hosted que ja foi corrigido retroativamente varias vezes.

create table public.shared_knowledge_files (
  id uuid primary key default gen_random_uuid(),
  filename text not null,
  file_type text not null,
  content text not null,
  created_at timestamptz not null default now()
);

alter table public.shared_knowledge_files enable row level security;

create policy "shared_knowledge_files_select_all_authenticated"
on public.shared_knowledge_files
for select
to authenticated
using (true);

create policy "shared_knowledge_files_admin_write"
on public.shared_knowledge_files
for all
to authenticated
using ((select public.is_admin()))
with check ((select public.is_admin()));

grant select, insert, update, delete on public.shared_knowledge_files to authenticated;
