---
phase: quick/260811-imw
plan: 01
subsystem: ai
tags: [supabase, rls, pgtap, nextjs, server-actions, anthropic, prompt-assembly]

# Dependency graph
requires:
  - phase: 05-access-roles (05-01)
    provides: is_admin(), profiles.role/status app-layer check pattern
  - phase: quick/260810-ivr
    provides: clientTag-based prompt identification, T-ivr-03 prompt-injection-resistance ordering (trusted instruction always last)
  - phase: P0 pivot 2026-08-04 (checklist-templates.ts, clients.ts, structured-extraction.ts)
    provides: runStructuredExtraction shared engine, buildExtractionPrompt/assembleSystemPrompt modules, the 4 AI call-sites this plan extends
provides:
  - public.shared_knowledge_files table (no client_id) + RLS (select any authenticated, admin-only write) + pgTAP proof
  - lib/actions/shared-knowledge.ts (listSharedKnowledgeFiles/uploadSharedKnowledgeFile/deleteSharedKnowledgeFile, admin-gated)
  - /admin/shared-knowledge Admin screen + sidebar nav link
  - assembleSystemPrompt/buildExtractionPrompt/StructuredExtractionParams sharedFiles parameter, wired into the chat route and all 4 runStructuredExtraction call-sites
affects: [phase-04-client-approval-scheduling, phase-06-admin-oversight-dashboard, any future AI feature using runStructuredExtraction]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Cross-client (non-client-scoped) knowledge table pattern: RLS shape mirrors checklist_templates (select-all-authenticated + admin-only for-all write), not client_files' per-client scoping — used when content must reach every client's AI context regardless of active client"
    - "Required (non-optional) new parameter as a TypeScript forcing function to catch every call-site (sharedFiles here, mirrors clientTag from 260810-ivr)"

key-files:
  created:
    - supabase/migrations/0026_shared_knowledge_files.sql
    - supabase/tests/0014_rls_shared_knowledge_files_scoping_test.sql
    - lib/actions/shared-knowledge.ts
    - app/admin/shared-knowledge/page.tsx
    - components/admin/shared-knowledge-section.tsx
  modified:
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

key-decisions:
  - "Followed the plan's exact SQL/code in <interfaces> verbatim for the migration, pgTAP fixture-seed row, requireAdmin() shape, and the 4 call-site current-state quotes"
  - "Fixed 2 real pgTAP test bugs found via empirical reproduction against the plan's own exact test SQL: Postgres RLS silently excludes a USING-clause-failing row from UPDATE/DELETE (0-row no-op, no exception) rather than throwing 'row-level security' the way INSERT's WITH CHECK violation does — throws_like replaced with results_eq content/existence assertions for assertions 3 and 4"
  - "Tasks 1-4 executed and committed by this worktree; Task 5 (live human-verify checkpoint) is reserved for the orchestrator's live session, and the hosted Supabase migration push (project ancfwsgyzoostoidqzqj) is explicitly NOT attempted here — this worktree has no .env.local/hosted credentials by design, matching the established 260722-hnm/260805-kio/260805-fao/260810-g3f pattern"

patterns-established:
  - "Cross-client knowledge injection: sharedFiles is a REQUIRED 3rd/4th positional argument in assembleSystemPrompt/buildExtractionPrompt, rendered via the exact same non-empty-only single-ternary pattern as the existing per-client files block — zero behavioral change when the source table is empty"

requirements-completed: [QUICK-260811-imw]

# Metrics
duration: ~6min (Task 1 commit to Task 4 commit)
completed: 2026-08-11
---

# Quick Task 260811-imw: Preparar estrutura de base de conhecimento comum Summary

**Structural foundation for a cross-client "base de conhecimento comum" — new `public.shared_knowledge_files` table (no `client_id`) + RLS + pgTAP, an Admin-only `/admin/shared-knowledge` upload/list/delete screen, and a required `sharedFiles` parameter wired through `assembleSystemPrompt`/`buildExtractionPrompt`/`runStructuredExtraction` into the chat route and all 4 one-shot AI extraction call-sites — table starts empty (Juliano's document hasn't arrived), so zero behavioral change to any existing prompt today.**

## Performance

