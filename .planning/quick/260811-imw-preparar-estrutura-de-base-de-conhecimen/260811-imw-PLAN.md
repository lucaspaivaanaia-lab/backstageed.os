---
phase: quick/260811-imw
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - supabase/migrations/0026_shared_knowledge_files.sql
  - supabase/tests/0014_rls_shared_knowledge_files_scoping_test.sql
  - lib/actions/shared-knowledge.ts
  - app/admin/shared-knowledge/page.tsx
  - components/admin/shared-knowledge-section.tsx
  - lib/chat/assemble-prompt.ts
  - lib/chat/assemble-prompt.test.ts
  - lib/ai/extraction-prompt.ts
  - lib/ai/extraction-prompt.test.ts
  - lib/ai/structured-extraction.ts
  - app/api/chat/route.ts
  - lib/actions/checklist-templates.ts
  - lib/actions/client-files.ts
  - lib/actions/clients.ts
  - app/pm/board/actions.ts
  - app/admin/layout.tsx
autonomous: false
requirements: [QUICK-260811-imw]

must_haves:
  truths:
    - "An Admin can open /admin/shared-knowledge, upload a PDF/TXT/MD/DOCX file, see it listed, and delete it — all admin-only, structurally separate from any single client's client_files"
    - "A non-admin authenticated user (PM or Client) can read shared_knowledge_files rows but is blocked by RLS from inserting/updating/deleting any row, proven by a new pgTAP suite"
    - "When shared_knowledge_files has at least one row, its content is injected into the chat system prompt (lib/chat/assemble-prompt.ts) for every client conversation, regardless of which client is active"
    - "When shared_knowledge_files has at least one row, its content is injected into every one-shot AI structured-extraction call — checklist generation/draft, briefing autofill, transcript analysis, card-vs-checklist validation — regardless of which client triggered it"
    - "When shared_knowledge_files is empty (the real state until Juliano's document arrives), no shared-knowledge block appears anywhere and every existing prompt/test assertion from before this plan still passes byte-for-byte"
    - "A link to 'Base de conhecimento' appears in the Admin sidebar navigation, alongside Clientes/Aprovações/Checklists/Cards"
  artifacts:
    - path: "supabase/migrations/0026_shared_knowledge_files.sql"
      provides: "public.shared_knowledge_files table (no client_id) + RLS (select any authenticated, write admin-only) + GRANT in the same migration"
      contains: "create table public.shared_knowledge_files"
    - path: "supabase/tests/0014_rls_shared_knowledge_files_scoping_test.sql"
      provides: "pgTAP proof: any authenticated role can SELECT, only admin can INSERT/UPDATE/DELETE"
      contains: "shared_knowledge_files_admin_write"
    - path: "lib/actions/shared-knowledge.ts"
      provides: "listSharedKnowledgeFiles/uploadSharedKnowledgeFile/deleteSharedKnowledgeFile, all admin-only at the app layer"
      exports: ["listSharedKnowledgeFiles", "uploadSharedKnowledgeFile", "deleteSharedKnowledgeFile"]
    - path: "app/admin/shared-knowledge/page.tsx"
      provides: "Admin screen rendering the shared-knowledge list/upload/delete UI"
      contains: "SharedKnowledgeSection"
    - path: "components/admin/shared-knowledge-section.tsx"
      provides: "Client Component: list + upload + delete, mirroring client-files-section.tsx's visual pattern"
      contains: "uploadSharedKnowledgeFile"
    - path: "lib/chat/assemble-prompt.ts"
      provides: "assembleSystemPrompt accepts sharedFiles and injects a common-knowledge block only when non-empty"
      contains: "sharedFiles: ClientFileContext[]"
    - path: "lib/ai/extraction-prompt.ts"
      provides: "buildExtractionPrompt accepts sharedFiles and injects a common-knowledge block only when non-empty, before the trusted instruction"
      contains: "sharedFiles: ExtractionFile[]"
    - path: "lib/ai/structured-extraction.ts"
      provides: "StructuredExtractionParams requires sharedFiles, forwarded to buildExtractionPrompt"
      contains: "sharedFiles: ExtractionFile[]"
    - path: "app/api/chat/route.ts"
      provides: "fetches shared_knowledge_files (no filter) and forwards to assembleSystemPrompt"
      contains: "shared_knowledge_files"
    - path: "app/admin/layout.tsx"
      provides: "sidebar nav item linking to /admin/shared-knowledge"
      contains: "/admin/shared-knowledge"
  key_links:
    - from: "app/api/chat/route.ts"
      to: "lib/chat/assemble-prompt.ts (assembleSystemPrompt)"
      via: "sharedFiles argument built from an unfiltered shared_knowledge_files select"
      pattern: "assembleSystemPrompt\\(client, files, sharedFiles\\)"
    - from: "lib/actions/checklist-templates.ts | lib/actions/client-files.ts | lib/actions/clients.ts | app/pm/board/actions.ts"
      to: "lib/ai/structured-extraction.ts (runStructuredExtraction)"
      via: "sharedFiles fetched from shared_knowledge_files (no client_id filter) and passed alongside files"
      pattern: "sharedFiles,"
    - from: "lib/ai/structured-extraction.ts"
      to: "lib/ai/extraction-prompt.ts (buildExtractionPrompt)"
      via: "params.sharedFiles forwarded as the new 4th positional argument"
      pattern: "params\\.sharedFiles"
    - from: "components/admin/shared-knowledge-section.tsx"
      to: "lib/actions/shared-knowledge.ts"
      via: "uploadSharedKnowledgeFile/deleteSharedKnowledgeFile/listSharedKnowledgeFiles calls"
      pattern: "uploadSharedKnowledgeFile|deleteSharedKnowledgeFile"
    - from: "app/admin/layout.tsx"
      to: "app/admin/shared-knowledge/page.tsx"
      via: "AppSidebar items array href"
      pattern: "/admin/shared-knowledge"
