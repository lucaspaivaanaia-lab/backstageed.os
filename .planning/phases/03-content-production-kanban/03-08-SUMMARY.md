---
phase: 03-content-production-kanban
plan: 08
subsystem: ui
tags: [nextjs, react, dnd-kit, accessibility, kanban, optimistic-ui]

# Dependency graph
requires:
  - phase: 03-content-production-kanban
    plan: 07
    provides: "moveCard Server Action, evaluateMove/MoveDecision predicate, MOVE_SKIPS_REVIEW_MESSAGE"
  - phase: 03-content-production-kanban
    plan: 03
    provides: "isGateBlocked/GATE_BLOCKED_MESSAGE, board-face progress badge, checklist-aware BoardCardItem"
provides:
  - "app/pm/board/draggable-card.tsx: DraggableCard board-local wrapper + CardDragHandle accessible grip, cardDraggableId/cardIdFromDraggableId namespacing"
  - "app/pm/board/droppable-column.tsx: DroppableColumn per-stage drop target (min-h-24 for empty columns), columnDroppableId/stageFromDroppableId namespacing"
  - "DndContext wired into board-panel.tsx: pointer (8px activation) + keyboard sensors, useOptimistic column state, Portuguese screen-reader announcements/instructions, client-side evaluateMove snap-back before any server call, moveCard invoked inside startTransition"
affects: ["03-09 (adds the per-column '+' button and description/assignee fields to the same board-panel.tsx this plan just modified)"]

# Tech tracking
tech-stack:
  added:
    - "@dnd-kit/core@6.3.1 (pinned exact) — DndContext, useDraggable, useDroppable, PointerSensor, KeyboardSensor, DragOverlay, closestCorners"
    - "@dnd-kit/utilities@3.2.2 (pinned exact) — CSS.Translate.toString for the draggable transform"
  patterns:
    - "Board-local dnd-kit wrapper kept entirely outside components/ui/data-card.tsx — the generic DataCard primitive stays untouched and drag behavior lives only in app/pm/board/*"
    - "Namespaced droppable/draggable ids (card:<id>, column:<stage>) with null-returning parsers (cardIdFromDraggableId, stageFromDroppableId) so onDragEnd no-ops on any malformed or spoofed id instead of writing garbage"
    - "Client-side evaluateMove re-run in onDragEnd for instant snap-back feedback, with the server's moveCard (which re-runs evaluateMove again, server-side) as the actual trust boundary — same predicate, two evaluations, only one is authoritative"
    - "useOptimistic column state applied only inside startTransition and only after the client-side gate passes; a server rejection lets the transition settle and React discards the optimistic state on its own — no manual rollback code"

key-files:
  created:
    - app/pm/board/draggable-card.tsx
    - app/pm/board/droppable-column.tsx
  modified:
    - package.json
    - package-lock.json
    - app/pm/board/board-panel.tsx

key-decisions:
  - "Drag handle rendered as a sibling of the card body (not nested inside it), keeping the existing DialogTrigger role=\"button\" div free of a nested interactive element"
  - "8px pointer activation distance lets a plain click still open the detail Dialog while a deliberate drag still starts the DnD gesture"
  - "All blocked-move copy flows through decision.reason / result.error (GATE_BLOCKED_MESSAGE / MOVE_SKIPS_REVIEW_MESSAGE) — never a locally retyped string — so the drag path and the Avançar button always show byte-identical messages"

requirements-completed: [KAN-02, KAN-03]

