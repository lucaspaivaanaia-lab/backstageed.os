---
phase: 03-content-production-kanban
plan: 05
subsystem: database, api, ui
tags: [supabase, rls, pgtap, nextjs, server-actions, admin-audit]

requires:
  - phase: 03-content-production-kanban (plans 03-01..03-04, 03-07, 03-09)
    provides: cards/card_checklist_items/card_attachments schema, checklist gate,
      move-rules, card description+assignee, board panel section layout
provides:
  - Append-only card_checklist_overrides audit table (RLS: assigned PM+Admin
    read, Admin-only insert, no update/delete)
  - forceAdvanceOverride Server Action (Admin-only D-11 force-advance,
    writes the audit row before the stage mutation)
  - Override marker (StatusBadge "Avanço forçado" + expandable history)
    surfaced on the PM board's checklist section
  - /admin/cards cross-client card audit screen with client filter,
    per-card checklist/attachment/override history, and the "Forçar avanço"
    trigger
affects: [phase-06-admin-oversight]

tech-stack:
  added: []
  patterns:
    - "Append-only audit table: no update/delete policy, GRANT is select+insert only"
    - "Frozen text[] snapshot on an audit row instead of FK-to-mutable-rows, to preserve point-in-time state"
    - "Admin-only privileged Server Action kept in its own file, never co-located with the PM action surface it must never contaminate"

key-files:
  created:
    - supabase/migrations/0022_card_checklist_overrides.sql
    - supabase/tests/0012_rls_card_checklist_overrides_scoping_test.sql
    - lib/actions/card-overrides.ts
    - app/admin/cards/page.tsx
    - app/admin/cards/card-audit-panel.tsx
  modified:
    - lib/validation/cards.ts
    - app/pm/board/page.tsx
    - app/pm/board/board-panel.tsx
    - app/admin/layout.tsx

key-decisions:
  - "Renumbered the plan's reserved migration/test slots (0019/0011) to 0022/0012 -- those numbers were consumed by the 2026-08-04/05 P0/P1/P2 pivot (clients.archived_at, client_files update grant, pm_assigned_clients status check) that landed on main after this plan was written."
  - "Hosted (Supabase linked project) push deferred to the orchestrator -- this worktree has no .env.local / SUPABASE_ACCESS_TOKEN, a known limitation of isolated executor worktrees in this project (same wall hit by quick tasks 260722-hnm and 260805-kio). Migration 0022 is applied and pgTAP-verified against the LOCAL stack only."
  - "card-audit-panel.tsx's row-click Dialog uses controlled open state (useState + onClick/onKeyDown on TableRow) instead of DialogTrigger asChild -- TableRow is a plain function component, not React.forwardRef, so wrapping it as a Radix Slot child would emit a ref-forwarding warning."

requirements-completed: [CHK-04]

duration: ~25min (Tasks 1-3 only; Task 4 human-verify checkpoint still pending)
completed: 2026-08-05
---

# Phase 3 Plan 5: Admin Checklist Audit + Force-Advance Override Summary

**Append-only card_checklist_overrides audit table + Admin-only forceAdvanceOverride Server Action + cross-client /admin/cards audit screen, closing CHK-04/D-11.**

## Performance

- **Duration:** ~25 min
- **Tasks:** 3 of 4 complete (Task 4 is a blocking human-verify checkpoint, intentionally not executed by this run)
- **Files modified:** 9 (5 created, 4 modified)

## Accomplishments

- Shipped `public.card_checklist_overrides`, an append-only audit table (no update/delete policy, GRANT is `select, insert` only) recording who force-advanced a card, when, the forced `from_stage`→`to_stage` transition, and a frozen `text[]` snapshot of which checklist item labels were still unchecked at that moment.
- Proved the RLS shape with a 4-assertion pgTAP suite: an assigned PM can read their own client's override rows, cannot see another client's, and — the crux — **cannot insert an override row even on their own assigned client**; only Admin can insert. Verified locally: 13 files / 53 tests, 0 `not ok`, zero regressions in `0001`–`0011`.
- Built `lib/actions/card-overrides.ts`'s `forceAdvanceOverride` — a NEW file, never co-located with the PM action surface (`app/pm/board/actions.ts`, confirmed byte-unchanged across the whole plan). Re-authorizes as `role === "admin" && status === "approved"`, re-reads the card and its checklist server-side, refuses to run when the card isn't in `revisao_interna` or when nothing is actually blocking (`isGateBlocked` false), writes the audit row **before** the stage update and aborts on insert failure (Repudiation mitigation, T-03-25), then advances the stage.
- Surfaced the override as a `StatusBadge tone="danger"` "Avanço forçado" + expandable `<details>` history inside the PM board's existing checklist section header — no other section (Descrição/Responsável/Anexos), the "Avançar" button, or any DnD wiring was touched.
- Built `/admin/cards`: a cross-client, read-plus-override audit screen (Table: Cliente/Título/Responsável/Etapa/Checklist/Anexos/marker), a client filter Select, and a per-card Dialog showing the full checklist/attachment/override audit trail plus the "Forçar avanço" `AlertDialog` (UI-SPEC copy verbatim), offered only when the card is in `revisao_interna` AND the gate is actually blocked. Added to the Admin sidebar; no drag-and-drop, no card creation.

