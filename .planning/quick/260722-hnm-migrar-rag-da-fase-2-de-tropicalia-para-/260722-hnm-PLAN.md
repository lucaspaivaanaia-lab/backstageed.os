---
task: 260722-hnm
type: quick-full
description: "Migrar RAG da Fase 2 de Tropicalia para armazenamento direto em Supabase (client_files) com injeção completa de conteúdo no contexto, sem embeddings; remove auto-provisioning Tropicalia (Fase 1) e upload-para-Tropicalia (Fase 2); nova UI de upload de arquivo do cliente"
autonomous: true
requirements: [CLI-03, CTX-01, CTX-02, CTX-03, CTX-04, CTX-05]
files_modified:
  - supabase/migrations/0011_client_files.sql
  - supabase/migrations/0012_drop_tropicalia_project_id.sql
  - supabase/tests/0005_rls_client_files_scoping_test.sql
  - lib/extract/extract-text.ts
  - lib/extract/extract-text.test.ts
  - lib/tropicalia/client.ts
  - lib/tropicalia/client.test.ts
  - lib/actions/clients.ts
  - lib/actions/client-files.ts
  - lib/client-files/limit.ts
  - components/clients/client-detail-form.tsx
  - components/clients/client-files-section.tsx
  - app/pm/clients/[id]/page.tsx
  - app/admin/clients/[id]/page.tsx
  - app/pm/clients/page.tsx
  - app/admin/clients/page.tsx
  - app/api/chat/route.ts
  - lib/chat/assemble-prompt.ts
  - lib/chat/assemble-prompt.test.ts
  - app/pm/chat/actions.ts
  - app/pm/chat/page.tsx
  - app/pm/chat/chat-panel.tsx
  - lib/validation/clients.ts
  - lib/anthropic/client.ts
  - .env.local.example
  - package.json
  - .planning/phases/02-client-isolated-ai-chat/02-06-PLAN.md
  - .planning/PROJECT.md
  - .planning/REQUIREMENTS.md

user_setup: []

must_haves:
  truths:
    - "Um PM consegue enviar um arquivo PDF/TXT/MD/DOCX de um cliente pela UI de briefing, ve-lo listado (nome, tipo, data) e remove-lo"
    - "Um arquivo cujo texto nao pode ser extraido (scaneado/vazio) e rejeitado com mensagem amigavel e NUNCA persiste uma linha em client_files"
    - "O 4o upload de um mesmo cliente e bloqueado com mensagem amigavel (limite 3)"
    - "As respostas do chat de um cliente injetam o conteudo completo dos client_files daquele cliente no system prompt, sem vazar arquivos de outro cliente (CTX-01/CTX-02)"
    - "O conteudo de um arquivo recem-enviado e refletido na resposta do chat IMEDIATAMENTE, sem espera assincrona"
    - "Salvar conhecimento curado do chat insere uma nova linha markdown em client_files (nao Tropicalia), so no clique explicito (CTX-03)"
    - "O badge do chat mostra 'Nenhum arquivo de referencia...' apenas quando o cliente ativo tem 0 arquivos, e some com >=1 arquivo"
    - "Nenhum codigo Tropicalia, coluna tropicalia_project_id ou referencia a TROPICALIA_API_KEY permanece no app/lib/components/env"
  artifacts:
    - path: "supabase/migrations/0011_client_files.sql"
      provides: "Tabela client_files + RLS scoped (select/insert/delete) + GRANT na mesma migration"
      contains: "create table public.client_files"
    - path: "supabase/migrations/0012_drop_tropicalia_project_id.sql"
      provides: "Remocao da coluna tropicalia_project_id de public.clients"
      contains: "drop column"
    - path: "supabase/tests/0005_rls_client_files_scoping_test.sql"
      provides: "pgTAP: PM ve/insere/deleta arquivos do proprio cliente, bloqueado para outro"
      contains: "public.client_files"
    - path: "lib/extract/extract-text.ts"
      provides: "extractDocumentText(buffer, fileType) + UnreadableFileError + MIN_CHARS"
      exports: ["extractDocumentText", "UnreadableFileError"]
    - path: "lib/actions/client-files.ts"
      provides: "Server Actions de upload e remocao de arquivo do cliente (RLS-scoped)"
      exports: ["uploadClientFile", "deleteClientFile", "listClientFiles"]
    - path: "lib/client-files/limit.ts"
      provides: "Helper compartilhado de contagem/limite de arquivos por cliente"
      contains: "FILE_LIMIT"
    - path: "components/clients/client-files-section.tsx"
      provides: "Secao 'Arquivos do cliente' (lista + upload + remover)"
      min_lines: 40
    - path: "lib/chat/assemble-prompt.ts"
      provides: "assembleSystemPrompt com nova assinatura de files (filename/content)"
      contains: "filename"
  key_links:
    - from: "app/api/chat/route.ts"
      to: "public.client_files"
      via: "select RLS-scoped por client_id resolvido no servidor"
      pattern: "client_files"
    - from: "app/api/chat/route.ts"
      to: "lib/chat/assemble-prompt.ts"
      via: "assembleSystemPrompt(client, files)"
      pattern: "assembleSystemPrompt"
    - from: "lib/actions/client-files.ts"
      to: "lib/extract/extract-text.ts"
      via: "extractDocumentText antes do insert"
      pattern: "extractDocumentText"
    - from: "app/pm/chat/actions.ts"
      to: "public.client_files"
      via: "insert markdown de buildKnowledgeMarkdown"
      pattern: "client_files"
    - from: "app/pm/chat/page.tsx"
      to: "public.client_files"
      via: "existencia de arquivo por cliente => hasRag"
      pattern: "client_files"