- **Duration:** ~6 min (Task 1 commit `4e9bc2b` to Task 4 commit `98a591a`)
- **Started:** 2026-08-11T13:45:31-03:00 (Task 1 commit)
- **Completed:** 2026-08-11T13:51:02-03:00 (Task 4 commit)
- **Tasks:** 4 of 5 (Task 5 is a `checkpoint:human-verify` gate reserved for the orchestrator's live session, per this run's constraints — not executed by this worktree)
- **Files modified:** 16 (5 created, 11 modified)

## Accomplishments

- **Task 1:** `public.shared_knowledge_files` (id/filename/file_type/content/created_at, no `client_id`) + RLS mirroring `checklist_templates` (select open to any authenticated, write admin-only via a single `for all` policy) + GRANT in the same migration. pgTAP suite `0014_rls_shared_knowledge_files_scoping_test.sql`: 6/6 assertions pass — PM and Client-role reads both succeed, PM insert/update/delete all correctly blocked, admin insert succeeds.
- **Task 2:** `lib/actions/shared-knowledge.ts` (list/upload/delete, all gated by a private `requireAdmin()` helper matching `generateChecklistFromFiles`'s app-layer check shape) + `/admin/shared-knowledge` Server Component page + `SharedKnowledgeSection` Client Component mirroring `client-files-section.tsx`'s list/upload/delete UI pattern (simplified: no `clientId`, no `FILE_LIMIT` badge).
- **Task 3 (TDD):** `assembleSystemPrompt`/`buildExtractionPrompt` both gain a required `sharedFiles` parameter rendered via the same non-empty-only pattern as the existing `files` block; `buildExtractionPrompt` inserts it before the trusted `instruction`, which stays strictly last (T-ivr-03 ordering, preserved). `StructuredExtractionParams` gains a required `sharedFiles` field. `app/api/chat/route.ts` fetches `shared_knowledge_files` (unfiltered, RLS-scoped client) and forwards it. RED confirmed (new assertions failed against the unmodified signatures), then GREEN (21/21 tests pass across both files).
- **Task 4:** All 4 `runStructuredExtraction` call-sites (`proposeChecklistFromFiles`, `runTranscriptAnalysis` — which gained its own `const supabase`, `autofillBriefingFromFiles`, `validateCardAgainstChecklist`) fetch and forward `shared_knowledge_files` via their already-in-scope RLS-scoped `supabase` client, resolving the Task 3 forcing-function typecheck break. `app/admin/layout.tsx` gained a `BookOpenIcon` sidebar item linking to `/admin/shared-knowledge` ("Base de conhecimento"), positioned last.

## TDD Gate Compliance

Task 3 (`tdd="true"`) followed the full RED → GREEN cycle:

- **RED** (`d80e5a7`): both test files updated to pass `[]` as the new required `sharedFiles` argument on every existing call, plus 5 new tests (3 in `assemble-prompt.test.ts`, 2 in `extraction-prompt.test.ts`). Run against the unmodified implementation: `node --test lib/chat/assemble-prompt.test.ts lib/ai/extraction-prompt.test.ts` → 3 new assertions failed with the expected "did not match" errors (sharedFiles content absent), confirming the tests actually exercise unshipped behavior.
- **GREEN** (`b553cca`): `assembleSystemPrompt`/`buildExtractionPrompt`/`structured-extraction.ts`/`app/api/chat/route.ts` implemented. Re-run: `21 tests, 21 pass, 0 fail`.
- Gate sequence confirmed in `git log`: `test(260811-imw): add failing tests...` (`d80e5a7`) precedes `feat(260811-imw): wire sharedFiles into...` (`b553cca`). No REFACTOR commit was needed (implementation was clean on first pass).

## Task Commits

Each task was committed atomically:

1. **Task 1: Migration + RLS + pgTAP for shared_knowledge_files** - `4e9bc2b` (feat)
2. **Task 2: Server Actions + Admin UI for shared-knowledge upload/list/delete** - `fafe86e` (feat)
3. **Task 3 (RED): add failing tests for sharedFiles in prompt-assembly modules** - `d80e5a7` (test)
3. **Task 3 (GREEN): wire sharedFiles into assembleSystemPrompt/buildExtractionPrompt/chat route** - `b553cca` (feat)
4. **Task 4: wire all 4 runStructuredExtraction call-sites + Admin nav link** - `98a591a` (feat)

**Plan metadata:** this SUMMARY.md, committed separately per this run's constraints (docs artifacts are not committed together with code changes; only this SUMMARY.md itself gets its own final docs-only commit so it survives worktree cleanup).

_Task 5 (the plan's live 8-step human-verify checkpoint: upload a test file, confirm it surfaces in chat across 2 different clients, confirm an extraction feature still completes, delete it, confirm the rule disappears from chat) is a `checkpoint:human-verify gate="blocking"` scoped to the ORCHESTRATOR's live session, per this run's constraints — not executed by this worktree._

## Files Created/Modified

- `supabase/migrations/0026_shared_knowledge_files.sql` - `public.shared_knowledge_files` table + RLS (select-all-authenticated, admin-only write) + GRANT, applied to LOCAL Supabase only
- `supabase/tests/0014_rls_shared_knowledge_files_scoping_test.sql` - 6-assertion pgTAP proof; 2 assertions rewritten from `throws_like` to `results_eq` after empirical reproduction showed UPDATE/DELETE silently no-op under RLS rather than throwing
- `lib/actions/shared-knowledge.ts` - `listSharedKnowledgeFiles`/`uploadSharedKnowledgeFile`/`deleteSharedKnowledgeFile`, each gated by `requireAdmin()`
- `app/admin/shared-knowledge/page.tsx` - Server Component rendering `SharedKnowledgeSection`
- `components/admin/shared-knowledge-section.tsx` - Client Component: list/upload/delete UI
- `lib/chat/assemble-prompt.ts` - `assembleSystemPrompt` gains required `sharedFiles: ClientFileContext[]`, rendered as `sharedKnowledgeBlock`
- `lib/chat/assemble-prompt.test.ts` - all existing calls updated (`[]` 3rd arg) + 3 new tests
- `lib/ai/extraction-prompt.ts` - `buildExtractionPrompt` gains required `sharedFiles: ExtractionFile[]`, inserted before the trusted `instruction`
- `lib/ai/extraction-prompt.test.ts` - all existing calls updated (`[]` 4th arg) + 2 new tests
- `lib/ai/structured-extraction.ts` - `StructuredExtractionParams.sharedFiles` (required), forwarded to `buildExtractionPrompt`
- `app/api/chat/route.ts` - fetches `shared_knowledge_files` unfiltered, forwards as `assembleSystemPrompt`'s 3rd argument
- `lib/actions/checklist-templates.ts` - `proposeChecklistFromFiles` fetches + forwards `sharedFiles`
- `lib/actions/client-files.ts` - `runTranscriptAnalysis` gains its own `const supabase`, fetches + forwards `sharedFiles`
- `lib/actions/clients.ts` - `autofillBriefingFromFiles` fetches + forwards `sharedFiles`
- `app/pm/board/actions.ts` - `validateCardAgainstChecklist` fetches + forwards `sharedFiles`
- `app/admin/layout.tsx` - new `BookOpenIcon` sidebar item, `/admin/shared-knowledge` ("Base de conhecimento")

## Decisions Made

- Followed the plan's exact SQL/code in `<interfaces>` verbatim — migration DDL/RLS/GRANT shape, pgTAP fixture-seed row and identity UUIDs, `requireAdmin()`'s shape (copied from `generateChecklistFromFiles`), and the 4 call-site current-state quotes all matched what the plan described before editing.
- Fixed 2 real, plan-inherited pgTAP test bugs (Rule 1 — auto-fix bugs): `throws_like` on UPDATE/DELETE against a row a non-admin's `USING` clause excludes does not throw in Postgres (unlike INSERT's `WITH CHECK` violation) — it silently affects 0 rows. Reproduced empirically (`no exception thrown` in the pgTAP output) before rewriting assertions 3-4 as `results_eq` checks that the row's content/existence is unchanged. This is the same class of pgTAP test-writing bug this project has fixed several times before (see STATE.md: 260715-ca2, 260716-bjk).
- Stopped after Task 4 as instructed: did not attempt Task 5 (the live checkpoint) and did not push migration 0026 to the hosted Supabase project, since both require the orchestrator's live session / hosted credentials this isolated worktree does not have.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Fixed 2 broken pgTAP assertions in the plan's own exact test SQL (Task 1)**
- **Found during:** Task 1, first `npx supabase test db` run after applying migration 0026 locally
- **Issue:** Assertions 3 and 4 of `0014_rls_shared_knowledge_files_scoping_test.sql` (written verbatim from the plan's `<interfaces>` block) used `throws_like(..., '%row-level security%', ...)` on UPDATE/DELETE statements run as `pm_a`. Both failed with "no exception thrown" — Postgres RLS excludes a row from UPDATE/DELETE silently (0 rows affected) when the `USING` clause fails for a non-admin, it does not raise an exception the way INSERT's `WITH CHECK` violation does.
- **Fix:** Replaced both `throws_like` assertions with `results_eq` checks — run the UPDATE/DELETE as `pm_a`, then assert the row's `content` (for UPDATE) or existence count (for DELETE) is unchanged, proving the write had zero effect.
- **Files modified:** `supabase/tests/0014_rls_shared_knowledge_files_scoping_test.sql`
- **Verification:** `npx supabase test db` — `0014_rls_shared_knowledge_files_scoping_test.sql` now shows 6/6 `ok`, full suite `Files=15, Tests=66`, only the pre-existing `rls_helpers.sql` cosmetic glob non-issue remains (documented in the plan's own `<done>` criteria as a non-regression).
- **Committed in:** `4e9bc2b` (Task 1 commit)

---

**Total deviations:** 1 auto-fixed (1 test bug, Rule 1)
**Impact on plan:** The fix was necessary to make Task 1's own stated verification (`npx supabase test db` shows 6/6 assertions passing) achievable — without it, the plan's exact verbatim SQL could never pass. No scope creep; the migration/RLS shape itself was untouched, only the test assertions.

## Issues Encountered

None beyond the pgTAP test bug documented above. `node_modules` was missing in this worktree (expected, per this run's constraints) and was restored via `npm ci` before Task 1, zero new dependencies introduced. Local Supabase Docker stack was already running and healthy.

## User Setup Required

**Hosted Supabase migration push still owed by the orchestrator.** Migration `0026_shared_knowledge_files.sql` was applied to the LOCAL Docker Supabase stack only (`npx supabase db reset`) — this worktree has no `.env.local`/hosted credentials by design, matching the established pattern from quick tasks 260722-hnm, 260805-kio, 260805-fao, and 260810-g3f. Before Task 5's live checkpoint can meaningfully exercise production, the orchestrator must run `npx supabase db push` against the hosted project (`ancfwsgyzoostoidqzqj`) and confirm via `npx supabase migration list`/`npx supabase db dump` that migration 0026 is actually live, same verification sequence as 260805-kio's Task 3.

## Next Phase Readiness

Tasks 1-4 complete: schema/RLS/pgTAP, Server Actions/Admin UI, prompt-assembly wiring (both modules + the chat route), and all 4 `runStructuredExtraction` call-sites + Admin nav link are all built, tested (`tsc`/`eslint`/`build`/`npm test` 97/97 all green project-wide), and committed. The table remains genuinely empty (its real, intended state until Juliano's cross-client document arrives) — confirmed by Task 3's byte-identical-when-empty backward-compatibility tests.

**Remaining before this quick task can close:**
1. Orchestrator pushes migration `0026` to the hosted Supabase project (`ancfwsgyzoostoidqzqj`) and verifies it landed (see "User Setup Required" above).
2. Orchestrator runs Task 5's 8-step live checkpoint against a real browser session (upload a test file at `/admin/shared-knowledge`, confirm it surfaces in `/pm/chat` for two different clients, confirm one AI extraction feature still completes without error, delete the test file, confirm the rule stops surfacing).

## Self-Check: PASSED

- FOUND: supabase/migrations/0026_shared_knowledge_files.sql
- FOUND: supabase/tests/0014_rls_shared_knowledge_files_scoping_test.sql
- FOUND: lib/actions/shared-knowledge.ts
- FOUND: app/admin/shared-knowledge/page.tsx
- FOUND: components/admin/shared-knowledge-section.tsx
- FOUND: lib/chat/assemble-prompt.ts
- FOUND: lib/chat/assemble-prompt.test.ts
- FOUND: lib/ai/extraction-prompt.ts
- FOUND: lib/ai/extraction-prompt.test.ts
- FOUND: lib/ai/structured-extraction.ts
- FOUND: app/api/chat/route.ts
- FOUND: lib/actions/checklist-templates.ts
- FOUND: lib/actions/client-files.ts
- FOUND: lib/actions/clients.ts
- FOUND: app/pm/board/actions.ts
- FOUND: app/admin/layout.tsx
- FOUND commit: 4e9bc2b
- FOUND commit: fafe86e
- FOUND commit: d80e5a7
- FOUND commit: b553cca
- FOUND commit: 98a591a

---
*Phase: quick/260811-imw*
*Completed: 2026-08-11*
