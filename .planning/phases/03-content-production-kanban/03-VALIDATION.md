---
phase: 03
slug: content-production-kanban
status: planned
nyquist_compliant: true
created: 2026-07-29
revised: 2026-07-31
plans: 9
waves: 9
---

# Phase 03 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

> **Revised 2026-07-31.** This document originally described a 6-plan phase. The
> mid-execution re-scope (03-CONTEXT.md D-12 → D-19) inserted plans **03-07**
> (server-side move/description/assignee), **03-08** (dnd-kit drag-and-drop) and
> **03-09** (per-column creation + description/assignee UI) at waves 4–6, pushing
> 03-04/03-05/03-06 to waves 7–9 and renumbering their migrations (0018/0019) and
> pgTAP files (0010/0011). It also corrects a stale claim: a JS/TS unit test
> runner **does** exist in this codebase (`node --test` via `npm test`), so several
> behaviors previously listed as manual-only now have automated coverage.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Frameworks** | pgTAP (`supabase test db`) for RLS/schema/privileges · `node --test` (`npm test`) for pure TS modules |
| **Config files** | `supabase/tests/` (pgTAP files, `rls_helpers.sql` fixtures) · `package.json` `test` script glob |
| **Unit test glob** | `node --test lib/security/*.test.ts lib/chat/*.test.ts lib/extract/*.test.ts lib/cards/*.test.ts` — plan 03-04 extends it with `lib/attachments/*.test.ts` |
| **Quick run command** | `npm test` (~2s) |
| **Full suite command** | `npm test && npx supabase test db` |
| **Estimated runtime** | ~10-20 seconds |

---

## Sampling Rate

- **After every task commit:** `npm test` always; `npx supabase test db` additionally whenever a migration changes
- **After every plan wave:** `npm test && npx supabase test db`, plus a manual click-through of the full briefing → produção → revisão interna → gate-block → checklist-check → advance flow
- **Before `/gsd:verify-work`:** both suites green + the manual verifications listed below (drag-and-drop, admin override, per-column creation) — these are browser interaction and Server Action orchestration, not expressible as pgTAP or node:test assertions
- **Max feedback latency:** ~20 seconds

---

## Per-Task Verification Map

Waves run in this order: **03-01 → 03-02 → 03-03 → 03-07 → 03-08 → 03-09 → 03-04 → 03-05 → 03-06**.

