---
phase: 03
slug: content-production-kanban
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-07-29
---

# Phase 03 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | pgTAP (`supabase test db`) for RLS/schema — no JS/TS unit test runner exists in this codebase yet |
| **Config file** | `supabase/tests/` (existing pgTAP test files from Phases 1/5) |
| **Quick run command** | `npx supabase test db` |
| **Full suite command** | `npx supabase test db` (same suite — no separate full/quick split exists) |
| **Estimated runtime** | ~10-20 seconds |

---

## Sampling Rate

- **After every task commit:** Run `npx supabase test db` whenever a migration changes
- **After every plan wave:** Run `npx supabase test db` + manual click-through of the full briefing → produção → revisão interna → gate-block → checklist-check → advance flow
- **Before `/gsd:verify-work`:** pgTAP suite green + manual verification of the checklist-gate (CHK-03) and admin-override (D-11) paths — these are Server Action business logic, not expressible as pgTAP assertions
- **Max feedback latency:** ~20 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 03-01-XX | 01 | 0 | KAN-01, KAN-03 | RLS bypass / cross-client leak | New `cards` table scoped by denormalized `client_id`, no self-join recursion | pgTAP (RLS insert/select) | `npx supabase test db` | ❌ W0 — new `cards_rls_test.sql` | ⬜ pending |
| 03-01-XX | 01 | 0 | KAN-02 | — | Stage transitions follow the 5-stage order | pgTAP (check constraint) + manual | `npx supabase test db` + manual | ❌ W0 | ⬜ pending |
| 03-01-XX | 01 | 0 | CHK-01, CHK-02 | RLS bypass (admin vs PM) | Admin-only template CRUD, per-client assignment scoped by RLS | pgTAP (RLS insert/update) | `npx supabase test db` | ❌ W0 — new `checklist_rls_test.sql` | ⬜ pending |
| 03-01-XX | 01 | 0 | CHK-04 | Repudiation (silent skip) | `completed_at`/`completed_by` and override rows visible via RLS select | pgTAP (RLS select on `card_checklist_items`/`card_checklist_overrides`) | `npx supabase test db` | ❌ W0 — new `card_checklist_items_rls_test.sql` | ⬜ pending |
| 03-0X-XX | — | — | CHK-03 | Elevation of Privilege | Checklist gate blocks stage advance until all items checked | manual click-through (no DB-constraint expression possible) | manual — documented in VERIFICATION.md | ❌ — no automated coverage without new JS test harness | ⬜ pending |
| 03-0X-XX | — | — | D-11 (admin override) | Repudiation | Override force-advances but always writes `card_checklist_overrides` row in the same action | manual click-through | manual — documented in VERIFICATION.md | ❌ — no automated coverage | ⬜ pending |
| 03-0X-XX | — | — | KAN-05 | Tampering (client-side bypass) | Drive-link regex re-validated server-side before insert | manual (error-path click-through); no JS unit runner present | manual | ❌ — flagged gap, see below | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `supabase/tests/0XXX_cards_rls_test.sql` — covers KAN-01/KAN-03 (RLS select/insert scoping; regression test asserting a piece row's own `client_id` — not its parent's — governs access)
- [ ] `supabase/tests/0XXX_checklist_rls_test.sql` — covers CHK-01/CHK-02 (admin-only template writes, PM read-only)
- [ ] `supabase/tests/0XXX_card_checklist_items_rls_test.sql` — covers CHK-03/CHK-04 (scoped read/write through `cards.client_id`, override rows visible to admin)

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|--------------------|
| Checklist gate disables "Avançar" while any item unchecked, re-enables once all checked | CHK-03, D-06 | Server Action business logic, not a DB constraint; no JS/TS unit test runner exists in this codebase | 1. Create card, advance to revisão interna. 2. Confirm "Avançar" is disabled with all items unchecked. 3. Check items one by one, confirm button stays disabled until the last one. 4. Check final item, confirm button enables. 5. Advance and confirm stage changes. |
| Admin override force-advances a gated card AND writes an audit row | D-11, CHK-04 | Same reason — Server Action logic; also asserts no bypass path exists that skips the audit write | 1. Leave a checklist item unchecked. 2. As Admin, trigger override. 3. Confirm card advances. 4. Open card detail as Admin, confirm an override event (who/when/which items were unchecked) is visible alongside regular checklist history. |
| Drive link validation rejects malformed URLs client- and server-side | KAN-05 | No JS unit test runner in this codebase; regex is a paste-mistake catcher, not a security boundary (per D-09) | 1. Paste a non-Drive URL, confirm rejection with error message. 2. Paste a valid `drive.google.com`/`docs.google.com` link, confirm acceptance. 3. Bypass the client (e.g. direct Server Action call with a bad URL) and confirm server-side rejection too. |
| Package sub-card independence: advancing one sub-card doesn't move siblings | KAN-01, D-01 | No automated test infra covers cross-row UI behavior for this MVP scope | 1. Create a package with 2+ sub-cards. 2. Advance one sub-card to the next stage. 3. Confirm sibling sub-cards remain in their original stage. |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify (pgTAP) or Wave 0 dependencies, or are explicitly listed under Manual-Only Verifications
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references (3 new pgTAP test files above)
- [ ] No watch-mode flags
- [ ] Feedback latency < 20s
- [ ] `nyquist_compliant: true` set in frontmatter once Wave 0 tests exist

**Approval:** pending
