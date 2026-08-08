---
phase: quick/260808-c9s
plan: 01
subsystem: ui
tags: [nextjs, server-actions, supabase, zod, kanban]

# Dependency graph
requires:
  - phase: 03-content-production-kanban (03-06)
    provides: Pacotes region above the board, createPiece Server Action, PackageRow's "Ver
      peças" dialog with per-piece rows
provides:
  - removePieceSchema (lib/validation/cards.ts) — shape-only validation for removePiece's
    single cardId argument
  - removePiece Server Action (app/pm/board/actions.ts) — re-reads the target card via RLS,
    rejects any card_type !== "piece" before deleting, revalidates /pm/board
  - PieceRow component (app/pm/board/board-panel.tsx) — per-piece delete trigger (Trash2Icon +
    AlertDialog confirmation) rendered as a sibling of the existing click-to-open-detail button
affects: [phase-03 follow-ups (deferred item 1 from 03-06's Task 3 checkpoint)]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "App-layer type check as the actual authorization boundary when the underlying RLS
      DELETE policy is deliberately client-scoped-only, not type-scoped (mirrors createPiece's
      own card_type !== 'package' check on its parent)"

key-files:
  created: []
  modified:
    - lib/validation/cards.ts
    - app/pm/board/actions.ts
    - app/pm/board/board-panel.tsx

key-decisions:
  - "No new migration — the existing cards_delete_scoped RLS policy (0017) already authorizes
    the delete; it deliberately stays client-scoped-only (not card_type-scoped) because
    createCard's D-15 compensating delete needs it to also cover single-type cards. The
    card_type='piece' restriction is enforced entirely inside removePiece, the app-layer
    boundary, not in RLS."
  - "PackageRow's piece row markup was restructured from a single outer <button> to an outer
    <div> containing an inner <button> (unchanged click-to-open-detail behavior) plus a sibling
    AlertDialog delete trigger — a nested interactive <button> inside another <button> is
    invalid HTML."
  - "PieceRow mirrors AttachmentRow's useTransition + confirmation-AlertDialog UI pattern, but
    adds its own local serverError state (AttachmentRow has none) so a failed delete surfaces
    via ErrorBox instead of failing silently."

requirements-completed: [KAN-01]

# Metrics
duration: 5min
completed: 2026-08-08
---

# Quick Task 260808-c9s: Excluir peça Summary

**Per-piece delete (trash icon + AlertDialog confirmation) inside a package's "Ver peças" dialog, backed by a removePiece Server Action that enforces card_type='piece' at the app layer since the underlying RLS DELETE policy is deliberately not type-scoped.**

## Performance

- **Duration:** ~5 min (Tasks 1-2 only; Task 3 is a blocking human-verify checkpoint reserved
  for the orchestrator's live session with the developer)
- **Started:** 2026-08-08T08:58:59-03:00 (pre-dispatch plan commit)
- **Completed:** 2026-08-08T09:03:31-03:00 (Task 2 commit)
- **Tasks:** 2 of 3 complete (Task 3 intentionally not executed by this agent — see below)
- **Files modified:** 3 (lib/validation/cards.ts, app/pm/board/actions.ts,
  app/pm/board/board-panel.tsx)

## Accomplishments
- `removePieceSchema`/`RemovePieceInput` (lib/validation/cards.ts) — a single-field `cardId`
  shape validator, matching `removeAttachmentSchema`'s pattern.
- `removePiece` Server Action (app/pm/board/actions.ts) — mirrors `createPiece`'s RLS-re-read +
  type-check structure: re-reads the target row (`id, card_type`) through the RLS-scoped
  client, returns `PIECE_NOT_FOUND_ERROR` if it doesn't resolve, returns
  `PIECE_MUST_BE_PIECE_ERROR` if `card_type !== "piece"`, otherwise deletes and revalidates
  `/pm/board`. This is the ONLY place `card_type='piece'` is enforced for a deletion — the
  underlying `cards_delete_scoped` RLS policy (0017) stays deliberately client-scoped-only, not
  type-scoped, because `createCard`'s D-15 compensating delete needs it to also cover
  `single`-type cards.
- `PieceRow` component (app/pm/board/board-panel.tsx) — extracted above `PackageRow`, matching
  `AttachmentRow`'s placement pattern. Renders the piece's title/stage badge inside an inner
  `<button>` (unchanged `onOpenDetail` click behavior) plus a sibling `Trash2Icon` `AlertDialog`
  trigger, wired through `useTransition` and a local `serverError` state surfaced via
  `ErrorBox`. `PackageRow`'s `pieces.map` now renders `PieceRow` instead of the old inline
  `<button>` block.
- No migration needed — confirmed by reading migrations 0016/0017/0018/0022 directly that the
  DELETE RLS policy and cascading FKs on `card_checklist_items`/`card_attachments`/
  `card_checklist_overrides` already exist and require zero changes.

## Task Commits

Each task was committed atomically:

1. **Task 1: removePieceSchema + removePiece Server Action** - `f4c7f6e` (feat)
2. **Task 2: Delete trigger + confirmation in PackageRow's piece list** - `e277cf1` (feat)

**Plan metadata:** (pending — orchestrator's docs commit)

Task 3 (human-verify checkpoint, `gate="blocking"`) is intentionally NOT executed by this
agent — it is reserved for the orchestrator's live session with the developer per the plan's
explicit scope boundary. See "Next Phase Readiness" below.

## Files Created/Modified
- `lib/validation/cards.ts` - Added `removePieceSchema`/`RemovePieceInput` after
  `createPieceSchema`.
- `app/pm/board/actions.ts` - Added `PIECE_NOT_FOUND_ERROR`/`PIECE_MUST_BE_PIECE_ERROR`/
  `PIECE_DELETE_ERROR` constants and the `removePiece` Server Action, after `createPiece`.
- `app/pm/board/board-panel.tsx` - Added `Trash2Icon` import, `removePiece` import, the new
  `PieceRow` component, and updated `PackageRow`'s `pieces.map` to render it.

## Decisions Made
- Followed the plan's explicit correction (confirmed by reading the migrations directly): the
  existing `cards_delete_scoped` policy (0017) already authorizes the delete and must NOT be
  narrowed to `card_type='piece'`, since `createCard`'s D-15 compensating delete needs it to
  also cover `single`-type cards. `removePiece` is the sole enforcement point for the
  `card_type='piece'` restriction.
- Used the simpler `{ error?: string }` return shape for `removePiece` (matching
  `advanceStage`/`removeAttachment`), not `createPiece`'s discriminated-union shape, per the
  plan's explicit interface guidance — the UI only needs to know whether the delete worked.
- Restructured the piece row from a single outer `<button>` to an outer `<div>` with an inner
  `<button>` (click-to-open-detail, unchanged) plus a sibling `AlertDialog` delete trigger, to
  avoid nesting an interactive delete button inside another button (invalid HTML).

## Deviations from Plan

None - plan executed exactly as written. No Rule 1-4 deviations were needed; the plan's
own interface notes and threat model were followed directly with no ambiguity requiring a
judgment call.

## Issues Encountered
None. `npx tsc --noEmit`, `npx eslint app/pm/board/board-panel.tsx`, and `npm run build` all
passed clean on the first attempt for both tasks. `npm run build` initially failed with a
Turbopack workspace-root-inference error because this worktree had no local `node_modules`
(the same pre-existing environment quirk documented in `03-06-SUMMARY.md`'s Deviation #1) —
running `npm ci` (no lockfile drift, `node_modules` is gitignored) resolved it. This was
infra-only setup, not a code deviation, so it is not logged as a Rule 1-4 deviation.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness

Tasks 1-2's automated verification is fully green:
- `npx tsc --noEmit` — 0 errors.
- `npx eslint app/pm/board/board-panel.tsx` — 0 errors (1 pre-existing warning at an unrelated
  line, `form.watch()`, matching an established pattern already flagged elsewhere in the file
  before this task; not new).
- `npm run build` — succeeds, all 26 routes generated.
- `grep -n "card_type !== \"piece\""` — present in `app/pm/board/actions.ts`, confirming the
  app-layer boundary exists.
- `git diff --stat` shows exactly the three files in the plan's `files_modified`, no migration
  files, no `package.json`/lockfile changes.
- `createPiece`, `packageRollupLabel`, `createCard`, `advanceStage`, `moveCard`,
  `toggleChecklistItem` are all byte-for-byte unchanged (confirmed via `git diff` showing only
  additions/the one intentional inline-button replacement, no edits to any other export).

**Task 3: Human Verification — PENDING (orchestrator)**

Not attempted by this agent per the dispatch constraints. The orchestrator must run the plan's
9-step live verification script against `npm run dev` (create a package, add a piece with a
deliberately wrong title, confirm the trash icon + confirmation dialog, confirm cancel does
nothing, confirm delete removes only the target piece leaving siblings/the package untouched,
confirm no delete affordance exists for a package or a `single` card, confirm normal card
operations are unaffected) before this quick task can be considered fully closed.

---
*Phase: quick/260808-c9s*
*Completed: 2026-08-08 (Tasks 1-2; Task 3 pending orchestrator's live session)*

## Self-Check: PASSED

- FOUND: lib/validation/cards.ts
- FOUND: app/pm/board/actions.ts
- FOUND: app/pm/board/board-panel.tsx
- FOUND: .planning/quick/260808-c9s-adicionar-a-op-o-de-excluir-uma-pe-a-car/260808-c9s-SUMMARY.md
- FOUND: f4c7f6e (Task 1 commit)
- FOUND: e277cf1 (Task 2 commit)
