---
phase: 04-client-approval-scheduling
verified: 2026-08-13T00:00:00Z
status: passed
score: 6/6 ROADMAP success criteria verified; 22/22 plan-level must-have truths verified
overrides_applied: 0
---

# Phase 4: Client Approval & Scheduling Verification Report

**Phase Goal:** Client can review their own content board and approve or send it back for adjustment, and once approved the PM locks in a publish date — closing the loop from production to "ready to publish"
**Verified:** 2026-08-13
**Status:** passed
**Re-verification:** No — initial verification

## Note on MVP-mode goal format

ROADMAP.md marks this phase `mode: mvp`. `gsd-sdk query user-story.validate` confirms the ROADMAP Goal line is NOT in strict `As a [role], I want to [capability], so that [outcome].` format (`valid: false`). This is the same situation Phase 1's own verifier documented and proceeded past (see `01-VERIFICATION.md`'s "Note on MVP-mode goal format") — the phase's own PLAN/CONTEXT artifacts predate the newer literal user-story convention and describe the goal in prose that is functionally equivalent (client-facing capability → PM-facing outcome). Rather than refuse verification on a regex technicality, this report proceeds with standard goal-backward verification against ROADMAP's 6 numbered Success Criteria (the actual contract) and each plan's `must_haves`, consistent with this project's own established precedent.

## Goal Achievement

### Observable Truths (ROADMAP Success Criteria)

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | Client logs in and sees only their own content, organized as a board of cards ready for review | ✓ VERIFIED | `supabase/migrations/0032_client_approval_scheduling.sql` — 4th, stage-filtered OR-branch on `cards_select_scoped`/`card_attachments_select_scoped`, scoped by `client_id` + `status='approved'` subquery, restricted to `stage in ('aprovacao_cliente','agendamento')`. `app/client/page.tsx` reads through this RLS with zero client-side `.eq("client_id", ...)` filter (confirmed by grep — none present). `app/client/client-board-panel.tsx` renders a `Tabs` UI ("Para revisar (N)" / "Histórico"). pgTAP `0018` (14 assertions, confirmed passing live) proves both same-client stage-filtering (sees `aprovacao_cliente`/`agendamento`, not `producao`) and bidirectional cross-client isolation. Live-verified in 04-04's approved 12-step checkpoint (step 2). |
| 2 | Client can approve an individual content item with one action | ✓ VERIFIED | `app/client/actions.ts`'s `approveCard` — single click on "Aprovar" (`client-board-panel.tsx` line ~120), no `AlertDialog`/confirmation step, calls `buildClientApprovePayload` (pure, tested — key-shape confirmed by `npm test`) via a plain `.update()`. Live-verified (checkpoint step 4: toast "Conteúdo aprovado.", card moves queue→history). |
| 3 | Client can instead request an adjustment on an item, attaching a comment explaining what needs to change | ✓ VERIFIED | `requestAdjustment` in `app/client/actions.ts`, gated by `requestAdjustmentSchema` (`comment.trim().min(1)`). UI: "Solicitar ajuste" button `disabled` until `comment.trim().length > 0` (confirmed by source read, `client-board-panel.tsx` line 129). Live-verified (checkpoint step 7: disabled→enabled behavior, toast "Ajuste solicitado."). |
| 4 | Adjustment comment is visible to the PM directly on the original card (not a separate document), and the card automatically returns to produção, requiring revisão interna again | ✓ VERIFIED | Write path: `client_request_adjustment` SECURITY DEFINER RPC (migration 0032 §4) sets `stage='producao', client_adjustment_comment=p_comment` atomically, re-deriving caller/row/stage boundaries server-side. Read path: `app/pm/board/board-panel.tsx` line 1195 — `{card.stage === "producao" && card.client_adjustment_comment ? (...) }` renders a "Comentário do cliente" box directly in the existing card detail Dialog (no new screen/document). `lib/cards/checklist-snapshot.ts`'s `snapshotChecklistForCard` is idempotent (existing-rows short-circuit, confirmed by source read) — re-entry into revisão interna preserves prior checklist completion state rather than resetting it, satisfying "requires revisão interna again" without silently discarding audit history. Live-verified (checkpoint steps 8-9: exact comment text visible on PM's card; checklist state preserved on second pass). |
| 5 | Once a card is approved by the client, PM can register the agreed publish date/time on the card | ✓ VERIFIED | `app/pm/board/board-panel.tsx` line 1347 — the "Data de publicação" `Input type="datetime-local"` block is wrapped in `{card.stage === "agendamento" ? (...) : null}` — HIDDEN (not merely disabled) for every earlier stage, matching D-03's structural-separation requirement. `handleSaveDetails` sends `publishAt` to `updateCardDetails` (`app/pm/board/actions.ts` line 551, `publish_at: parsed.data.publishAt`), gated by the pre-existing, unchanged `assertPmOrAdminCaller` boundary. `publish_at` is a genuinely new, separate column (migration 0032 §3: `alter table public.cards add column ... publish_at timestamptz`), never aliased to/derived from `due_date` — confirmed structurally distinct (D-03). Live-verified (checkpoint step 10). |
| 6 | A card with a registered publish date/time shows a final status of "Pronto para publicar" | ✓ VERIFIED | `lib/cards/publish-status.ts`'s `isReadyToPublish` — pure function, `stage === "agendamento" && publish_at !== null`, zero Supabase/React imports (confirmed by source read), zero new `card_stage` enum value added anywhere (grep for `create type`/`alter type ... add value` in migration 0032 returns nothing — D-04 honored). Rendered identically in 3 places: PM dialog top badge row (`board-panel.tsx` :1191), PM board-card badge stack alongside the channel badge, not replacing it (`board-panel.tsx` :1513), and the Client's own history tab (`client-board-panel.tsx` :57/:184). Live-verified (checkpoint steps 10-11: badge appears on both PM board and Client history after publish date is set). |