# Metrics
duration: ~10min (continuation session — Tasks 1-2 code already committed by a prior agent; this session closed Task 3's human-verify checkpoint and wrote this summary)
completed: 2026-07-31
---

# Phase 3 Plan 08: Drag-and-Drop Kanban Board (dnd-kit) Summary

**Pointer- and keyboard-driven card movement on `/pm/board` via dnd-kit, with an accessible drag handle, Portuguese screen-reader announcements, optimistic movement, and the identical checklist-gate snap-back message the "Avançar" button already shows (D-12/D-13).**

## Status: COMPLETE (3 of 3 tasks)

Tasks 1-2 were executed and committed by a prior agent in this same worktree session. This continuation session verified those commits were present and intact, then handed the running app to the developer for Task 3's `checkpoint:human-verify` (drag-and-drop, keyboard move, drag-triggered checklist gate). The developer walked all 13 numbered steps and replied "approved."

## Accomplishments

- `@dnd-kit/core@6.3.1` and `@dnd-kit/utilities@3.2.2` installed at pinned exact versions, in `dependencies` only — no sibling `@dnd-kit/*` package added, per the plan's package legitimacy audit
- `app/pm/board/draggable-card.tsx`: `DraggableCard` wraps the existing `BoardCardItem`/`DataCard` markup untouched, adding a `CardDragHandle` grip icon (`aria-label="Mover card: {título}"`) as a sibling element — `components/ui/data-card.tsx` stays byte-identical to its pre-plan state
- `app/pm/board/droppable-column.tsx`: `DroppableColumn` gives every stage column a `min-h-24` drop target so an empty column can still receive a card, with a `bg-muted` over-state reusing the existing secondary surface token (no new hue)
- `board-panel.tsx` restructured: `DndContext` wraps only the five-column region, `PointerSensor` (8px activation) + `KeyboardSensor` for full keyboard operability, `useOptimistic` column state for flicker-free movement, and an `Announcements` object producing the exact Portuguese strings from the plan's copy contract
- `onDragEnd` runs `evaluateMove` client-side before touching any state — a blocked move (unchecked checklist items, or skipping revisão interna) snaps back with zero optimistic update and a toast reading the shared `GATE_BLOCKED_MESSAGE` / `MOVE_SKIPS_REVIEW_MESSAGE` constant verbatim; an allowed move applies the optimistic update inside `startTransition` and then calls the real `moveCard` Server Action, which re-runs the same gate server-side
- The `Avançar` button and `advanceStage` Server Action are completely untouched — dragging is an additional path, not a replacement (D-12)

## Task Commits

1. **Task 1: Install dnd-kit and build the board-local draggable card and droppable column** — `c11b509` (feat, committed by prior agent in this session)
2. **Task 2: Wire DndContext into the board with optimistic movement, snap-back, and Portuguese announcements** — `af0eec7` (feat, committed by prior agent in this session)
3. **Task 3: Human verification** — CONFIRMED by developer 2026-07-31 (all 13 steps, including the drag-triggered gate message, the skip-review rejection, the backward-move allowance, and both keyboard tests); no task commit, verification only

## Files Created/Modified

- `app/pm/board/draggable-card.tsx` (new, 105 lines) - `DraggableCard`, `CardDragHandle`, `cardDraggableId`, `cardIdFromDraggableId`
- `app/pm/board/droppable-column.tsx` (new, 62 lines) - `DroppableColumn`, `columnDroppableId`, `stageFromDroppableId`
- `app/pm/board/board-panel.tsx` (modified, now 602 lines) - `DndContext` wiring, sensors, `useOptimistic`, drag handlers, `Announcements`, `DragOverlay`
- `package.json` / `package-lock.json` - `@dnd-kit/core@6.3.1` and `@dnd-kit/utilities@3.2.2` added to `dependencies`

## Decisions Made

See `key-decisions` in the frontmatter above. In summary: the drag handle stays a sibling (never nested) of the existing card body; an 8px pointer activation distance keeps a plain click opening the Dialog; all blocked-move copy is sourced from the shared `evaluateMove`/`moveCard` result, never retyped locally.

## Deviations from Plan

None in the code itself — Tasks 1 and 2 were executed exactly as written by a prior agent in this worktree session (verified by re-reading both commits' diffs against the plan's task specifications; file line counts, exports, and literal copy strings all match).

The only wrinkle was an environment issue, not a code defect: after this worktree's changes were merged to the developer's main checkout, the developer hit a `Module not found: @dnd-kit/core` error because their main checkout's `node_modules` had not been updated to reflect the new `package.json`/`package-lock.json` entries added by Task 1. This was resolved by running a plain `npm install` in the main checkout — no code change was needed, and it does not affect this worktree's commits or this plan's `git diff --stat` guarantees.

## Issues Encountered

None beyond the environment issue documented above.

## User Setup Required

None - no external service configuration required. (The `npm install` needed in the developer's main checkout after merge was a one-time local environment sync, not an ongoing setup requirement.)

## Next Phase Readiness

- `app/pm/board/board-panel.tsx` is now at 602 lines with `DndContext`, sensors, optimistic state, and the five-column drag region wired in. Plan 03-09 (wave 6) builds the per-column "+" create trigger and the description/assignee form controls against this same file — it should read the current `BoardPanel` structure carefully before adding markup, since the column region is now wrapped in `DroppableColumn` rather than a bare `div`.
- `app/pm/board/draggable-card.tsx` and `app/pm/board/droppable-column.tsx` are stable, board-local modules that 03-09 should not need to touch.
- `components/ui/data-card.tsx` remains byte-identical to its pre-Phase-3-rescope state, confirmed by `git diff --stat` across both Task 1 and Task 2 commits.

---
*Phase: 03-content-production-kanban*
*Completed: 2026-07-31*

## Self-Check: PASSED

- FOUND: app/pm/board/draggable-card.tsx
- FOUND: app/pm/board/droppable-column.tsx
- FOUND: app/pm/board/board-panel.tsx
- FOUND commit: c11b509 (Task 1)
- FOUND commit: af0eec7 (Task 2)
