---
phase: quick/260810-ivr
plan: 01
subsystem: ai
tags: [prompt-engineering, anthropic, structured-extraction, client-isolation]

# Dependency graph
requires:
  - phase: quick/260810-g3f
    provides: "public.clients.tag column (migration 0025), NOT NULL, case-insensitive unique, populated for all 5 real clients"
provides:
  - "assembleSystemPrompt renders client.tag as a labeled reference code and instructs the model to anchor identification on it, not name"
  - "buildExtractionPrompt does the same, with clientTag as a new positional argument, task instruction still positioned last"
  - "StructuredExtractionParams.clientTag forwarded end-to-end by all 4 runStructuredExtraction callers (checklist generation, checklist draft-on-upload, briefing autofill, transcript analysis, card validation)"
  - "Chat route's clients select includes tag"
affects: [chat, checklist-generation, briefing-autofill, transcript-analysis, card-validation]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Client identification in AI prompts anchors on a developer-controlled short code (tag), not the free-text name, closing an ambiguous-name leakage vector"

key-files:
  created: []
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

key-decisions:
  - "buildExtractionPrompt's signature changed positionally (clientName, clientTag, files, instruction) rather than an options-object refactor, matching the module's existing style and keeping the diff minimal"
  - "StructuredExtractionParams.clientTag is required (no optional/default fallback) so TypeScript force-breaks every caller until it forwards tag — used deliberately as the forcing function for Task 3"
  - "Every tag re-read rides the SAME .select(...) call that already reads name at that exact call-site — no new query, no new RLS/authorization boundary (T-ivr-05, accepted)"

patterns-established:
  - "AI prompt identity signal: 'Cliente (código de referência: TAG): Nome' plus an explicit anti-confusion instruction, used identically in both the multi-turn chat system prompt and the one-shot extraction prompt"

requirements-completed: [QUICK-260810-ivr]

# Metrics
duration: ~25min
completed: 2026-08-10
---

# Quick Task 260810-ivr Summary

**AI prompt-assembly (chat system prompt + one-shot structured-extraction prompt) now identifies the active client by `public.clients.tag`, a short unambiguous reference code, instead of relying on `name` alone — closing a real production bug where a client's own uploaded file mentioned an ambiguous name and confused which client the AI was talking about.**

## Performance

- **Duration:** ~25 min
- **Completed:** 2026-08-10
- **Tasks:** 3
- **Files modified:** 10

## Accomplishments
- `assembleSystemPrompt` (lib/chat/assemble-prompt.ts) renders the client's `tag` as a labeled reference code (`Cliente (código de referência: TAG): Nome`) and the preamble now explicitly instructs the model to use the code — not the name — as the real identification key, and to never confuse the client with other companies/people named inside the client's own files.
- `buildExtractionPrompt` (lib/ai/extraction-prompt.ts) does the identical thing for the shared one-shot structured-extraction prompt used by checklist generation, checklist draft-on-upload, briefing autofill, transcript analysis, and card-vs-checklist validation. The trusted task `instruction` parameter still stays last in the assembled prompt (prompt-injection-resistance pattern, T-ivr-03, preserved).
- `StructuredExtractionParams.clientTag` (required) is forwarded end-to-end by `runStructuredExtraction` and by all 4 call-sites, each independently re-reading `tag` from the same RLS-scoped `clients` query already reading `name` at that exact spot — zero new queries, zero authorization changes.
- Leakage-guard test suites in both modules extended: existing assertions still pass with `tag` added to fixtures, plus 2 new tests per module (4 total) proving the tag renders as the identifier and remains the identifier even when a client's own file content mentions another client's name in full.

## Task Commits

Each task was committed atomically (rebased after execution to land on the correct base commit — see Deviations):

1. **Task 1: Redefine the prompt contracts — tag as the client identifier, both modules** - `4405350` (feat)
2. **Task 2: Wire tag through the structured-extraction engine and the chat route** - `d0f2336` (feat)
3. **Task 3: Forward tag from all 4 runStructuredExtraction call-sites** - `a650977` (feat)

