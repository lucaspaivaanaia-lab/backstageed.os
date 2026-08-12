---
phase: 04-client-approval-scheduling
plan: 01
subsystem: database
tags: [postgres, rls, supabase, security-definer, zod, node-test, pgtap]

# Dependency graph
requires:
  - phase: 05-access-roles
    provides: user_role enum (admin/pm/client/editor), is_admin()/pm_assigned_clients() RLS helpers, the Editor-role RLS/column-restriction precedent (migration 0031) this plan mirrors
  - phase: 03-content-production-kanban
    provides: cards/card_checklist_items/card_attachments schema, card_stage enum, nextStage/STAGE_ORDER, assertPmOrAdminCaller/isBoardWriteAuthorized precedent, package-rollup.ts "computed, never stored" doc-comment convention
provides:
  - "Client-role RLS branch on cards_select_scoped/cards_update_scoped/card_attachments_select_scoped, stage-filtered (aprovacao_cliente/agendamento only) and status-hardened"
  - "client_adjustment_comment/publish_at columns on public.cards (nullable, no enum change)"
  - "client_request_adjustment SECURITY DEFINER RPC -- the only way a Client's write can move a card to producao, since Postgres RLS requires an UPDATE's post-image row to also satisfy the table's SELECT policy"
  - "buildClientApprovePayload/buildClientAdjustPayload pure payload builders (lib/security/client-card-write-scope.ts)"
  - "isReadyToPublish pure computation (lib/cards/publish-status.ts, SCH-02, D-04)"
  - "approveCardSchema/requestAdjustmentSchema + publishAt sibling field on updateCardDetailsSchema (lib/validation/cards.ts)"
  - "assertPmOrAdminCaller extended to all 9 PM/Admin Server Actions in app/pm/board/actions.ts (was 3)"
  - "assertEditorCaller/isEditorCardWriteAuthorized gating updateCardDescriptionAsEditor (app/editor/actions.ts)"
affects: [04-02-client-board, 04-03-pm-publish-scheduling]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "SECURITY DEFINER RPC as the write path for an RLS transition that would otherwise require the post-image row to remain visible under the table's own SELECT policy (a genuine Postgres RLS constraint, not a policy-wording bug) -- new pattern for this codebase, first used in client_request_adjustment"
    - "RLS decides rows, Server Action/RPC decides columns -- Client's two write paths mirror the Editor role's own split (editor-card-write-scope.ts), but requestAdjustment's split lives inside a SECURITY DEFINER function body instead of a plain `.update()` call"

key-files:
  created:
    - supabase/migrations/0032_client_approval_scheduling.sql
    - supabase/tests/0018_rls_client_card_scoping_test.sql
    - lib/security/client-card-write-scope.ts
    - lib/security/client-card-write-scope.test.ts
    - lib/cards/publish-status.ts
    - lib/cards/publish-status.test.ts
    - lib/security/editor-card-write-authz.ts
    - lib/security/editor-card-write-authz.test.ts
  modified:
    - lib/validation/cards.ts
    - app/pm/board/actions.ts
    - app/pm/board/board-panel.tsx
    - lib/security/board-write-authz.ts
    - lib/security/board-write-authz.test.ts
    - app/editor/actions.ts

key-decisions:
  - "Discovered live (not in RESEARCH.md): Postgres RLS requires an UPDATE's post-image row to satisfy the table's SELECT policy, not just the UPDATE policy's own WITH CHECK -- since a Client must never SELECT a 'producao' card (locked must-have), requestAdjustment's aprovacao_cliente -> producao transition is structurally impossible via the plain `.update()` 04-RESEARCH.md Pattern 2 drafted. Fixed with a SECURITY DEFINER RPC (client_request_adjustment) that re-implements the row/stage/comment boundary explicitly and bypasses RLS internally for its own write. approveCard's own transition (-> agendamento) is unaffected (agendamento IS in the Client's SELECT branch) and stays a plain `.update()`, exactly as researched."
  - "cards_update_scoped's WITH CHECK Client branch was also missing 'agendamento' in the first draft -- fixed to list all three legal post-write stages (aprovacao_cliente no-op, producao, agendamento)."

