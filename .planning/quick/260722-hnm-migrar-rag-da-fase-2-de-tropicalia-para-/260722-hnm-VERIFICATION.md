---
task: 260722-hnm
verified: 2026-07-22T00:00:00Z
status: passed
score: 8/8 must-haves verified (truths), 8/8 artifacts, 5/5 key links
overrides_applied: 0
---

# Quick Task 260722-hnm: Migrar RAG de Tropicalia para Supabase Verification Report

**Task Goal:** Migrar RAG da Fase 2 de Tropicalia para armazenamento direto em Supabase (client_files) com injeção completa de conteúdo no contexto, sem embeddings; remove auto-provisioning Tropicalia (Fase 1) e upload-para-Tropicalia (Fase 2); nova UI de upload de arquivo do cliente
**Verified:** 2026-07-22
**Status:** passed

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | PM envia PDF/TXT/MD/DOCX, vê listado (nome/tipo/data) e remove | VERIFIED | `components/clients/client-files-section.tsx` renders list (filename, file_type, created_at) + remove button wired to `deleteClientFile`; `lib/actions/client-files.ts` implements `uploadClientFile`/`deleteClientFile`/`listClientFiles`, wired into `client-detail-form.tsx` and both detail pages via `initialFiles={listClientFiles(client.id)}` |
| 2 | Extração falha nunca persiste linha em client_files | VERIFIED | `uploadClientFile` (lib/actions/client-files.ts:102-113) wraps `extractDocumentText` in try/catch; `UnreadableFileError` OR any other parse error returns a friendly error string BEFORE the `.insert()` call at line 115 — insert is unreachable on any extraction failure. `extract-text.ts` never returns success below `MIN_CHARS=20` (throws `UnreadableFileError` instead) |
| 3 | 4º upload bloqueado (limite 3) | VERIFIED | `lib/client-files/limit.ts` exports `FILE_LIMIT=3`/`atFileLimit`; `uploadClientFile` counts existing rows and returns `FILE_LIMIT_MESSAGE` without inserting when `atFileLimit(count)` (lines 90-97); same guard reused identically in `saveKnowledge` (app/pm/chat/actions.ts:66-73) |
| 4 | Chat injeta conteúdo completo de client_files sem vazar entre clientes (CTX-01/CTX-02) | VERIFIED | `app/api/chat/route.ts` fetches `client_files` via the SAME RLS-scoped client used to resolve `client` (lines 69-77), passes `{filename, content}[]` to `assembleSystemPrompt`; `lib/chat/assemble-prompt.test.ts` has an explicit leakage-guard test proving Client B's content never appears in Client A's prompt and vice versa — test passes (`npm test`, 23/23) |
| 5 | Conteúdo de arquivo recém-enviado reflete no chat IMEDIATAMENTE | VERIFIED | `app/api/chat/route.ts` does a live `select` on `client_files` on every request (no cache, no async indexing step) — architecturally synchronous by construction |
| 6 | Salvar conhecimento insere nova linha markdown em client_files só no clique explícito (CTX-03) | VERIFIED | `saveKnowledge` (app/pm/chat/actions.ts) builds markdown via `buildKnowledgeMarkdown`, inserts `file_type: "markdown"` row only when the Server Action is invoked; `chat-panel.tsx`'s `handleSaveKnowledge` is only called from the explicit "Salvar como conhecimento" button click — no automatic invocation path found |
| 7 | Badge do chat aparece só com 0 arquivos, some com >=1 | VERIFIED | `app/pm/chat/page.tsx` computes `hasRag` server-side from existence of >=1 row in `client_files` per client (Set-based); `chat-panel.tsx` renders `DEGRADED_NOTICE` badge only when `!activeClient.hasRag` |
| 8 | Zero código/coluna/env Tropicalia em app/lib/components/env | VERIFIED | `grep -riE "tropicalia" app lib components` returns empty; `lib/tropicalia/` directory does not exist; `.env.local.example` has no `TROPICALIA_API_KEY`; `clients.ts` has no provisioning/retry code; migration `0012` drops `tropicalia_project_id` column (confirmed applied to hosted DB by orchestrator via Supabase MCP `list_tables`) |