---

<objective>
Migrar todo o RAG da plataforma de Tropicalia para armazenamento direto em Supabase. Arquivos do cliente (PDF/TXT/MD/DOCX) passam a viver na nova tabela `client_files` como texto extraido, injetados por completo no system prompt do agente — sem embeddings, sem servico externo, aproveitando o volume baixo (~3 arquivos por cliente). Remove por inteiro o auto-provisioning Tropicalia da Fase 1, o upload-para-Tropicalia da Fase 2, a coluna `tropicalia_project_id` e a dependencia de `TROPICALIA_API_KEY`.

Purpose: A Tropicalia mudou de modelo de negocio (confirmado em reuniao com o fundador em 2026-07-22). A arquitetura direta e mais simples, mais barata, sem latencia de indexacao assincrona, e o isolamento de contexto — requisito nao-negociavel — continua estrutural, agora via RLS scoping de `client_files` por `client_id` (`is_admin()`/`pm_assigned_clients()`).
Output: Nova tabela + RLS + pgTAP, modulo de extracao de texto, UI+Server Action de upload, chat/curadoria/badge reescritos sobre `client_files`, remocao completa do codigo Tropicalia, e documentacao atualizada.
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
@$HOME/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/PROJECT.md
@.planning/STATE.md
@.planning/quick/260722-hnm-migrar-rag-da-fase-2-de-tropicalia-para-/260722-hnm-CONTEXT.md
@.planning/quick/260722-hnm-migrar-rag-da-fase-2-de-tropicalia-para-/260722-hnm-RESEARCH.md

# Padroes a reaproveitar EXATAMENTE:
@supabase/migrations/0010_messages.sql
@supabase/tests/0004_rls_messages_scoping_test.sql
@lib/chat/build-knowledge-markdown.ts

<interfaces>
<!-- Contratos existentes que os executores precisam. Extraidos do codebase. -->

Padrao de RLS (0010_messages.sql) a espelhar para client_files:
- alter table ... enable row level security;
- policy select/insert to authenticated using/with check: (select public.is_admin()) or client_id in (select public.pm_assigned_clients())
- grant ... to authenticated NA MESMA migration (nunca diferida — gap local-vs-hosted).
- NUNCA inlinar subquery contra pm_clients; sempre os helpers is_admin()/pm_assigned_clients().

Fixture pgTAP (rls_helpers.sql, ja existente, NAO alterar):
- client_a = 11111111-1111-1111-1111-111111111111
- client_b = 22222222-2222-2222-2222-222222222222
- pm_a     = aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa (role=pm, approved, assigned to client_a ONLY)
- select tests.set_auth('<uuid>') autentica; reset role + set_config('request.jwt.claims','',true) desautentica.

Assinatura ATUAL de assembleSystemPrompt (lib/chat/assemble-prompt.ts) — vai mudar:
  assembleSystemPrompt(client: Briefing, retrievedChunks: { document: string }[]): string
  Briefing = { name, objective|null, tone_of_voice|null, target_audience|null, content_pillars: string[] }
  Instrucoes de sistema ficam DEPOIS do bloco de conteudo (T-2-02 anti prompt-injection). Manter.

Code sketch de extracao (RESEARCH.md, seguir): unpdf getDocumentProxy+extractText({mergePages:true}) para PDF, mammoth.extractRawText({buffer}) para DOCX, buffer.toString("utf-8") para TXT/MD, MIN_CHARS=20 => UnreadableFileError.

Server-only discipline: extracao roda em runtime Node (app/api/chat/route.ts ja declara export const runtime = "nodejs"). Nunca importar lib/extract de Client Component.

Harness pgTAP (STATE.md quick 260716-bjk — LER antes de escrever verifies): `npx supabase test db` retorna exit code 1 por um motivo COSMETICO pre-existente e nao relacionado — rls_helpers.sql (um helper de fixture, nao um teste) e mal-capturado pelo glob do pg_prove sem TAP plan. O veredito real de PASS/FAIL e "0 linhas 'not ok'" na saida, NAO o exit code do processo. Portanto, verifies que rodam supabase test db devem gatear sobre linhas 'not ok' / o resultado por-arquivo do proprio teste, nunca sobre o exit code do harness.
</interfaces>
</context>

<tasks>

