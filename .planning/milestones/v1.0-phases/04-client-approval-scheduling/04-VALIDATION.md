---
phase: 04
slug: client-approval-scheduling
status: plans-verified
nyquist_compliant: true
wave_0_complete: false
created: 2026-08-12
revised: 2026-08-12
plans: 4
waves: 3
---

# Phase 04 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

> **Revised 2026-08-12.** Finalized against the actual `04-01`..`04-04` PLAN.md task
> numbering (previously placeholder `04-01-TBD` rows). Also reflects the plan-checker
> revision that added `04-01` Task 4: extending `assertPmOrAdminCaller` to
> `toggleChecklistItem`/`addAttachment`/`removeAttachment`/`validateCardAgainstChecklist`/
> `createPiece`/`removePiece` in `app/pm/board/actions.ts` — the 6 Server Actions
> migration `0032`'s Client RLS branch makes newly reachable, alongside the original 3
> (`updateCardDetails`/`advanceStage`/`moveCard`) already covered by `260811-oe0`.
> `wave_0_complete` flips to `true` once Plan `04-01` executes.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework (JS/TS)** | Node's built-in test runner (`node --test`) — already covers `lib/cards/*.test.ts`, `lib/security/*.test.ts` |
| **Framework (DB/RLS)** | pgTAP via `npx supabase test db` |
| **Config file** | `package.json`'s `"test"` script (glob-based, no separate config file) |
| **Quick run command** | `npm test` |
| **Full suite command** | `npm test && npx supabase test db` |
| **Estimated runtime** | ~1s (JS) + ~10-20s (pgTAP, local Docker) |

---

## Sampling Rate

- **After every task commit:** Run `npm test`
- **After every plan wave:** Run `npm test && npx supabase test db`
- **Before `/gsd:verify-work`:** Full suite must be green
- **Max feedback latency:** ~20 seconds

---

## Per-Task Verification Map

Waves run in this order: **04-01 (wave 1) → 04-02, 04-03 (wave 2, parallel) → 04-04 (wave 3)**.

| Task | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | Status |
|------|------|------|-------------|------------|-----------------|-----------|-------------------|--------|
| Task 1 | 04-01 | 1 | KAN-04, APR-01, APR-02, APR-03, SCH-01, SCH-02 | T-04-01, T-04-02, T-04-03 | Migration 0032: Client RLS branch on `cards_select_scoped`/`cards_update_scoped`/`card_attachments_select_scoped`, stage-filtered + status-hardened; `client_adjustment_comment`/`publish_at` columns | schema/grep gate | `grep -c "create policy" supabase/migrations/0032_client_approval_scheduling.sql` | ⬜ pending |
| Task 2 | 04-01 | 1 | APR-01, APR-02, APR-03, KAN-04 | T-04-02, T-04-03 | pgTAP proof of Client row/stage/cross-client scoping and write-boundary enforcement | pgTAP | `npx supabase test db` (`supabase/tests/0018_rls_client_card_scoping_test.sql`, 11 assertions) | ⬜ pending |
| Task 3 | 04-01 | 1 | KAN-04, APR-02, APR-03, SCH-01, SCH-02 | — | `buildClientApprovePayload`/`buildClientAdjustPayload`/`isReadyToPublish` pure modules; `approveCardSchema`/`requestAdjustmentSchema`/`updateCardDetailsSchema.publishAt`; migration applied locally | unit + migration apply | `npx supabase migration up && npm test && npx supabase test db` | ⬜ pending |
| Task 4 | 04-01 | 1 | Security regression (widened) | T-04-01 | `toggleChecklistItem`/`addAttachment`/`removeAttachment`/`validateCardAgainstChecklist`/`createPiece`/`removePiece` all reject `role:'client'` via `assertPmOrAdminCaller`, fail closed, before any row read — closes the gap the widened Client RLS branch (Task 1) would otherwise open | unit + typecheck | `npx tsc --noEmit -p tsconfig.json && npm test` (extends `lib/security/board-write-authz.test.ts`) | ⬜ pending |
| Task 1 | 04-02 | 2 | APR-01, APR-02, APR-03, KAN-04 | T-04-05, T-04-02b, T-04-04b | `approveCard`/`requestAdjustment` Server Actions — role gate + stage re-read + hardcoded payload builders only | typecheck | `npx tsc --noEmit -p tsconfig.json` | ⬜ pending |
| Task 2 | 04-02 | 2 | APR-01 | — | `/client` RSC loader — queue (`aprovacao_cliente`) + history (`agendamento`) reads, RLS is the entire filter | typecheck | `npx tsc --noEmit -p tsconfig.json` | ⬜ pending |
| Task 3 | 04-02 | 2 | APR-01, APR-02, APR-03 | T-04-06 | Tabs UI + card detail Dialog — minimal surface, one-click approve, comment-required adjustment | typecheck + build | `npx tsc --noEmit -p tsconfig.json`; `npm run build` | ⬜ pending |
| Task 1 | 04-03 | 2 | APR-04, SCH-01 | T-04-01c, T-04-08 | `publish_at`/`client_adjustment_comment` flow through `page.tsx`'s loader into `BoardCard`; `updateCardDetails` can write `publish_at` | typecheck | `npx tsc --noEmit -p tsconfig.json` | ⬜ pending |
| Task 2 | 04-03 | 2 | APR-04, SCH-01, SCH-02 | T-04-07 | Stage-gated "Data de publicação" field, read-only "Comentário do cliente" block, "Pronto para publicar" badge (dialog + board card) | typecheck + build | `npx tsc --noEmit -p tsconfig.json && npm run build` | ⬜ pending |
| Task 1 | 04-04 | 3 | all | — | Pre-flight: full automated suite green (post-merge regression check) | full suite | `npm test && npx supabase test db && npx tsc --noEmit -p tsconfig.json && npm run build` | ⬜ pending |
| Task 2 | 04-04 | 3 | KAN-04, APR-01..04, SCH-01, SCH-02 | — | Comment visible to PM (existing read path) — UI rendering, not a pure logic assertion | manual/live-verify | `<human-check>` — 12-step round-trip checkpoint | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky — task IDs finalized against actual PLAN.md numbering as of the 2026-08-12 revision.*

