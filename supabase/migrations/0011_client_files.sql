-- Quick task 260722-hnm: Migrar RAG de Tropicalia para Supabase -- CLI-03, CTX-01..05.
--
-- Nova tabela public.client_files: arquivos do cliente (PDF/TXT/MD/DOCX) sao
-- extraidos para texto puro no momento do upload (lib/extract/extract-text.ts)
-- e o conteudo completo e persistido aqui, sem embeddings/vetor. O conteudo
-- e injetado por inteiro no system prompt do chat (lib/chat/assemble-prompt.ts),
-- substituindo o retrieval via Tropicalia.
--
-- RLS scoping espelha EXATAMENTE o padrao de 0010_messages.sql -- reusa os
-- helpers is_admin()/pm_assigned_clients() de 0004_rls_policies.sql (Pitfall 1:
-- nunca inlinar subquery contra pm_clients diretamente na policy).
--
-- Isolamento de contexto (requisito nao-negociavel) agora e estrutural via
-- RLS scoping por client_id, no lugar de um project separado por cliente na
-- Tropicalia -- mesmo principio, novo mecanismo.
--
-- Pitfall #4 (herdado de 0010): o GRANT a `authenticated` vai NESTA MESMA
-- migration -- hosted Supabase auto-concede privilegios de tabela base na
-- provisao, mas `supabase start` local NAO concede, entao um GRANT diferido
-- reproduziria o mesmo gap local-vs-hosted que 0008/0009 tiveram que corrigir
-- retroativamente para clients/profiles/pm_clients.

create table public.client_files (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.clients(id) on delete cascade,
  filename text not null,
  file_type text not null,
  content text not null,
  created_at timestamptz not null default now()
);

alter table public.client_files enable row level security;

create policy "client_files_select_scoped"
on public.client_files
for select
to authenticated
using (
  (select public.is_admin())
  or client_id in (select public.pm_assigned_clients())
);

create policy "client_files_insert_scoped"
on public.client_files
for insert
to authenticated
with check (
  (select public.is_admin())
  or client_id in (select public.pm_assigned_clients())
);

create policy "client_files_delete_scoped"
on public.client_files
for delete
to authenticated
using (
  (select public.is_admin())
  or client_id in (select public.pm_assigned_clients())
);

grant select, insert, delete on public.client_files to authenticated;