## Task Commits

1. **Task 1: Ship the override audit table with its RLS proof** — `bba7e83` (feat)
2. **Task 2: Build the Admin-only forceAdvanceOverride action and surface the override marker on the PM board** — `9e29ac3` (feat)
3. **Task 3: Build the /admin/cards audit screen and wire it into the Admin sidebar** — `c9ae86e` (feat)

Task 4 (checkpoint:human-verify, `gate="blocking"`) has **not** been executed — see "Next Phase Readiness" below. No plan-metadata commit has been made yet; that happens after the checkpoint is signed off.

## Files Created/Modified

- `supabase/migrations/0022_card_checklist_overrides.sql` — append-only override audit table, RLS (PM+Admin select, Admin-only insert), GRANT `select, insert` only
- `supabase/tests/0012_rls_card_checklist_overrides_scoping_test.sql` — 4-assertion pgTAP proof (PM read own/blocked-from-other/blocked-from-insert-even-own; Admin insert)
- `lib/actions/card-overrides.ts` — `forceAdvanceOverride` Server Action
- `lib/validation/cards.ts` — added `forceAdvanceSchema`/`ForceAdvanceInput`
- `app/pm/board/page.tsx` — batched `card_checklist_overrides` read, `overridden_by` folded into the single `resolvePmNames` call, `BoardCard.overrides` + exported `BoardOverride` type
- `app/pm/board/board-panel.tsx` — new `OverrideHistory` component rendered inside the checklist section header
- `app/admin/cards/page.tsx` — RSC: clients + cards (optional `?client=` filter) + batched checklist/attachment/override reads + one `resolvePmNames` call
- `app/admin/cards/card-audit-panel.tsx` — client filter Select, cards Table, per-card audit Dialog with the "Forçar avanço" `AlertDialog`
- `app/admin/layout.tsx` — added `/admin/cards` ("Cards", `KanbanIcon`) to the sidebar; existing entries (including "Checklists") untouched

## Decisions Made