**Score:** 6/6 ROADMAP Success Criteria verified.

### Plan-Level Must-Haves (all 4 plans)

**04-01 (schema/RLS foundation) — 9 truths, all VERIFIED:**
- Client RLS SELECT branch scoped to own `client_id` + `stage in (aprovacao_cliente, agendamento)` — confirmed in migration 0032, proven by pgTAP assertions.
- Client RLS UPDATE branch: `using` restricted to `stage='aprovacao_cliente'` only, `with check` allows the 3 legal post-write stages — confirmed by direct SQL read.
- `buildClientApprovePayload`/`buildClientAdjustPayload` never emit `client_id`/`channel`/`assignee_id`/`media_assignee_id`/`due_date`/`publish_at` — confirmed by `FORBIDDEN_KEYS` negative test suite, all passing (`npm test`).
- D-02 (single overwritten comment field): confirmed — `client_adjustment_comment` is one nullable text column, both the payload builder and the RPC's `update` statement REPLACE it wholesale, no append/thread table exists anywhere in the schema.
- D-03 (separate `publish_at` column): confirmed structurally distinct from `due_date` in migration 0032 and in `updateCardDetailsSchema`.
- `isReadyToPublish` returns true only for `agendamento` + non-null `publish_at`: confirmed by source + passing unit tests.
- D-04 (no 6th stage enum value): confirmed, zero `create type`/`alter type` statements in migration 0032.
- `assertPmOrAdminCaller` extended to all 9 PM/Admin Server Actions in `app/pm/board/actions.ts` (was 3): confirmed live — `grep -c` returns exactly 9.
- `updateCardDescriptionAsEditor` guarded by `assertEditorCaller`/`isEditorCardWriteAuthorized`: confirmed live — `grep -c "assertEditorCaller"` returns exactly 2 (definition + call site), positioned before the card re-read.

**04-02 (Client-facing board) — 5 truths, all VERIFIED:**
- D-01 two-tab board (queue/history), scoped to own client only — confirmed in `client-board-panel.tsx`/`page.tsx`.
- One-click approve, no confirmation dialog — confirmed.
- Adjustment requires non-empty comment, disabled until filled — confirmed.
- History-tab cards render read-only (no action row) — confirmed: `ClientCardDialogBody`'s action block is wrapped in `mode === "queue" ? (...) : null`; `mode === "history"` renders nothing after the attachments list.
- Minimal surface (no checklist/assignee/channel) — confirmed by grep for `assignee|channel|checklist|mediaAssignee` in `client-board-panel.tsx`, zero matches outside a doc comment that was itself reworded specifically to avoid false-positiving this same check.

