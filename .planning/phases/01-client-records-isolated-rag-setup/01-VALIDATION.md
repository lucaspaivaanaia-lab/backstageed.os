---
phase: 1
slug: client-records-isolated-rag-setup
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-07-08
---

# Phase 1 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | None detected — no test config exists in the repo (same finding as Phase 5) |
| **Config file** | none — see Wave 0 Requirements |
| **Quick run command** | To be established in Wave 0 if `vitest` is introduced for `lib/validation/clients.ts` schemas / Tropicalia error-handling unit tests |
| **Full suite command** | To be established in Wave 0 |
| **Estimated runtime** | N/A — manual-only for v1 |

---

## Sampling Rate

- **After every task commit:** Manual click-through of the specific flow just built (e.g., after building client creation, manually create a client as the seeded PM and confirm it appears in that PM's own list).
- **After every plan wave:** Full manual pass through all 4 ROADMAP.md §Phase 1 success criteria, including the two RLS-conflict fixes (Common Pitfalls #2 and #3) explicitly re-verified as PM, not just Admin.
- **Before `/gsd:verify-work`:** All 4 success criteria manually verified true; both D-08 (key-present-but-fails) and D-11 (key-absent) "RAG setup pendente" states visually distinguished correctly.
- **Max feedback latency:** N/A (manual verification — no automated suite exists yet)

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 1-01-xx | TBD | 0 | — | — | `SUPABASE_SECRET_KEY` populated in `.env.local` | manual | — | ❌ W0 | ⬜ pending |
| 1-xx-xx | TBD | TBD | CLI-01 | RLS clients_insert | Admin or PM can create a client record | manual | manual click-through as both Admin and PM | ❌ W0 | ⬜ pending |
| 1-xx-xx | TBD | TBD | CLI-02 | RLS clients_select_scoped / pm_clients | PM gains immediate access once assigned; unassigned PM cannot see the client | manual | create as PM A → confirm PM B blocked → assign PM B → confirm PM B sees it | ❌ W0 | ⬜ pending |
| 1-xx-xx | TBD | TBD | CLI-03 | — | `tropicalia_project_id` isolated per client; D-08/D-11 pendente states correct | manual (+ unit once vitest exists) | manual for success path (needs real `TROPICALIA_API_KEY`); unit test recommended for `createTropicaliaProject` error/timeout branches | ❌ W0 | ⬜ pending |
| 1-xx-xx | TBD | TBD | CLI-04 | RLS clients_update_scoped | PM fills/edits briefing, persists | manual | manual click-through as PM | ❌ W0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

*Task IDs are placeholders — the planner assigns real plan/task IDs; this table's requirement coverage must be re-checked against final PLAN.md files before phase gate.*

---

## Wave 0 Requirements

- [ ] `SUPABASE_SECRET_KEY` populated in `.env.local` from the Supabase Dashboard — hard blocker for the privileged-admin-client transaction pattern (client + pm_clients + Tropicalia provisioning)
- [ ] `TROPICALIA_API_KEY=` empty placeholder line added to `.env.local` per D-11 (not a blocker — supports the key-absent path being the default testable state)
- [ ] Seeded Admin + seeded PM rows created per D-02 (`status='approved'`, `must_change_password=false`)
- [ ] `npx shadcn@latest add checkbox` run once, before the PM multi-select picker is built
- [ ] Decision flagged to user during planning: invest in `pgTAP` for the two corrected RLS policies given their criticality, or accept manual-only verification for v1

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|--------------------|
| Client creation as Admin and as PM | CLI-01 | No test framework exists yet; RLS behavior is most reliably verified against a real local Postgres instance | Log in as seeded Admin, create a client. Log in as seeded PM, create a client. Both should succeed. |
| PM assignment + immediate access | CLI-02 | Same — RLS-dependent, needs real Postgres | Create client as PM A. Confirm PM B (unassigned) cannot see it in their list. Assign PM B. Confirm PM B now sees it. |
| Tropicalia provisioning success path | CLI-03 | Requires a real `TROPICALIA_API_KEY`, which is not yet supplied (D-11) | Once the key is provided, create a client and confirm `tropicalia_project_id` is populated and unique per client. |
| Tropicalia pendente states (D-08 vs D-11) | CLI-03 | Distinguishing "key present but call failed" (retry button) vs. "key absent" (no retry button) is a visual/UX check | With key absent, create a client — confirm "RAG setup pendente" with no retry button. With key present pointing at a bad/unreachable URL, confirm the same status but with a retry button. |
| Briefing fill/edit persistence | CLI-04 | RLS-scoped update, no test framework yet | As PM, fill in briefing fields, save, reload, confirm persistence. Edit again, confirm update persists. |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < N/A (manual-only phase)
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
