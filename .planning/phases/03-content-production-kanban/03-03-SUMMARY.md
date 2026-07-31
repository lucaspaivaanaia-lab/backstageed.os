---
phase: 03-content-production-kanban
plan: 03
subsystem: database, ui
tags: [supabase, rls, pgtap, node-test, nextjs, server-actions, kanban, checklist-gate]

# Dependency graph
requires:
  - phase: 03-content-production-kanban
    plan: 01
    provides: checklist_templates / checklist_template_items / clients.checklist_template_id
  - phase: 03-content-production-kanban
    plan: 02
    provides: public.cards, lib/cards/stages.ts, createCard/advanceStage Server Actions, /pm/board screen with card detail Dialog
provides:
  - "public.card_checklist_items snapshot table: copy-on-entry (no template FK, D-04), two-hop RLS scoping through cards.client_id, GRANT"
  - "lib/cards/checklist-gate.ts: isGateBlocked/checklistProgress/GATE_BLOCKED_MESSAGE — framework-free pure predicate shared by render, action, and (03-08) the drag handler"
  - "lib/cards/checklist-snapshot.ts: snapshotChecklistForCard — the single reusable snapshot-on-entry routine for advanceStage now and moveCard/createCard in 03-07"
  - "advanceStage extended with gate-on-exit + snapshot-on-entry; toggleChecklistItem Server Action recording completed_at/completed_by"
  - "/pm/board card detail Dialog: checklist section with per-item audit lines, disabled Avançar with visible gate reason, board-face progress badge (with a no-template-safe neutral state)"