patterns-established:
  - "Pattern: when RLS SELECT+UPDATE policies interact to block a legitimate role-narrowing write, wrap it in a SECURITY DEFINER RPC scoped to exactly that one transition, re-deriving every boundary RLS would have enforced (caller identity, row ownership, current-stage gate) explicitly inside the function body."

requirements-completed: [KAN-04, APR-01, APR-02, APR-03, SCH-01, SCH-02]

# Metrics
duration: ~85min (committed work; wall-clock longer due to a mid-session connection drop, recovered from git state per orchestrator instruction)
completed: 2026-08-12
---

# Phase 4 Plan 1: Client RLS Branch & Approval Schema Foundation Summary

**Client-role RLS branch (stage-filtered) on cards/card_attachments, two new cards columns, a SECURITY DEFINER RPC for the one Client write Postgres RLS cannot express as a plain UPDATE, and the app-layer authorization gap this RLS widening opens closed on 10 total Server Actions (9 PM/Admin + 1 Editor).**

## Performance

- **Duration:** ~85 min of committed work (559b00a → de27e32), spread across a session that included a mid-execution connection drop; recovered by inspecting git log/status directly per the coordinator's instruction, no work was lost or redone
- **Tasks:** 5/5 complete
- **Files modified:** 14 (8 created, 6 modified)

## Accomplishments

- Migration `0032_client_approval_scheduling.sql`: a fourth, stage-filtered Client OR-branch on `cards_select_scoped`/`cards_update_scoped`/`card_attachments_select_scoped`, plus `client_adjustment_comment`/`publish_at` columns
- pgTAP `0018` (14 assertions): proves stage-filtered SELECT, bidirectional cross-client isolation, the `using`-clause write gate, attachment read/write scoping, and both Client write paths (RPC-based adjust, plain-update approve) including the RPC's own internal wrong-stage/cross-client rejections
- A **real, live Postgres RLS constraint discovered and fixed during execution**, not present in the original plan or research: an UPDATE's post-image row must also satisfy the table's SELECT policy, which made `requestAdjustment`'s `aprovacao_cliente → producao` transition structurally impossible via a plain `.update()` — closed with `client_request_adjustment`, a new SECURITY DEFINER RPC
- `lib/security/client-card-write-scope.ts` / `lib/cards/publish-status.ts`: pure, tested modules for Wave 2 to import directly
- `lib/validation/cards.ts`: `approveCardSchema`/`requestAdjustmentSchema` + `publishAt` sibling field
- All 6 previously-unguarded PM/Admin Server Actions in `app/pm/board/actions.ts` (`toggleChecklistItem`, `addAttachment`, `removeAttachment`, `validateCardAgainstChecklist`, `createPiece`, `removePiece`) now call `assertPmOrAdminCaller` before any read/write — 9 call sites total, up from 3
- `updateCardDescriptionAsEditor` (`app/editor/actions.ts`) now rejects any non-Editor/non-approved caller via a new `assertEditorCaller`/`isEditorCardWriteAuthorized`, closing the plan's own third-revision-flagged live bypass

## Task Commits

1. **Task 1: Migration 0032 — Client RLS branch + columns** - `559b00a` (feat)
2. **Task 2: pgTAP scoping test 0018** - `47a1508` (test)
3. **Task 3: Pure-logic modules + schema extensions** - `ad94b38` (feat), preceded by `b306c53` (fix — the RLS/RPC bug discovered during this task's own verification gate, touching Task 1/2's already-committed files)
4. **Task 4: Extend assertPmOrAdminCaller to 6 more Server Actions** - `2af9262` (fix)
5. **Task 5: Guard updateCardDescriptionAsEditor** - `de27e32` (fix)

_Note: Task 3's own full-suite verification gate (as required by its `<action>`) surfaced a real bug in Tasks 1/2's already-committed migration/pgTAP files — fixed forward in a new commit (`b306c53`), never amended, per this project's git safety protocol._

## Files Created/Modified

