# Quick Task 260722-hnm: Migrar RAG de Tropicalia para Supabase - Context

**Gathered:** 2026-07-22
**Status:** Ready for planning

<domain>
## Task Boundary

Migrar o RAG da Fase 2 de Tropicalia para armazenamento direto em Supabase (tabela `client_files`) com injeção completa de conteúdo no contexto do agente, sem embeddings/vetor. Remove o auto-provisioning Tropicalia da Fase 1 (LUC-16) e o upload-para-Tropicalia da Fase 2 (LUC-22, construído como 02-05). Constrói uma nova UI de upload de arquivo do cliente (PDF/TXT/MD/DOCX, máx ~3 por cliente). Decisão de arquitetura confirmada em reunião com o fundador da Tropicalia em 2026-07-22 — motivada pela mudança de modelo de negócio da Tropicalia e pelo volume real por cliente ser baixo.

</domain>

<decisions>
## Implementation Decisions

### Origem dos arquivos (resolvido antes desta discussão, com o usuário)
- Upload direto de arquivo pré-existente pelo PM é o mecanismo principal (nova funcionalidade — hoje só existe o fluxo de marcar trecho do chat).

### Código Tropicalia existente (resolvido antes desta discussão, com o usuário)
- Remover agora, não deixar dormente: lib/tropicalia/*, provisioning em lib/actions/clients.ts + retryTropicaliaProvisioning, seção RAG em client-detail-form.tsx, coluna tropicalia_project_id (via nova migration DROP COLUMN).

### Falha de extração de texto (PDF/DOCX)
- Bloquear o upload com erro claro ("Não foi possível ler o conteúdo deste arquivo"). Nunca salvar um client_files com content vazio/lixo — isso poluiria o contexto do agente silenciosamente sem que ninguém perceba.

### Badge de contexto no chat
- Manter, mas simplificado: badge "Nenhum arquivo de referência — respostas usam apenas o briefing do cliente" quando o cliente ativo tem 0 arquivos em `client_files`. Some assim que o primeiro arquivo for enviado. Não depende mais de nenhuma env var ou serviço externo.

### Upload com nome duplicado
- Permitir duplicado. Cada upload cria uma nova linha em `client_files`, mesmo que o nome já exista para aquele cliente. Simplicidade > detecção de duplicata — o PM usa o botão de excluir já previsto se quiser remover o antigo.

### Claude's Discretion
- Escolha exata da(s) biblioteca(s) de extração de texto para PDF/DOCX — delegado à fase de pesquisa (research) desta quick task, com o critério: sem serviço externo, compatível com runtime Node.js de Route Handler/Server Action do Next.js já usado neste projeto.
- Local exato da UI de upload na tela de briefing (nova seção dedicada vs. parte do client-detail-form existente) — mantendo o padrão visual PageShell/SectionTitle já estabelecido.
- Exato comportamento de enforcement do limite de ~3 arquivos (mensagem, se conta arquivos existentes antes de permitir o formulário de upload aparecer, etc.) — resolvido pela pesquisa/planner com o princípio geral já dado: bloquear o 4º upload com mensagem amigável.

</decisions>

<specifics>
## Specific Ideas

Formato da tabela `client_files`: id uuid pk, client_id uuid not null references public.clients(id) on delete cascade, filename text not null, file_type text, content text not null, created_at timestamptz default now(). RLS mirrorando exatamente supabase/migrations/0010_messages.sql (client_files_select_scoped/client_files_insert_scoped/client_files_delete_scoped usando is_admin()/pm_assigned_clients(), GRANT na mesma migration).

</specifics>

<canonical_refs>
## Canonical References

- Linear LUC-16 ("Auto-provisioning de project na Tropicalia", Fase 1, Done) e LUC-22 ("Upload de aprendizado para Tropicalia", Fase 2, Backlog) — escopo substituído por esta migração.
- SEED-001 (.planning/seeds/SEED-001-catalogo-rag-llms-txt.md) — sistema de catálogo/llms.txt como próxima iteração, explicitamente FORA de escopo aqui.
- supabase/migrations/0010_messages.sql + supabase/tests/0004_rls_messages_scoping_test.sql — padrão de RLS a reaproveitar para client_files.

</canonical_refs>
