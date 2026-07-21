---
phase: 02-client-isolated-ai-chat
plan: 03
subsystem: api
tags: [anthropic-sdk, tropicalia, rag, server-only, tdd]

# Dependency graph
requires:
  - phase: 01-client-records-isolated-rag-setup
    provides: lib/tropicalia/client.ts (createTropicaliaProject, TROPICALIA_API_KEY convention)
provides:
  - "@anthropic-ai/sdk installed and wrapped in a server-only singleton (lib/anthropic/client.ts)"
  - "searchTropicaliaProject (retrieval, generate_answer:false pinned by test)"
  - "uploadTropicaliaDocument (multipart curated-document upload)"
affects: [02-04-chat-route-handler, 02-05-memory-curation-action]

# Tech tracking
tech-stack:
  added: ["@anthropic-ai/sdk ^0.112.4"]
  patterns:
    - "Server-only client factory: module-level singleton cache (getAnthropicClient), mirrors lib/supabase/admin.ts doc-comment discipline"
    - "Tropicalia fetch wrapper conventions extended (not forked): apiKey null-check-throws backstop, Bearer auth, AbortSignal.timeout, res.ok throw with endpoint name + status"

key-files:
  created:
    - lib/anthropic/client.ts
    - lib/tropicalia/client.test.ts
  modified:
    - package.json
    - package-lock.json
    - .env.local.example
    - lib/tropicalia/client.ts

key-decisions:
  - "generate_answer:false is hard-coded (not a parameter) in searchTropicaliaProject's request body and pinned by a unit test that mocks global.fetch and inspects the JSON body — Tropicalia never generates, Claude always does (CTX-05)"
  - "uploadTropicaliaDocument sets no manual Content-Type header on the multipart request, letting the runtime fetch implementation set the boundary; verified by asserting the header key is absent"

patterns-established:
  - "TDD RED/GREEN cycle for external-service wrapper invariants: mock global.fetch, assert on captured request body/headers rather than hitting the network"

requirements-completed: [CTX-01, CTX-04, CTX-05]

# Metrics
duration: 12min
completed: 2026-07-21
---

# Phase 2 Plan 3: Anthropic SDK + Tropicalia Search/Upload Summary

**Installed @anthropic-ai/sdk behind a server-only singleton factory, and extended lib/tropicalia/client.ts with generate_answer:false-pinned retrieval search and multipart document upload.**

## Performance

- **Duration:** ~12 min
- **Started:** 2026-07-21T20:38:00Z
- **Completed:** 2026-07-21T20:49:54Z
- **Tasks:** 2
- **Files modified:** 6 (2 created, 4 modified)

## Accomplishments
- `@anthropic-ai/sdk` installed (pinned `^0.112.4`, RESEARCH-approved, no postinstall script) and wrapped in `lib/anthropic/client.ts`'s `getAnthropicClient()` module-level singleton — server-only, reads `process.env.ANTHROPIC_API_KEY` (never `NEXT_PUBLIC_`).
- `lib/tropicalia/client.ts` extended with `searchTropicaliaProject` (POST `/v1/projects/{id}/search`, body always includes `generate_answer: false`) and `uploadTropicaliaDocument` (multipart `FormData`, no manual `Content-Type`), following the existing `createTropicaliaProject` conventions verbatim (apiKey null-check throw, Bearer auth, `AbortSignal.timeout`, `res.ok` throw).
- `generate_answer: false` invariant pinned by a RED→GREEN TDD unit test (`lib/tropicalia/client.test.ts`) that mocks `global.fetch` and asserts the captured JSON body, independent of query input.
- `.env.local.example` and `package.json`'s test glob updated for the new dependency and test suites.

## Task Commits

Each task was committed atomically:

1. **Task 1: Install @anthropic-ai/sdk, add the Anthropic client factory + env example** - `b573cef` (feat)
2. **Task 2 (RED): Add failing test for generate_answer:false invariant** - `4d34360` (test)
2. **Task 2 (GREEN): Implement searchTropicaliaProject + uploadTropicaliaDocument** - `171b0bd` (feat)