---

<objective>
Build the structural foundation for a "base de conhecimento comum" — content shared across ALL clients (not scoped to any single one), always injected into every AI call regardless of which client is active. This is item 9 of 9 (the last) of the 2026-08-05 Juliano P0/P1 action plan.

Deliverable is the STRUCTURE only: a new table (`public.shared_knowledge_files`, deliberately separate from `client_files`, no `client_id` column), an Admin-only upload/list/delete screen, and wiring into both AI prompt-assembly modules (chat's multi-turn system prompt and the shared one-shot structured-extraction prompt) plus all of their call-sites. The table is deliberately left EMPTY — Juliano's source document has not arrived yet — so the injection block never actually appears in a real prompt today. Every other part of this feature (schema, RLS, pgTAP, Server Actions, UI, prompt injection, nav link) must be complete, tested, and merged now.

Purpose: close the last open item of the 2026-08-05 action plan and give the team a ready-to-populate channel for cross-client knowledge (brand-wide rules, general social-media guidance, etc.) the moment Juliano's document arrives — with zero further code changes needed at that point.
Output: `shared_knowledge_files` table + RLS + pgTAP; `lib/actions/shared-knowledge.ts`; `/admin/shared-knowledge` screen; `assembleSystemPrompt`/`buildExtractionPrompt`/`runStructuredExtraction` and all 4 `runStructuredExtraction` call-sites forwarding shared knowledge; Admin nav link.
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
@$HOME/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/STATE.md
@CLAUDE.md
@supabase/migrations/0011_client_files.sql
@supabase/migrations/0013_checklist_templates.sql
@supabase/tests/0006_rls_checklist_templates_scoping_test.sql
@supabase/tests/rls_helpers.sql
@lib/actions/client-files.ts
@lib/extract/extract-text.ts
@components/clients/client-files-section.tsx
@components/layout/page-shell.tsx
@components/ui/data-card.tsx
@components/ui/error-box.tsx
@app/admin/layout.tsx
@lib/chat/assemble-prompt.ts
@lib/chat/assemble-prompt.test.ts
@lib/ai/extraction-prompt.ts
@lib/ai/extraction-prompt.test.ts
@lib/ai/structured-extraction.ts
@app/api/chat/route.ts
@lib/actions/checklist-templates.ts
@lib/actions/clients.ts
@app/pm/board/actions.ts

<baseline>
- Migration numbering: latest shipped migration is `0025_clients_tag.sql` — this plan's migration is `0026_shared_knowledge_files.sql`. Latest pgTAP test file is `0013_rls_checklist_templates_owner_scoping_test.sql` — this plan's test is `0014_rls_shared_knowledge_files_scoping_test.sql`.
- The table has NO `client_id` and NO update-related trigger/column beyond what's listed — it mirrors `0011_client_files.sql`'s four non-`client_id` columns exactly: `id uuid PK default gen_random_uuid()`, `filename text not null`, `file_type text not null`, `content text not null`, `created_at timestamptz not null default now()`.
- RLS shape mirrors `0013_checklist_templates.sql` (SELECT open to any authenticated, write admin-only via a single `for all` policy), NOT `0011_client_files.sql`'s per-client-scoped policies — this table's whole point is to NOT be scoped by client.
- GRANT ships in the SAME migration file as the table/policies (repeated project lesson — hosted Supabase auto-grants on table creation, local `supabase start` does not).
- No `FILE_LIMIT`-style per-file-count ceiling is added for this table — `lib/client-files/limit.ts`'s `FILE_LIMIT` exists because `client_files`' content is injected per-client into a single conversation's prompt budget; `shared_knowledge_files` is global and has no equivalent per-client budget concept in scope for this plan. Do reuse the SAME per-file size ceiling (`MAX_FILE_BYTES = 5 * 1024 * 1024`) and the same `ALLOWED_EXTENSIONS` set (`pdf`, `txt`, `md`, `docx`) that `lib/actions/client-files.ts` already defines locally (not imported from `limit.ts` — that module only exports the per-client count constant/message, not the byte ceiling or extension set).
- `extractDocumentText`/`UnreadableFileError`/`ClientFileType` from `lib/extract/extract-text.ts` are reused UNCHANGED — no edits to that file.
- ALL THREE actions in `lib/actions/shared-knowledge.ts` (including the read-only list) are admin-only at the app layer, even though the underlying RLS select policy is open to any authenticated role — the only consumer today is the Admin-only `/admin/shared-knowledge` screen, and `middleware.ts` already blocks non-admin roles from `/admin/*` routes, but this app-layer check is deliberate defense in depth, matching every other admin-only action in this codebase (e.g. `generateChecklistFromFiles`, `lib/actions/checklist-templates.ts`).
- `assembleSystemPrompt`'s and `buildExtractionPrompt`'s new `sharedFiles` parameter is REQUIRED (not optional, no default) — same forcing-function pattern quick task 260810-ivr used for `clientTag`, so TypeScript itself flags every call-site that needs updating (`assemble-prompt.test.ts`, `extraction-prompt.test.ts`, `app/api/chat/route.ts`, and — via `StructuredExtractionParams`'s new required `sharedFiles` field — all 4 `runStructuredExtraction` callers).
- The shared-knowledge injection block follows the EXACT SAME "only render when non-empty, single ternary expression, never a separate branch" pattern `filesBlock`/`ExtractionFile`'s block already use in both modules — when `shared_knowledge_files` is empty (the real state today), the rendered prompt is byte-identical to before this plan.
- In `buildExtractionPrompt`, the shared-knowledge block is inserted BEFORE the trusted task-specific `instruction` parameter, which must remain the LAST content in the returned string (T-ivr-03's established prompt-injection-resistance ordering, quick task 260810-ivr) — do not disturb this ordering.
</baseline>

<interfaces>
<!-- Exact SQL for Task 1 — write these two files with exactly this content (adapt only the seed UUID collision comment/wording if truly needed, do not change the DDL/RLS/GRANT shape). -->

**`supabase/migrations/0026_shared_knowledge_files.sql`** (full content):
```sql
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
```

**`supabase/tests/0014_rls_shared_knowledge_files_scoping_test.sql`** (full content):
```sql
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

-- 3. pm_a nao consegue atualizar o arquivo semeado.
select throws_like(
  $$ update public.shared_knowledge_files set content = 'PM tentando editar' where id = '44444444-4444-4444-4444-444444444444' $$,
  '%row-level security%',
  'pm_a nao consegue atualizar um shared_knowledge_files (admin-only write)'
);

-- 4. pm_a nao consegue excluir o arquivo semeado.
select throws_like(
  $$ delete from public.shared_knowledge_files where id = '44444444-4444-4444-4444-444444444444' $$,
  '%row-level security%',
  'pm_a nao consegue excluir um shared_knowledge_files (admin-only write)'
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
```

<!-- Current runStructuredExtraction call-sites Task 4 touches, exact as of this plan. Read once here — do not re-read these files during Task 4. -->

**`lib/actions/checklist-templates.ts` — `proposeChecklistFromFiles`** already has a `supabase` client in scope (used to fetch `client_files`) and its `runStructuredExtraction({...})` call currently starts with `clientName: client.name, clientTag: client.tag, files,`.

**`lib/actions/client-files.ts` — `runTranscriptAnalysis`** has NO `supabase` client in scope today (signature: `(file, client, transcript)`, no Supabase import used inside its body) — Task 4 must add `const supabase = await createClient();` inside it (the file already imports `createClient` from `@/lib/supabase/server` at the top). Its `runStructuredExtraction({...})` call currently starts with `clientName: client.name, clientTag: client.tag, files: [...],`.

**`lib/actions/clients.ts` — `autofillBriefingFromFiles`** already has a `supabase` client in scope (used for both the `clients` and `client_files` reads) and its `runStructuredExtraction({...})` call currently starts with `clientName: client.name, clientTag: client.tag, files,`.

**`app/pm/board/actions.ts` — `validateCardAgainstChecklist`** already has a `supabase` client in scope (used for `cards`, `clients`, `card_checklist_items`, `client_files` reads) and its `runStructuredExtraction({...})` call currently starts with `clientName: client.name, clientTag: client.tag, files: [cardContentFile, ...(clientFiles ?? [])],`.

In all 4 cases, add a query `.from("shared_knowledge_files").select("filename, content")` (no filter — RLS's `select_all_authenticated` policy is the only scoping) using the ALREADY-IN-SCOPE `supabase` client (or the newly-added one in `client-files.ts`), map `data ?? []` to `{ filename, content }[]`, and add `sharedFiles,` to the `runStructuredExtraction({...})` call directly after `files`/`files: [...],`.
</interfaces>
</context>

<tasks>

<task type="auto">
  <name>Task 1: Migration + RLS + pgTAP for shared_knowledge_files</name>
  <files>supabase/migrations/0026_shared_knowledge_files.sql, supabase/tests/0014_rls_shared_knowledge_files_scoping_test.sql</files>
  <action>
    Create both files with EXACTLY the SQL given in the `<interfaces>` block above (no `client_id` column, RLS mirroring `0013_checklist_templates.sql`'s select-all-authenticated + admin-only-write shape, GRANT in the same migration file as the table/policies). Apply the migration locally with `npx supabase db reset` (or `npx supabase migration up` if a reset is not needed) before running the pgTAP suite.
  </action>
  <verify>
    <automated>cd /Users/lucaspaiva/projects/backstageed.OS && npx supabase test db 2>&1 | tail -80</automated>
  </verify>
  <done>`npx supabase test db` shows `0014_rls_shared_knowledge_files_scoping_test.sql` with all 6 assertions passing (`ok 1` through `ok 6`, no `not ok` lines), and no regression in any of the other 13 pre-existing test files (the pre-existing `rls_helpers.sql` cosmetic glob non-issue, if it reappears, is not a regression). `public.shared_knowledge_files` exists locally with exactly the 5 columns from the migration, RLS enabled, and the GRANT applied.</done>
</task>

<task type="auto">
  <name>Task 2: Server Actions + Admin UI for shared-knowledge upload/list/delete</name>
  <files>lib/actions/shared-knowledge.ts, app/admin/shared-knowledge/page.tsx, components/admin/shared-knowledge-section.tsx</files>
  <action>
    **`lib/actions/shared-knowledge.ts`** (new "use server" file, mirroring `lib/actions/client-files.ts`'s shape): define `MAX_FILE_BYTES = 5 * 1024 * 1024` and `ALLOWED_EXTENSIONS = new Set(["pdf", "txt", "md", "docx"])` locally (same values as `client-files.ts`, not imported — that file also defines them locally, not via `lib/client-files/limit.ts`). Define a private `requireAdmin()` helper that calls `createClient()`, `auth.getUser()`, reads `profiles.role, status`, and returns either `{ ok: true, supabase }` when `status === "approved" && role === "admin"`, or `{ ok: false, error }` otherwise (copy the exact check shape from `generateChecklistFromFiles` in `lib/actions/checklist-templates.ts`). Export `SharedKnowledgeFileRow` (`id`, `filename`, `file_type`, `created_at`), `UploadSharedKnowledgeFileResult`, `DeleteSharedKnowledgeFileResult` types. Export `listSharedKnowledgeFiles()`: calls `requireAdmin()`, returns `[]` if unauthorized, otherwise selects `id, filename, file_type, created_at` from `shared_knowledge_files` ordered `created_at` ascending. Export `uploadSharedKnowledgeFile(formData: FormData)`: calls `requireAdmin()` first and returns its error if unauthorized; then validates the `"file"` field exists and is non-empty (`FILE_SELECT_ERROR`), validates extension against `ALLOWED_EXTENSIONS` (`FILE_FORMAT_ERROR`), validates size against `MAX_FILE_BYTES` (`FILE_TOO_LARGE_ERROR`); extracts text via `extractDocumentText` from `lib/extract/extract-text.ts`, catching `UnreadableFileError` (and any other extraction error) into `FILE_UNREADABLE_ERROR` — never persists on extraction failure; inserts `{ filename: file.name, file_type: extension, content }` into `shared_knowledge_files` using the RLS-scoped `supabase` client returned by `requireAdmin()`. Export `deleteSharedKnowledgeFile(fileId: string)`: calls `requireAdmin()`, deletes by `id` on success. Every user-facing error string is Portuguese, matching this codebase's convention (mirror `client-files.ts`'s exact wording where the scenario matches — file-select/format/size/unreadable/save/delete messages).

    **`app/admin/shared-knowledge/page.tsx`** (new Server Component): calls `listSharedKnowledgeFiles()`, renders `PageShell`/`PageTitle` ("Base de conhecimento") from `@/components/layout/page-shell`, and renders `<SharedKnowledgeSection initialFiles={files} />`.

    **`components/admin/shared-knowledge-section.tsx`** (new "use client" Client Component, mirroring `components/clients/client-files-section.tsx`'s visual/interaction pattern but deliberately simplified — no `clientId`, no briefing-autofill/checklist-draft callbacks, no per-file `FILE_LIMIT` badge since this table has no per-client prompt budget): a `DataCard` titled "Arquivos de conhecimento comum" with a description explaining these files are injected into every client's AI context; a list of files (filename, file_type uppercase + formatted date, delete `Button` with `XIcon`) or an `EmptyState` when empty; a hidden `<input type="file" accept=".pdf,.txt,.md,.docx">` driven by a `fileInputRef` + visible "Escolher arquivo"/"Enviar arquivo" `Button`s (same hidden-input-plus-button pattern as `client-files-section.tsx`, not a bare native file input); an `ErrorBox` for upload/delete errors. `handleUpload` calls `uploadSharedKnowledgeFile(formData)` inside a `useTransition`, and on success re-fetches via `listSharedKnowledgeFiles()` (not a full page `router.refresh()` — no `router` import needed). `handleDelete` calls `deleteSharedKnowledgeFile(fileId)` inside a separate `useTransition`, and on success filters the deleted row out of local state.
  </action>
  <verify>
    <automated>cd /Users/lucaspaiva/projects/backstageed.OS && npx tsc --noEmit 2>&1 | tail -40</automated>
    <automated>cd /Users/lucaspaiva/projects/backstageed.OS && npx eslint lib/actions/shared-knowledge.ts app/admin/shared-knowledge/page.tsx components/admin/shared-knowledge-section.tsx 2>&1 | tail -40</automated>
    <automated>cd /Users/lucaspaiva/projects/backstageed.OS && npm run build 2>&1 | tail -60</automated>
  </verify>
  <done>`tsc --noEmit`, `eslint`, and `npm run build` are all clean. `lib/actions/shared-knowledge.ts` exports `listSharedKnowledgeFiles`, `uploadSharedKnowledgeFile`, `deleteSharedKnowledgeFile`, each starting with the same `requireAdmin()` app-layer check. `/admin/shared-knowledge` renders the list/upload/delete UI via `SharedKnowledgeSection`.</done>
</task>

<task type="auto" tdd="true">
  <name>Task 3: Prompt-assembly core — sharedFiles in both modules + the chat route</name>
  <files>lib/chat/assemble-prompt.ts, lib/chat/assemble-prompt.test.ts, lib/ai/extraction-prompt.ts, lib/ai/extraction-prompt.test.ts, lib/ai/structured-extraction.ts, app/api/chat/route.ts</files>
  <behavior>
    - `assembleSystemPrompt(client, files, sharedFiles)`: when `sharedFiles` is `[]`, the returned prompt is IDENTICAL to what the current 2-argument tests already assert (all 10 existing tests in `assemble-prompt.test.ts`, updated to pass `[]` as the 3rd argument, must still pass unchanged).
    - `assembleSystemPrompt`: NEW — when `sharedFiles` is non-empty (e.g. `[{ filename: "guia-marca.md", content: "Nunca use gírias regionais." }]`), the returned prompt contains both the filename and the content, regardless of which client's briefing/files are also passed.
    - `assembleSystemPrompt`: NEW — the shared-knowledge content is present even when `client` is Client A and `files` is `[]` (proves it is not accidentally gated behind a non-empty client-files list).
    - `buildExtractionPrompt(clientName, clientTag, files, sharedFiles, instruction)`: when `sharedFiles` is `[]`, the returned prompt is IDENTICAL to what the current tests already assert (all 6 existing tests in `extraction-prompt.test.ts`, updated to pass `[]` as the new 4th argument before `instruction`, must still pass unchanged).
    - `buildExtractionPrompt`: NEW — when `sharedFiles` is non-empty, the returned prompt contains both the filename and content, AND the trusted `instruction` parameter still appears strictly AFTER the shared-knowledge content in the returned string (ordering assertion via `indexOf`).
  </behavior>
  <action>
    **`lib/chat/assemble-prompt.ts`:** Change `assembleSystemPrompt`'s signature to `(client: Briefing, files: ClientFileContext[], sharedFiles: ClientFileContext[])`. Add a `sharedKnowledgeBlock` computed the same way `filesBlock` already is — non-empty only when `sharedFiles.length`, labeled `Conhecimento comum a todos os clientes:` followed by each file rendered as `Arquivo: ${f.filename}\n${f.content}` joined by `\n\n`, with a trailing `\n\n` so it composes cleanly when non-empty and contributes nothing when empty. Insert it into the final `return (...)` template between `${formattingBlock}\n\n` and `${briefingBlock}` (i.e. `...${formattingBlock}\n\n${sharedKnowledgeBlock}${briefingBlock}${filesBlock}`), so the block only appears when non-empty and the output is byte-identical to today when `sharedFiles` is `[]`. Update the module's top doc comment with a short paragraph noting quick task 260811-imw added the `sharedFiles` parameter (item 9 of the 2026-08-05 action plan), always injected regardless of the active client, following the exact same non-empty-only pattern as `files`.

    **`lib/chat/assemble-prompt.test.ts`:** Add `[]` as the 3rd argument to every existing `assembleSystemPrompt(CLIENT_X, [...])` call (10 call-sites). Add the 3 NEW tests described in `<behavior>` above — do not remove or weaken any existing test.

    **`lib/ai/extraction-prompt.ts`:** Change `buildExtractionPrompt`'s signature to `(clientName: string, clientTag: string, files: ExtractionFile[], sharedFiles: ExtractionFile[], instruction: string)`. Add a `sharedFilesBlock` computed the same way — non-empty only when `sharedFiles.length`, same `Conhecimento comum a todos os clientes:` label and per-file rendering as assemble-prompt.ts's block, with a leading `\n\n` so it composes cleanly. Insert it immediately after `` `Arquivos de referência do cliente:\n${filesBlock}` `` and before the trailing `` `\n\n---\n\n${instruction}` `` — the task-specific `instruction` parameter MUST remain the LAST content in the returned string (T-ivr-03's established ordering, quick task 260810-ivr — do not weaken it). Update the module's top doc comment the same way as assemble-prompt.ts's.

    **`lib/ai/extraction-prompt.test.ts`:** Add `[]` as the 4th argument (before `instruction`) to every existing `buildExtractionPrompt(...)` call (6 call-sites). Add the 2 NEW tests described in `<behavior>` above — do not remove or weaken any existing test.

    **`lib/ai/structured-extraction.ts`:** Add `sharedFiles: ExtractionFile[];` to `StructuredExtractionParams`, directly after `files: ExtractionFile[];`. Change the `buildExtractionPrompt(...)` call inside `runStructuredExtraction` from `buildExtractionPrompt(params.clientName, params.clientTag, params.files, params.instruction)` to `buildExtractionPrompt(params.clientName, params.clientTag, params.files, params.sharedFiles, params.instruction)`, matching Task 3's new signature exactly. This is the SAME forcing-function pattern quick task 260810-ivr used for `clientTag` — it intentionally breaks the typecheck for all 4 `runStructuredExtraction` callers until Task 4 updates them.

    **`app/api/chat/route.ts`:** After the existing `client_files` select (which builds `files`), add a second, unfiltered select: `.from("shared_knowledge_files").select("filename, content")` via the SAME RLS-scoped `supabase` client (never `createAdminClient()` — the `shared_knowledge_files_select_all_authenticated` policy is the actual boundary here, open to any authenticated role by design), map `data ?? []` to `{ filename, content }[]` as `sharedFiles`. Change the `assembleSystemPrompt(client, files)` call to `assembleSystemPrompt(client, files, sharedFiles)`.
  </action>
  <verify>
    <automated>cd /Users/lucaspaiva/projects/backstageed.OS && npx tsc --noEmit 2>&1 | tail -40</automated>
    <automated>cd /Users/lucaspaiva/projects/backstageed.OS && npx eslint lib/chat/assemble-prompt.ts lib/chat/assemble-prompt.test.ts lib/ai/extraction-prompt.ts lib/ai/extraction-prompt.test.ts lib/ai/structured-extraction.ts app/api/chat/route.ts 2>&1 | tail -40</automated>
    <automated>cd /Users/lucaspaiva/projects/backstageed.OS && node --test lib/chat/assemble-prompt.test.ts lib/ai/extraction-prompt.test.ts 2>&1 | tail -60</automated>
  </verify>
  <done>`tsc --noEmit` and `eslint` are clean on all 6 files (the intentional break in the 4 `runStructuredExtraction` callers from `StructuredExtractionParams`'s new required `sharedFiles` field is expected here and resolved by Task 4). `node --test` reports 0 failures across both test files: all pre-existing assertions still pass with `[]` added as the new argument, plus the 5 new tests (3 in `assemble-prompt.test.ts`, 2 in `extraction-prompt.test.ts`) proving `sharedFiles` renders correctly and — in `buildExtractionPrompt` — that `instruction` still appears after it. `app/api/chat/route.ts` fetches `shared_knowledge_files` via the RLS-scoped `supabase` client and forwards it as `assembleSystemPrompt`'s 3rd argument.</done>
</task>

<task type="auto">
  <name>Task 4: Wire all 4 runStructuredExtraction call-sites + Admin nav link</name>
  <files>lib/actions/checklist-templates.ts, lib/actions/client-files.ts, lib/actions/clients.ts, app/pm/board/actions.ts, app/admin/layout.tsx</files>
  <action>
    Using the exact current shapes documented in `<interfaces>` above, update all 4 `runStructuredExtraction` call-sites:

    **`lib/actions/checklist-templates.ts`:** In `proposeChecklistFromFiles` (the shared helper both `generateChecklistFromFiles` and `generateChecklistDraftFromFiles` call), add a query on the already-in-scope `supabase` client — `.from("shared_knowledge_files").select("filename, content")`, no filter — map `data ?? []` to a `sharedFiles` array, and add `sharedFiles,` to the `runStructuredExtraction({...})` call directly after `files,`.

    **`lib/actions/client-files.ts`:** In `runTranscriptAnalysis`, add `const supabase = await createClient();` at the top of the function body (the file's top-level `import { createClient } from "@/lib/supabase/server";` already exists, just currently unused inside this specific function), then the same `shared_knowledge_files` query and `sharedFiles,` addition to its `runStructuredExtraction({...})` call, directly after `files: [...],`.

    **`lib/actions/clients.ts`:** In `autofillBriefingFromFiles`, add the same `shared_knowledge_files` query on the already-in-scope `supabase` client, and add `sharedFiles,` to its `runStructuredExtraction({...})` call, directly after `files,`.

    **`app/pm/board/actions.ts`:** In `validateCardAgainstChecklist`, add the same `shared_knowledge_files` query on the already-in-scope `supabase` client, and add `sharedFiles,` to its `runStructuredExtraction({...})` call, directly after `files: [cardContentFile, ...(clientFiles ?? [])],`.

    None of these 4 files gain a new authorization check or RLS-boundary change for the shared-knowledge read — every call rides the `shared_knowledge_files_select_all_authenticated` RLS policy (open to any authenticated role by design, since the whole point of this table is to be visible regardless of client scope), via the SAME RLS-scoped `supabase` client already in use in each function (never `createAdminClient()`).

    **`app/admin/layout.tsx`:** Import `BookOpenIcon` from `lucide-react` alongside the existing icon imports. Add a new item to the `AppSidebar`'s `items` array: `{ href: "/admin/shared-knowledge", label: "Base de conhecimento", icon: <BookOpenIcon /> }`, positioned after the existing "Cards" item (end of the list, matching this being the newest/last-added Admin screen).
  </action>
  <verify>
    <automated>cd /Users/lucaspaiva/projects/backstageed.OS && npx tsc --noEmit 2>&1 | tail -40</automated>
    <automated>cd /Users/lucaspaiva/projects/backstageed.OS && npx eslint lib/actions/checklist-templates.ts lib/actions/client-files.ts lib/actions/clients.ts app/pm/board/actions.ts app/admin/layout.tsx 2>&1 | tail -40</automated>
    <automated>cd /Users/lucaspaiva/projects/backstageed.OS && grep -c "shared_knowledge_files" lib/actions/checklist-templates.ts lib/actions/client-files.ts lib/actions/clients.ts app/pm/board/actions.ts</automated>
    <automated>cd /Users/lucaspaiva/projects/backstageed.OS && grep -n "/admin/shared-knowledge" app/admin/layout.tsx</automated>
    <automated>cd /Users/lucaspaiva/projects/backstageed.OS && npm run build 2>&1 | tail -60</automated>
    <automated>cd /Users/lucaspaiva/projects/backstageed.OS && npm test 2>&1 | tail -80</automated>
  </verify>
  <done>`tsc --noEmit`, `eslint`, `npm run build`, and `npm test` are all clean project-wide — the intentional Task-3 typecheck break is fully resolved by these 4 files. Each of the 4 action files shows at least 1 occurrence of `shared_knowledge_files`. `app/admin/layout.tsx` contains a sidebar item linking to `/admin/shared-knowledge`. `npm test` passes with 0 failures, including Task 3's extended `assemble-prompt.test.ts`/`extraction-prompt.test.ts` suites.</done>
</task>

<task type="checkpoint:human-verify" gate="blocking">
  <what-built>
    Full structure for the cross-client "base de conhecimento comum": `public.shared_knowledge_files` table + RLS + pgTAP, an Admin-only `/admin/shared-knowledge` screen (list/upload/delete), and prompt-injection wiring into both the chat system prompt and every one-shot AI extraction call (checklist generation/draft, briefing autofill, transcript analysis, card validation) — none of it client-scoped. The table starts empty (Juliano's document hasn't arrived), so this checkpoint verifies the STRUCTURE works end-to-end with a real test file, not that real cross-client knowledge already shapes production answers.
  </what-built>
  <how-to-verify>
    1. Run `npm run dev`, log in as Admin, open `/admin/shared-knowledge` from the new sidebar link ("Base de conhecimento").
    2. Confirm the screen shows "Nenhum arquivo enviado ainda" (empty state) — the table is genuinely empty right now.
    3. Upload a small `.txt` or `.md` test file containing a distinctive, made-up sentence (e.g. "Regra de teste: nunca mencionar a palavra abacate."). Confirm it appears in the list with the right filename/type/date.
    4. Open `/pm/chat`, select ANY client, ask something that would surface the rule (e.g. "Quais são as regras de conteúdo que você segue?"). Confirm the AI's answer reflects the test rule you just uploaded — proving the injection reaches the chat prompt regardless of which client is active.
    5. Switch to a DIFFERENT client in `/pm/chat` and ask the same question. Confirm the same test rule still surfaces — proving it is NOT client-scoped.
    6. Go to any client's page and trigger one AI extraction feature (e.g. "Gerar checklist com IA" on `/admin/clients/[id]`, or "Revalidar com IA" on a card) — this doesn't need to visibly reference the test file's content to pass, but confirm the feature still completes successfully (no crash/error), proving the new `sharedFiles` wiring didn't break the extraction call-sites.
    7. Return to `/admin/shared-knowledge` and delete the test file. Confirm it disappears from the list.
    8. Ask the same chat question from step 4 again (new message, same or different client). Confirm the test rule NO LONGER surfaces — proving the deletion is picked up immediately (no caching), matching the no-embeddings architecture's existing "reflects immediately" behavior for `client_files`.
  </how-to-verify>
  <resume-signal>Type "approved" or describe issues</resume-signal>
</task>

</tasks>

<threat_model>
## Trust Boundaries

| Boundary | Description |
|----------|-------------|
| Admin browser → `uploadSharedKnowledgeFile`/`deleteSharedKnowledgeFile` | Admin-only at the app layer (`requireAdmin()`) — file content and delete `id` are the only caller-influenced inputs |
| `shared_knowledge_files` content → every client's AI prompt | Unlike `client_files` (scoped to one client), this content reaches EVERY client's chat and extraction prompts — a larger blast radius if the content itself were untrustworthy, mitigated by write access being admin-only |
| Any authenticated role → SELECT `shared_knowledge_files` | Deliberately open by design (RLS `using (true)`) — this is the entire point of the feature, not a leak |

## STRIDE Threat Register

| Threat ID | Category | Component | Disposition | Mitigation Plan |
|-----------|----------|-----------|-------------|-----------------|
| T-imw-01 | Spoofing | `uploadSharedKnowledgeFile`/`deleteSharedKnowledgeFile`/`listSharedKnowledgeFiles` | mitigate | Every export starts with `requireAdmin()` (app-layer `profiles.role === "admin" && status === "approved"` check), backed by the RLS `shared_knowledge_files_admin_write` policy as defense in depth — proven by pgTAP assertions 2-4 (pm_a blocked on insert/update/delete) and assertion 6 (admin succeeds) |
| T-imw-02 | Tampering | Admin-uploaded file content reaching every client's prompt (wider blast radius than `client_files`, which is per-client) | accept | Only the Admin role (already the most-trusted role in this system, with unrestricted RLS access via `is_admin()` across every table) can write to this table — same trust level as `checklist_templates` content, which is already injected app-wide via checklist gating; no new trust boundary is crossed by this plan |
| T-imw-03 | Information Disclosure | `shared_knowledge_files` visible to every authenticated role, not scoped to any client | accept | This is the deliberate design goal of the feature (explicitly locked in the task description) — the RLS `select_all_authenticated` policy matches that intent exactly, proven for both a PM and a Client-role actor by pgTAP assertions 1 and 5 |
| T-imw-04 | Tampering | Ordering of the new shared-knowledge block relative to each module's trusted content/instruction | mitigate | Both modules insert the block using the SAME "non-empty-only, single ternary, never a separate branch" pattern the existing `files`/`filesBlock` already use; in `extraction-prompt.ts`, the trusted task `instruction` parameter remains strictly last, preserving the T-ivr-03 ordering established by quick task 260810-ivr |
| T-imw-05 | Elevation of Privilege | `listSharedKnowledgeFiles()` is admin-gated at the app layer even though its RLS select policy is open to any authenticated role | accept | Intentional stricter-than-RLS check — the only consumer today is the Admin-only `/admin/shared-knowledge` screen; a future PM-facing read (if ever needed) would be a new, separately-considered action, not a loosening of this one |
| T-imw-SC | Tampering | npm/pip/cargo installs | n/a | No package installs in this plan — zero dependency or `package.json` changes |
</threat_model>

<verification>
1. `npx supabase test db` passes with all 6 new assertions green and zero regression across the other 13 pre-existing pgTAP test files.
2. `npx tsc --noEmit`, `npx eslint`, `npm run build`, and `npm test` are all clean project-wide after every task.
3. `node --test lib/chat/assemble-prompt.test.ts lib/ai/extraction-prompt.test.ts` passes with 0 failures, including all new `sharedFiles` assertions.
4. `grep -c "shared_knowledge_files"` shows at least 1 occurrence in each of the 4 `runStructuredExtraction` call-site files.
5. The live checkpoint (Task 5) confirms the end-to-end structure works with a real test file: upload → surfaces in chat regardless of active client → delete → stops surfacing immediately.
6. With `shared_knowledge_files` empty (its real state after this plan merges), every prompt/test assertion that existed before this plan still passes unchanged — confirmed by Task 3's `[]`-argument backward-compatibility tests.
</verification>

<success_criteria>
- `public.shared_knowledge_files` exists with RLS: any authenticated role can SELECT, only Admin can INSERT/UPDATE/DELETE — proven by pgTAP, not just app-layer checks.
- Admin can list/upload/delete shared-knowledge files via `/admin/shared-knowledge`, reachable from the Admin sidebar.
- `assembleSystemPrompt` and `buildExtractionPrompt` both accept and correctly render `sharedFiles`, following the same non-empty-only pattern as the existing per-client `files` parameter.
- All 4 `runStructuredExtraction` call-sites (checklist generation/draft, briefing autofill, transcript analysis, card validation) fetch and forward `shared_knowledge_files` content, unfiltered by client.
- The chat route (`app/api/chat/route.ts`) fetches and forwards `shared_knowledge_files` content to every conversation, regardless of active client.
- With the table empty (its actual state after merge), zero behavioral change to any existing prompt — confirmed by tests, not just code review.
- `tsc`/`eslint`/`build`/`test`/`supabase test db` all green.
- This closes item 9 of 9 of the 2026-08-05 Juliano action plan — the plan is now fully closed.
</success_criteria>

<output>
Create `.planning/quick/260811-imw-preparar-estrutura-de-base-de-conhecimen/260811-imw-SUMMARY.md` when done
</output>
