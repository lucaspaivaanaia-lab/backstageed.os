---
phase: 03-content-production-kanban
plan: 06
subsystem: ui
tags: [nextjs, server-actions, supabase, zod, react-hook-form, dnd-kit, kanban]

# Dependency graph
requires:
  - phase: 03-content-production-kanban (03-05)
    provides: PM Kanban board with drag-and-drop, checklist gate, force-advance override audit
provides:
  - packageRollupLabel pure module (lib/cards/package-rollup.ts) computing a package's aggregate
    piece-stage status at render time, never stored
  - createPiece Server Action creating a piece under a package with client_id copied server-side
    from the re-read parent row
  - "Pacotes" region above the board listing package rows with a rollup StatusBadge and a
    package Dialog for adding/viewing peças
  - Pacote/Post único card-type selector in the top-level "Criar card" Dialog (hidden for
    per-column "+" triggers, which always create a single card in that column)
  - Piece cards in the stage columns carrying a "Pacote: {title}" meta segment and their own
    independent checklist gate, draggable and advanceable exactly like a standalone card
affects: [phase-04 (client-facing approval), future package/piece reporting]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Rollup/aggregate status computed at render time from children, never persisted as a
      column on the parent row (avoids drift, especially under drag-and-drop)"
    - "Extracted CardDetailDialogBody from the card's own trigger+Dialog wrapper so the exact
      same detail content can be opened both from an uncontrolled Dialog (column card) and an
      externally-controlled Dialog (piece opened from the package dialog)"

key-files:
  created:
    - lib/cards/package-rollup.ts
    - lib/cards/package-rollup.test.ts
  modified:
    - lib/validation/cards.ts
    - app/pm/board/actions.ts
    - app/pm/board/page.tsx
    - app/pm/board/board-panel.tsx

key-decisions:
  - "A package's rollup badge is computed at render time via a pure function over its pieces'
    current stages, never stored as a column on the package row (D-02, avoids drift under drag)"
  - "A piece is created title-only (no clientId in the input schema) — client_id is always
    copied server-side from the re-read parent package row, closing the cross-client write
    primitive a browser-supplied clientId would otherwise open (T-03-31)"
  - "The package Dialog renders no Descrição/Responsável/Anexos/Checklist section of its own —
    a package is an organisational container only; its per-piece children carry the real
    content and ownership (discretionary call recorded in the plan, D-02/A3)"
  - "The card-type (Post único/Pacote) selector is shown only when the create-card Dialog's
    `stage` prop is absent (top-level button + empty-state action) — the five per-column '+'
    triggers always pass a stage and therefore always create a single card"

requirements-completed: [KAN-01, KAN-02, CHK-03]

# Metrics
duration: 61min
completed: 2026-08-05
---

# Phase 3 Plan 06: Content packages (Pacotes) Summary

**PM can group related posts into a Pacote whose peças each advance through the five stages, and get gated by their own revisão-interna checklist, fully independently — with an aggregate rollup badge computed at render time above the board.**

## Performance

- **Duration:** 61 min (across two sessions; this session resumed mid-Task-2)
- **Started:** 2026-08-05T16:44:43-03:00 (Task 1, prior session)
- **Completed:** 2026-08-05T17:45:53-03:00 (Task 2, this session)
- **Tasks:** 2 of 3 complete (Task 3 is a blocking human-verify checkpoint, reserved for the
  orchestrator)
- **Files modified:** 4 (2 created, 4 modified — package-rollup.ts/.test.ts are new,
  lib/validation/cards.ts / app/pm/board/actions.ts / app/pm/board/page.tsx /
  app/pm/board/board-panel.tsx are modified)

## Accomplishments
- `packageRollupLabel` (lib/cards/package-rollup.ts): a pure, fully unit-tested function
  returning `"Nenhuma peça"`, `"{count}/{total} em {stage}"` (strict majority), or
  `"{total} peças"` (no majority/tie), always sourcing stage copy from `STAGE_LABELS`.