| Task | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | Test Artifact | Status |
|------|------|------|-------------|------------|-----------------|-----------|-------------------|---------------|--------|
| T1 | 03-01 | 1 | CHK-01, CHK-02 | RLS bypass (admin vs PM) | Admin-only template CRUD, per-client assignment scoped by RLS | pgTAP (RLS insert/update) + grep gates | `npx supabase test db` | `supabase/tests/0006_rls_checklist_templates_scoping_test.sql` | ✅ |
| T2 | 03-01 | 1 | CHK-01, CHK-02 | — | Migrations 0013/0014 actually applied to the linked remote, not just authored | schema assertion | `npx supabase migration list --linked` | remote migration history | ✅ |
| T3 | 03-01 | 1 | CHK-01, CHK-02 | — | Admin template screen compiles and typechecks | build gate | `npx tsc --noEmit && npm run lint && npm run build` | — | ✅ |
| T4 | 03-01 | 1 | CHK-01, CHK-02 | — | Template CRUD works end to end in the browser | **manual** (checkpoint) | `<human-check>` | see Manual-Only #1 | ✅ |
| T1 | 03-02 | 2 | KAN-01, KAN-03 | RLS bypass / cross-client leak, self-referencing recursion | `cards` scoped by denormalized `client_id`, no subquery back into `cards`; GRANT ships in the same migration | pgTAP + `node --test` + grep gates | `npm test && npx supabase test db` | `supabase/tests/0007_rls_cards_scoping_test.sql`, `lib/cards/stages.test.ts` | ✅ |
| T2 | 03-02 | 2 | KAN-02 | Tampering (stage forced) | `advanceStage` derives the next stage server-side; never accepts a target | typecheck + lint | `npx tsc --noEmit && npm run lint` | — | ✅ |
| T3 | 03-02 | 2 | KAN-01, KAN-03 | — | `/pm/board` renders scoped cards only | build gate | `npx tsc --noEmit && npm run lint && npm run build` | — | ✅ |
| T4 | 03-02 | 2 | KAN-01, KAN-02 | — | Board, card creation, stage advance in the browser | **manual** (checkpoint) | `<human-check>` | see Manual-Only #2 | ✅ |
| T1 | 03-03 | 3 | CHK-03, CHK-04 | RLS bypass, silent skip | Snapshot table scoped through `cards.client_id`; pure gate predicate | pgTAP + `node --test` | `npm test && npx supabase test db` | `supabase/tests/0008_rls_card_checklist_items_scoping_test.sql`, `lib/cards/checklist-gate.test.ts` | ⬜ pending |
| T2 | 03-03 | 3 | CHK-03 | Elevation of Privilege | `advanceStage` snapshots on entry and gates on exit using the shared predicate | `node --test` + typecheck | `npx tsc --noEmit && npm run lint && npm test` | `lib/cards/checklist-gate.test.ts` | ⬜ pending |
| T3 | 03-03 | 3 | CHK-03, D-06 | — | Avançar renders disabled while any item is unchecked | build gate + manual | `npx tsc --noEmit && npm run lint && npm run build` | see Manual-Only #3 | ⬜ pending |
| T4 | 03-03 | 3 | CHK-03, CHK-04 | — | Snapshot, audit lines, disabled gate in the browser | **manual** (checkpoint) | `<human-check>` | see Manual-Only #3 | ⬜ pending |
| T1 | 03-07 | 4 | KAN-01, KAN-02, CHK-03 | T-03-37, T-03-39, T-03-40, T-03-45 | Move legality is a pure predicate (skip-review + gate rules); assignee membership enforced by a `security definer` trigger on INSERT **and** UPDATE; DELETE grant + `cards_delete_scoped` make D-15's compensating delete a real operation | `node --test` + pgTAP (incl. privilege + policy assertions) + grep gates | `npm test && npx supabase test db && npx supabase migration list --linked` | `lib/cards/move-rules.test.ts` (13 cases), `supabase/tests/0009_cards_assignee_membership_test.sql` (7 assertions — 3/4 raise, 5/6/7 prove DELETE) | ⬜ pending |
| T2 | 03-07 | 4 | KAN-02, CHK-03 | T-03-36, T-03-38 | `moveCard` re-runs `evaluateMove` server-side over a server-side checklist re-read; `toStage` bounded by zod enum + Postgres enum | typecheck + `node --test` + grep gates | `npx tsc --noEmit && npm run lint && npm test` | `lib/cards/move-rules.test.ts` | ⬜ pending |
| T3 | 03-07 | 4 | KAN-01, CHK-04 | T-03-39, T-03-40, T-03-41 | D-15 snapshot-on-create with a **result-checked** compensating delete (rollback failure surfaced + logged, never swallowed); `listClientPmRoster` gated by an RLS visibility check before the privileged read | typecheck + pgTAP re-run + grep gates | `npx tsc --noEmit && npm run lint && npm test && npx supabase test db` | `supabase/tests/0009_cards_assignee_membership_test.sql` assertions 5–7 | ⬜ pending |
| T1 | 03-08 | 5 | KAN-02, KAN-03 | supply chain (`@dnd-kit/*`) | Pinned dnd-kit versions asserted in `package.json`; draggable/droppable wrappers isolated from the generic `DataCard` primitive | build gate + dependency pin assertion | `npx tsc --noEmit && npm run lint && npm run build && node -e "…pin check…"` | `package.json` pin check | ⬜ pending |
| T2 | 03-08 | 5 | KAN-02, CHK-03 | T-03-36, T-03-37 (client half) | Drag handler calls the SAME `evaluateMove` the server uses; snap-back on rejection with the byte-identical message | build gate + `node --test` (shared predicate) | `npx tsc --noEmit && npm run lint && npm run build && npm test` | `lib/cards/move-rules.test.ts` | ⬜ pending |
| T3 | 03-08 | 5 | KAN-02, KAN-03, CHK-03 | — | Mouse drag, keyboard drag, screen-reader announcements, snap-back with the gate message, backward moves allowed | **manual** (checkpoint) — browser pointer/keyboard interaction has no automated harness in this codebase | `<human-check>` | see Manual-Only #5 | ⬜ pending |
| T1 | 03-09 | 6 | KAN-01, KAN-03 | T-03-39 (surface) | Per-column create triggers pass an explicit `stage`; board query extended with description/assignee | build gate | `npx tsc --noEmit && npm run lint && npm run build` | — | ⬜ pending |
| T2 | 03-09 | 6 | KAN-01, KAN-03 | T-03-41, T-03-43 | Assignee picker offers only `listClientPmRoster` results; description never rendered on the board face (D-17) | build gate + `node --test` | `npx tsc --noEmit && npm run lint && npm run build && npm test` | — | ⬜ pending |
| T3 | 03-09 | 6 | KAN-01, KAN-03, CHK-04 | T-03-39 | Direct creation in revisão interna already shows its checklist and active gate (D-15 observed end to end) | **manual** (checkpoint) | `<human-check>` | see Manual-Only #6 | ⬜ pending |
| T1 | 03-04 | 7 | KAN-05 | RLS bypass, Tampering (client-side URL bypass) | Attachments scoped through `cards.client_id`; Drive-URL predicate is a shared pure module re-run server-side | pgTAP + `node --test` + grep gates | `npm test && npx supabase test db` | `supabase/tests/0010_rls_card_attachments_scoping_test.sql`, `lib/attachments/drive-url.test.ts` | ⬜ pending |
| T2 | 03-04 | 7 | KAN-05 | Tampering | `addAttachment`/`removeAttachment` re-validate the URL server-side | typecheck + `node --test` | `npx tsc --noEmit && npm run lint && npm test` | `lib/attachments/drive-url.test.ts` | ⬜ pending |
| T3 | 03-04 | 7 | KAN-05 | — | Attachment list + attach form render in the card dialog | build gate | `npx tsc --noEmit && npm run lint && npm run build` | — | ⬜ pending |
| T4 | 03-04 | 7 | KAN-05 | — | Attach, reject-bad-URL, remove flows in the browser | **manual** (checkpoint) | `<human-check>` | see Manual-Only #4 | ⬜ pending |
| T1 | 03-05 | 8 | CHK-04 | RLS bypass (PM force-advancing) | Override audit table is admin-write-only, readable by the assigned PM | pgTAP + grep gates | `npx supabase test db && npx supabase migration list --linked` | `supabase/tests/0011_rls_card_checklist_overrides_scoping_test.sql` | ⬜ pending |
| T2 | 03-05 | 8 | CHK-04, D-11 | Repudiation | `forceAdvanceOverride` always writes the audit row in the same action; it is the ONLY path past a blocked gate — neither `advanceStage` nor `moveCard` can bypass | typecheck + `node --test` + grep gates | `npx tsc --noEmit && npm run lint && npm test` | — | ⬜ pending |
| T3 | 03-05 | 8 | CHK-04 | — | `/admin/cards` audit screen renders every client's cards | build gate | `npx tsc --noEmit && npm run lint && npm run build` | — | ⬜ pending |
| T4 | 03-05 | 8 | CHK-04, D-11 | — | Override force-advance + visible audit trail in the browser | **manual** (checkpoint) | `<human-check>` | see Manual-Only #7 | ⬜ pending |
| T1 | 03-06 | 9 | KAN-01, KAN-02, CHK-03 | Tampering (piece client_id from browser) | Package rollup is a pure deterministic function; `createPiece` takes the parent's `client_id` server-side | `node --test` + typecheck | `npm test && npx tsc --noEmit && npm run lint` | `lib/cards/package-rollup.test.ts` | ⬜ pending |
| T2 | 03-06 | 9 | KAN-01, D-01 | — | Package row renders above the columns and is never draggable | build gate | `npx tsc --noEmit && npm run lint && npm run build` | — | ⬜ pending |
| T3 | 03-06 | 9 | KAN-01, D-01, D-02 | — | Independent piece advancement + per-piece gate under drag | **manual** (checkpoint) | `<human-check>` | see Manual-Only #8 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

