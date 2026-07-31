---
phase: 03-content-production-kanban
plan: 07
subsystem: api
tags: [nextjs, server-actions, supabase, postgres, rls, zod, kanban]

# Dependency graph
requires:
  - phase: 03-content-production-kanban
    provides: "03-02's cards table + policies, 03-03's card_checklist_items + checklist-gate/checklist-snapshot modules"
provides:
  - "moveCard Server Action: places a card in any column, re-deciding legality server-side via evaluateMove (D-12/D-13)"
  - "createCard extended with stage/description/assigneeId and D-15 snapshot-on-create with a result-checked compensating delete"
  - "updateCardDetails Server Action for editing description/assignee post-creation"
  - "listClientPmRoster in lib/actions/clients.ts: privileged, client-scoped PM roster read for the assignee picker"
affects: ["03-08 (drag-and-drop UI wiring moveCard)", "03-09 (per-column create + description/assignee form controls)"]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Shared move-legality predicate (evaluateMove) imported by both the Server Action and the future drag handler, never reimplemented"
    - "Result-checked compensating delete: a failed rollback is escalated (console.error + distinct error message), never silently swallowed"
    - "Privileged roster read gated by an RLS-scoped visibility check performed FIRST, closing a cross-client membership oracle"

key-files:
  created: []
  modified:
    - lib/validation/cards.ts
    - app/pm/board/actions.ts
    - lib/actions/clients.ts

key-decisions:
  - "createCard defaults stage to 'briefing' when the caller omits it, preserving pre-D-14 behaviour of the top-level 'Criar card' button"
  - "moveCard needs no compensating delete (unlike createCard) — the card already existed, so the fail-safe is simply not moving it"
  - "listClientPmRoster performs its RLS visibility check on clients before touching the service-role client, returning [] rather than becoming a cross-client membership oracle"

patterns-established:
  - "isAssigneeMembershipError(): a tiny module-local helper mapping migration 0017's assignee_not_assigned_to_client exception token to a Portuguese message, reused by both createCard and updateCardDetails"

requirements-completed: [KAN-01, KAN-02, CHK-03]

# Metrics
duration: ~25min (continuation session, Tasks 2-3 only; Task 1 was completed and committed by a prior agent)
completed: 2026-07-31
---

# Phase 3 Plan 07: Content Card Server Actions (moveCard, updateCardDetails, createCard extension) Summary

**moveCard/updateCardDetails Server Actions plus a stage/description/assignee-aware createCard, all delegating move-legality and checklist-snapshot decisions to the shared lib/cards modules Task 1 shipped**

## Performance

- **Duration:** ~25 min (this continuation session — Task 1's migration/move-rules work was already committed by a prior agent at commit `2584038`)
- **Tasks:** 2 (Task 2, Task 3) — Task 1 confirmed already complete and left untouched
- **Files modified:** 3 (`lib/validation/cards.ts`, `app/pm/board/actions.ts`, `lib/actions/clients.ts`)

## Accomplishments
- `moveCard` Server Action: accepts a caller-supplied target stage (D-12), re-reads the card and its checklist through RLS, and delegates the legality decision entirely to `evaluateMove` — returning `MOVE_SKIPS_REVIEW_MESSAGE`/`GATE_BLOCKED_MESSAGE` verbatim so the drag path (03-08) shows byte-identical messages to the "Avançar" button
- `createCard` extended to accept an optional `stage` (D-14), `description` (D-16/D-18), and `assigneeId` (D-19), with a D-15 snapshot-on-create whose compensating delete checks its own result and escalates via `CARD_ROLLBACK_FAILED_ERROR` + `console.error` rather than swallowing a failed rollback
- `updateCardDetails` Server Action for editing description/assignee after creation, mapping the database's `assignee_not_assigned_to_client` trigger exception to Portuguese
- `listClientPmRoster` added to `lib/actions/clients.ts`: an RLS visibility check on `clients` runs before any privileged read, so a caller who cannot see the client gets `[]`, never a roster

## Task Commits

Each task was committed atomically:

1. **Task 1: Ship description/assignee columns, membership trigger, DELETE grant/policy, pgTAP, move-rules module** — `2584038` (feat, committed by prior agent, confirmed still on branch after worktree reset)
2. **Task 2: Build the moveCard Server Action** — `4e33f72` (feat)
3. **Task 3: Extend createCard, add updateCardDetails and listClientPmRoster** — `b488e21` (feat)

_Note: this executor picked up mid-plan after Task 1 was already committed; Tasks 2 and 3 are the new work in this session._

## Files Created/Modified
- `lib/validation/cards.ts` - added `CARD_STAGE_VALUES`, `moveCardSchema`/`MoveCardInput`, extended `createCardSchema` with `stage`/`description`/`assigneeId`, added `updateCardDetailsSchema`/`UpdateCardDetailsInput`
- `app/pm/board/actions.ts` - added `moveCard`, extended `createCard` (stage default, description/assignee insert, D-15 snapshot-on-create + result-checked compensating delete), added `updateCardDetails`, added the `isAssigneeMembershipError` helper and new error constants
- `lib/actions/clients.ts` - added `listClientPmRoster` (RLS visibility check on `clients` first, then a privileged, client-scoped `pm_clients`/`profiles` read)

## Decisions Made
- Followed the plan's exact task order (createCard's `targetStage` computed once and reused for both the insert and the D-15 snapshot check)
- Used the plan's specified constant names and literal Portuguese error strings verbatim (`ASSIGNEE_NOT_ON_CLIENT_ERROR`, `CARD_ROLLBACK_FAILED_ERROR`, `MOVE_FAILED_ERROR`) so the acceptance-criteria grep checks match exactly