**Score:** 8/8 truths verified

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `supabase/migrations/0011_client_files.sql` | Table + RLS scoped (select/insert/delete) + GRANT same migration | VERIFIED | Contains `create table public.client_files`, 3 policies (`client_files_select_scoped`/`_insert_scoped`/`_delete_scoped`) using `is_admin()`/`pm_assigned_clients()` exactly mirroring `0010_messages.sql`, and `grant select, insert, delete on public.client_files to authenticated` in the same file |
| `supabase/migrations/0012_drop_tropicalia_project_id.sql` | Drop tropicalia_project_id column | VERIFIED | `alter table public.clients drop column tropicalia_project_id;` — 0006 (original add) left untouched |
| `supabase/tests/0005_rls_client_files_scoping_test.sql` | pgTAP proving select/insert/delete isolation | VERIFIED | `plan(4)`, seeds client_a fixture, asserts pm_a sees exactly 1 row for client_a / 0 for client_b / insert-for-client_b throws `%row-level security%` / delete-scoped works. Ran via `npx supabase test db`: reports `ok` |
| `lib/extract/extract-text.ts` | extractDocumentText + UnreadableFileError + MIN_CHARS | VERIFIED | Both exports present; unpdf (PDF)/mammoth (DOCX)/utf-8 passthrough (TXT/MD); MIN_CHARS=20 gate throws before any success return |
| `lib/actions/client-files.ts` | uploadClientFile/deleteClientFile/listClientFiles | VERIFIED | All three exported, RLS-scoped via `createClient()`, `clientId` never trusted beyond insert/filter value |
| `lib/client-files/limit.ts` | Shared FILE_LIMIT helper | VERIFIED | `FILE_LIMIT=3`, `atFileLimit`, `FILE_LIMIT_MESSAGE` — imported identically by both `client-files.ts` and `app/pm/chat/actions.ts` |
| `components/clients/client-files-section.tsx` | Upload/list/remove UI, >=40 lines | VERIFIED | 138 lines, full upload form + list + remove wired to Server Actions |
| `lib/chat/assemble-prompt.ts` | assembleSystemPrompt with files (filename/content) signature | VERIFIED | Signature is `(client: Briefing, files: ClientFileContext[])`; `filename` rendered in output |

### Key Link Verification

| From | To | Via | Status | Details |
|------|-----|-----|--------|---------|
| `app/api/chat/route.ts` | `public.client_files` | RLS-scoped select by client_id | WIRED | Line 69-72: `supabase.from("client_files").select("filename, content").eq("client_id", clientId)` using the same RLS-scoped client that resolved `client` |
| `app/api/chat/route.ts` | `lib/chat/assemble-prompt.ts` | `assembleSystemPrompt(client, files)` | WIRED | Line 97 |
| `lib/actions/client-files.ts` | `lib/extract/extract-text.ts` | `extractDocumentText` before insert | WIRED | Line 104 call precedes line 115 insert; failure path returns before insert |
| `app/pm/chat/actions.ts` | `public.client_files` | insert markdown from `buildKnowledgeMarkdown` | WIRED | Lines 76-94 |
| `app/pm/chat/page.tsx` | `public.client_files` | existence per client => hasRag | WIRED | Lines 19-33 |

### Behavioral Spot-Checks / Automated Suite (run directly by verifier, not trusted from SUMMARY)