affects: [03-07 (moveCard/createCard reuse snapshotChecklistForCard verbatim — no second copy), 03-08 (drag handler imports isGateBlocked/GATE_BLOCKED_MESSAGE verbatim for the D-13 identical-message requirement, and replaces the badge slot with a flex row holding this same standalone badge plus a drag handle), 03-09 (inserts Descrição/Responsável sibling sections into this plan's single-column Dialog flow)]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Snapshot-not-live-bind: a copy table with zero FK back to its template (no template_id/template_item_id column) is how a D-04 'template edits don't retroactively mutate in-progress cards' guarantee is enforced at the schema level, not just in application logic"
    - "Snapshot-on-entry write ordering: the copy-insert runs and its error is checked BEFORE the stage-transition update, because the Supabase JS client has no multi-statement transaction — this makes the only possible mid-request failure mode 'stuck in place with an inert checklist', never 'advanced with an unguarded one' (03-RESEARCH.md Pitfall 3)"
    - "Gate predicate as a single framework-free pure module (lib/cards/checklist-gate.ts) imported identically by the RSC render (disabled attribute), the Server Action (server-side re-enforcement), and a later Client Component drag handler — one predicate, one message string, never re-derived per call site"
    - "No-template fail-safe: an empty checklist item list (client has no assigned template) must never block a stage transition — isGateBlocked([]) === false by contract, tested explicitly, and surfaced as an informational EmptyState rather than an error"

key-files:
  created:
    - supabase/migrations/0016_card_checklist_items.sql
    - supabase/tests/0008_rls_card_checklist_items_scoping_test.sql
    - lib/cards/checklist-gate.ts
    - lib/cards/checklist-gate.test.ts
    - lib/cards/checklist-snapshot.ts
  modified:
    - lib/validation/cards.ts
    - app/pm/board/actions.ts
    - app/pm/board/page.tsx
    - app/pm/board/board-panel.tsx

key-decisions:
  - "card_checklist_items carries no template_id/template_item_id FK by design (D-04) — the Task 1 acceptance gate greps the migration file for zero occurrences of either identifier to prove the snapshot is a copy, never a live binding"
  - "The snapshot routine (lib/cards/checklist-snapshot.ts) accepts an already-constructed RLS-scoped Supabase client as its first argument rather than constructing its own, so it can never reach for the service-role client and so 03-07's moveCard/createCard can call it with their own already-scoped client without a second implementation"
  - "advanceStage deliberately gained no bypass parameter (no force/skipGate/override argument) — the Admin override is a separate exported action in a later plan (03-05's forceAdvanceOverride), keeping this action's audit guarantee (CHK-04) impossible to defeat from within itself"
  - "Board-face badge slot renders StatusBadge as a standalone element with no wrapper div/positioning classes, specifically so 03-08 can replace the slot with a flex row (badge + drag handle) without unpicking baked-in layout"

requirements-completed: [CHK-03, KAN-02]

# Metrics
duration: ~35min (Tasks 1-3) + human verification + one mid-checkpoint bug fix
completed: 2026-07-31
---

# Phase 3 Plan 03: Checklist Gate Summary

**A card entering revisão interna gets its client's checklist copied onto it as an immutable snapshot (D-04), the PM checks items off with a recorded who/when, and the "Avançar" button out of revisão interna is rendered disabled while anything is unchecked (D-06) — independently re-enforced server-side inside advanceStage via the same shared gate predicate.**

## Status: COMPLETE (4 of 4 tasks)

Tasks 1-3 completed by the executor, committed, and automated-verified. Task 4 (`checkpoint:human-verify`, `gate="blocking"`) was walked through by the developer against the merged `main` branch on 2026-07-31. During the first walkthrough the developer found a UI-honesty issue in the board-face badge (see Deviations below); it was root-caused and fixed in the same session, and the developer re-verified all 12 steps (the original 10 plus the badge-fix check and the disabled-Avançar-gate check called out explicitly) and replied "approved" with no remaining issues. Plan closed.

## Accomplishments

- `public.card_checklist_items` shipped (migration `0016`): `card_id` FK to `cards` with `on delete cascade`, `label`, `sort_order`, `completed_at`/`completed_by` (audit columns, no default completion), index on `card_id` for the board's batched read, RLS enabled with two-hop scoping through `cards.client_id` (`card_checklist_items_select_scoped`, `card_checklist_items_write_scoped`), GRANT shipped in the same migration. Zero occurrences of `template_id`/`template_item_id` — the table is a one-time copy, never live-bound to the template it was copied from (D-04)
- pgTAP suite (`0008_rls_card_checklist_items_scoping_test.sql`, `plan(4)`) proves: pm_a sees exactly its client's checklist items, sees zero of another client's items even though scoping travels through `cards.client_id` rather than a direct `client_id` column, cannot insert an item against another client's card (RLS violation), and an update against another client's card silently matches zero rows
- `lib/cards/checklist-gate.ts`: pure, framework-free (`grep -cE "from \"@/lib/supabase|from \"react|from \"next"` returns 0) module exporting `checklistProgress`, `isGateBlocked`, and the verbatim `GATE_BLOCKED_MESSAGE` copy string — one predicate imported identically by the RSC render, the Server Action, and (from 03-08) the drag handler
- `lib/cards/checklist-snapshot.ts`: the single reusable `snapshotChecklistForCard` routine — idempotent (a card re-entering revisão interna keeps its original snapshot and audit trail), fail-safe on a null `checklist_template_id` (returns success with zero items rather than blocking), reads the template's items ordered by `sort_order` and inserts one row per item with `completed_at`/`completed_by` left null
- `advanceStage` extended with two blocks around its existing parse → re-read → `nextStage` → update shape: a gate check (re-reads the card's own checklist rows server-side, never trusts a client completion claim, returns `GATE_BLOCKED_MESSAGE` when blocked) evaluated before leaving `revisao_interna`, and a snapshot call (via the shared routine) evaluated before entering it, with the snapshot's error checked first so the only failure mode is "stuck in place with an inert checklist" — never "advanced unguarded" (Pitfall 3 write ordering)
- `toggleChecklistItem` Server Action: writes `completed_at`/`completed_by` from `auth.getUser()`, never from caller input; the RLS write policy scopes the update per-client so a foreign item id simply matches zero rows
- `/pm/board` card detail Dialog: checklist section (checkbox + `Marcado por {nome} em {data}` audit line per item, interactive only in `revisao_interna` and read-only afterward), "Nenhum checklist configurado" informational `EmptyState` for clients with no assigned template (does not block Avançar), "Avançar" rendered disabled with `GATE_BLOCKED_MESSAGE` visible above it while any item is unchecked
- Board-face progress badge on `revisao_interna` cards: `{checked}/{total} concluídos` in warning/success tone, rendered as a standalone `StatusBadge` with no wrapper layout so 03-08 can drop a drag handle alongside it later

## Task Commits

1. **Task 1: Ship the checklist snapshot table with its RLS proof and the pure gate module, then push it live** — `5fb61ac` (feat)
2. **Task 2: Extract the reusable snapshot routine, extend advanceStage with snapshot-on-entry and gate-on-exit, and add toggleChecklistItem** — `98dc8c0` (feat)
3. **Task 3: Render the checklist and the disabled-Avançar gate in the card detail Dialog** — `35ce3cb` (feat)
4. **Task 4: Human verification** — CONFIRMED by developer 2026-07-31 (all 12 steps passed after the mid-checkpoint badge fix; no task commit, verification only)

Mid-checkpoint bug-fix commit (found by the developer during Task 4 verification, fixed and re-verified before final approval): `1297b65` (fix)

## Files Created/Modified
- `supabase/migrations/0016_card_checklist_items.sql` - `card_checklist_items` copy table, two-hop RLS + GRANT
- `supabase/tests/0008_rls_card_checklist_items_scoping_test.sql` - pgTAP: per-client scoping through `cards.client_id` on select/insert/update
- `lib/cards/checklist-gate.ts` - `checklistProgress`, `isGateBlocked`, `GATE_BLOCKED_MESSAGE`
- `lib/cards/checklist-gate.test.ts` - 7 `node:test` cases covering all documented behaviors
- `lib/cards/checklist-snapshot.ts` - `snapshotChecklistForCard`, `SNAPSHOT_FAILED_MESSAGE`
- `lib/validation/cards.ts` - added `toggleChecklistItemSchema`
- `app/pm/board/actions.ts` - `advanceStage` extended with gate-on-exit + snapshot-on-entry; new `toggleChecklistItem`
- `app/pm/board/page.tsx` - batched `card_checklist_items` read across board card ids, `resolvePmNames` for audit-line display names, `checklist_template_id` presence boolean threaded to the panel
- `app/pm/board/board-panel.tsx` - checklist section + audit lines in the Dialog, disabled-Avançar gate, board-face progress badge (with the no-template-safe neutral variant added by the mid-checkpoint fix)

## Decisions Made

See `key-decisions` in the frontmatter above:
- `card_checklist_items` has no FK back to the template it was copied from (D-04, enforced by a grep gate on the migration file)
- `snapshotChecklistForCard` takes an already RLS-scoped Supabase client rather than constructing its own, so it can never escalate to the service-role client and so 03-07 can call it verbatim
- `advanceStage` gained no bypass parameter — the Admin override path is a separate action in a later plan
- The board-face badge slot stays a bare `StatusBadge` with no wrapper so 03-08 can add a drag handle beside it without restyling

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Board card badge implied a completed checklist for clients with no assigned template**
- **Found during:** Task 4 human verification (developer walkthrough of step 9 — the no-template-client case)
- **Issue:** `BoardCardItem`'s board-face badge for `revisao_interna` cards computed its tone from `progress.checked === progress.total` without first checking whether the client actually had a checklist template assigned. For a client with no template, `checklistProgress([])` returns `{ total: 0, checked: 0 }`, so `0 === 0` evaluated true and rendered a green "success" tone "0/0 concluídos" badge — visually indistinguishable from a genuinely completed 3/3 checklist. This was a UI-honesty bug, not a gating bug: CHK-04's guarantee was untouched (advancing without a template remains intentionally unblocked per the D-06 fail-safe), and the Dialog's own "Nenhum checklist configurado" `EmptyState` was already correct.
- **Fix:** Added a `hasChecklistTemplate` branch in `BoardCardItem`'s badge slot: when the client has no assigned template, render a neutral-tone "Sem checklist" badge instead of computing a progress badge from an empty item list.
- **Files modified:** `app/pm/board/board-panel.tsx`
- **Verification:** Developer re-walked step 9 (no-template client entering revisão interna) and confirmed the board now shows "Sem checklist" in neutral tone rather than a false-positive success badge, then re-confirmed all 11 remaining steps before replying "approved".
- **Commit:** `1297b65`

### Out-of-scope, deferred (not fixed)
None.

---

**Total deviations:** 1 auto-fixed (Rule 1 - bug, found by the developer mid-checkpoint and fixed in the same session before re-verification), 0 deferred.

## Issues Encountered
None beyond the deviation documented above.

## User Setup Required
None - no new external service configuration required.

## Next Phase Readiness / Next Steps

- `lib/cards/checklist-snapshot.ts`'s `snapshotChecklistForCard` and `lib/cards/checklist-gate.ts`'s `isGateBlocked`/`GATE_BLOCKED_MESSAGE` are the two modules 03-07's `moveCard`/extended `createCard` and 03-08's drag handler must import verbatim — the Task 2 acceptance gate (`checklist_template_items` appears zero times in `app/pm/board/actions.ts`) structurally forces this, since the only place that string can legally appear is inside the snapshot module.
- The board card's `badge` slot and the card detail Dialog's single-column sibling-block flow are both shaped per the `03-03-PLAN.md` rescope notice so that 03-08 (drag handle beside the badge) and 03-09 (Descrição/Responsável sections above the checklist) do not need to restructure this plan's markup.
- Phase 3's next waves (03-07/03-08/03-09, the dnd-kit/rich-card rescope from `03-CONTEXT.md`) can now proceed against a merged `main` that includes this plan's checklist gate.

---
*Phase: 03-content-production-kanban*
*Completed: 2026-07-31*

## Self-Check: PASSED

- FOUND: supabase/migrations/0016_card_checklist_items.sql
- FOUND: supabase/tests/0008_rls_card_checklist_items_scoping_test.sql
- FOUND: lib/cards/checklist-gate.ts
- FOUND: lib/cards/checklist-gate.test.ts
- FOUND: lib/cards/checklist-snapshot.ts
- FOUND commit: 5fb61ac (Task 1)
- FOUND commit: 98dc8c0 (Task 2)
- FOUND commit: 35ce3cb (Task 3)
- FOUND commit: 1297b65 (mid-checkpoint bug fix)