_Note: Task 2 was TDD (`tdd="true"`), producing separate test → feat commits._

## Files Created/Modified
- `lib/anthropic/client.ts` - `getAnthropicClient()` server-only singleton factory wrapping `new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })`
- `lib/tropicalia/client.test.ts` - node:test suite mocking `global.fetch`; pins `generate_answer:false`, `retrieval_contents ?? []` fallback, and absent `Content-Type` on upload
- `lib/tropicalia/client.ts` - added `TropicaliaRetrievalChunk` type, `searchTropicaliaProject`, `uploadTropicaliaDocument`; `createTropicaliaProject` unchanged
- `package.json` - added `@anthropic-ai/sdk` dependency; `test` script glob extended to `lib/security/*.test.ts lib/chat/*.test.ts lib/tropicalia/*.test.ts`
- `package-lock.json` - lockfile update from `npm install`
- `.env.local.example` - added `ANTHROPIC_API_KEY=` and `ANTHROPIC_CHAT_MODEL=` blocks mirroring the existing `TROPICALIA_API_KEY` comment style

## Decisions Made
- `generate_answer: false` is a hard-coded literal in the request body (not a caller-supplied parameter) — closes off any possibility of a caller accidentally flipping it. Verified by unit test, not just code review.
- Followed the plan's exact function signatures and endpoint paths from 02-RESEARCH.md Pattern 2/3 without deviation.

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
- `package.json`'s `test` script now references `lib/chat/*.test.ts`, a directory that does not exist yet (created in Plan 02-04). This was an explicit, deliberate instruction in this plan's Task 1 (\"single owner of package.json across Wave 1\"). Running `npm test` before 02-04 lands will fail to resolve that glob at the shell level. This is expected and self-resolves once 02-04 creates `lib/chat/*.test.ts`; not treated as a deviation since it was explicitly directed by the plan.

## User Setup Required

**External services require manual configuration** (per this plan's `user_setup` frontmatter):
- `ANTHROPIC_API_KEY` — source: Anthropic Console -> API Keys (https://console.anthropic.com). Required for Plan 02-04's chat Route Handler to function.
- `ANTHROPIC_CHAT_MODEL` — optional; defaults to `claude-sonnet-4-5` in code if unset.
- `TROPICALIA_API_KEY` — already placeholdered in `.env.local`; confirmed still empty as of 2026-07-16 per plan context — degraded mode (D-11 skip path) applies until supplied.

No .env.local values were set by this agent — these are local/deployment secrets the user must supply directly.

## Next Phase Readiness
- `getAnthropicClient()`, `searchTropicaliaProject`, and `uploadTropicaliaDocument` are ready for Plan 02-04 (chat Route Handler) and Plan 02-05 (memory curation action) to import.
- Both secrets (`ANTHROPIC_API_KEY`, `TROPICALIA_API_KEY`) remain server-only; confirmed no `"use client"` file imports either `lib/anthropic/client.ts` or `lib/tropicalia/client.ts` (only `lib/actions/clients.ts`, a `"use server"` file, imports the Tropicalia client).
- Real API keys still need to be supplied by the user before end-to-end chat can be exercised — flagged above under User Setup Required.

---
*Phase: 02-client-isolated-ai-chat*
*Completed: 2026-07-21*

## Self-Check: PASSED

- FOUND: lib/anthropic/client.ts
- FOUND: lib/tropicalia/client.test.ts
- FOUND: .planning/phases/02-client-isolated-ai-chat/02-03-SUMMARY.md
- FOUND commit: b573cef (Task 1)
- FOUND commit: 4d34360 (Task 2 RED)
- FOUND commit: 171b0bd (Task 2 GREEN)
- FOUND commit: 2367f46 (docs: SUMMARY)
- `node --test lib/tropicalia/client.test.ts` re-verified green (4/4 passing)
