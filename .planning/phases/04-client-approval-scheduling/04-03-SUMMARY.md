---
phase: 04-client-approval-scheduling
plan: 03
subsystem: pm-board
tags: [nextjs, react, zod, server-actions, ui]

# Dependency graph
requires:
  - phase: 04-client-approval-scheduling
    plan: 01
    provides: "publish_at/client_adjustment_comment columns, isReadyToPublish (lib/cards/publish-status.ts), updateCardDetailsSchema.publishAt, the publishAt:null placeholder at board-panel.tsx's updateCardDetails call site"
provides:
  - "BoardCard type (app/pm/board/page.tsx) extended with client_adjustment_comment/publish_at, sourced from the same RLS-scoped cards select as every other column"
  - "updateCardDetails (app/pm/board/actions.ts) writes publish_at as one more PM/Admin-writable column, gated by the existing assertPmOrAdminCaller boundary"
  - "Stage-gated Data de publicação field (agendamento only), read-only Comentário do cliente block (producao only), and a Pronto para publicar badge (isReadyToPublish) rendered identically on the card detail dialog and the board card"
affects: []

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Reused toDatetimeLocalValue/draftDueDate's exact seeding+dirty-check+save shape for a second datetime-local field (draftPublishAt), rather than writing a parallel helper"
    - "isReadyToPublish imported once from lib/cards/publish-status.ts and rendered in two places (dialog top badge row, BoardCardItem's badge stack) so the PM board and the Client's own history tab (04-02) can never disagree"

key-files:
  created: []
  modified:
    - app/pm/board/page.tsx
    - app/pm/board/actions.ts
    - app/pm/board/board-panel.tsx

key-decisions: []

requirements-completed: [APR-04, SCH-01, SCH-02]

# Metrics
duration: ~25min
completed: 2026-08-12
---

# Phase 4 Plan 3: PM Publish Scheduling Summary

**Wired `publish_at`/`client_adjustment_comment` through the PM board's existing read/write path and replaced 04-01's `publishAt: null` placeholder with a real, stage-gated "Data de publicação" field, a read-only "Comentário do cliente" block, and a computed "Pronto para publicar" badge shown identically on both the card detail dialog and the board card.**

## Performance

- **Duration:** ~25 min
- **Tasks:** 2/2 complete
- **Files modified:** 3 (0 created, 3 modified) — matches plan's declared `files_modified` exactly

## Accomplishments