## Deviations from Plan

None — plan executed exactly as written for Tasks 2 and 3. Task 1 was pre-existing (committed by a prior agent) and was read, not redone.

## Issues Encountered

- **Worktree HEAD drift:** at agent startup, `git rev-parse --abbrev-ref HEAD` correctly showed the `worktree-agent-*` branch, but `git merge-base HEAD <expected-base>` revealed the branch's history did not contain Task 1's commit at all (it pointed to unrelated Phase 5 commits). Per the `<worktree_branch_check>` protocol, ran `git reset --hard 09cdafc818380b5f6843674845fa881401d5d453` (confirmed clean working tree first) to correct the base before any work began. This is why Task 1's commit `2584038` appears in this plan's git history despite not being redone in this session.
- **`npm run build` fails in this worktree:** the worktree has no local `node_modules` (nor a symlink) — `tsc`/`eslint`/`node --test` all resolve dependencies via Node's parent-directory `node_modules` lookup (found at the main repo root), which works for those tools, but Turbopack's `next build` explicitly refuses to resolve the `next` package from outside the project directory for security reasons. This is a pre-existing environment/workspace-root limitation unrelated to any code in this plan — `npx tsc --noEmit`, `npm run lint`, and `npm test` (the automated verify commands actually specified by Tasks 2 and 3) all pass cleanly. Flagging for the orchestrator in case `npm run build` needs to be re-verified from the main worktree before merge.
- **`npx supabase test db` harness-level "Result: FAIL":** all ten `.sql` test files (`0001`–`0009` plus `rls_helpers.sql`) reported "ok" with zero `not ok` lines (`grep -c '^not ok'` → 0), including all 7 assertions in `0009_cards_assignee_membership_test.sql` (Task 1, unmodified in this session). The harness reports "FAIL" only because it globs `rls_helpers.sql` itself as a test file, which has no TAP plan — a pre-existing harness quirk, not a regression from this plan's SQL (which was not touched in this session).

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness
- Plan 03-08 can now wire `moveCard` into a drag-and-drop handler in `app/pm/board/board-panel.tsx`, importing the same `evaluateMove` for instant snap-back feedback
- Plan 03-09 can now build the per-column "+" trigger and description/assignee form controls against `createCard`'s new fields, `updateCardDetails`, and `listClientPmRoster`
- Recommend the orchestrator re-run `npm run build` from the main worktree (not this isolated agent worktree) before merge, given the Turbopack workspace-root limitation noted above

---
*Phase: 03-content-production-kanban*
*Completed: 2026-07-31*

## Self-Check: PASSED

- FOUND: lib/validation/cards.ts
- FOUND: app/pm/board/actions.ts
- FOUND: lib/actions/clients.ts
- FOUND: .planning/phases/03-content-production-kanban/03-07-SUMMARY.md
- FOUND commit: 4e33f72 (Task 2)
- FOUND commit: b488e21 (Task 3)
- FOUND commit: 2584038 (Task 1, pre-existing)