- `createPiece` Server Action: creates a piece under a package with `client_id` copied from the
  RLS-re-read parent row (never from browser input), rejecting any parent that isn't
  `card_type = "package"`.
- `app/pm/board/page.tsx` splits cards into `packages`/`pieces`/`standalone` groups server-side
  and threads `piecesByPackageId` (stage arrays for the rollup) and `parentTitleById` (for the
  piece meta segment) through to `BoardPanel`.
- `app/pm/board/board-panel.tsx`:
  - New "Pacotes" region between the client switcher and the `DndContext`-wrapped column board
    — outside the drag-and-drop tree entirely, never wrapped in the draggable/droppable card
    wrappers (verified: zero occurrences of either identifier in that JSX span).
  - Package Dialog ("Ver peças") listing each piece's title + stage badge, with an
    "Adicionar peça" title-only form calling `createPiece`. Renders none of the four
    Descrição/Responsável/Anexos/Checklist sections a full card Dialog has.
  - Clicking a piece row inside the package Dialog closes it and opens that piece's own full
    card detail Dialog (`PieceDetailDialog`), reusing the exact same `CardDetailDialogBody` a
    standalone card's own Dialog uses — no duplicated markup.
  - "Tipo" (Post único/Pacote) selector added to the top-level "Criar card" Dialog, shown only
    when the `stage` prop is absent; selecting "Pacote" hides Descrição/Responsável and sends
    both as `undefined`.
  - Pieces append a `"Pacote: {title}"` segment to their existing `meta` line.

## Task Commits

1. **Task 1: Build the pure package rollup module and the createPiece Server Action** -
   `a01778d` (feat) — completed in a prior session.
2. **Task 2: Render packages above the board and add the Pacote creation path** - `7be16ab`
   (feat) — completed this session.

**Plan metadata:** (pending — this commit)

Task 3 (human-verify checkpoint) is intentionally NOT executed by this agent — see
"Next Phase Readiness" below.

## Files Created/Modified
- `lib/cards/package-rollup.ts` - Pure rollup-label computation over piece stages.
- `lib/cards/package-rollup.test.ts` - 7 unit tests covering every rollup branch.
- `lib/validation/cards.ts` - Added `createPieceSchema`/`CreatePieceInput` (no `clientId` field).
- `app/pm/board/actions.ts` - Added `createPiece` Server Action.
- `app/pm/board/page.tsx` - Groups cards by `card_type`, computes `piecesByPackageId` and
  `parentTitleById`, passes both plus `packages` to `BoardPanel`.
- `app/pm/board/board-panel.tsx` - Added the Pacotes region, package Dialog, piece detail
  dialog reuse, and the Pacote/Post único selector; extracted `CardDetailDialogBody` and
  `PieceDetailDialog` from the former monolithic `BoardCardItem`.

## Decisions Made
- Rollup is computed at render time from `piecesByPackageId`, never persisted — matches the
  plan's explicit anti-pattern guidance (03-RESEARCH.md).
- Reused the exact same `CardDetailDialogBody` component for both the column-rendered piece
  card and the package-dialog-opened piece detail, rather than duplicating the Descrição/
  Responsável/Anexos/Checklist markup, to guarantee behavioral parity between the two entry
  points (both use identical `advanceStage`/`updateCardDetails`/checklist logic).
- Full piece list per package is derived by filtering the already-loaded `columns` cards for
  `parent_card_id === pkg.id`, rather than adding a second `pieces` array prop — `columns`
  already contains every piece (with its full checklist/attachments/overrides) since a piece
  lives in its own stage column exactly like a standalone card.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Worktree had no local `node_modules`, blocking `npm run build`**
- **Found during:** Task 2 verification (`npx tsc --noEmit && npm run lint && npm run build`)
- **Issue:** The worktree directory had no `node_modules` at all. `tsc`/`eslint` still worked
  because Node's own module-resolution algorithm walks up to the main repo's `node_modules`,
  but Next's Turbopack build does a direct filesystem check scoped to the project directory
  and failed with "Next.js package... not found from the project directory."