- `supabase/migrations/0032_client_approval_scheduling.sql` - Client RLS branch (3 policies), 2 new columns, `client_request_adjustment` SECURITY DEFINER RPC
- `supabase/tests/0018_rls_client_card_scoping_test.sql` - 14 pgTAP assertions
- `lib/security/client-card-write-scope.ts` (+test) - `buildClientApprovePayload`/`buildClientAdjustPayload`
- `lib/cards/publish-status.ts` (+test) - `isReadyToPublish`
- `lib/validation/cards.ts` - `approveCardSchema`/`requestAdjustmentSchema`/`publishAt`
- `app/pm/board/actions.ts` - 6 new `assertPmOrAdminCaller` call sites
- `app/pm/board/board-panel.tsx` - `publishAt: null` placeholder at the one `updateCardDetails` call site (deviation, see below)
- `lib/security/board-write-authz.ts` (+test) - doc comment + test updated for the 9-call-site scope
- `lib/security/editor-card-write-authz.ts` (+test) - `isEditorCardWriteAuthorized`
- `app/editor/actions.ts` - `assertEditorCaller` gate on `updateCardDescriptionAsEditor`

## Decisions Made

- **SECURITY DEFINER RPC for `requestAdjustment`'s write, not a policy tweak.** Verified empirically (isolated repro against the local Postgres instance, three independent controlled tests) that Postgres additionally requires an UPDATE's post-image row to satisfy the table's SELECT policy's `USING` clause, in addition to the UPDATE policy's own `WITH CHECK`. Since a Client must never `SELECT` a `producao` card (this plan's own locked must-have, proven by pgTAP assertion 2), widening the SELECT policy to fix this was not an option. `client_request_adjustment` re-implements the row/stage/comment boundary explicitly inside a `SECURITY DEFINER` function body (bypassing RLS internally, since the function owner is not subject to RLS on this table — `relforcerowsecurity` is `false`) and is the only path Wave 2's `requestAdjustment` Server Action can use for this transition. `approveCard`'s own transition (`→ agendamento`) is unaffected, since `agendamento` IS in the Client's SELECT branch, and remains a plain `.update()` exactly as `04-RESEARCH.md` Pattern 2 drafted.
- **`cards_update_scoped`'s WITH CHECK Client branch also needed `'agendamento'`**, not just `'aprovacao_cliente'`/`'producao'` as originally drafted — without it, `approveCard`'s own forward transition would have failed WITH CHECK. Fixed in the same migration file, same commit as the RPC addition.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] `cards_update_scoped`'s WITH CHECK Client branch missing `'agendamento'`**
- **Found during:** Task 3's own full-suite verification gate (`npx supabase test db`)
- **Issue:** The migration's WITH CHECK array (`stage in ('aprovacao_cliente', 'producao')`) never permitted the row to land in `'agendamento'` — `approveCard`'s own real transition — so that write would always have failed once Wave 2 built it.
- **Fix:** Added `'agendamento'` to the array.
- **Files modified:** `supabase/migrations/0032_client_approval_scheduling.sql`
- **Verification:** pgTAP assertion 13 (plain-update approve transition) now passes.
- **Committed in:** `b306c53`