- `app/pm/board/page.tsx`: `BoardCard` type gained `client_adjustment_comment`/`publish_at` (both `string | null`); the `cards` select string now includes both columns alongside every other column the loader already reads
- `app/pm/board/actions.ts`: `updateCardDetails`'s `.update({...})` payload gained `publish_at: parsed.data.publishAt` as one more sibling key next to `due_date` — no new authorization check, `assertPmOrAdminCaller` (already gating this function) remains the sole boundary
- `app/pm/board/board-panel.tsx`:
  - `draftPublishAt` state, seeded via the existing `toDatetimeLocalValue` helper (no second date-parsing helper), wired into `hasDetailChanges` and `handleSaveDetails`'s `updateCardDetails({...})` call, replacing 04-01's `publishAt: null` placeholder
  - New "Data de publicação" `Input type="datetime-local"` block, structurally identical to the existing "Prazo" block, wrapped in `{card.stage === "agendamento" ? (...) : null}` — hidden, not disabled, for every earlier stage
  - Read-only "Comentário do cliente" block (`flex flex-col gap-2 rounded-md border p-3`, matching the AI-validation summary block's own style) gated on `card.stage === "producao" && card.client_adjustment_comment`, no edit affordance
  - "Pronto para publicar" `StatusBadge` (tone `success`), computed via `isReadyToPublish(card)` imported from `lib/cards/publish-status.ts`, rendered directly under the top stage badge in the dialog, and as an additional badge alongside the existing channel badge in `BoardCardItem`'s `flex flex-col items-end gap-1` stack

## Task Commits

1. **Task 1: Wire publish_at + client_adjustment_comment through the read/write path** - `6e53d33` (feat)
2. **Task 2: board-panel.tsx — Data de publicação field, Comentário do cliente block, Pronto para publicar badge** - `7420c61` (feat)

## Files Created/Modified

- `app/pm/board/page.tsx` - `BoardCard` type + `cards` select extended with `client_adjustment_comment`/`publish_at`
- `app/pm/board/actions.ts` - `updateCardDetails` writes `publish_at` as one more PM/Admin-writable column
- `app/pm/board/board-panel.tsx` - `isReadyToPublish` import, `draftPublishAt` state/save wiring, stage-gated publish-date field, read-only client-comment block, "Pronto para publicar" badge on both the dialog and the board card

## Decisions Made

None beyond the plan's own explicit instructions — both tasks were executed as written, reusing existing helpers/patterns (`toDatetimeLocalValue`, the "Prazo" field's structural shape, the AI-validation summary block's box style) with zero new abstractions.

## Deviations from Plan

None - plan executed exactly as written. Both tasks' acceptance criteria were verified via direct grep against the final file state (see Self-Check below) rather than inferred.

## Verification

- `npx tsc --noEmit -p tsconfig.json` — clean, both after Task 1 and after Task 2
- `npx eslint app/pm/board/board-panel.tsx app/pm/board/page.tsx app/pm/board/actions.ts` — 0 errors, 1 pre-existing warning (unrelated line, `form.watch()` React Compiler memoization notice, not touched by this plan)
- `npm run build` — failed with a Turbopack workspace-root resolution error (`next/package.json` not resolvable from inside this isolated worktree's `app/` directory). This is a documented, recurring environment limitation for this project, unrelated to this plan's code (see STATE.md entries 260811-kl3, 260808-ci5, 260810-jl0, 260805-kio for the same root-cause across prior worktree executions) — the orchestrator runs `npm run build` after merge, from the main checkout, where it has consistently succeeded for every prior phase/quick-task in this project's history. Not treated as a plan failure.
- `git diff --stat main...HEAD` — exactly 3 files touched (`app/pm/board/actions.ts`, `app/pm/board/board-panel.tsx`, `app/pm/board/page.tsx`), all additive (63 insertions, 12 deletions — deletions are the placeholder-comment block and its `publishAt: null` line being replaced by the real wiring, no existing field/block removed)
- Acceptance-criteria grep checks (all passed): `client_adjustment_comment`/`publish_at` present in `BoardCard` type and select string; `publish_at: parsed.data.publishAt` present in `updateCardDetails`; `draftPublishAt` seeded via `toDatetimeLocalValue`; the new field's guard is exactly `card.stage === "agendamento"`; `handleSaveDetails`'s payload contains `publishAt`; the comment block's guard includes both `card.stage === "producao"` and a truthiness check; `BoardCardItem` renders both the channel badge and the conditional "Pronto para publicar" badge (both JSX nodes present, no replacement); `isReadyToPublish` imported from `@/lib/cards/publish-status`, never reimplemented

## Threat Flags

None — this plan introduces no new trust boundary. `updateCardDetails` remains gated exclusively by `assertPmOrAdminCaller` (unchanged); `publish_at` is one more column reachable through that same, already-audited path. `client_adjustment_comment` is rendered only inside `app/pm/board/*` (PM/Admin-only routes per `middleware.ts`'s `roleRoot` map, unchanged). The Client's own `approveCard`/`requestAdjustment` (plan 04-02) never call `updateCardDetails`/reach `publish_at` — confirmed by this plan's own scope (`app/pm/board/actions.ts` is untouched by 04-02's `app/client/actions.ts`).

## Known Stubs

None. Every field wired by this plan (`publish_at`, `client_adjustment_comment`) flows from the real RLS-scoped `cards` select through to real UI, and `handleSaveDetails` sends the real `draftPublishAt` value (not a hardcoded placeholder) — this plan's entire purpose was replacing 04-01's `publishAt: null` placeholder with this real wiring.

## Issues Encountered

- `npm run build` fails inside this isolated worktree with a Turbopack workspace-root resolution error unrelated to this plan's code — a known, previously-documented limitation of this project's worktree-executor setup (see Verification section above). `npx tsc --noEmit` (the plan's own declared verification command for Task 1, and the first half of Task 2's) passed clean both times; ESLint passed with zero new errors/warnings.

## User Setup Required

None — no new environment variable, migration, or external service configuration. This plan touches application code only (no `supabase/migrations/*` file), reusing columns/RPCs/pure functions already shipped by 04-01.

## Next Phase Readiness

- Phase 4's PM-facing half (APR-04, SCH-01, SCH-02) is now complete: the PM sees the Client's adjustment comment directly on the card, and can register/clear a publish date once a card reaches `agendamento`, with "Pronto para publicar" computed and displayed consistently.
- No blockers for the orchestrator's post-merge steps (`npm run build` from the main checkout, hosted migration push if any — none needed by this plan specifically).
- 04-02 (Client-facing board/actions) and 04-03 (this plan) both build on 04-01's foundation independently — no cross-plan dependency between them; the orchestrator should confirm both land cleanly on the same base before considering Phase 4 fully closed.

---
*Phase: 04-client-approval-scheduling*
*Completed: 2026-08-12*

## Self-Check: PASSED

- `app/pm/board/page.tsx`, `app/pm/board/actions.ts`, `app/pm/board/board-panel.tsx` confirmed present on disk with the described edits (all three re-read post-edit during execution)
- Both commit hashes confirmed present in `git log --oneline -5`: `6e53d33`, `7420c61`
- `npx tsc --noEmit -p tsconfig.json` re-verified clean as the final step before this summary was written
- `git diff --stat main...HEAD` re-verified: exactly 3 files, matching the plan's declared `files_modified` list exactly