**04-03 (PM publish scheduling) — 4 truths, all VERIFIED:**
- PM sees the Client's comment directly on the card, gated `stage === 'producao' && client_adjustment_comment` — confirmed.
- Publish-date field hidden (not disabled) for every stage except `agendamento` — confirmed, `{card.stage === "agendamento" ? (...) : null}`.
- "Pronto para publicar" renders on both dialog and board card once `agendamento` + `publish_at` set — confirmed, both JSX nodes present, `isReadyToPublish` imported (never reimplemented).
- Client's own actions never touch `publish_at` — confirmed: `app/client/actions.ts` never imports/calls `updateCardDetails`, and `publish_at` is in `buildClientApprovePayload`/`buildClientAdjustPayload`'s own `FORBIDDEN_KEYS` test set.

**04-04 (phase gate / live checkpoint) — 6 truths (= the 6 ROADMAP SCs above), all VERIFIED live** by the developer across a 12-step, two-role-session round-trip, approved (`04-04-SUMMARY.md`, "Developer walked the 12-step round-trip ... and approved it live").

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `supabase/migrations/0032_client_approval_scheduling.sql` | Client RLS branch + 2 new columns + RPC | ✓ VERIFIED | Exists, 3 `create policy` statements (confirmed by grep), 2-column ALTER TABLE, 1 index, `client_request_adjustment` SECURITY DEFINER RPC. Applied both locally (`npx supabase migration up`) AND to the hosted project (`npx supabase migration list` shows `0032` present in both `local` and `remote` columns). |
| `supabase/tests/0018_rls_client_card_scoping_test.sql` | pgTAP proof | ✓ VERIFIED | 14 assertions (expanded from the original 11 during Task 3's own fix), `select plan(14)`, ran live via `npx supabase test db` — passes ("ok"), part of 18/18 numbered files passing, 107 total assertions, zero regression. |
| `lib/security/client-card-write-scope.ts` | Pure payload builders | ✓ VERIFIED | Exports `buildClientApprovePayload`/`buildClientAdjustPayload`, zero Supabase/React imports, fully tested. |
| `lib/cards/publish-status.ts` | `isReadyToPublish` | ✓ VERIFIED | Pure function, zero I/O imports, tested with 3 named cases. |
| `lib/validation/cards.ts` | `approveCardSchema`/`requestAdjustmentSchema`/`publishAt` | ✓ VERIFIED | All 3 present (confirmed by grep). |
| `app/client/actions.ts` | `approveCard`/`requestAdjustment` — Client's only write path | ✓ VERIFIED | Both exported, both gated by `assertClientCaller` + stage re-read before any write, `requestAdjustment` correctly routes through the `client_request_adjustment` RPC (the documented deviation from the original plan text, required by a real Postgres RLS constraint discovered during 04-01). |
| `app/client/page.tsx` | Real RSC loader | ✓ VERIFIED | Replaces the old "Em construção" placeholder entirely; two RLS-scoped reads (queue/history), no client-side `client_id` filter. |
| `app/client/client-board-panel.tsx` | Tabs UI + Dialog | ✓ VERIFIED | 230 lines, Tabs/Dialog/DataCard composition, wired to Server Actions. |
| `app/pm/board/page.tsx` | `BoardCard` extended | ✓ VERIFIED | `client_adjustment_comment`/`publish_at` present in both the type and the select string. |
| `app/pm/board/actions.ts` | `updateCardDetails` writes `publish_at` | ✓ VERIFIED | `publish_at: parsed.data.publishAt` present, single sibling key next to `due_date`. |
| `app/pm/board/board-panel.tsx` | Publish-date field, comment block, badge | ✓ VERIFIED | All three additions present and correctly gated (see Observable Truths #5/#6 above). |

### Key Link Verification

| From | To | Via | Status | Details |
|------|-----|-----|--------|---------|
| `client-board-panel.tsx` | `app/client/actions.ts` | `approveCard`/`requestAdjustment` import + `startTransition` | ✓ WIRED | Both imported and called on button click, both handle `result.error` via `ErrorBox`. |
| `app/client/actions.ts` | `lib/security/client-card-write-scope.ts` | `buildClientApprovePayload` call before `.update()` | ✓ WIRED | Confirmed — `approveCard` calls it directly. `requestAdjustment` instead calls the RPC (documented, necessary deviation — `buildClientAdjustPayload` remains real/tested but has no call site in this file, since the RPC re-implements the same write shape server-side). |
| `app/client/page.tsx` | `cards_select_scoped` (migration 0032) | `.eq('stage', 'aprovacao_cliente'|'agendamento')`, RLS as the entire filter | ✓ WIRED | Confirmed, no client-side `client_id` filter, RLS does the scoping. |
| `board-panel.tsx` | `lib/cards/publish-status.ts` | `isReadyToPublish` import | ✓ WIRED | Imported once, used in 2 places (dialog + board card), never reimplemented inline. |
| `app/pm/board/actions.ts` | `lib/validation/cards.ts` | `updateCardDetailsSchema.publishAt` | ✓ WIRED | `parsed.data.publishAt` flows directly into the `.update()` payload. |

### Data-Flow Trace (Level 4)

| Artifact | Data Variable | Source | Produces Real Data | Status |
|----------|---------------|--------|---------------------|--------|
| `ClientBoardPanel` (`queueCards`/`historyCards`) | `ClientPage`'s two `supabase.from("cards").select(...)` reads | Real Postgres query, RLS-scoped, migration 0032 applied both locally and on the hosted project | Yes | ✓ FLOWING |
| `CardDetailDialogBody`'s "Pronto para publicar" badge | `isReadyToPublish(card)` | `card.stage`/`card.publish_at` sourced from `app/pm/board/page.tsx`'s real `cards` select (extended by 04-03, confirmed present) | Yes | ✓ FLOWING |
| `client-board-panel.tsx`'s "Comentário do cliente" (PM side) equivalent block | `card.client_adjustment_comment` | Same real select, written by the `client_request_adjustment` RPC on a genuine Client action | Yes | ✓ FLOWING |

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
|----------|---------|--------|--------|
| Full JS/TS unit suite (incl. all Phase 4 pure-logic modules) | `npm test` | 147/147 passing | ✓ PASS |
| Full pgTAP suite (incl. `0018`, the Phase-4-specific RLS proof) | `npx supabase test db` | 18/18 numbered files "ok", 107 assertions, zero regression (the one reported `FAIL` in the summary line is `rls_helpers.sql` itself — a shared fixture file with no `plan()`, picked up incidentally by the test runner; this is a pre-existing, non-Phase-4 harness artifact, not a test failure — same pattern present before this phase) | ✓ PASS |
| Type check | `npx tsc --noEmit -p tsconfig.json` | Exit 0, clean | ✓ PASS |
| Production build | `npm run build` | Succeeds, `/client` listed as a dynamic (ƒ) route alongside all 29 other routes | ✓ PASS |
| `assertPmOrAdminCaller` call-site count regression guard | `grep -c "await assertPmOrAdminCaller(supabase, user.id)" app/pm/board/actions.ts` | 9 | ✓ PASS |
| `assertEditorCaller` call-site count regression guard | `grep -c "assertEditorCaller" app/editor/actions.ts` | 2 | ✓ PASS |
| Migration 0032 applied to hosted project (not just local) | `npx supabase migration list` | `0032` present in both `local` and `remote` columns | ✓ PASS |

### Probe Execution

Not applicable — no `scripts/*/tests/probe-*.sh` convention in use in this project; automated verification is via `npm test`/`npx supabase test db`, both run directly above (Behavioral Spot-Checks).

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
|-------------|-------------|--------------|--------|----------|
| KAN-04 | 04-01, 04-02 | Adjustment returns card to produção, requires revisão interna again | ✓ SATISFIED | `client_request_adjustment` RPC sets `stage='producao'`; `snapshotChecklistForCard` idempotency preserves-but-requires re-pass. |
| APR-01 | 04-01, 04-02 | Client views content as a board of cards ready for review | ✓ SATISFIED | `/client` queue tab. |
| APR-02 | 04-01, 04-02 | Client approves an individual content item | ✓ SATISFIED | `approveCard`. |
| APR-03 | 04-01, 04-02 | Client requests adjustment with a comment | ✓ SATISFIED | `requestAdjustment`, required non-empty comment. |
| APR-04 | 04-03 | Adjustment comments attached to the card, visible to PM, not a separate document | ✓ SATISFIED | "Comentário do cliente" block in the existing PM card detail dialog. |
| SCH-01 | 04-01, 04-03 | PM registers publish date/time once client-approved | ✓ SATISFIED | "Data de publicação" field, gated to `agendamento`. |
| SCH-02 | 04-01, 04-03 | Card with registered publish date shows "Pronto para publicar" | ✓ SATISFIED | `isReadyToPublish`, rendered on PM board + Client history. |

No orphaned requirements — all 7 requirement IDs declared in ROADMAP's Phase 4 traceability table (`KAN-04`, `APR-01..04`, `SCH-01/02`) appear in at least one plan's `requirements:` frontmatter, and REQUIREMENTS.md's own Traceability table lists all 7 as mapped to Phase 4 with nothing left unmapped.

### Anti-Patterns Found

None. Swept all 18 files touched by Phase 4's 3 code-bearing plans (04-01/04-02/04-03) for `TBD`/`FIXME`/`XXX`/`TODO`/`HACK`/`PLACEHOLDER`/"coming soon"/"not yet implemented" — the single match (`app/pm/board/actions.ts` line 815, the string `"TODOS os itens do checklist..."`) is Portuguese for "ALL", not a debt marker — false positive, no actual marker present. No `return null`/empty-stub patterns found on data-flow-critical code; the one hardcoded-empty precedent (04-01's `publishAt: null` placeholder in `board-panel.tsx`) was itself replaced with real wiring by 04-03, confirmed by direct source read (only a historical comment references the old placeholder, the code itself uses `draftPublishAt`).

### Human Verification Required

None outstanding. Phase 4's own Wave 3 plan (`04-04-PLAN.md`) IS the human-verification gate for this phase — a `checkpoint:human-verify` task walking a real developer through all 6 ROADMAP success criteria across two live role sessions (Client, then PM), already executed and approved (`04-04-SUMMARY.md`: "Developer walked the 12-step round-trip ... and approved it live"). This satisfies the human-verification requirement for this phase; the verifier's own independent code-level checks above corroborate every claim made during that live walkthrough.

### Note on the two post-checkpoint quick-task fixes (260812-jpi, 260812-k6c)

Both bugs were discovered live DURING 04-04's own checkpoint session, but neither is a Phase 4 ROADMAP success criterion:
- **260812-jpi** (briefing autofill unsaved-indicator) is Phase 1/CLI-04 territory (`app/pm/clients/*`) — a visual-only fix (a "não salvo" badge derived from existing `form.formState.isDirty`), no persistence-behavior change, unrelated to any of Phase 4's 6 success criteria.
- **260812-k6c** (Admin access to `/pm/board`/`/pm/chat`) is a `middleware.ts` role-routing gap pre-dating Phase 4 (Admin never had access to Produção/Chat since Phase 5's original `roleRoot` design) — fixed with an additive allow-list, confirmed in the current `middleware.ts` (`extraAllowedPrefixes: { admin: ["/pm/board", "/pm/chat"] }`). Client's own access remains unchanged and correctly restricted (Client has no `extraAllowedPrefixes` entry — checkpoint step 12's assertion still holds, confirmed by source read).

Both are already merged to `main` (confirmed present in `git log`: `cbd46f9`, `a472073`, `fb82b02`, `ab2934f`, `00a5e11`), tracked in `STATE.md`'s Quick Tasks table with status `Verified`, and re-verified live in the same checkpoint session before final approval. Neither represents an unresolved gap in Phase 4's own scope — both are correctly classified as incidental, adjacent-area bugs found opportunistically during live testing, not phase deliverables.

### Gaps Summary

No gaps. All 6 ROADMAP Success Criteria are verified by direct source-code evidence, passing automated tests (147 JS/TS unit tests + 107 pgTAP assertions across 18 files, all re-run live during this verification pass, not merely trusted from SUMMARY.md), a clean type-check, a successful production build, hosted-migration confirmation (`0032` present on both local and remote), and an already-completed, developer-approved 12-step live checkpoint covering the exact same 6 criteria across two real role sessions.

---

*Verified: 2026-08-13*
*Verifier: Claude (gsd-verifier)*
