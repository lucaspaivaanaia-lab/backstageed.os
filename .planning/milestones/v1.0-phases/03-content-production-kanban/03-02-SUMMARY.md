---
phase: 03-content-production-kanban
plan: 02
subsystem: database, ui
tags: [supabase, rls, pgtap, zod, react-hook-form, nextjs, server-actions, kanban]

# Dependency graph
requires:
  - phase: 05-access-roles
    provides: is_admin() / pm_assigned_clients() RLS helpers, PM/Admin/Client role model
  - phase: 03-content-production-kanban
    plan: 01
    provides: checklist_templates / clients.checklist_template_id (not consumed by this plan yet — 03-03's slice)
provides:
  - "public.cards table: self-referencing (parent_card_id), denormalized client_id, card_type/card_stage enums, RLS + GRANT"
  - "pgTAP proof of per-client card scoping including the self-referencing-hierarchy leakage regression"
  - "lib/cards/stages.ts: STAGE_ORDER/STAGE_LABELS/nextStage — single source of truth for stage progression"
  - "createCard / advanceStage Server Actions (app/pm/board/actions.ts)"
  - "/pm/board screen: client switcher, 5 fixed stage columns, card creation, card detail dialog with Avançar"
affects: [03-03 (checklist gate attaches to advanceStage's revisao_interna transition and the card detail Dialog), 03-04 (Drive attachments attach to the same Dialog), 03-06 (package/piece creation extends CreateCardButton's cardType selector and renders the `packages` array this plan already threads through but does not render)]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Self-referencing table RLS: denormalize the scoping column (client_id) onto every row including children, never infer it through a parent join — avoids Postgres 'infinite recursion detected in policy'"
    - "Stage progression expressed in exactly one pure module (lib/cards/stages.ts) — no inline ordered stage arrays anywhere else in the codebase"
    - "Server Action target-state derivation: the client never supplies the next stage, only the card id — the server re-reads current state via RLS and computes the transition"

key-files:
  created:
    - supabase/migrations/0015_cards.sql
    - supabase/tests/0007_rls_cards_scoping_test.sql
    - lib/cards/stages.ts
    - lib/cards/stages.test.ts
    - lib/validation/cards.ts
    - app/pm/board/actions.ts
    - app/pm/board/page.tsx
    - app/pm/board/board-panel.tsx
  modified:
    - app/pm/layout.tsx
    - package.json

key-decisions:
  - "Followed 03-RESEARCH.md Pattern 1 DDL verbatim for the self-referencing cards table (denormalized client_id, flat non-recursive RLS)"
  - "app/pm/board/actions.ts imports only nextStage from lib/cards/stages, not STAGE_ORDER (STAGE_ORDER is genuinely unused in that file — page.tsx and board-panel.tsx are the actual STAGE_ORDER/STAGE_LABELS consumers); avoids an unused-import lint failure while still satisfying 'never an inline stage array'"
  - "BoardPanel's props type declares `packages: BoardCard[]` (passed by page.tsx per 03-RESEARCH.md Pitfall 4) but the destructure omits it — the array is threaded through the data layer now so 03-06 doesn't need to touch page.tsx's return shape, but rendering it is explicitly out of this plan's scope"

requirements-completed: [KAN-01, KAN-02, KAN-03]

# Metrics
duration: ~1h10min (Tasks 1-3) + human verification
completed: 2026-07-31
---

# Phase 3 Plan 02: Core Content Production Board Summary

**Self-referencing `cards` table (single/package/piece) with non-recursive per-client RLS proven by pgTAP, a pure `nextStage` stage-progression module, and the `/pm/board` screen where a PM creates a single-post card and advances it through five fixed stages via an explicit "Avançar" button (no drag-and-drop).**

## Status: COMPLETE (4 of 4 tasks)

Tasks 1-3 completed by the executor, committed, and automated-verified. Task 4 (`checkpoint:human-verify`, `gate="blocking"`) was walked through by the developer against the merged `main` branch on 2026-07-31 — all 9 verification steps confirmed correct ("approved"). Plan closed.

**Post-approval feedback (not part of this plan's scope):** the developer also requested drag-and-drop stage advancement and Trello-style rich cards (description, assignees, column-scoped creation) after approving. These directly revisit locked decision D-05 (explicit button, no DnD) and introduce fields outside Phase 3's requirements (KAN/CHK). Phase 3 execution is paused pending re-discussion/re-planning — see `.planning/phases/03-content-production-kanban/03-CONTEXT.md` for the pending decision reversal.

## Accomplishments

- `public.cards` table shipped: self-referencing (`parent_card_id`), `card_type` (single/package/piece) and `card_stage` (5-value) enums, denormalized `client_id` on every row (including pieces) so every RLS policy is a flat, non-recursive check — RLS enabled, `cards_select_scoped`/`cards_insert_scoped`/`cards_update_scoped` policies, and the GRANT all shipped in the same migration (0015)
- `cards_package_has_no_stage` and `cards_piece_requires_parent` check constraints enforce D-02's package/piece shape at the database layer
- pgTAP suite (`0007_rls_cards_scoping_test.sql`, `plan(5)`) proves: pm_a sees exactly its assigned client's card, sees zero of an unassigned client's cards, sees **zero `piece` rows at all** (the self-referencing-hierarchy leakage regression — a piece is invisible on its own denormalized `client_id` independent of its parent), cannot insert a card for an unassigned client, and an update targeting an unassigned client's cards silently matches zero rows rather than mutating them
- Migration 0015 applied to the linked hosted Supabase project (`ancfwsgyzoostoidqzqj`), confirmed via `supabase migration list --linked`; full local pgTAP suite (0001-0007) green, 0 `not ok` lines
- `lib/cards/stages.ts`: `STAGE_ORDER`, `STAGE_LABELS`, `nextStage()` — the only place stage progression is expressed in the codebase; 5 unit tests (`node --test`) covering the behaviors specified in the plan
- `createCard` / `advanceStage` Server Actions (`app/pm/board/actions.ts`): both RLS-scoped only (never the service-role client); `createCard` re-resolves the target client via RLS before insert; `advanceStage` re-reads the card via RLS and derives the target stage from `nextStage()` — the target stage is never a caller-supplied argument
- `/pm/board` screen: RSC loads the client roster + the active client's cards grouped into 5 fixed columns by `STAGE_ORDER` (package parents excluded per Pitfall 4, threaded through as a separate `packages` array for 03-06 to render later); client switcher drives the active client via the URL (`?client=<id>`, D-10); "Criar card" dialog (react-hook-form + zod, title-only, `cardType` fixed to `"single"`); card detail dialog with a stage badge and an "Avançar" button, disabled at `agendamento`
- "Produção" nav entry added to the PM sidebar

## Task Commits

1. **Task 1: Ship the cards schema with its RLS proof and the pure stage module, then push it live** — `d681d24` (feat)
2. **Task 2: Build createCard and advanceStage Server Actions** — `a77a0bf` (feat)
3. **Task 3: Build the /pm/board screen and wire it into the PM sidebar** — `e75cc91` (feat)
4. **Task 4: Human verification** — CONFIRMED by developer 2026-07-31 (all 9 steps passed; no commit, verification only)

## Files Created/Modified
- `supabase/migrations/0015_cards.sql` - self-referencing `cards` table, `card_type`/`card_stage` enums, non-recursive RLS + GRANT
- `supabase/tests/0007_rls_cards_scoping_test.sql` - pgTAP: per-client scoping + self-referencing-hierarchy leakage regression
- `lib/cards/stages.ts` - `STAGE_ORDER`, `STAGE_LABELS`, `nextStage()`
- `lib/cards/stages.test.ts` - 5 unit tests for `nextStage`/`STAGE_ORDER`/`STAGE_LABELS`
- `lib/validation/cards.ts` - `createCardSchema`, `advanceStageSchema`
- `app/pm/board/actions.ts` - `createCard`, `advanceStage` Server Actions
- `app/pm/board/page.tsx` - RSC: loads roster + client's cards, groups by stage
- `app/pm/board/board-panel.tsx` - client switcher, 5-column board, create-card dialog, card detail dialog
- `app/pm/layout.tsx` - added "Produção" sidebar nav item
- `package.json` - extended `test` script with `lib/cards/*.test.ts`

## Decisions Made
- `app/pm/board/actions.ts` imports only `nextStage` from `lib/cards/stages`, not `STAGE_ORDER` — the plan's action text names both, but `STAGE_ORDER` has no actual use inside `actions.ts` (only `page.tsx`/`board-panel.tsx` consume it for column grouping/labels); importing it unused would fail ESLint's `no-unused-vars`. The binding acceptance gate ("no inlined ordered stage array in this file") is satisfied regardless.
- `BoardPanel`'s prop type declares `packages: BoardCard[]` (page.tsx passes it per 03-RESEARCH.md Pitfall 4's "collect separately, don't crash") but the component destructure omits it — the data flows through so plan 03-06 doesn't need to touch `page.tsx`'s return shape when it adds package rendering, but no package UI exists yet in this plan (intentional, matches the plan's explicit scope).
- Card detail Dialog's `role="button"` wrapper (rather than a native `<button>`) around `DataCard` avoids nesting a `<button>` around Card's internal markup while keeping it keyboard-focusable (`tabIndex={0}`) and a valid Radix `DialogTrigger asChild` child.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Worktree lacked `.env.local` / linked-project state (structural, not a code fix)**
- **Found during:** Task 1 start (before `supabase db push`)
- **Issue:** This git worktree is a fresh checkout; `.env.local` and `supabase/.temp/project-ref`/`pooler-url` are both gitignored, so neither existed here — same class of gap 03-01-SUMMARY.md documented for its own worktree.
- **Fix:** Copied `.env.local` and `supabase/.temp/project-ref`/`pooler-url` from the main checkout into this worktree (both gitignored — confirmed via `git status --short` showing no tracked change).
- **Files modified:** none (gitignored local files only)
- **Verification:** `supabase migration list --linked` succeeded afterward.
- **Committed in:** n/a

**2. [Rule 3 - Blocking] Worktree lacked `node_modules`**
- **Found during:** Task 1, before `npm test`
- **Issue:** Fresh worktree checkout, `node_modules` did not exist.
- **Fix:** Ran `npm install`. `package-lock.json` was rewritten by the install (pre-existing lockfile drift, same class of issue 03-01-SUMMARY.md logged) and reverted via `git checkout -- package-lock.json` immediately after — out of this plan's scope per the Scope Boundary rule.
- **Files modified:** none (reverted)
- **Committed in:** n/a

**3. [Rule 3 - Blocking] Local Docker Supabase database was not on migration 0015 when `supabase test db` first ran**
- **Found during:** Task 1, first `npx supabase test db` run
- **Issue:** `0007_rls_cards_scoping_test.sql` failed with `relation "public.cards" does not exist` — the local Docker Postgres instance had not been re-migrated since 0015 was written (it only picks up new migrations on `db reset`, not automatically on `test db`).
- **Fix:** Ran `npx supabase db reset` (applies all local migrations 0001-0015 fresh), then re-ran `npx supabase test db` — all of 0001-0007 passed with 0 `not ok` lines.
- **Files modified:** none (local Docker state only)
- **Committed in:** n/a

**4. [Rule 1 - Bug] Doc comment in `app/pm/board/actions.ts` literally contained the string `createAdminClient()`, failing the acceptance gate's exact `grep -c 'createAdminClient'` == 0 check**
- **Found during:** Task 2, acceptance-criteria verification
- **Issue:** The doc comment explained the action deliberately avoids the service-role client by naming it, which the acceptance gate greps for literally (to prove no accidental service-role escalation was introduced) — the explanatory mention itself tripped the same grep meant to catch a real usage.
- **Fix:** Reworded the comment to describe "the service-role client" without the literal identifier.
- **Files modified:** `app/pm/board/actions.ts`
- **Verification:** `grep -c 'createAdminClient' app/pm/board/actions.ts` returns 0.
- **Committed in:** `a77a0bf` (Task 2's commit)

### Out-of-scope, deferred (not fixed)
None beyond the already-reverted `package-lock.json` drift noted above.

---

**Total deviations:** 4 auto-fixed (3 Rule 3 - blocking preconditions for Task 1's BLOCKING schema-push/test-suite step, 1 Rule 1 - bug in a doc comment), 0 deferred. No scope creep — none altered the schema, RLS shape, or Server Action behavior beyond what the plan specifies.

## Issues Encountered
None beyond the deviations documented above.

## User Setup Required
None - no new external service configuration required. `.env.local`/`supabase/.temp/` were copied from the already-configured main checkout (gitignored, not new secrets).

## Next Phase Readiness / Next Steps

**This plan is NOT closed.** Task 4 (`checkpoint:human-verify`, `gate="blocking"`) is outstanding: a developer must run the app (against a branch/worktree where these commits are merged, since a fresh dev server on `main` will not see them until merged — same situation 03-01-SUMMARY.md's "Execution Note" documented), walk the 9 verification steps in `03-02-PLAN.md` Task 4 (sidebar entry, empty states, 5-column layout, card creation, stage advance through all 5 stages, disabled "Avançar" at agendamento, reload persistence, cross-client isolation), and reply "approved" or describe what's wrong. Until that sign-off happens, `03-03` (checklist gate) and later plans that extend this same card detail Dialog should not assume this UI is final.

- `public.cards`, `lib/cards/stages.ts`, and both Server Actions are ready for `03-03`'s checklist-gate logic to extend `advanceStage` (snapshot-on-entry into `revisao_interna`, gate check before leaving it) without touching this plan's already-shipped re-validation discipline.
- The `packages` array is already threaded from `page.tsx` through to `BoardPanel`'s prop type, unrendered — `03-06` can add package-row rendering without changing the data-loading shape.

## Execution Note (worktree isolation)

This executor ran as a parallel worktree agent (`worktree-agent-a142178ca7ce3ab5b`) and cannot itself launch a browser session, run `npm run dev` interactively, or receive the developer's verification reply — Task 4 is inherently a human-in-the-loop step. Per the plan's own instruction ("do not self-approve, and do not proceed to the summary until the developer responds") and this executor's checkpoint protocol, execution stops here and control returns to the orchestrator, which owns merging these commits and coordinating the human-verify step (as it did for 03-01).

---
*Phase: 03-content-production-kanban*
*Paused: 2026-07-31 (Tasks 1-3 of 4 complete; Task 4 checkpoint outstanding)*

## Self-Check: PASSED

- FOUND: supabase/migrations/0015_cards.sql
- FOUND: supabase/tests/0007_rls_cards_scoping_test.sql
- FOUND: lib/cards/stages.ts
- FOUND: lib/cards/stages.test.ts
- FOUND: lib/validation/cards.ts
- FOUND: app/pm/board/actions.ts
- FOUND: app/pm/board/page.tsx
- FOUND: app/pm/board/board-panel.tsx
- FOUND commit: d681d24 (Task 1)
- FOUND commit: a77a0bf (Task 2)
- FOUND commit: e75cc91 (Task 3)