**Sampling continuity check:** no run of 3 consecutive tasks lacks an automated verify — every non-checkpoint task in all 9 plans carries at least a typecheck/lint/build gate, and every wave that touches the schema carries pgTAP.

---

## Wave 0 Requirements

Satisfied per-plan rather than as a standalone wave — each plan's own Task 1 embeds its pgTAP test and/or its `node --test` module alongside the code it proves.

**pgTAP (schema / RLS / privileges):**

- [x] `supabase/tests/0006_rls_checklist_templates_scoping_test.sql` (03-01) — CHK-01/CHK-02: admin-only template writes, PM read-only
- [x] `supabase/tests/0007_rls_cards_scoping_test.sql` (03-02) — KAN-01/KAN-03: RLS select/insert scoping; regression assertion that a piece row's OWN `client_id` — not its parent's — governs access
- [ ] `supabase/tests/0008_rls_card_checklist_items_scoping_test.sql` (03-03) — CHK-03/CHK-04: scoped read/write through `cards.client_id`
- [ ] `supabase/tests/0009_cards_assignee_membership_test.sql` (03-07, **new**) — D-19 assignee membership rejected on INSERT and UPDATE (assertions 3–4) **and** the D-15 fail-safe path: `authenticated` holds DELETE on `public.cards` and `cards_delete_scoped` actually admits a PM deleting a card in their own client (assertions 5–7)
- [ ] `supabase/tests/0010_rls_card_attachments_scoping_test.sql` (03-04, renumbered from 0009) — KAN-05
- [ ] `supabase/tests/0011_rls_card_checklist_overrides_scoping_test.sql` (03-05, renumbered from 0010) — CHK-04