## Files Created/Modified
- `lib/chat/assemble-prompt.ts` - `Briefing.tag` added; `briefingBlock` renders the labeled reference code; preamble instructs the model to anchor identification on it
- `lib/chat/assemble-prompt.test.ts` - fixtures gain `tag`; 2 new tests (tag renders as identifier; tag remains identifier when a file mentions another client's name in full)
- `lib/ai/extraction-prompt.ts` - `buildExtractionPrompt` signature gains `clientTag` (2nd positional arg); renders + instructs identically to assemble-prompt.ts, before the files block, task instruction stays last
- `lib/ai/extraction-prompt.test.ts` - `clientTag` added to every existing call; 2 new tests mirroring assemble-prompt.test.ts's new coverage
- `lib/ai/structured-extraction.ts` - `StructuredExtractionParams.clientTag` (required); forwarded to `buildExtractionPrompt` as its new 2nd positional arg
- `app/api/chat/route.ts` - `clients` select gains `tag`, satisfying the extended `Briefing` type with no other line changed
- `lib/actions/checklist-templates.ts` - `proposeChecklistFromFiles` takes `tag`, forwards `clientTag`; both callers (`generateChecklistFromFiles`, `generateChecklistDraftFromFiles`) re-read and forward `tag`
- `lib/actions/client-files.ts` - `resolveTranscriptTarget` re-reads `tag`; `runTranscriptAnalysis` forwards `clientTag`
- `lib/actions/clients.ts` - `autofillBriefingFromFiles` re-reads and forwards `tag`
- `app/pm/board/actions.ts` - `validateCardAgainstChecklist` re-reads and forwards `tag`

## Decisions Made
None beyond what the plan already specified (positional signature, required `clientTag` as forcing function, same-query tag re-read) — followed plan as specified.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Bootstrapped node_modules in the worktree**
- **Found during:** Task 3's `npm run build` verification step
- **Issue:** The worktree had no `node_modules` of its own; `npx tsc`/`eslint`/`node --test` had silently succeeded earlier by resolving packages via Node's upward directory search into the main repo checkout, but Turbopack's `next build` performs stricter workspace-root detection and failed with "couldn't find the Next.js package from the project directory."
- **Fix:** Ran `npm ci` inside the worktree (pre-authorized as an established pattern for this session per the executor's constraints — purely local infra, no lockfile drift).
- **Files modified:** none (node_modules is gitignored infra, not committed)
- **Verification:** `npm run build` and `npm test` both ran clean afterward (89/89 tests, build succeeded)

**2. [Rule 3 - Blocking] Corrected the worktree's base commit via rebase**
- **Found during:** Post-Task-3, while double-checking the plan's `files_modified` scope with `git diff --stat`
- **Issue:** The startup `<worktree_branch_check>` merge-base check was run and its actual output (`63301de...`, one commit behind the target `3319e37...`) was misread as matching the target, so no reset happened before work began. This meant the 3 task commits were built on a base missing one prior docs-only commit (`3319e37`, which only added the plan's own PLAN.md file — no code overlap).
- **Fix:** `git rebase 3319e3790995d3ac062efdec90035ffe219b8f60` — a clean, conflict-free replay of all 3 task commits onto the correct base (zero file overlap between the missing commit and any file this plan touches).
- **Files modified:** none (rebase only rewrote commit ancestry, not content)
- **Verification:** Post-rebase, `git merge-base --is-ancestor 3319e37... HEAD` confirmed the correct base is now an ancestor; `tsc --noEmit`, `npm test` (89/89), and `npm run build` were all re-run clean after the rebase; `git diff --stat` against the correct base now shows exactly the plan's 10 `files_modified` entries, nothing more.

---

**Total deviations:** 2 auto-fixed (both Rule 3 - blocking, both infra/process, zero code-content changes)
**Impact on plan:** No scope creep — both fixes were process corrections (dependency bootstrap, commit-ancestry correction) needed to reach a verifiable, mergeable state. All code changes match the plan exactly.

## Issues Encountered
See Deviations above — both were caught and resolved before finishing, with a full clean re-verification (tsc/eslint/build/test) after the rebase.

## Next Phase Readiness
- Both prompt-assembly modules and all 5 AI-touching features (chat, checklist generation, checklist draft-on-upload, briefing autofill, transcript analysis, card validation) now anchor client identification on `tag`, closing item 3 of the 2026-08-05 Juliano P0/P1 action plan.
- No blockers. Zero migrations, zero RLS changes, zero UI changes, as scoped.
- Next P0/P1 items per STATE.md: (4) attach file at client creation, (5) remove PM-listing column, (6) content prompt rewrite, (7) chat/Kanban formatting parity, (8) centralize AI model constant, (9) shared knowledge base.

---
*Phase: quick/260810-ivr*
*Completed: 2026-08-10*

## Self-Check: PASSED

All 10 `files_modified` paths and the SUMMARY.md itself found on disk; all 3 task commit hashes (`4405350`, `d0f2336`, `a650977`) found in git log.