<task type="auto" tdd="true">
  <name>Task 1: Migration client_files + RLS + GRANT + pgTAP test</name>
  <files>supabase/migrations/0011_client_files.sql, supabase/tests/0005_rls_client_files_scoping_test.sql</files>
  <behavior>
    - pm_a (assigned to client_a) VE exatamente 1 arquivo semeado para client_a.
    - pm_a NAO ve nenhum arquivo de client_b (0 linhas).
    - pm_a NAO consegue inserir arquivo para client_b (insert rejeitado pela policy — %row-level security%).
    - pm_a CONSEGUE deletar seu proprio arquivo de client_a (delete afeta 1 linha); delete de client_b nao afeta nada.
  </behavior>
  <action>
    Criar supabase/migrations/0011_client_files.sql espelhando EXATAMENTE o padrao de 0010_messages.sql. Tabela public.client_files com colunas: id uuid primary key default gen_random_uuid(), client_id uuid not null references public.clients(id) on delete cascade, filename text not null, file_type text not null, content text not null, created_at timestamptz not null default now(). Habilitar RLS. Criar TRES policies to authenticated — client_files_select_scoped (for select, using), client_files_insert_scoped (for insert, with check), client_files_delete_scoped (for delete, using) — TODAS com a MESMA predicate (select public.is_admin()) or client_id in (select public.pm_assigned_clients()), reusando os helpers (nunca inlinar subquery contra pm_clients). Emitir grant select, insert, delete on public.client_files to authenticated NA MESMA migration (o comentario sobre o gap local-vs-hosted de 0010 se aplica — nao diferir o GRANT). Criar supabase/tests/0005_rls_client_files_scoping_test.sql seguindo 0004_rls_messages_scoping_test.sql: plan(4), incluir rls_helpers.sql, semear 1 client_files para client_a como postgres ANTES de set_auth, autenticar como pm_a, entao assertar os 4 comportamentos do bloco behavior (results_eq para os counts de select, throws_like %row-level security% para insert em client_b, e um delete + count para provar delete scoped). Desautenticar antes do rollback. NAO alterar rls_helpers.sql nem nenhum teste 0001-0004.
  </action>
  <verify>
    <automated>npx supabase test db 2>&1 | tee /tmp/hnm-pgtap-t1.log >/dev/null; grep "0005_rls_client_files_scoping_test" /tmp/hnm-pgtap-t1.log | grep -qiE "\bok\b" && ! grep "0005_rls_client_files_scoping_test" /tmp/hnm-pgtap-t1.log | grep -qiE "not ok|fail" && ! grep -qE "^not ok" /tmp/hnm-pgtap-t1.log && grep -q "grant select, insert, delete on public.client_files to authenticated" supabase/migrations/0011_client_files.sql && echo ok</automated>
  </verify>
  <done>Migration cria a tabela + 3 policies scoped + GRANT; pgTAP 0005 passa provando isolamento select/insert/delete; testes 0001-0004 continuam verdes. (Verify e gateado pela linha de resultado por-arquivo do proprio 0005 + ausencia de qualquer linha 'not ok', nao pelo exit code cosmetico do harness — ver STATE.md 260716-bjk.)</done>
</task>

