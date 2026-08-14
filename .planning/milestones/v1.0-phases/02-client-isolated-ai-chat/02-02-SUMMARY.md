---
phase: 02-client-isolated-ai-chat
plan: 02
subsystem: api
tags: [zod, node:test, tdd, prompt-engineering, multi-tenancy]

# Dependency graph
requires:
  - phase: 01-client-records-isolated-rag-setup
    provides: clients table (name, objective, tone_of_voice, target_audience, content_pillars, tropicalia_project_id) and its RLS-scoped read pattern
provides:
  - lib/chat/assemble-prompt.ts (assembleSystemPrompt) — pure D-07 one-code-path briefing+retrieval prompt assembly
  - lib/chat/build-knowledge-markdown.ts (buildKnowledgeMarkdown) — pure Q/A transcript → curated markdown packaging
  - lib/chat/stale-response-guard.ts (shouldAppendChunk) — pure client-switch race-condition guard predicate
  - lib/validation/chat.ts (sendMessageSchema, saveKnowledgeSchema) — zod input validation for chat send + save-to-knowledge
affects: [02-03, 02-04, 02-05]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Pure, I/O-free lib/chat/*.ts modules with a sibling *.test.ts exercised via `node --test` — same discipline as lib/security/client-access-authz.ts"
    - "zod schemas in a new file per phase (lib/validation/chat.ts) rather than editing an existing validation file owned by another plan"

key-files:
  created:
    - lib/chat/assemble-prompt.ts
    - lib/chat/assemble-prompt.test.ts
    - lib/chat/build-knowledge-markdown.ts
    - lib/chat/build-knowledge-markdown.test.ts
    - lib/chat/stale-response-guard.ts
    - lib/chat/stale-response-guard.test.ts
    - lib/validation/chat.ts
  modified: []

key-decisions:
  - "System-prompt instructions placed AFTER the briefing/retrieval content (T-2-02 accept-disposition prompt-injection habit), not before"
  - "buildKnowledgeMarkdown sorts by created_at ascending internally rather than trusting caller-provided order — callers (Server Action) may pass rows in any order"
  - "content max length capped at 4000 chars in sendMessageSchema to bound Claude/Tropicalia payload size (Security Domain V5)"

patterns-established:
  - "Pattern: pure prompt/markdown/guard logic lives in lib/chat/*.ts with zero imports beyond types, verified by node:test with no mocking — the same isolation discipline as lib/security/*"

requirements-completed: [CTX-01, CTX-02, CTX-03, CTX-04, CTX-05]

# Metrics
duration: 2min
completed: 2026-07-21
---

# Phase 2 Plan 2: Pure Chat Logic Modules Summary

**Four pure, I/O-free TypeScript modules (system-prompt assembly, knowledge-markdown packaging, stale-response guard, zod schemas) each pinned by a green node:test suite proving cross-client isolation, D-07 degraded mode, and chronological message ordering.**

## Performance

- **Duration:** ~2 min
- **Started:** 2026-07-21T20:48:09Z
- **Completed:** 2026-07-21T20:49:46Z
- **Tasks:** 3
- **Files modified:** 7 (all new)

## Accomplishments
- `assembleSystemPrompt` proven — via an explicit leakage-guard test — to never leak a second client's name/briefing fields into the first client's prompt, and to still produce a briefing-inclusive prompt when `retrievedChunks` is empty (D-07 degraded mode, one code path).
- `shouldAppendChunk` extracted as a standalone pure predicate for the client-switch stale-response race condition (CTX-02, Pitfall #3), ready for the chat panel's `AbortController`-driven guard logic in 02-03/02-04.
- `buildKnowledgeMarkdown` proven to sort by `created_at` ascending regardless of input order and to include only the caller-provided messages — an excluded message's content never appears (CTX-03/CTX-04).
- `lib/validation/chat.ts` adds `sendMessageSchema` (uuid clientId, 1..4000-char content) and `saveKnowledgeSchema` (uuid clientId, uuid[] messageIds, min 1) as a new file, leaving `lib/validation/clients.ts` untouched.

## Task Commits

Each task was committed atomically:

1. **Task 1: Add the chat zod schemas (validation/chat.ts)** - `ee5ea89` (feat)
2. **Task 2: TDD assembleSystemPrompt + shouldAppendChunk** - `8ec4b42` (test, RED) → `46dbc53` (feat, GREEN)
3. **Task 3: TDD buildKnowledgeMarkdown** - `0ded041` (test, RED) → `00a677b` (feat, GREEN)

_TDD tasks each produced a RED test commit followed by a GREEN implementation commit, per plan._

## Files Created/Modified
- `lib/validation/chat.ts` - `sendMessageSchema`, `saveKnowledgeSchema` + inferred types
- `lib/chat/assemble-prompt.ts` - `assembleSystemPrompt(client, retrievedChunks)` pure prompt assembly
- `lib/chat/assemble-prompt.test.ts` - leakage-guard, degraded-mode, chunk-append, null-field tests
- `lib/chat/stale-response-guard.ts` - `shouldAppendChunk(requestClientId, activeClientId)` pure predicate
- `lib/chat/stale-response-guard.test.ts` - positive/negative client-switch cases
- `lib/chat/build-knowledge-markdown.ts` - `buildKnowledgeMarkdown(clientName, messages)` pure markdown builder
- `lib/chat/build-knowledge-markdown.test.ts` - selection, ordering, labeling tests

## Decisions Made
- System-prompt instructions placed after the briefing/retrieval content (T-2-02) rather than as a leading preamble — a low-cost prompt-injection mitigation carried over verbatim from 02-RESEARCH.md's code example.
- `buildKnowledgeMarkdown` performs its own `created_at` sort internally (non-mutating, via `[...messages].sort(...)`) rather than assuming the caller (Server Action's Supabase query) always supplies ascending order — cheaper to guarantee correctness in the pure layer than to rely on every future call site remembering `.order("created_at", { ascending: true })`.
- No other deviations from the plan's specified interfaces/signatures.

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
None.

## User Setup Required

None - no external service configuration required. (`@anthropic-ai/sdk` install and `ANTHROPIC_API_KEY`/`TROPICALIA_API_KEY` provisioning are scoped to later plans in this phase, per 02-RESEARCH.md's Environment Availability table.)

## Next Phase Readiness
- These four pure modules are the Wave 0 validation scaffolds that 02-04 (streaming Route Handler) and 02-05 (curation Server Action) import directly — no further scaffolding needed before those plans wire in Supabase/Tropicalia/Anthropic I/O around them.
- `node --test lib/chat/*.test.ts` is green (11/11 tests); no pure module in `lib/chat/*.ts` imports `@/lib/supabase`, `@anthropic-ai`, or `@/lib/tropicalia` (verified via grep).
- Not yet done (out of this plan's scope, tracked for later plans): `lib/tropicalia/client.test.ts` (CTX-05's `generate_answer: false` invariant), the `messages` table migration + pgTAP RLS test, and updating `package.json`'s `test` script glob to include `lib/chat/` (currently still `node --test lib/security/*.test.ts` only — noted here so a later plan doesn't silently lose `npm test` coverage of this directory).

---
*Phase: 02-client-isolated-ai-chat*
*Completed: 2026-07-21*

## Self-Check: PASSED

All 7 created files verified present on disk; all 5 task commits (`ee5ea89`, `8ec4b42`, `46dbc53`, `0ded041`, `00a677b`) verified present in git log.