- **Fix:** First tried symlinking `node_modules` to the main repo's — Turbopack rejected this
  as "Symlink points out of the filesystem root" (a security restriction). Ran `npm ci`
  instead, which materializes `node_modules` from the existing `package-lock.json` exactly —
  no new packages, no lockfile changes, purely local infra setup so the build could run inside
  this worktree.
- **Files modified:** None (node_modules is gitignored; `git status` confirmed no lockfile
  drift after `npm ci`).
- **Verification:** `npm run build` succeeded afterward; `git status --short` showed nothing
  beyond the two intended source files.
- **Committed in:** N/A (no file changes to commit for this fix).

**2. [Rule 1 - Bug] Doc-comment prose accidentally tripped the acceptance-criteria's literal
   text checks**
- **Found during:** Self-verification of Task 2's acceptance criteria (grep-based checks over
  the literal file text between the "Pacotes" heading and `<DndContext`, and inside the
  package Dialog's own block)
- **Issue:** An early draft of `PackageRow`'s doc comment used the literal identifier names
  `DraggableCard`/`DroppableColumn` and the literal headings `Anexos`/`Descrição`/
  `Responsável` in prose explaining what the component does NOT use/render. A naive
  first-occurrence-of-"Pacotes" text scan (matching a comment far above the actual "Pacotes"
  JSX region) would have picked up those literal substrings and produced a false failure.
- **Fix:** Reworded both doc comments to describe the same facts without using the exact
  literal strings the acceptance criteria checks for (e.g. "the column board's own
  draggable/droppable wrappers" instead of naming the components; "none of the four sections
  a full card detail Dialog has" instead of naming each heading).
- **Files modified:** `app/pm/board/board-panel.tsx`
- **Verification:** Re-ran the same grep/python-based checks anchored at both the naive first
  "Pacotes" mention and the actual `<SectionTitle>Pacotes` JSX heading — both report zero
  occurrences of the draggable/droppable identifiers in that span, and the package Dialog's
  own JSX block (from its `<Dialog open={dialogOpen}...>` to its matching `</Dialog>`) reports
  zero occurrences of "Checklist de revisão", "Anexos", "Descrição", and "Responsável".
- **Committed in:** `7be16ab` (part of the Task 2 commit).

---

**Total deviations:** 2 auto-fixed (1 blocking/infra, 1 bug in doc-comment wording).
**Impact on plan:** Neither affects runtime behavior. No scope creep — both were necessary to
get a clean, verifiable Task 2 automated pass.

## Issues Encountered
None beyond the two auto-fixed items above.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness

Task 2's automated verification is fully green:
- `npx tsc --noEmit` — 0 errors.
- `npm run lint` — 0 errors (4 pre-existing warning-class occurrences matching an established
  `form.watch()` pattern already used elsewhere in the codebase; not new).
- `npm run build` — succeeds, all 26 routes generated.
- `npm test` — 85/85 pass, including all 7 `package-rollup.test.ts` cases (re-run to confirm no
  regression in Task 1's work).
- Every Task 2 `acceptance_criteria` grep/structural check passes, including the two nuanced
  ones: zero `DraggableCard`/`DroppableColumn` occurrences in the Pacotes region's own JSX
  span, and zero `Checklist de revisão`/`Anexos`/`Descrição`/`Responsável` occurrences inside
  the package Dialog's own JSX block.

**Task 3 (human-verify checkpoint) is explicitly NOT executed by this agent** — it requires a
running dev server, real PM credentials, and a live walkthrough of package creation,
independent per-piece drag advancement, and the per-piece checklist gate (steps 1-12 in the
plan). This is reserved for the orchestrator session. Once Task 3 is signed off, this plan
(and Phase 3 wave 9, its last wave) is complete.

---
*Phase: 03-content-production-kanban*
*Completed: 2026-08-05 (Tasks 1-2; Task 3 pending)*