- **Migration/test renumbering (0019/0011 → 0022/0012):** the plan was written before the 2026-08-04/05 P0/P1/P2 pivot landed `0019_clients_archived_at.sql`, `0020_client_files_update_grant.sql`, `0021_pm_assigned_clients_status_check.sql`, and test `0011_rls_pm_status_defense_test.sql` on main. Confirmed via `ls supabase/migrations/` and `ls supabase/tests/` immediately before writing, per the plan's own read_first instruction to "confirm 0019 is genuinely the next free number before writing." Applied Rule 3 (blocking issue, file-naming collision) and renumbered to the next genuinely free slots. No other content deviates from the plan's DDL/RLS/pgTAP spec.
- **Hosted push deferred, not attempted-and-failed:** this worktree has no `.env.local` (confirmed absent, only `.env.local.example` present), so `SUPABASE_ACCESS_TOKEN` is unavailable and `npx supabase db push` cannot run at all — this is the same documented isolated-worktree limitation quick tasks 260722-hnm and 260805-kio both hit. Per the constraints given for this run, applied and pgTAP-verified against the **local** Supabase stack only (`npx supabase migration up --local` + `npx supabase test db`), and did not block Tasks 2/3 on the hosted push.
- **Controlled Dialog instead of `DialogTrigger asChild` on `TableRow`:** `TableRow` (`components/ui/table.tsx`) is a plain function component, not `React.forwardRef`. Wrapping it as the single child of a Radix `Slot` (which `asChild` uses) would emit a ref-forwarding console warning even though click-through would still work. Used `useState` + `onClick`/`onKeyDown` on the row and a controlled `<Dialog open={open} onOpenChange={setOpen}>` instead — functionally identical, no warning.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Renumbered migration/test files from the plan's reserved 0019/0011 to 0022/0012**
- **Found during:** Task 1, before writing the migration file (per the plan's own read_first instruction to verify the next free number)
- **Issue:** `supabase/migrations/0019_clients_archived_at.sql`, `0020_client_files_update_grant.sql`, `0021_pm_assigned_clients_status_check.sql`, and `supabase/tests/0011_rls_pm_status_defense_test.sql` already existed on `main`, landed by the 2026-08-04/05 pivot after this plan was authored. Writing to `0019`/`0011` would have collided with existing files.
- **Fix:** Used `0022_card_checklist_overrides.sql` and `0012_rls_card_checklist_overrides_scoping_test.sql` — the next genuinely free numbers — and documented the renumbering in both files' header comments.
- **Files modified:** `supabase/migrations/0022_card_checklist_overrides.sql`, `supabase/tests/0012_rls_card_checklist_overrides_scoping_test.sql`
- **Verification:** `npx supabase migration up --local` applied cleanly; `npx supabase test db` — 13 files/53 tests, 0 `not ok`, no regressions in `0001`–`0011`.
- **Committed in:** `bba7e83` (Task 1 commit)

**2. [Rule 3 - Blocking] Hosted Supabase push not attempted (no credentials in this worktree), applied locally only**
- **Found during:** Task 1
- **Issue:** The plan's Task 1 instructions call for `export SUPABASE_ACCESS_TOKEN from .env.local` then `npx supabase db push` against the linked hosted project. This worktree has no `.env.local` at all (confirmed: only `.env.local.example` is present, `SUPABASE_ACCESS_TOKEN` is not set in the environment).
- **Fix:** Per this run's explicit instructions, applied and verified migration `0022` against the **local** Supabase stack only (`npx supabase migration up --local`, `npx supabase test db`) and proceeded with Tasks 2/3, which only depend on the local schema for the pgTAP suite and `tsc`/type inference.
- **Files modified:** none (verification-only deviation)
- **Verification:** Local apply + pgTAP suite green (see above). Hosted state is NOT yet verified — see "Next Phase Readiness."
- **Committed in:** `bba7e83` (Task 1 commit, migration itself)

---

**Total deviations:** 2 auto-fixed (both Rule 3 — blocking issues that would otherwise have prevented completing Task 1 as literally written)
**Impact on plan:** Both deviations are mechanical (file numbering, execution environment) — no change to the DDL, RLS policies, pgTAP assertions, Server Action logic, or UI contract the plan specifies. No scope creep.

## Issues Encountered

None beyond the two deviations documented above.

## User Setup Required

**Hosted Supabase push is still pending.** The orchestrator (or whoever has hosted credentials) must run, from a checkout/worktree with `.env.local`'s `SUPABASE_ACCESS_TOKEN` set:

```bash
npx supabase db push
```

This applies `supabase/migrations/0022_card_checklist_overrides.sql` to the linked hosted project (`ancfwsgyzoostoidqzqj`, per STATE.md). Until this runs, `card_checklist_overrides` does not exist on the hosted database, and the Task 4 human-verify checkpoint (which requires a live `npm run dev` session against real data) cannot be walked through end-to-end against production — it can still be exercised against a local dev server pointed at the local Supabase stack, since the schema is live there.

## Next Phase Readiness

- **Tasks 1–3 are complete, committed, and locally verified** (`tsc --noEmit`, `npm run lint`, `npm run build`, `npm test`, `npx supabase test db` all green; `app/pm/board/actions.ts` confirmed byte-unchanged).
- **Task 4 (`checkpoint:human-verify`, `gate="blocking"`) has NOT been executed.** Per this run's constraints, execution stopped at this gate rather than attempting browser verification. The 12-step walkthrough in `03-05-PLAN.md` (lines 308–320) is ready to run as soon as:
  1. The hosted push above completes (or the developer verifies against a local dev server backed by the local Supabase stack, where the schema is already live), and
  2. A fresh agent/session picks up the plan at Task 4 with the developer present to respond to the resume-signal ("approved" or a description of what went wrong).
- No plan-metadata commit (SUMMARY + STATE + ROADMAP) has been made — per this run's instructions, only this SUMMARY.md is committed by the executor; STATE.md/ROADMAP.md updates are the orchestrator's responsibility after Task 4 is signed off.

---
*Phase: 03-content-production-kanban*
*Completed: 2026-08-05 (Tasks 1-3 only; Task 4 pending)*

## Self-Check: PASSED

- All 5 created files verified present on disk (migration, pgTAP test, card-overrides action, admin/cards page, admin/cards panel).
- All 3 task commit hashes (`bba7e83`, `9e29ac3`, `c9ae86e`) verified present in `git log --oneline --all`.