<task type="auto" tdd="true">
  <name>Task 2: Modulo de extracao de texto (unpdf + mammoth) + deps + test</name>
  <files>lib/extract/extract-text.ts, lib/extract/extract-text.test.ts, package.json</files>
  <behavior>
    - TXT/MD: buffer com texto legivel (>= MIN_CHARS) retorna o texto trimmado (passthrough utf-8).
    - Input so de espacos em branco / abaixo de MIN_CHARS lanca UnreadableFileError (nunca retorna string vazia com sucesso).
    - UnreadableFileError e uma instancia de Error, distinguivel via instanceof.
  </behavior>
  <action>
    Instalar as dependencias: npm install unpdf mammoth (NAO instalar @napi-rs/canvas — so e preciso para render de imagem, nao para texto; ver RESEARCH.md Pitfall 2). Criar lib/extract/extract-text.ts conforme o Code Sketch do RESEARCH.md: classe UnreadableFileError extends Error; const MIN_CHARS=20; async extractDocumentText(buffer: Buffer, fileType: "pdf"|"docx"|"txt"|"md"): Promise<string> que usa getDocumentProxy(new Uint8Array(buffer)) + extractText(pdf,{mergePages:true}) para pdf, mammoth.extractRawText({buffer}) para docx, buffer.toString("utf-8") para txt/md; depois trim + colapso de whitespace e, se cleaned.length < MIN_CHARS, lanca UnreadableFileError. Modulo Node-runtime only (docstring deixando isso explicito). Criar lib/extract/extract-text.test.ts (node:test + assert/strict) cobrindo os casos do bloco behavior (usar TXT para o passthrough e para o caso abaixo-do-threshold — nao depender de fixtures binarios de PDF/DOCX aqui; o parsing real de PDF/DOCX e coberto pela verificacao humana ao vivo na Task 11). Atualizar o script test de package.json trocando lib/tropicalia/*.test.ts por lib/extract/*.test.ts (o glob de tropicalia deixa de existir apos a Task 3).
  </action>
  <verify>
    <automated>node --test lib/extract/extract-text.test.ts 2>&1 | grep -qiE "pass" && node -e "require('unpdf');require('mammoth')" 2>/dev/null && echo ok</automated>
  </verify>
  <done>unpdf e mammoth instalados; extractDocumentText extrai TXT/MD e lanca UnreadableFileError abaixo de MIN_CHARS; test verde; package.json aponta para lib/extract em vez de lib/tropicalia.</done>
</task>

<task type="auto">
  <name>Task 3: Remover Tropicalia da camada de cliente (lib + actions + migration DROP COLUMN + env + comentarios)</name>
  <files>lib/tropicalia/client.ts, lib/tropicalia/client.test.ts, lib/actions/clients.ts, supabase/migrations/0012_drop_tropicalia_project_id.sql, .env.local.example, lib/validation/clients.ts, lib/anthropic/client.ts</files>
  <action>
    Deletar os arquivos lib/tropicalia/client.ts e lib/tropicalia/client.test.ts (remover o diretorio lib/tropicalia se ficar vazio). Em lib/actions/clients.ts: remover o import de createTropicaliaProject; remover, dentro de createClientRecord, o bloco condicional if (process.env.TROPICALIA_API_KEY) { ... } que provisiona o project (client creation NAO deve mais tocar em Tropicalia); remover por inteiro a funcao exportada retryTropicaliaProvisioning. Manter createClientRecord, listPmRoster, resolvePmNames, updateBriefing, assignPms intactas quanto ao resto. Criar supabase/migrations/0012_drop_tropicalia_project_id.sql com: alter table public.clients drop column tropicalia_project_id; (NAO editar a migration 0006 antiga). Em .env.local.example: remover por completo o bloco de comentario + linha TROPICALIA_API_KEY=; no bloco ANTHROPIC_API_KEY, ajustar o comentario para remover a mencao "never Tropicalia". Em lib/validation/clients.ts e lib/anthropic/client.ts: atualizar apenas os comentarios residuais que citam tropicalia_project_id / lib/tropicalia/client.ts para refletir a nova realidade (sem Tropicalia). NAO tocar em lib/security/*, nem nas migrations 0001-0010, nem nos testes 0001-0004.

    NOTA (estado transitorio esperado — nao e regressao): deletar lib/tropicalia/client.ts aqui deixa imports orfaos em app/api/chat/route.ts (removidos so na Task 6) e app/pm/chat/actions.ts (removidos so na Task 7), que ainda referenciam searchTropicaliaProject / uploadTropicaliaDocument daquele modulo. Esse estado de import quebrado ao longo das Tasks 3-7 e INTENCIONAL e se auto-resolve ao fim da Task 7. O build so e exigido verde na Task 11 — nenhum verify das Tasks 3-7 roda tsc/build. Se a execucao for interrompida/retomada entre a Task 3 e a Task 7, erros de import transitorios em route.ts/actions.ts sao esperados e nao indicam falha; basta prosseguir ate a Task 7.
  </action>
  <verify>
    <automated>test ! -e lib/tropicalia/client.ts && test ! -e lib/tropicalia/client.test.ts && grep -q "drop column tropicalia_project_id" supabase/migrations/0012_drop_tropicalia_project_id.sql && ! grep -riqE "tropicalia" lib/actions/clients.ts .env.local.example && echo ok</automated>
  </verify>
  <done>lib/tropicalia deletado; createClientRecord e retry sem Tropicalia; migration DROP COLUMN criada; .env.local.example sem TROPICALIA_API_KEY; comentarios residuais atualizados. (Imports orfaos em route.ts/actions.ts sao esperados ate a Task 7 — ver NOTA na acao.)</done>
</task>

<task type="auto">
  <name>Task 4: Remover UI de status RAG Tropicalia (detail form + paginas de detalhe + listas)</name>
  <files>components/clients/client-detail-form.tsx, app/pm/clients/[id]/page.tsx, app/admin/clients/[id]/page.tsx, app/pm/clients/page.tsx, app/admin/clients/page.tsx</files>
  <action>
    Em components/clients/client-detail-form.tsx: remover a section inteira "RAG" (SectionTitle "RAG", badges Pronto/Pendente, botao "Tentar novamente"); remover o import de retryTropicaliaProvisioning; remover o estado/handler de retry (isRetryPending, retryServerError, retryProvisioning); remover a prop tropicaliaProjectId do tipo do client e a prop canRetry do componente (e seus usos); remover imports agora orfaos (CheckCircle2, Clock se nao usados em outro lugar do arquivo). Manter as secoes "Briefing estrategico" e "PMs atribuidos" intactas. Em app/pm/clients/[id]/page.tsx e app/admin/clients/[id]/page.tsx: remover tropicalia_project_id do .select(...) de clients; remover o calculo de canRetry; remover tropicaliaProjectId e canRetry dos props passados ao ClientDetailForm. Em app/pm/clients/page.tsx e app/admin/clients/page.tsx: remover tropicalia_project_id do type ClientRow e do .select(...); remover a TableCell que renderiza o badge Pronto/Pendente de RAG e o TableHead correspondente do cabecalho; remover imports orfaos (CheckCircle2, Clock). NOTA: client-detail-form.tsx e as paginas de detalhe recebem a nova secao "Arquivos do cliente" na Task 5 — deixar o arquivo compilando limpo apos a remocao.
  </action>
  <verify>
    <automated>! grep -riqE "tropicalia|canRetry" components/clients/client-detail-form.tsx app/pm/clients app/admin/clients && echo ok</automated>
  </verify>
  <done>Secao RAG e coluna RAG removidas; nenhuma referencia a tropicalia/canRetry restante nessas telas.</done>
</task>

<task type="auto">
  <name>Task 5: UI + Server Action de upload de arquivo do cliente (client_files) com limite compartilhado</name>
  <files>lib/client-files/limit.ts, lib/actions/client-files.ts, components/clients/client-files-section.tsx, components/clients/client-detail-form.tsx, app/pm/clients/[id]/page.tsx, app/admin/clients/[id]/page.tsx</files>
  <action>
    Criar lib/client-files/limit.ts exportando const FILE_LIMIT = 3, uma funcao atFileLimit(count: number): boolean (count >= FILE_LIMIT) e a mensagem amigavel de limite (ex: "Limite de 3 arquivos por cliente atingido. Remova um arquivo antes de enviar outro."). Este e o helper compartilhado entre o upload direto e a curadoria de chat (Task 7). Criar lib/actions/client-files.ts ("use server"): (a) listClientFiles(clientId): read RLS-scoped de client_files (id, filename, file_type, created_at) ordenado por created_at; (b) uploadClientFile(clientId, formData): resolve/autoriza o cliente via createClient() RLS-scoped (NUNCA confia no body alem do id, que a RLS ja valida no insert); le o File do formData como Buffer; valida extensao (.pdf/.txt/.md/.docx) e tamanho (const MAX_FILE_BYTES = 5 * 1024 * 1024) ANTES de extrair, rejeitando com mensagem amigavel se invalido; conta arquivos existentes do cliente e, se atFileLimit, retorna o erro de limite SEM inserir; determina file_type pela extensao; chama extractDocumentText — se lancar UnreadableFileError OU qualquer erro de parsing, faz catch e retorna "Nao foi possivel ler o conteudo deste arquivo." SEM inserir (decisao travada CONTEXT.md); senao insere em client_files (client_id, filename, file_type, content); duplicado por nome e PERMITIDO (nao checar). (c) deleteClientFile(fileId): delete RLS-scoped por id. Criar components/clients/client-files-section.tsx ("use client"): usa SectionTitle ja estabelecido, titulo "Arquivos do cliente"; lista os arquivos (nome, tipo, data) com botao remover por item; formulario de upload com input type="file" accept=".pdf,.txt,.md,.docx" + botao enviar; exibe erros amigaveis (extracao/limite/tamanho) e faz refresh da lista apos sucesso; strings em portugues. Renderizar a secao dentro de client-detail-form.tsx (apos "PMs atribuidos", mantendo consistencia visual), recebendo a lista inicial via prop. Passar a lista inicial (listClientFiles) de app/pm/clients/[id]/page.tsx e app/admin/clients/[id]/page.tsx para o ClientDetailForm/secao. NAO aceitar client_id do body em nenhum ponto — sempre o id da rota/props resolvido via RLS.
  </action>
  <verify>
    <automated>test -f lib/actions/client-files.ts && test -f components/clients/client-files-section.tsx && grep -q "FILE_LIMIT" lib/client-files/limit.ts && grep -q "extractDocumentText" lib/actions/client-files.ts && grep -qE "UnreadableFileError|Nao foi possivel ler|conteudo deste arquivo" lib/actions/client-files.ts && grep -q "MAX_FILE_BYTES" lib/actions/client-files.ts && echo ok</automated>
  </verify>
  <done>PM consegue enviar/listar/remover arquivos; extracao falha bloqueia o insert com mensagem; 4o arquivo bloqueado; validacao de extensao+tamanho antes de extrair; client_id nunca vem do body.</done>
</task>

<task type="auto">
  <name>Task 6: Reescrever chat route + adaptar assemble-prompt para client_files</name>
  <files>app/api/chat/route.ts, lib/chat/assemble-prompt.ts, lib/chat/assemble-prompt.test.ts</files>
  <behavior>
    - assembleSystemPrompt inclui SEMPRE o briefing do cliente ativo (modo degradado = lista de files vazia, mesmo code path — D-06/D-07).
    - Com files nao-vazio, o conteudo (e nome) de cada arquivo aparece no prompt.
    - Nunca inclui nome/campos/arquivo de outro cliente (guarda de isolamento CTX-01/CTX-02 preservada).
    - Campos null do briefing sao omitidos (nao renderizam "null").
  </behavior>
  <action>
    Em lib/chat/assemble-prompt.ts: mudar a assinatura de retrievedChunks: { document: string }[] para files: { filename: string; content: string }[]. Renderizar o retrievalBlock a partir de files (ex: cabecalho "Arquivos de referencia do cliente:" seguido, por arquivo, de "Arquivo: <filename>" + nova linha + <content>). Manter: briefing SEMPRE presente; bloco so aparece quando files.length>0 (array vazio = no-op, sem branch novo); instrucoes de sistema DEPOIS do conteudo (T-2-02). Atualizar lib/chat/assemble-prompt.test.ts para a nova assinatura, preservando TODOS os casos existentes adaptados: isolamento (nunca vaza CLIENT_B), modo degradado (files vazio ainda inclui briefing), append de conteudo (usar [{ filename: "notas.md", content: "Trecho recuperado X" }] e assertar que o content aparece), e null-fields. Em app/api/chat/route.ts: remover o import de searchTropicaliaProject; remover tropicalia_project_id do .select(...) de clients; remover TODO o bloco de retrieval Tropicalia (o try/catch com fallback a chunks vazios e o calculo de chunks). No lugar, apos resolver o client RLS-scoped, buscar todos os client_files do cliente ativo via o MESMO supabase client RLS-scoped (from("client_files").select("filename, content").eq("client_id", clientId) — client_id sempre o ja resolvido pela rota, nunca do body), mapear para { filename, content } e passar como segundo argumento de assembleSystemPrompt. Manter o restante (persistencia da mensagem do usuario antes de gerar, streaming Claude, persistencia do assistant) intacto.
  </action>
  <verify>
    <automated>node --test lib/chat/assemble-prompt.test.ts 2>&1 | grep -qiE "pass" && grep -q "client_files" app/api/chat/route.ts && ! grep -qi "tropicalia" app/api/chat/route.ts && echo ok</automated>
  </verify>
  <done>assemble-prompt aceita files (filename/content), mantem isolamento e modo degradado; testes adaptados verdes; chat route busca client_files RLS-scoped e nao referencia Tropicalia.</done>
</task>

<task type="auto">
  <name>Task 7: Reescrever saveKnowledge para inserir em client_files</name>
  <files>app/pm/chat/actions.ts</files>
  <action>
    Em app/pm/chat/actions.ts (saveKnowledge): remover o import de uploadTropicaliaDocument; remover tropicalia_project_id do .select(...) do client; remover o bloco de "fail closed" que checava !client.tropicalia_project_id || !process.env.TROPICALIA_API_KEY. Manter a re-resolucao RLS-scoped do client e o re-fetch RLS-scoped das mensagens marcadas (nunca confiar em conteudo vindo do browser — T-2-01). Aplicar o limite compartilhado: importar de lib/client-files/limit.ts, contar client_files existentes do cliente e, se atFileLimit, retornar a mensagem de limite SEM inserir. Trocar o upload por: montar o markdown com buildKnowledgeMarkdown (REUTILIZAR, nao reescrever), gerar filename conversa-${new Date().toISOString().replace(/[:.]/g,"-")}.md, e inserir uma nova linha em client_files (client_id, filename, file_type: "markdown", content: markdown) via o supabase client RLS-scoped. Manter a regra: so no clique explicito "Salvar como conhecimento" (nada automatico). Manter listMessagesForClient intacta.
  </action>
  <verify>
    <automated>grep -q "client_files" app/pm/chat/actions.ts && grep -q "buildKnowledgeMarkdown" app/pm/chat/actions.ts && grep -qE "FILE_LIMIT|atFileLimit" app/pm/chat/actions.ts && ! grep -qi "tropicalia" app/pm/chat/actions.ts && echo ok</automated>
  </verify>
  <done>saveKnowledge insere markdown curado em client_files (sem Tropicalia), aplica o limite compartilhado, mantem a curadoria manual explicita. A partir daqui o codigo volta a compilar limpo (fim do estado transitorio de imports orfaos da Task 3).</done>
</task>

<task type="auto">
  <name>Task 8: Atualizar chat page (hasRag por client_files) + badge do chat-panel</name>
  <files>app/pm/chat/page.tsx, app/pm/chat/chat-panel.tsx</files>
  <action>
    Em app/pm/chat/page.tsx: remover tropicalia_project_id do .select(...) e a variavel hasTropicaliaKey. Computar hasRag por cliente a partir da EXISTENCIA de pelo menos 1 registro em client_files: fazer uma query RLS-scoped em client_files selecionando client_id (from("client_files").select("client_id")), construir um Set dos client_ids com arquivo, e mapear roster com hasRag = set.has(c.id). Manter o comentario sobre RAG availability ser computado no servidor (T-2-04) — nunca re-derivado no cliente. Em app/pm/chat/chat-panel.tsx: trocar a constante DEGRADED_NOTICE para "Nenhum arquivo de referencia — respostas usam apenas o briefing do cliente." e manter a condicao de render !activeClient.hasRag (agora hasRag significa "tem >=1 arquivo"). Nenhuma outra mudanca de comportamento no painel.
  </action>
  <verify>
    <automated>grep -q "client_files" app/pm/chat/page.tsx && ! grep -qi "tropicalia" app/pm/chat/page.tsx && grep -q "Nenhum arquivo de referencia" app/pm/chat/chat-panel.tsx && echo ok</automated>
  </verify>
  <done>hasRag reflete existencia de client_files por cliente; badge mostra a nova mensagem quando 0 arquivos e some com >=1; sem Tropicalia na page.</done>
</task>

<task type="auto">
  <name>Task 9: Atualizar 02-06-PLAN.md (verificacao ao vivo sem Tropicalia)</name>
  <files>.planning/phases/02-client-isolated-ai-chat/02-06-PLAN.md</files>
  <action>
    Atualizar SOMENTE 02-06-PLAN.md (nao tocar em 02-01..02-05 PLAN/SUMMARY — historico). Task 1 (preflight): remover qualquer dependencia de TROPICALIA_API_KEY; agora so ANTHROPIC_API_KEY e relevante para a verificacao ao vivo; ajustar o comando de suite para refletir o novo package.json (sem lib/tropicalia). Task 2 (streaming + isolamento): manter em espirito, mas o passo 4 (que testava o badge de indisponibilidade por falta de TROPICALIA_API_KEY) passa a testar o NOVO badge "Nenhum arquivo de referencia..." (aparece quando o cliente tem 0 arquivos, some com >=1). Task 3: reescrever para o novo fluxo — enviar um arquivo real pela nova UI de upload em /pm/clients/[id] (ou /admin/clients/[id]), confirmar que aparece na lista, ir ao chat, perguntar algo que dependa do conteudo do arquivo, e confirmar que a resposta reflete o conteudo IMEDIATAMENTE (sem espera assincrona — vantagem da nova arquitetura); tambem testar a curadoria (marcar mensagens, salvar como conhecimento, confirmar que a nova linha aparece em client_files e vira contexto). Remover mencoes a status:ready / indexacao assincrona / upload para Tropicalia. Atualizar o frontmatter/threat_model do 02-06 apenas no necessario para remover Tropicalia; manter o formato de plano.
  </action>
  <verify>
    <automated>! grep -qi "tropicalia" .planning/phases/02-client-isolated-ai-chat/02-06-PLAN.md && grep -qE "Nenhum arquivo de referencia|arquivo de refer" .planning/phases/02-client-isolated-ai-chat/02-06-PLAN.md && echo ok</automated>
  </verify>
  <done>02-06-PLAN.md reflete a arquitetura client_files: preflight so ANTHROPIC, badge novo, verificacao de upload+chat imediato + curadoria; sem Tropicalia.</done>
</task>

<task type="auto">
  <name>Task 10: Atualizar documentacao do projeto (PROJECT.md + REQUIREMENTS.md)</name>
  <files>.planning/PROJECT.md, .planning/REQUIREMENTS.md</files>
  <action>
    Em .planning/PROJECT.md: reescrever a constraint "RAG: Tropicalia API..." descrevendo a nova arquitetura (arquivos do cliente armazenados em public.client_files no Supabase, injecao direta do conteudo completo no system prompt, sem embeddings/vetor, volume baixo ~3 arquivos por cliente, geracao sempre via Claude API). Reescrever a constraint "Isolamento de contexto: precisa ser estrutural (project separado por cliente na Tropicalia)..." para o novo mecanismo estrutural (RLS scoping de client_files por client_id via pm_assigned_clients()/is_admin(), nunca filtro de aplicacao) — o principio nao-negociavel de isolamento estrutural continua o mesmo, so o mecanismo muda. Na tabela Key Decisions: NAO apagar a linha antiga "RAG isolado por cliente via project separado na Tropicalia" — ADICIONAR uma NOVA linha documentando a migracao para Supabase client_files + injecao direta, com o motivo (mudanca de modelo de negocio da Tropicalia confirmada com o fundador; volume real baixo; simplicidade + sem latencia de indexacao) e a data 2026-07-22. Em .planning/REQUIREMENTS.md: atualizar a descricao do mecanismo nas linhas CLI-03, CTX-01, CTX-04, CTX-05 (trocar "Tropicalia project"/"upload endpoint"/"context retrieved from Tropicalia" pelo novo mecanismo: client_files no Supabase, injecao direta de conteudo, prompt montado no servidor, geracao via Claude) — o REQUISITO de isolamento de contexto por cliente em si NAO muda, so o mecanismo.
  </action>
  <verify>
    <automated>grep -q "client_files" .planning/PROJECT.md && grep -qi "2026-07-22" .planning/PROJECT.md && grep -q "client_files" .planning/REQUIREMENTS.md && echo ok</automated>
  </verify>
  <done>PROJECT.md e REQUIREMENTS.md descrevem a arquitetura client_files; decisao antiga preservada + nova decisao datada 2026-07-22 adicionada; isolamento estrutural reafirmado com o novo mecanismo.</done>
</task>

<task type="auto">
  <name>Task 11: Scope gate + verificacao completa (suite + typecheck + build)</name>
  <files></files>
  <action>
    Rodar a verificacao final e o scope gate. (1) Suite JS: npm test (agora lib/security + lib/chat + lib/extract) — todos verdes. (2) pgTAP: npx supabase test db — testes 0001-0005 verdes (veredito por linhas 'not ok', NAO pelo exit code do harness, que permanece 1 por um motivo cosmetico pre-existente do rls_helpers.sql — ver STATE.md 260716-bjk). (3) Typecheck: npx tsc --noEmit — sem erros. (4) Build: npm run build — sucesso. SCOPE GATE: confirmar via git diff que NAO foram tocados: lib/security/*, as migrations RLS ja existentes 0001-0010, o rls_helpers.sql, e os testes de messages/clients/profiles/pm_clients (supabase/tests/0001-0004). As UNICAS mudancas em supabase/ devem ser as NOVAS 0011/0012 migrations e o NOVO 0005 test. Se alguma dessas areas protegidas aparecer no diff, PARAR e reportar. Confirmar tambem que nao restou nenhuma referencia a tropicalia/TROPICALIA em app/lib/components.

    O verify abaixo e uma cadeia sequencial &&-encadeada REAL: cada etapa (suite JS, pgTAP, tsc, build, scope gate, grep de tropicalia) precisa passar para chegar em `echo ok`. Notas de deteccao: (a) node --test sempre imprime "fail 0" no resumo, entao NAO se pode gatear com grep "fail" cru; gateamos sobre "fail [1-9]" e o simbolo de falha ✖. (b) supabase test db e executado de fato e capturado em log; como o processo sai 1 por motivo cosmetico, NAO gateamos pelo seu exit code — gateamos sobre ausencia de qualquer linha "^not ok" no log E sobre a linha de resultado por-arquivo do 0005 dizer ok. (c) tsc --noEmit e npm run build sao executados de verdade e seu exit code nao-zero quebra a cadeia (sem string-matching mascarado por echo/||).
  </action>
  <verify>
    <automated>npm test 2>&1 | tee /tmp/hnm-js.log >/dev/null; npx supabase test db 2>&1 | tee /tmp/hnm-pg.log >/dev/null; grep -q "pass" /tmp/hnm-js.log && ! grep -qE "fail [1-9]" /tmp/hnm-js.log && ! grep -q "✖" /tmp/hnm-js.log && ! grep -qE "^not ok" /tmp/hnm-pg.log && grep "0005_rls_client_files_scoping_test" /tmp/hnm-pg.log | grep -qiE "\bok\b" && npx tsc --noEmit && npm run build && ! git diff --name-only | grep -qE "lib/security/|supabase/migrations/000[0-9]|supabase/tests/000[1-4]|rls_helpers" && ! grep -riqE "tropicalia" app lib components && echo ok</automated>
  </verify>
  <done>npm test + supabase test db + tsc + build verdes (pgTAP gateado por linhas 'not ok'/resultado do 0005, nao pelo exit code cosmetico); scope gate confirma lib/security, migrations 0001-0010, rls_helpers e testes 0001-0004 intocados; zero referencias Tropicalia em app/lib/components. Qualquer falha real (teste JS vermelho, 'not ok' no pgTAP, erro de tsc, build quebrado, arquivo protegido no diff, ou tropicalia residual) impede o `echo ok`.</done>
</task>

</tasks>

<threat_model>
## Trust Boundaries

| Boundary | Description |
|----------|-------------|
| browser -> Server Action de upload | PM envia bytes de arquivo + client_id; entrada nao confiavel cruzando para escrita privilegiada |
| browser -> /api/chat | clientId + content do body; content vai para o Claude, arquivos sao resolvidos server-side |
| Postgres RLS (client_files) | fronteira real de multi-tenancy: is_admin()/pm_assigned_clients() por client_id |

## STRIDE Threat Register

| Threat ID | Category | Component | Disposition | Mitigation Plan |
|-----------|----------|-----------|-------------|-----------------|
| T-hnm-01 | Tampering / EoP | uploadClientFile, /api/chat, saveKnowledge | mitigate | client_id NUNCA aceito do body como fonte de verdade — sempre resolvido/validado via query RLS-scoped; o insert/select depende das policies client_files_*_scoped (Tasks 5/6/7) |
| T-hnm-02 | Denial of Service | uploadClientFile (arquivo enorme) | mitigate | Validar MAX_FILE_BYTES (5MB) e extensao permitida (.pdf/.txt/.md/.docx) ANTES de ler/extrair; rejeitar com mensagem amigavel (Task 5) |
| T-hnm-03 | Tampering (context poisoning) | extractDocumentText -> insert client_files | mitigate | MIN_CHARS + UnreadableFileError: nunca persiste content vazio/lixo; qualquer erro de parsing bloqueia o insert (Tasks 2/5) |
| T-hnm-04 | Info Disclosure / EoP | RLS de client_files (select/insert/delete) | mitigate | 3 policies scoped com is_admin()/pm_assigned_clients(), provadas por pgTAP 0005 (Task 1) |
| T-hnm-05 | Spoofing (extensao != conteudo real) | file_type derivado da extensao | accept | PMs sao usuarios confiaveis e aprovados; conteudo ilegivel cai no MIN_CHARS; risco baixo, sem sniff de magic bytes na v1 |
| T-hnm-SC | Tampering (supply chain) | npm install unpdf, mammoth | mitigate | RESEARCH.md Package Legitimacy Audit: ambos Approved (unjs org / 10+ anos, ~2M-6M dl/semana), sem sinais [SLOP]/[SUS]/[ASSUMED] — install autonomo permitido, sem checkpoint bloqueante |
</threat_model>

<verification>
- pgTAP 0005 prova isolamento select/insert/delete de client_files; 0001-0004 continuam verdes. Veredito por linhas 'not ok' / resultado por-arquivo, nunca pelo exit code cosmetico do harness (STATE.md 260716-bjk).
- npm test (lib/security + lib/chat + lib/extract) verde; assemble-prompt e extract-text cobrem os novos contratos.
- npx tsc --noEmit e npm run build sem erros.
- Scope gate: lib/security/*, migrations 0001-0010, rls_helpers.sql, testes 0001-0004 intocados no git diff.
- Zero referencias a tropicalia/TROPICALIA em app/lib/components/env.
</verification>

<success_criteria>
- Nova tabela client_files com RLS scoped + GRANT + pgTAP passando.
- Upload de PDF/TXT/MD/DOCX funcional com extracao de texto, bloqueio de extracao-falha, limite de 3 e validacao de tamanho/extensao.
- Chat e curadoria operam 100% sobre client_files; conteudo de arquivo recem-enviado reflete no chat imediatamente; isolamento CTX-01/CTX-02 preservado.
- Badge de contexto reflete existencia de client_files (nao env var).
- Remocao completa de Tropicalia (codigo, coluna, env, testes, comentarios).
- Documentacao (PROJECT.md, REQUIREMENTS.md, 02-06-PLAN.md) atualizada; decisao antiga preservada + nova decisao datada.
</success_criteria>

<output>
Create `.planning/quick/260722-hnm-migrar-rag-da-fase-2-de-tropicalia-para-/260722-hnm-SUMMARY.md` when done
</output>
</content>
</invoke>
