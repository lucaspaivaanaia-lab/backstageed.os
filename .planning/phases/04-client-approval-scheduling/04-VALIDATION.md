---
phase: 04
slug: client-approval-scheduling
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-08-12
---

# Phase 04 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

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

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 04-01-TBD | TBD | 1 | KAN-04 | T-04-01 | Adjustment bounces `aprovacao_cliente` → `producao`, card must re-pass `revisao_interna` | unit + pgTAP | `node --test lib/security/client-card-write-scope.test.ts`; `npx supabase test db` | ❌ Wave 0 | ⬜ pending |
| 04-01-TBD | TBD | 1 | APR-01 | T-04-02 | Client sees only `aprovacao_cliente`/`agendamento` stage cards for their own client, nothing else | pgTAP | `npx supabase test db` (new `0018_rls_client_card_scoping_test.sql`) | ❌ Wave 0 | ⬜ pending |
| 04-01-TBD | TBD | 1 | APR-02 | T-04-02 | Client can approve — RLS + app-layer both permit, target stage correct | pgTAP + unit | same as above | ❌ Wave 0 | ⬜ pending |
| 04-01-TBD | TBD | 1 | APR-03 | T-04-02 | Client can request adjustment with comment; card lands in `producao` with comment set | pgTAP + unit | same as above | ❌ Wave 0 | ⬜ pending |
| 04-01-TBD | TBD | 1 | APR-04 | — | Comment visible to PM (existing read path) | manual/live-verify | N/A — covered by checkpoint | — | ⬜ pending |
| 04-01-TBD | TBD | 1 | SCH-01 | — | PM can register `publish_at`, only after approval | unit | `node --test` (schema coverage) | ❌ Wave 0 | ⬜ pending |
| 04-01-TBD | TBD | 1 | SCH-02 | — | "Pronto para publicar" badge computed correctly | unit | `node --test lib/cards/publish-status.test.ts` | ❌ Wave 0 | ⬜ pending |
| 04-01-TBD | TBD | 1 | Security regression | T-04-01 | A Client caller invoking `updateCardDetails`/`advanceStage`/`moveCard` directly is still rejected after this phase's RLS widening (the `260811-oe0` class of bug) | unit | `node --test lib/security/board-write-authz.test.ts` (new `role: 'client'` case) | ❌ Wave 0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky — task IDs finalized once the planner writes actual PLAN.md files.*

---

## Wave 0 Requirements

- [ ] `lib/security/client-card-write-scope.test.ts` — covers APR-02/APR-03 (pure payload-shape assertions, mirrors `editor-card-write-scope.test.ts`)
- [ ] `supabase/tests/0018_rls_client_card_scoping_test.sql` — covers APR-01/APR-02/APR-03/KAN-04 (RLS row/stage scoping), reuses `rls_helpers.sql`'s existing `client_a_user` fixture (already `role='client'`, `client_id=client_a`, `status='approved'`) — no new fixture actor needed, but the new file should add a second Client-role actor scoped to a different client to prove cross-client isolation (the negative case)
- [ ] A `role: 'client'` regression case added to `lib/security/board-write-authz.test.ts` — proves the `260811-oe0` fix generalizes to the Client role too
- [ ] `lib/cards/publish-status.test.ts` (or equivalent) — covers SCH-02's pure "Pronto para publicar" computation

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|--------------------|
| Comment visible to PM directly on the card (not a separate document) | APR-04 | UI rendering, not a pure logic assertion | Live checkpoint: Client submits an adjustment with a comment, PM opens the same card and confirms the comment renders on it |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 20s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
