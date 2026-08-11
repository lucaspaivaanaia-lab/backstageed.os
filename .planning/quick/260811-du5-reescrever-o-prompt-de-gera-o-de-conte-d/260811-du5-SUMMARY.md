---
phase: quick/260811-du5
plan: 01
subsystem: ai
tags: [prompt-engineering, chat, system-prompt, linkedin, formatting]

# Dependency graph
requires:
  - phase: quick/260810-ivr
    provides: "assembleSystemPrompt's tag-based client identification, the CURRENT state this plan builds on"
provides:
  - "assembleSystemPrompt's trusted preamble now carries user-approved LinkedIn formatting rules (no em dash, no asterisk, short paragraphs) and an edit-in-place correction instruction"
affects: [chat, content-generation]

# Tech tracking
tech-stack:
  added: []
  patterns: ["Trusted-preamble-only prompt additions, ordered strictly before client-controlled content (T-2-02)"]

key-files:
  created: []
  modified:
    - lib/chat/assemble-prompt.ts
    - lib/chat/assemble-prompt.test.ts

key-decisions:
  - "Inserted formattingBlock strictly between the existing preamble's last sentence and briefingBlock/filesBlock, preserving T-2-02 trusted-preamble-before-client-content ordering"
  - "Fixed a stale doc comment: T-2-02's own note said instructions are placed AFTER briefing/files content, when the code has always placed them BEFORE — corrected to match reality"

patterns-established:
  - "Prompt-text-only quick tasks add a new local const inside assembleSystemPrompt and splice it into the trusted preamble, never touching briefingBlock/filesBlock or the function signature"

requirements-completed: [QUICK-260811-du5]

# Metrics
duration: ~15min
completed: 2026-08-11
---

# Quick Task 260811-du5: LinkedIn Formatting + Edit-in-Place Chat Prompt Rules Summary

**Added the user-approved verbatim LinkedIn formatting rules (no em dash, no asterisk, short paragraphs) and an edit-in-place correction instruction to `assembleSystemPrompt`'s trusted preamble, with 3 new test cases proving presence and T-2-02 ordering.**

## Performance

- **Duration:** ~15 min
- **Tasks:** 1 completed
- **Files modified:** 2

## Accomplishments
- `assembleSystemPrompt` now instructs the model to never use em dash or asterisk, write short paragraphs (max 2 lines, blank line between), and optimize for LinkedIn readability
- `assembleSystemPrompt` now instructs the model to edit existing generated content in place and return the full corrected version on correction requests, instead of regenerating from scratch
- New instructions live inside the same trusted preamble as the existing T-2-02 note, strictly before `briefingBlock`/`filesBlock` — preserves the anti-prompt-injection ordering
- Fixed a stale doc-comment inaccuracy (T-2-02 said instructions are placed AFTER briefing/files content; the code has always placed them BEFORE)

## Task Commits

Each task was committed atomically:

1. **Task 1: Add formatting + edit-in-place instructions to the chat system prompt, with test coverage** - `a8991c0` (feat)

**Plan metadata:** (recorded by orchestrator after this summary)

## Files Created/Modified
- `lib/chat/assemble-prompt.ts` - Added `formattingBlock` const (verbatim user-approved text) spliced into the trusted preamble before `briefingBlock`/`filesBlock`; updated top doc comment (new 260811-du5 note + fixed AFTER→BEFORE inaccuracy in the T-2-02 note)
- `lib/chat/assemble-prompt.test.ts` - Added 3 new test cases: formatting-rules substrings, edit-in-place substrings, and before-briefing ordering check (T-2-02); all 7 pre-existing tests left unmodified

## Decisions Made
- Inserted `formattingBlock` strictly between the preamble's existing last sentence and `${briefingBlock}${filesBlock}`, per the plan's exact instruction — keeps it fully inside the trusted, pre-content preamble
- Took the constraint's drive-by fix: corrected the doc comment's stale claim that system instructions sit AFTER briefing/files content (they've always sat BEFORE) — same paragraph the plan already had me touching

## Deviations from Plan

None - plan executed exactly as written. The doc-comment AFTER→BEFORE fix was explicitly authorized as a drive-by fix in this task's dispatch constraints (not a deviation rule trigger).

## Issues Encountered

`node_modules` was not present in this worktree; ran `npm ci` per the dispatch constraints before running `tsc`/`eslint`/`test`. No other issues.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness
- No blockers. `lib/ai/extraction-prompt.ts` and `app/api/chat/route.ts` remain untouched, exactly as scoped.
- The new formatting/edit-in-place instructions take effect immediately for all chat-generated content once merged — no migration, no env var, no deploy step beyond the normal merge.

---
*Phase: quick/260811-du5*
*Completed: 2026-08-11*

## Self-Check: PASSED

- FOUND: lib/chat/assemble-prompt.ts
- FOUND: lib/chat/assemble-prompt.test.ts
- FOUND: .planning/quick/260811-du5-reescrever-o-prompt-de-gera-o-de-conte-d/260811-du5-SUMMARY.md
- FOUND: commit a8991c0
