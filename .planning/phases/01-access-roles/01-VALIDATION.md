---
phase: 01
slug: access-roles
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-07-01
---

# Phase 01 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | None yet — greenfield project. `pgTAP` via Supabase CLI (`supabase test db`) for RLS policies; manual click-through for Auth/UI flows |
| **Config file** | none — Wave 0 installs Supabase CLI + `supabase/tests/` scaffold |
| **Quick run command** | `supabase test db` (RLS/pgTAP suite only) |
| **Full suite command** | `supabase test db` + manual checklist pass (see Manual-Only Verifications) |
| **Estimated runtime** | ~30 seconds (pgTAP) + ~15 min manual pass |

---

## Sampling Rate

- **After every task commit:** Manual click-through of the specific flow just built (e.g., after building signup, manually sign up a test PM and confirm `pending` status)
- **After every plan wave:** `supabase test db` (if pgTAP tests exist for the wave) + manual pass through affected AUTH criteria
- **Before `/gsd:verify-work`:** All 6 phase success criteria manually verified true, plus `supabase test db` green for AUTH-06/07/08
- **Max feedback latency:** 30 seconds (pgTAP) / ~15 minutes (full manual pass)

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 01-01-01 | 01 | 0 | — | — | Supabase project provisioned, RLS enabled on all tables | manual | N/A — infra provisioning | ❌ W0 | ⬜ pending |
| 01-0X-0X | TBD | TBD | AUTH-01 | — | PM signup creates pending profile | manual | N/A — manual signup + DB check | ❌ W0 | ⬜ pending |
| 01-0X-0X | TBD | TBD | AUTH-02 | — | Pending PM cannot access platform | manual | N/A — manual login attempt | ❌ W0 | ⬜ pending |
| 01-0X-0X | TBD | TBD | AUTH-03 | — | Admin approves/rejects, rejected not deleted | manual | N/A — manual admin action + DB check | ❌ W0 | ⬜ pending |
| 01-0X-0X | TBD | TBD | AUTH-04 | — | Admin assigns role, takes effect next login | manual | N/A — manual role change + re-login | ❌ W0 | ⬜ pending |
| 01-0X-0X | TBD | TBD | AUTH-05 | — | Session persists across browser refresh | manual | N/A — manual refresh test | ❌ W0 | ⬜ pending |
| 01-0X-0X | TBD | TBD | AUTH-06 | T-01-01 | PM blocked from unassigned client at RLS layer | pgTAP | `supabase test db` | ❌ W0 | ⬜ pending |
| 01-0X-0X | TBD | TBD | AUTH-07 | T-01-02 | Client blocked from other clients' data at RLS layer | pgTAP | `supabase test db` | ❌ W0 | ⬜ pending |
| 01-0X-0X | TBD | TBD | AUTH-08 | T-01-03 | Admin sees everything, unrestricted by RLS | pgTAP | `supabase test db` | ❌ W0 | ⬜ pending |
| 01-0X-0X | TBD | TBD | AUTH-09 | — | PM creates Client login linked to client record | manual | N/A — manual provisioning flow | ❌ W0 | ⬜ pending |
| 01-0X-0X | TBD | TBD | AUTH-10 | — | Client forced to change password on first login | manual | N/A — manual first-login flow | ❌ W0 | ⬜ pending |
| 01-0X-0X | TBD | TBD | AUTH-11 | — | PM/Admin deactivates Client access | manual | N/A — manual deactivation + login attempt | ❌ W0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*
*Task IDs and waves are TBD — planner fills these in once PLAN.md files exist.*

---

## Wave 0 Requirements

- [ ] Supabase project provisioned (hosted) — hard blocker, no fallback (per RESEARCH.md Environment Availability)
- [ ] Supabase CLI installed (`npm install supabase --save-dev` or Homebrew) — enables `supabase test db` (pgTAP) and repeatable migrations
- [ ] `supabase/migrations/` directory initialized
- [ ] `supabase/tests/` scaffold for pgTAP RLS tests (AUTH-06/07/08)
- [ ] Decision confirmed with user: pgTAP investment for RLS policies vs. manual-only for v1 given timeline pressure (RESEARCH.md flags this explicitly — RLS bugs are the highest-severity risk class in this phase)

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| PM signup → pending state | AUTH-01 | No test framework exists yet; Auth flows most reliably verified against a real Supabase instance | Sign up with a new email/password; confirm `profiles.status = 'pending'` and no platform access on login |
| Pending PM blocked from platform | AUTH-02 | Same as above | Log in as pending PM; confirm redirect to waiting screen, no access to `/pm` routes |
| Admin approve/reject flow | AUTH-03 | Same as above | Approve one signup, reject another; confirm rejected row has `status = 'rejected'` (not deleted) |
| Role assignment takes effect | AUTH-04 | Same as above | Assign PM role, log out/in; confirm role-scoped view matches assignment |
| Session persistence across refresh | AUTH-05 | Browser session persistence best verified with a real browser; Playwright not yet installed | Log in, refresh browser tab, confirm still authenticated with no re-login prompt |
| PM provisions Client login | AUTH-09 | Same as no-framework reason above | As PM, create a Client login linked to an existing client record; confirm Client can log in |
| Client forced password change | AUTH-10 | Browser flow, no framework yet | Log in as newly provisioned Client; confirm forced password-change screen blocks access until password is changed |
| PM/Admin deactivates Client | AUTH-11 | Same as above | Deactivate a Client account; confirm subsequent login attempt is blocked |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify (pgTAP for AUTH-06/07/08) or documented manual-only justification (AUTH-01/02/03/04/05/09/10/11)
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify or manual checklist step
- [ ] Wave 0 covers all MISSING references (Supabase project, CLI, migrations dir, pgTAP scaffold)
- [ ] No watch-mode flags
- [ ] Feedback latency < 30s (pgTAP) / 15min (full manual pass)
- [ ] `nyquist_compliant: true` set in frontmatter once planner confirms task-level coverage

**Approval:** pending