---

## Wave 0 Requirements

- [ ] `lib/security/client-card-write-scope.test.ts` — covers APR-02/APR-03 (pure payload-shape assertions, mirrors `editor-card-write-scope.test.ts`) — `04-01` Task 3
- [ ] `supabase/tests/0018_rls_client_card_scoping_test.sql` — covers APR-01/APR-02/APR-03/KAN-04 (RLS row/stage scoping), reuses `rls_helpers.sql`'s existing `client_a_user` fixture (already `role='client'`, `client_id=client_a`, `status='approved'`) — no new fixture actor needed, but the new file adds a second Client-role actor scoped to a different client to prove cross-client isolation (the negative case) — `04-01` Task 2
- [ ] `lib/cards/publish-status.test.ts` (or equivalent) — covers SCH-02's pure "Pronto para publicar" computation — `04-01` Task 3
- [ ] `assertPmOrAdminCaller` extended to `toggleChecklistItem`/`addAttachment`/`removeAttachment`/`validateCardAgainstChecklist`/`createPiece`/`removePiece` — `04-01` Task 4

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|--------------------|
| Comment visible to PM directly on the card (not a separate document) | APR-04 | UI rendering, not a pure logic assertion | Live checkpoint (`04-04` Task 2): Client submits an adjustment with a comment, PM opens the same card and confirms the comment renders on it |

---

## Validation Sign-Off

- [x] All tasks have `<automated>` verify or are explicitly listed under Manual-Only Verifications (`04-04` Task 2)
- [x] Sampling continuity: no 3 consecutive tasks without automated verify
- [x] Wave 0 covers all MISSING references (`04-01` Tasks 2/3/4)
- [x] No watch-mode flags
- [x] Feedback latency < 20s
- [x] `nyquist_compliant: true` set in frontmatter

**Approval:** plans-verified 2026-08-12 (plan-checker revision — closed the 1 blocker on `04-01`'s incomplete `assertPmOrAdminCaller` audit; `wave_0_complete` flips to `true` once Plan `04-01` executes).
</content>