| Check | Command | Result | Status |
|-------|---------|--------|--------|
| JS unit suite | `npm test` | 23/23 pass (lib/security, lib/chat incl. assemble-prompt leakage guard, lib/extract) | PASS |
| pgTAP | `npx supabase test db` | 0001-0005 all report `ok`; process exit 1 is the pre-existing cosmetic `rls_helpers.sql` no-plan issue (matches STATE.md 260716-bjk note, not a real test failure) | PASS |
| Typecheck | `npx tsc --noEmit` | 0 errors | PASS |
| Build | `npm run build` | Compiled successfully, all routes generated including `/api/chat`, `/pm/clients/[id]`, `/admin/clients/[id]` | PASS |
| Scope gate | `git diff --name-only <base> -- lib/security/ supabase/migrations/000[1-9]* supabase/tests/000[1-4]* rls_helpers.sql` | empty diff | PASS |
| Residual Tropicalia | `grep -riE tropicalia app lib components` | no matches | PASS |
| unpdf/mammoth load | `node -e "require('unpdf');require('mammoth')"` | loads without error | PASS |

### Requirements Coverage

| Requirement | Description | Status | Evidence |
|-------------|-------------|--------|----------|
| CLI-03 | Client files stored as extracted text in client_files, RLS-scoped | SATISFIED | migration 0011 + client-files.ts |
| CTX-01 | PM chats with AI scoped to client_files | SATISFIED | route.ts + assemble-prompt.ts |
| CTX-02 | Switching client switches entire knowledge base, no bleed | SATISFIED | assemble-prompt.test.ts leakage guard + route.ts always re-fetches per active clientId |
| CTX-03 | Manual curation only, nothing automatic | SATISFIED | saveKnowledge only invoked from explicit button click |
| CTX-04 | Saved knowledge inserted as new client_files row, no external upload | SATISFIED | saveKnowledge inserts into client_files directly |
| CTX-05 | AI responses generated via Claude API with server-assembled prompt | SATISFIED | route.ts calls anthropic.messages.stream with system from assembleSystemPrompt |

REQUIREMENTS.md and PROJECT.md text confirmed updated to describe the new mechanism (2026-07-22 dated decision, old decision preserved and marked "Superseded").

### Anti-Patterns Found

No blocking anti-patterns in any file touched by this quick task. Debt-marker scan (TBD/FIXME/XXX/TODO/HACK/PLACEHOLDER) across all 21 phase-relevant source files: zero matches.

**Info (non-blocking):** `README.md` and `CLAUDE.md` still describe the old Tropicalia-based RAG architecture (Tropicalia API, `tropicalia_project_id`, `lib/tropicalia/` directory reference, `TROPICALIA_API_KEY` env var) and were not in this quick task's `files_modified` list or must-haves scope (the truth "#8" was explicitly scoped to `app/lib/components/env`, which is clean). This is stale documentation debt worth a follow-up but does not block this task's goal — `.planning/PROJECT.md`, `.planning/REQUIREMENTS.md`, and `.planning/phases/02-client-isolated-ai-chat/02-06-PLAN.md` (the actual planning docs required by the plan) were all correctly updated.

### Human Verification Required

None for this quick task — all 11 tasks in `260722-hnm-PLAN.md` are `type="auto"` with automated verify commands, all of which were re-run directly by this verifier and passed. The separate `02-06-PLAN.md` phase-gate checkpoint (live chat + upload verification with a real `ANTHROPIC_API_KEY`) remains pending, but this is explicitly out of scope for this quick task (it predates this task and is a separate phase-gate artifact, correctly noted as a "Follow-up for Orchestrator" in SUMMARY.md rather than claimed as done).

### Gaps Summary

No gaps. All 8 observable truths, 8 required artifacts, and 5 key links from the plan's frontmatter are verified directly against the current codebase (not from SUMMARY.md self-report). The full automated verification chain (unit tests, pgTAP, typecheck, build, scope gate, residual-reference grep) was independently re-executed by this verifier and passed in every dimension. The orchestrator's additional hosted-Supabase application of migrations 0011/0012 (confirmed via Supabase MCP `list_tables`) is accepted as reported, since it was performed and confirmed by the orchestrator directly (not merely claimed by the executor, who had no MCP access in its worktree).

---

_Verified: 2026-07-22_
_Verifier: Claude (gsd-verifier)_