**2. [Rule 1 - Bug] `requestAdjustment`'s transition to `producao` is structurally impossible via a plain `.update()`**
- **Found during:** Task 3's own full-suite verification gate — pgTAP assertions 5/6 (original numbering) failed with "new row violates row-level security policy for table cards" even though the WITH CHECK predicate manually evaluated to `true`
- **Issue:** A genuine, live Postgres RLS behavior, not a wording bug: for `UPDATE`, when a table also has a `SELECT` policy, Postgres additionally requires the post-image row to satisfy that `SELECT` policy's `USING` expression. Since `producao` is deliberately never in the Client's `cards_select_scoped` branch (internal WIP must stay hidden — this plan's own locked must-have), no wording of `cards_update_scoped`'s own `WITH CHECK` could make this write succeed via a plain RLS-scoped `.update()`. Verified via 3 independent isolated repros directly against the local Postgres instance (confirmed causality by toggling exactly one variable at a time).
- **Fix:** Added `client_request_adjustment(p_card_id uuid, p_comment text)`, a `SECURITY DEFINER` RPC that re-derives the caller's own Client identity/status, the target card's `client_id`/`stage`, and the non-empty-comment rule explicitly inside the function body, then performs the write with RLS bypassed internally (function owner is not subject to RLS on this table). Updated pgTAP 0018 to call this RPC for the adjust path and added 2 new assertions proving its own internal wrong-stage/cross-client rejections.
- **Files modified:** `supabase/migrations/0032_client_approval_scheduling.sql`, `supabase/tests/0018_rls_client_card_scoping_test.sql`
- **Verification:** `npx supabase test db` — all 18 numbered pgTAP files pass, 107 assertions total, zero regression
- **Committed in:** `b306c53`

**3. [Rule 3 - Blocking] `board-panel.tsx`'s `updateCardDetails` call site needed a `publishAt` value**
- **Found during:** Task 3 (extending `updateCardDetailsSchema` with a required, non-optional `publishAt` field)
- **Issue:** The schema change made `publishAt` a required key on `UpdateCardDetailsInput`; the one existing call site (`board-panel.tsx`'s `handleSaveDetails`) did not supply it, which would have broken both `tsc` and the runtime Zod parse for every PM saving card details, immediately.
- **Fix:** Hardcoded `publishAt: null` at that one call site — mirrors the established `260811-m0t` precedent (hardcoding `channel: "conteudo"` at the one call site a required-field addition couldn't wire a selector for). No UI for publish date exists yet; Wave 2's `04-03` plan wires the real field.
- **Files modified:** `app/pm/board/board-panel.tsx`
- **Verification:** `npx tsc --noEmit` exits 0; `npm test` (147/147) unaffected
- **Committed in:** `ad94b38`

---

**Total deviations:** 3 auto-fixed (2 real RLS bugs found live during Task 3's own required verification gate, 1 blocking schema-consumer fix)
**Impact on plan:** All three were necessary for correctness — deviation 2 in particular is a genuine, previously-undocumented Postgres RLS constraint that Wave 2's `04-02` plan must be aware of when implementing `requestAdjustment` (it MUST call `client_request_adjustment` via RPC, never a plain `.update()`, for that one transition). No scope creep — the fixes stay entirely within this migration's own file and this plan's own pgTAP test.

## Issues Encountered

- A mid-session connection drop occurred after Task 3's pure-logic modules were authored but before the RLS bug was fully diagnosed. Recovered per the coordinator's explicit instruction: re-verified git log/status directly (2 commits already landed cleanly: `559b00a`, `47a1508`), confirmed the uncommitted Task 3 work was complete and consistent by re-running `npx tsc --noEmit`/`npm test` from scratch (140/140 passing at that point, before the RLS fix), then continued the in-progress RLS debugging to its conclusion rather than re-doing already-correct work.

## User Setup Required

None — no external service configuration required. Migration `0032` was applied to the LOCAL Supabase instance only (`npx supabase migration up`, then `npx supabase db reset` after the RLS fix to re-apply cleanly) — hosted `supabase db push` remains the orchestrator's job post-merge, per this project's established convention (worktree executors lack `.env.local`/hosted credentials).

## Next Phase Readiness

- Wave 2 (`04-02`, Client-facing board) can build `approveCard` as a plain `.update(buildClientApprovePayload(...))` call exactly as `04-RESEARCH.md` Pattern 2 drafted, but **MUST** build `requestAdjustment` as `select client_request_adjustment(cardId, comment)` (an RPC call, not a plain `.update()`) — this is a required, not optional, interface change from the original research draft, flagged prominently in migration `0032`'s own header comment for exactly this reason.
- Wave 2 (`04-03`, PM publish scheduling) has `publishAt`/`isReadyToPublish` ready to wire into the actual UI; `board-panel.tsx`'s current `publishAt: null` placeholder at the `updateCardDetails` call site will need to become a real form field in that plan.
- No blockers for either downstream plan.

---
*Phase: 04-client-approval-scheduling*
*Completed: 2026-08-12*
