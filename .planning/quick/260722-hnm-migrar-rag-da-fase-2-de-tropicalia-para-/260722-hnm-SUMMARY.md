---
task: 260722-hnm
subsystem: RAG / Client Context Storage
tags: [supabase, rls, rag-migration, file-upload, chat, tropicalia-removal]
dependency-graph:
  requires: [Phase 1 (clients table), Phase 2 02-01..02-05 (chat/messages/RLS scaffolding)]
  provides: [public.client_files table + RLS, lib/extract text extraction, client-files upload UI, chat/curation on client_files]
  affects: [app/api/chat/route.ts, app/pm/chat/*, app/pm/clients/*, app/admin/clients/*, lib/actions/clients.ts]
tech-stack:
  added: [unpdf@^1.6.2, mammoth@^1.12.0]
  patterns: [RLS-scoped read/insert/delete on client_files mirroring 0010_messages.sql, extraction-before-insert with hard block on failure]
key-files:
  created:
    - supabase/migrations/0011_client_files.sql
    - supabase/migrations/0012_drop_tropicalia_project_id.sql
    - supabase/tests/0005_rls_client_files_scoping_test.sql
    - lib/extract/extract-text.ts
    - lib/extract/extract-text.test.ts
    - lib/client-files/limit.ts
    - lib/actions/client-files.ts
    - components/clients/client-files-section.tsx
  modified:
    - lib/actions/clients.ts
    - lib/anthropic/client.ts
    - lib/validation/clients.ts
    - lib/chat/assemble-prompt.ts
    - lib/chat/assemble-prompt.test.ts
    - lib/chat/stale-response-guard.ts
    - lib/chat/build-knowledge-markdown.ts
    - lib/validation/chat.ts
    - app/api/chat/route.ts
    - app/pm/chat/actions.ts
    - app/pm/chat/page.tsx
    - app/pm/chat/chat-panel.tsx
    - app/pm/clients/page.tsx
    - app/pm/clients/[id]/page.tsx
    - app/admin/clients/page.tsx
    - app/admin/clients/[id]/page.tsx
    - components/clients/client-detail-form.tsx
    - .env.local.example
    - package.json
    - .planning/phases/02-client-isolated-ai-chat/02-06-PLAN.md
    - .planning/PROJECT.md
    - .planning/REQUIREMENTS.md
  deleted:
    - lib/tropicalia/client.ts
    - lib/tropicalia/client.test.ts
decisions:
  - "Extraction failure (parse error or below-MIN_CHARS result) always blocks the client_files insert with a friendly message — never persists empty/garbage content (T-hnm-03, locked in CONTEXT.md)."
  - "Shared FILE_LIMIT=3 helper (lib/client-files/limit.ts) enforced identically by both the direct-upload Server Action and the chat curation Server Action, since both write to client_files."
  - "client_id is never trusted from the request body anywhere in the new code paths — always resolved via the RLS-scoped Supabase client, with the client_files_*_scoped policies as the actual authorization boundary (T-hnm-01)."
metrics:
  duration: "~1h"
  completed: "2026-07-22"
---

# Quick Task 260722-hnm: Migrar RAG de Tropicalia para Supabase Summary

RAG isolation for client-scoped AI chat now runs entirely on Supabase: client-uploaded files (PDF/TXT/MD/DOCX, capped at 3/client) are extracted to plain text with `unpdf`/`mammoth` and stored verbatim in a new RLS-scoped `public.client_files` table, injected in full into the chat system prompt on every turn — no embeddings, no external RAG service, no async indexing wait.

## What Was Built

All 11 tasks from the plan executed in strict dependency order, each committed atomically:

1. **`supabase/migrations/0011_client_files.sql`** — new `public.client_files` table (id, client_id, filename, file_type, content, created_at), 3 RLS policies (`client_files_select_scoped` / `_insert_scoped` / `_delete_scoped`) mirroring `0010_messages.sql`'s `is_admin()`/`pm_assigned_clients()` pattern, GRANT in the same migration. `supabase/tests/0005_rls_client_files_scoping_test.sql` (pgTAP, plan(4)) proves select/insert/delete isolation between `client_a`/`client_b`.
2. **`lib/extract/extract-text.ts`** — `extractDocumentText(buffer, fileType)` using `unpdf` (PDF) / `mammoth` (DOCX) / UTF-8 passthrough (TXT/MD), throwing `UnreadableFileError` below `MIN_CHARS=20` so a scanned/empty file can never silently persist as empty content. `unpdf`+`mammoth` installed without `@napi-rs/canvas` (text-only, no native deps).
3. Removed Tropicalia entirely from the client-creation layer (`lib/actions/clients.ts`): deleted `lib/tropicalia/client.ts` + its test, removed auto-provisioning and `retryTropicaliaProvisioning`, added migration `0012_drop_tropicalia_project_id.sql` (DROP COLUMN), scrubbed `.env.local.example` and residual comments.
4. Removed the Tropicalia RAG status UI (section, badge, retry button, `canRetry`/`tropicalia_project_id` props) from `client-detail-form.tsx` and both client list/detail pages.
5. **`lib/client-files/limit.ts`** (shared `FILE_LIMIT=3`/`atFileLimit`), **`lib/actions/client-files.ts`** (`listClientFiles`/`uploadClientFile`/`deleteClientFile`, extension+size validation before extraction, extraction failure blocks insert), **`components/clients/client-files-section.tsx`** (upload/list/remove UI), wired into `client-detail-form.tsx` after "PMs atribuídos".
6. Rewrote `lib/chat/assemble-prompt.ts` (`files: {filename, content}[]` replaces `retrievedChunks`) and `app/api/chat/route.ts` (fetches `client_files` via the same RLS-scoped client that resolved the active client, no Tropicalia retrieval).
7. Rewrote `saveKnowledge` (`app/pm/chat/actions.ts`) to insert curated markdown directly into `client_files` (file_type: "markdown"), applying the shared file limit — this is where the code returns to a fully-compiling state after Task 3's intentionally transitional broken-import window.
8. `app/pm/chat/page.tsx` computes `hasRag` from the existence of >=1 `client_files` row per client (RLS-scoped select + Set); `chat-panel.tsx`'s badge text updated to "Nenhum arquivo de referência...".
9. Rewrote `.planning/phases/02-client-isolated-ai-chat/02-06-PLAN.md`'s live-verification checkpoints for the new architecture (upload -> immediate chat reflection -> curation, no Tropicalia/async-indexing language).
10. Updated `.planning/PROJECT.md` (RAG/isolation constraints, new dated Key Decision, old decision marked superseded but preserved) and `.planning/REQUIREMENTS.md` (CLI-03/CTX-01/CTX-04/CTX-05 mechanism descriptions reworded; requirements themselves unchanged).
11. Full scope gate + verification: `npm test` (23/23 pass across lib/security, lib/chat, lib/extract), `npx supabase test db` (0001-0005 all "ok", cosmetic non-zero harness exit per STATE.md 260716-bjk), `npx tsc --noEmit` (0 errors), `npm run build` (success), scope-gate diff confirms `lib/security/*`, migrations 0001-0010, `rls_helpers.sql`, and tests 0001-0004 untouched, and zero `tropicalia` references remain anywhere under `app/lib/components`.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Residual Tropicalia mentions outside the plan's `files_modified` list**
- **Found during:** Task 11's final scope-gate grep.
- **Issue:** Doc-comment references to "Tropicalia" survived in `lib/chat/stale-response-guard.ts`, `lib/chat/build-knowledge-markdown.ts`, and `lib/validation/chat.ts` (files not listed in the plan's `files_modified` frontmatter, since they were never functionally touched by Tasks 1-10), plus this quick task's own descriptive header comments in `lib/client-files/limit.ts` and `lib/extract/extract-text.ts`. Task 11's own verify command (`! grep -riqE "tropicalia" app lib components`) requires zero matches project-wide, not just in the files each earlier task edited.
- **Fix:** Comment-only edits removing the word "Tropicalia" from all five files (no behavior change).
- **Files modified:** `lib/chat/stale-response-guard.ts`, `lib/chat/build-knowledge-markdown.ts`, `lib/validation/chat.ts`, `lib/client-files/limit.ts`, `lib/extract/extract-text.ts`.
- **Commit:** `68fb554`

No other deviations — the plan's 11 tasks executed as written, including the intentionally transitory broken-import state between Task 3 (deletes `lib/tropicalia/client.ts`) and Task 7 (removes the last import of it in `app/pm/chat/actions.ts`), which was called out in the plan itself and confirmed via `npx tsc --noEmit` at each step (2 expected errors after Task 3/5/6, 0 errors after Task 7).

### Auth Gates

None encountered — this task required no external service authentication (Tropicalia is being removed, not called; `ANTHROPIC_API_KEY`/Supabase local stack were already configured from prior phase work).

## Follow-ups for Orchestrator

- **Hosted Supabase migration not applied.** This worktree session has no `mcp__supabase__*` tools available, so migrations `0011_client_files.sql` and `0012_drop_tropicalia_project_id.sql` were applied and verified only against the **local** `supabase start` stack (`npx supabase db reset` + `npx supabase test db`, both green). Per the plan's own instructions this is NOT required for autonomous completion of this quick task, but the orchestrator (which does have MCP access) should apply both migrations to the hosted project `ancfwsgyzoostoidqzqj` for consistency with the rest of the schema, and re-run the RLS/GRANT check there (hosted auto-grants base-table privileges at provisioning, unlike local `supabase start` — the GRANT is already in the same migration per the established pattern, so this should be a no-op confirmation, not a fix).
- **02-06 live-verification checkpoint remains pending** (unchanged from before this task — it's a separate phase-gate plan, not part of this quick task's scope). Its content was rewritten in Task 9 to match the new architecture; it still needs a human to actually run it once `ANTHROPIC_API_KEY` is available in a live session.

## Known Stubs

None. No hardcoded empty/placeholder data was introduced — `listClientFiles` reads real rows, the upload/curation paths write real rows, and the chat route injects real `client_files` content.

## Threat Flags

None beyond what the plan's own `<threat_model>` already covers (T-hnm-01 through T-hnm-05, T-hnm-SC) — no new network endpoints, auth paths, or trust-boundary schema changes were introduced beyond what's already documented there.

## Self-Check: PASSED

- All 8 spot-checked created files present on disk (migrations, tests, extract module, actions, limit helper, UI section, assemble-prompt).
- All 11 per-task commit hashes (`f1a74ab`, `6a1c1d7`, `5c7123c`, `97aaf48`, `c85f3a7`, `5d48df7`, `c3bc282`, `2c62b8c`, `e04993f`, `367d1a6`, `68fb554`) confirmed present in `git log`.
- Full Task 11 verify chain re-run end-to-end immediately before writing this summary: `npm test` (23/23 pass) && pgTAP 0001-0005 all "ok" && `npx tsc --noEmit` (clean) && `npm run build` (success) && scope-gate diff clean && zero `tropicalia` matches in `app/lib/components` → printed `ok`.
