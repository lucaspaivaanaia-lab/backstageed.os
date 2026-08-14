---
phase: 04-client-approval-scheduling
plan: 02
subsystem: client-ui
tags: [nextjs, server-actions, rls, tabs, client-role]

# Dependency graph
requires:
  - phase: 04-client-approval-scheduling
    plan: 01
    provides: >
      Client-role RLS branch on cards_select_scoped/cards_update_scoped/
      card_attachments_select_scoped, client_adjustment_comment/publish_at
      columns, client_request_adjustment SECURITY DEFINER RPC,
      buildClientApprovePayload/buildClientAdjustPayload,
      approveCardSchema/requestAdjustmentSchema, isReadyToPublish
provides:
  - "app/client/actions.ts -- approveCard/requestAdjustment, the Client's ONLY write path"
  - "app/client/page.tsx -- real RSC loader (queue + history split reads)"
  - "app/client/client-board-panel.tsx -- Tabs UI + card detail Dialog, first real Tabs usage in this codebase"
affects: [04-04-integration-checkpoint]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "requestAdjustment routes through a SECURITY DEFINER RPC (supabase.rpc) instead of a plain .update() -- the one Client write this codebase's RLS design cannot express as a table UPDATE (04-01's own live finding); approveCard stays a plain .update() since its target stage is inside the Client's own SELECT branch"

key-files:
  created:
    - app/client/actions.ts
    - app/client/client-board-panel.tsx
  modified:
    - app/client/page.tsx

key-decisions:
  - "requestAdjustment calls supabase.rpc('client_request_adjustment', ...) per the orchestrator's critical_dependency_note, NOT buildClientAdjustPayload + .update() as the plan's original Task 1 <action> text specified -- that text pre-dated 04-01's own live discovery of the Postgres RLS post-image/SELECT-policy constraint. buildClientAdjustPayload remains a real, tested module (04-01), simply with no call site in this file, since the RPC re-implements the same {stage, client_adjustment_comment, updated_at} write internally."

requirements-completed: [APR-01, APR-02, APR-03, KAN-04]

# Metrics
duration: ~55min
completed: 2026-08-12
---

# Phase 4 Plan 2: Client Board -- Approval & Adjustment UI Summary

**The Client-facing vertical slice: a real `/client` board (Tabs: "Para revisar" / "Histórico") where a Client approves a queued card in one click or requests an adjustment with a required comment, wired to Server Actions that are gated by an explicit role/status re-check and a stage re-read, writing exclusively through hardcoded payload builders or a SECURITY DEFINER RPC.**

## Performance

- **Duration:** ~55 min of committed work
- **Tasks:** 3/3 complete
- **Files modified:** 3 (2 created, 1 rewritten)

## Accomplishments