**`node --test` unit modules (pure predicates, all under the `npm test` glob):**

- [x] `lib/cards/stages.test.ts` (03-02) — stage order and `nextStage`
- [ ] `lib/cards/checklist-gate.test.ts` (03-03) — `isGateBlocked`, including the empty-checklist fail-safe
- [ ] `lib/cards/move-rules.test.ts` (03-07, **new**) — 13 cases covering `evaluateMove`: no-op moves, the skip-over-revisão-interna rule (`MOVE_SKIPS_REVIEW_MESSAGE`), the D-13 gate cases, and unrestricted backward moves
- [ ] `lib/attachments/drive-url.test.ts` (03-04) — Drive/Docs URL predicate; **03-04 must also extend the `package.json` test glob with `lib/attachments/*.test.ts`**
- [ ] `lib/cards/package-rollup.test.ts` (03-06) — deterministic package rollup label

---

## Manual-Only Verifications

Each row corresponds to a `checkpoint:human-verify` task in the named plan. Everything expressible as a pure predicate has been pushed into `node --test`; what remains is browser interaction and multi-step Server Action orchestration.

| # | Behavior | Plan / Task | Requirement | Why Manual | Test Instructions |
|---|----------|-------------|-------------|------------|--------------------|
| 1 | Admin creates, edits and assigns a checklist template to a client | 03-01 T4 | CHK-01, CHK-02 | Multi-screen admin flow; RLS half is already covered by pgTAP `0006` | 1. As Admin, create a template with 3 items. 2. Assign it to a client. 3. Confirm a PM cannot reach the template editor. |
| 2 | Board renders, card creation, Avançar moves a card one stage | 03-02 T4 | KAN-01, KAN-02 | Rendering + navigation; the data half is covered by pgTAP `0007` | 1. Create a card. 2. Confirm it lands in Briefing. 3. Click Avançar, confirm it moves to Produção and persists across reload. |
| 3 | Checklist snapshot on entry, audit lines, and the disabled Avançar gate | 03-03 T4 | CHK-03, CHK-04, D-06 | Server Action orchestration across two tables; the predicate itself is covered by `lib/cards/checklist-gate.test.ts` | 1. Advance a card into revisão interna. 2. Confirm its checklist appeared, copied from the client's template. 3. Confirm "Avançar" is disabled with items unchecked and stays disabled until the last one. 4. Check the final item, confirm the button enables and the advance works. 5. Confirm each checked item shows who completed it and when. |
| 4 | Drive link attach, malformed-URL rejection, removal | 03-04 T4 | KAN-05 | Paste/click flow; the URL predicate is covered by `lib/attachments/drive-url.test.ts` and the scoping by pgTAP `0010` | 1. Paste a non-Drive URL, confirm the exact rejection message. 2. Paste a valid `drive.google.com`/`docs.google.com` link, confirm it attaches. 3. Attach a second link (no cap, D-09). 4. Remove one after the confirmation dialog. |
| 5 | **Drag-and-drop: mouse, keyboard, snap-back with the gate message, skip-review rejection, backward moves** | **03-08 T3** | **KAN-02, KAN-03, CHK-03** | dnd-kit pointer/keyboard sensors and screen-reader announcements have no automated harness in this codebase; the move predicate itself is fully covered by `lib/cards/move-rules.test.ts` | 1. Drag a card between columns, confirm it persists across reload. 2. Drop into an EMPTY column. 3. Release outside any column — card snaps back, no error. 4. Drop onto the origin column — no-op, no toast. 5. Click the card BODY (not the grip) — detail dialog still opens. 6. With an item unchecked, drag out of Revisão interna → snap-back with exactly "Existem itens do checklist não concluídos. Marque todos os itens antes de avançar." 7. Check all items, drag again → moves. 8. Drag Briefing → Agendamento → snap-back with exactly "Um card precisa passar pela revisão interna antes de seguir para as etapas seguintes." 9. Drag Revisão interna → Produção with items unchecked → ALLOWED. 10. Keyboard: Tab to the grip, Space, arrows, Space → card moves. 11. Keyboard cancel: Space, arrow, Escape → card stays. |
| 6 | **Per-column creation, snapshot-on-create (D-15), description placement, assignee scoping** | **03-09 T3** | **KAN-01, KAN-03, CHK-04** | Cross-cutting UI + Server Action behavior; the DELETE fail-safe behind D-15 is proved by pgTAP `0009` assertions 5–7 | 1. Confirm all five columns have a "+" trigger. 2. Create from the Produção "+", confirm the card appears in Produção, not Briefing. 3. Confirm the top-level "Criar card" still creates in Briefing. 4. Create a card directly in Revisão interna. 5. Open it — its checklist is ALREADY there and the Avançar gate is active (D-15). 6. Add a multi-line description; confirm it appears only in the detail dialog, never on the board face (D-17). 7. Open the assignee picker; confirm it lists only PMs assigned to that client. 8. Save with no assignee; confirm the unassigned state persists. 9. Confirm a client whose only PM is the viewer still renders a usable form. |
| 7 | Admin force-advance override writes a visible audit row | 03-05 T4 | CHK-04, D-11 | Multi-role flow; asserts no bypass path skips the audit write | 1. Leave an item unchecked. 2. As Admin, trigger the override with its destructive confirmation. 3. Confirm the card advances. 4. Confirm an override event (who/when/which items were unchecked) is visible to both Admin and the assigned PM. 5. Confirm a PM calling the action directly is rejected. |
| 8 | Package sub-card independence and per-piece gate | 03-06 T3 | KAN-01, D-01, D-02 | Cross-row UI behavior; the rollup label itself is covered by `lib/cards/package-rollup.test.ts` | 1. Create a package with 2+ peças. 2. Advance one peça. 3. Confirm siblings stay put. 4. Confirm each peça has its OWN checklist and gate. 5. Confirm the package row never sits inside a column and is never draggable. |

---

## Validation Sign-Off

- [x] All tasks have `<automated>` verify or are explicitly listed under Manual-Only Verifications (8 checkpoint tasks, one per plan except 03-07 which is fully autonomous)
- [x] Sampling continuity: no 3 consecutive tasks without automated verify
- [x] Wave-0-equivalent coverage exists for every requirement: 6 pgTAP files (`0006`–`0011`) + 5 `node --test` modules, each embedded in its own plan's Task 1
- [x] No watch-mode flags
- [x] Feedback latency < 20s
- [x] `nyquist_compliant: true` — re-confirmed 2026-07-31 after plans 03-07/03-08/03-09 were inserted and 03-04/03-05/03-06 renumbered

**Approval:** approved 2026-07-31 (plan-checker verification) · **revised 2026-07-31** to cover the 9-plan shape, the 03-07 DELETE-grant/`cards_delete_scoped` assertions, the new `lib/cards/move-rules.test.ts` module, and 03-08's drag-and-drop manual checkpoint.
</content>