- `app/client/actions.ts`: `approveCard` (plain `.update()` via `buildClientApprovePayload`) and `requestAdjustment` (via the `client_request_adjustment` SECURITY DEFINER RPC, migration 0032) -- both gated by a local `assertClientCaller` (fails closed, mirrors `assertPmOrAdminCaller`/`assertEditorCaller`'s exact shape) and a server-side re-read of the target card's `stage`, rejecting with `WRONG_STAGE_ERROR` unless it is exactly `aprovacao_cliente`, before any write
- `app/client/page.tsx`: replaced the "Em construção" placeholder with a real RSC loader -- independent queue (`stage = aprovacao_cliente`, oldest-first) and history (`stage = agendamento`, most-recently-updated-first) reads, merged with a single guarded `card_attachments` read grouped by `card_id`; RLS (migration 0032's Client branch) is the entire filter, no client-side `client_id` predicate anywhere
- `app/client/client-board-panel.tsx`: `Tabs`/`TabsList`/`TabsTrigger`/`TabsContent` (first real usage in this codebase) splitting the board into "Para revisar (N)" and "Histórico"; each card opens a `Dialog` with title/badge/description/attachments; the queue Dialog additionally renders an always-visible comment `Textarea` plus "Aprovar"/"Solicitar ajuste" buttons (the latter disabled until the trimmed comment is non-empty); the history Dialog renders no action row at all
- Minimal surface enforced structurally: no checklist state, no PM/Designer-Mídia assignee, no channel badge anywhere on `/client`

## Task Commits

1. **Task 1: app/client/actions.ts -- approveCard/requestAdjustment Server Actions** - `d8dca32` (feat)
2. **Task 2: app/client/page.tsx -- RSC loader (queue + history split reads)** - `a3c9f32` (feat)
3. **Task 3: app/client/client-board-panel.tsx -- Tabs UI + card detail Dialog** - `7424822` (feat)

## Files Created/Modified

- `app/client/actions.ts` (new) -- `approveCard`/`requestAdjustment` Server Actions, `assertClientCaller`
- `app/client/page.tsx` (rewritten) -- real RSC loader replacing the placeholder, `ClientCardAttachment`/`ClientBoardCard` types
- `app/client/client-board-panel.tsx` (new) -- `ClientBoardPanel`, `ClientCardDialogBody`, `ClientAttachmentRow`

## Decisions Made

- **`requestAdjustment` calls the `client_request_adjustment` RPC, not `buildClientAdjustPayload` + `.update()`.** The plan's Task 1 `<action>` text (written before 04-01 executed) described both `approveCard` and `requestAdjustment` as symmetric plain-`.update()` calls through their respective payload builders. 04-01's own execution discovered, live, that Postgres requires an UPDATE's post-image row to also satisfy the table's SELECT policy -- and a Client must never SELECT a `producao` card (locked must-have) -- making `requestAdjustment`'s `aprovacao_cliente → producao` transition structurally unreachable via a plain `.update()`. The orchestrator's `critical_dependency_note` for this plan made the corrected interface explicit and directed this file to call `supabase.rpc("client_request_adjustment", { p_card_id, p_comment })` instead. Implemented exactly as directed; `buildClientAdjustPayload` remains a real, independently tested module from 04-01 (its shape documents the exact columns the RPC also writes internally), simply with no call site inside `app/client/actions.ts` -- the RPC re-implements that same `{stage, client_adjustment_comment, updated_at}` write inside its own `SECURITY DEFINER` body.
- **Reworded a doc comment in `client-board-panel.tsx`** to avoid literally containing the words "assignee"/"channel"/"checklist" even in a sentence describing their intentional absence, since Task 3's own acceptance-criteria grep (`grep "assignee\|channel\|checklist\|mediaAssignee"`) is a blunt substring match that would otherwise false-positive on a comment that correctly states none of those fields are rendered.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug, pre-resolved by orchestrator] `requestAdjustment` routes through a RPC, not a plain `.update()`**
- **Found during:** Plan setup (documented explicitly in the orchestrator's `critical_dependency_note`, itself sourced from 04-01's own live verification finding)
- **Issue:** The plan's own Task 1 `<action>` text, drafted before 04-01 executed, specified a plain `.update(buildClientAdjustPayload(...))` call for `requestAdjustment` -- but this write is structurally impossible under the RLS design 04-01 shipped (Postgres re-validates the post-image row against the table's SELECT policy, and a Client can never SELECT a `producao` row).
- **Fix:** `requestAdjustment` calls `supabase.rpc("client_request_adjustment", { p_card_id: cardId, p_comment: comment })` instead, per the RPC signature documented in `supabase/migrations/0032_client_approval_scheduling.sql` Section 4. `approveCard` is unaffected and still uses the plain `.update()` + `buildClientApprovePayload` path exactly as originally planned.
- **Files modified:** `app/client/actions.ts`
- **Verification:** `npx tsc --noEmit` clean, `npm run build` succeeds, `npm test` 147/147 passing (unaffected -- no test in this repo yet exercises `app/client/actions.ts` directly; live round-trip verification is deferred to plan `04-04`'s checkpoint per this plan's own `<verification>` section)
- **Committed in:** `d8dca32`

**2. [Rule 1 - Bug] Task 1's literal acceptance-criteria grep no longer matches the corrected interface**
- **Found during:** Task 1's own acceptance-criteria check, immediately after committing
- **Issue:** The plan's Task 1 `<acceptance_criteria>` states `grep -c "buildClientApprovePayload\|buildClientAdjustPayload" app/client/actions.ts` should return 2 (one call site each). Because deviation 1 above routes `requestAdjustment` through the RPC instead of `buildClientAdjustPayload`, the actual count is 3 (one import + one doc-comment mention + one call site, all for `buildClientApprovePayload` only) -- `buildClientAdjustPayload` has zero references in this file.
- **Fix:** None applied -- this is the correct, intended result of deviation 1, not a bug to fix. Documented here so the discrepancy from the plan's literal (pre-04-01-finding) acceptance criterion is traceable.
- **Files modified:** none (documentation only)
- **Verification:** N/A -- correctness verified by deviation 1's own verification steps
- **Committed in:** N/A

**3. [Rule 1 - Bug] Doc comment false-positive on Task 3's minimal-surface grep**
- **Found during:** Task 3's own acceptance-criteria check, immediately after first draft
- **Issue:** `client-board-panel.tsx`'s top-level doc comment originally read "...no checklist state, no PM/Designer-Mídia assignee, no channel badge anywhere on this screen" -- correct in meaning, but the acceptance criterion's literal grep (`grep "assignee\|channel\|checklist\|mediaAssignee"`) matched those words regardless of context, producing a false positive.
- **Fix:** Reworded the comment to "No internal PM-coordination detail is rendered anywhere on this screen" -- same meaning, no longer contains any of the four grepped substrings.
- **Files modified:** `app/client/client-board-panel.tsx`
- **Verification:** `grep -n "assignee\|channel\|checklist\|mediaAssignee" app/client/client-board-panel.tsx` returns no matches (exit 1)
- **Committed in:** `7424822` (part of the same task commit, fixed before committing)

---

**Total deviations:** 3 (1 required interface correction inherited from 04-01's own finding and pre-resolved by the orchestrator's instructions, 1 documentation-only note about a now-stale literal acceptance criterion, 1 self-fixed grep false-positive)
**Impact on plan:** No scope creep. Deviation 1 is the load-bearing one -- without it, `requestAdjustment` would fail on every real call (RLS would reject the write). All three deviations stay entirely within this plan's own three files.

## Issues Encountered

- This worktree had no `node_modules` at all (only `package-lock.json` was present) -- `npx tsc`/`npm run build` initially resolved a stray global TypeScript install and silently produced misleadingly clean output without actually type-checking the project against its real dependencies (e.g. `next`'s own types). Ran `npm ci` (installs strictly from the committed lockfile, no new packages) to restore a real `node_modules`, then re-ran `npx tsc --noEmit`, `npm run build`, and `npm test` -- all genuinely clean/passing against the actual dependency tree. `node_modules` remains gitignored and was not committed.

## User Setup Required

None -- no external service configuration required. No new migration, no new environment variable.

## Next Phase Readiness

- Live/manual verification of the full round-trip (Client approves a queued card, requests an adjustment with a comment, views a read-only history entry) is explicitly deferred to plan `04-04`'s checkpoint, per this plan's own `<verification>` section -- it depends on `04-03` (PM publish scheduling) also landing so the full Client → PM → Client loop can be exercised together.
- `04-03`'s PM-side `Input type="datetime-local"` "Data de publicação" field and the `Comentário do cliente` read-only block (both additive changes to `board-panel.tsx`'s existing `CardDetailDialogBody`, per `04-UI-SPEC.md`) are unaffected by this plan and remain that plan's own scope.
- No blockers for `04-04`.

---
*Phase: 04-client-approval-scheduling*
*Completed: 2026-08-12*

## Self-Check: PASSED

- `app/client/actions.ts`, `app/client/page.tsx`, `app/client/client-board-panel.tsx` confirmed present on disk
- All 3 referenced commit hashes confirmed present in `git log` (d8dca32, a3c9f32, 7424822)
- `npx tsc --noEmit` clean, `npm run build` succeeds (all 30 routes including `/client` compiled, `ƒ /client` listed as dynamic/server-rendered), `npm test` 147/147 passing -- all re-verified as the final step before this summary was written
