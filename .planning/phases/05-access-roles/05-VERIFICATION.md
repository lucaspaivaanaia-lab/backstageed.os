---
phase: 05-access-roles
verified: 2026-07-14T03:47:10Z
status: gaps_found
score: 4/7 must-haves verified
overrides_applied: 0
gaps:
  - truth: "A PM (or Admin) can create a Client login and deactivate a Client's access, scoped only to clients they are assigned to (AUTH-09/AUTH-11, and the 'blocked at the data layer' half of AUTH-06/ROADMAP Success Criterion 6)"
    status: failed
    reason: "createClientLogin and deactivateClientAccess use the service-role admin client (lib/supabase/admin.ts), which bypasses RLS entirely, and neither function nor the calling page components verify that the authenticated caller is actually a PM assigned to the target clientId via pm_clients. middleware.ts only gates by path-prefix role ('/pm/*' requires role='pm'), never by per-resource assignment. This is a confirmed IDOR / broken-access-control gap (05-REVIEW.md CR-01, CR-02): any authenticated PM can provision or ban a Client login for a client outside their pm_clients assignment, and deactivateClientAccess accepts an arbitrary userId with no verification it belongs to the target client or even to a client-role account at all."
    artifacts:
      - path: "app/pm/clients/[id]/access/actions.ts"
        issue: "createClientLogin(clientId, email) (lines 59-104) and deactivateClientAccess(userId) (lines 121-138) trust clientId/userId at face value; no scoped query against pm_assigned_clients()/is_admin() before falling through to the admin-client calls"
      - path: "app/pm/clients/[id]/access/page.tsx"
        issue: "Derives client_id straight from the URL param and passes it to findActiveClientLogin/createClientLogin with no authorization check that the caller (a PM) is assigned to that client"
      - path: "components/clients/client-access-panel.tsx"
        issue: "handleDeactivate() calls deactivateClientAccess(activeUserId) where activeUserId is client-side React state seeded from the server-rendered existingLoginUserId prop — trivially replayable with an arbitrary UUID since the Server Action itself performs no ownership check"
    missing:
      - "Before any admin-client call in createClientLogin, resolve the caller via the RLS-scoped server client's auth.getUser() and confirm is_admin() OR clientId ∈ pm_assigned_clients() for that caller (05-REVIEW.md CR-01 fix)"
      - "In deactivateClientAccess, require clientId as an argument and verify userId matches the live findActiveClientLogin(clientId) result server-side before banning/deactivating (05-REVIEW.md CR-02 fix)"
  - truth: "A pgTAP suite proves at the Postgres RLS layer that AUTH-06 (PM scoped to assigned clients), AUTH-07 (Client scoped to own data), and AUTH-08 (Admin unrestricted) actually hold, and `supabase test db` exits 0"
    status: partial
    reason: "The four pgTAP files (supabase/tests/rls_helpers.sql, 0001-0003_*_test.sql) exist, are committed, are structurally sound by static review (correct fixture, correct predicates, exercise the real is_admin()/pm_assigned_clients() helpers and the privilege-escalation trigger, no redefinition of schema/policies), and pass every grep-based structural acceptance check — but have never been executed against a live Postgres instance. This verification session independently attempted `npx supabase test db` and confirmed the identical failure the 05-03-SUMMARY.md documented (\"LegacyDbConnectError: failed to connect to postgres\" — no Docker daemon in this sandbox). The underlying RLS policies (supabase/migrations/0004_rls_policies.sql) were pushed to a live Supabase project in 05-01 and structurally verified there (RLS enabled, functions/trigger exist), but no automated or manual test has ever exercised the actual SELECT-scoping behavior (a PM querying clients and getting only their assigned rows back) end-to-end."
    artifacts:
      - path: "supabase/tests/0001_rls_pm_scoping_test.sql"
        issue: "Written and structurally correct; never executed (no Docker/local Postgres in any available environment)"
      - path: "supabase/tests/0002_rls_client_scoping_test.sql"
        issue: "Same — unexecuted"
      - path: "supabase/tests/0003_rls_admin_unrestricted_test.sql"
        issue: "Same — unexecuted"
    missing:
      - "Run `npx supabase start` + `npx supabase test db` in a Docker-capable environment and confirm all assertions pass (ok/# Passed, no not ok/# Failed) before AUTH-06/07/08 can be marked verified per the plan's own must-have"
human_verification:
  - test: "Run the pgTAP RLS suite (`npx supabase start && npx supabase test db`) in an environment with a working Docker daemon"
    expected: "All assertions in 0001/0002/0003_*_test.sql pass (exit 0, no `not ok` lines), confirming AUTH-06/07/08 hold at the RLS layer"
    why_human: "No Docker daemon is available in this sandbox or the executor's sandbox — this is an environment/infrastructure limitation, not something resolvable by further code changes"
  - test: "Live browser check: sign up as a new PM, confirm the /pending screen, have an admin approve/reject via /admin/approvals, log in again and confirm role-root redirect and session persistence across a refresh"
    expected: "Matches AUTH-01 through AUTH-05 behavior as coded"
    why_human: "05-01/05-02-SUMMARY.md both explicitly state this manual click-through pass was never exercised in the executor sessions (no live browser access)"
  - test: "Live check: after the CR-01/CR-02 fix lands, confirm a PM assigned only to client A cannot create or deactivate a Client login for client B via direct Server Action invocation (not just hidden UI)"
    expected: "Action returns an authorization error, not a successful provisioning/deactivation"
    why_human: "Requires exercising the fixed code path with two real PM accounts and two real clients against a live Supabase project"
---

# Phase 5: Access & Roles Verification Report

**Phase Goal:** A PM can sign up and get approved by admin; a Client account is provisioned directly by a PM (no self-signup); both land in a platform that enforces their role's boundaries end-to-end via Supabase RLS
**Verified:** 2026-07-14T03:47:10Z
**Status:** gaps_found
**Re-verification:** No — initial verification

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | New PM can sign up with email/password and lands in a pending-approval state with no platform access (AUTH-01/02) | VERIFIED | `app/(auth)/signup/actions.ts` zod-validates then calls `supabase.auth.signUp` with `role: "pm"` metadata; `handle_new_user()` trigger (`supabase/migrations/0001_profiles.sql`) inserts `status='pending'`; `middleware.ts` redirects any user without an `approved`/non-pending profile to `/pending`, which renders the exact locked D-06 copy. 05-01-SUMMARY documents a live end-to-end test against the hosted Supabase project confirming the resulting profile row. |
| 2 | Admin can view, approve, or reject pending PM signups; rejected rows are retained, never deleted (AUTH-03) | VERIFIED | `app/admin/approvals/page.tsx` selects `profiles` where `status='pending'` via the RLS-scoped client; `components/approvals/approval-queue.tsx` renders email/role-select/Aprovar/Rejeitar per row; `app/admin/approvals/actions.ts` `rejectSignup` does `.update({status:'rejected'})`, never a delete. (Minor: WR-02 in 05-REVIEW.md notes the actions don't check affected-row count, so a stale/already-processed id would silently report success — a Warning, not a functional block.) |
| 3 | Admin can assign PM or Admin role to an approved signup, and that role determines next-login routing (AUTH-04) | VERIFIED | `approveSignup(profileId, role)` updates `profiles.role`/`status='approved'` guarded by the `is_admin()` RLS policy + `prevent_profile_privilege_escalation` trigger; `middleware.ts` re-queries `profiles.role` fresh on every request and redirects to `roleRoot[profile.role]`, so a role change takes effect on the very next request. |
| 4 | Logged-in user's session persists across a browser refresh (AUTH-05) | VERIFIED (structural) | `lib/supabase/middleware.ts`/`middleware.ts` use `@supabase/ssr`'s cookie-backed `getUser()` (verified JWT, not the unverified session cookie) on every request; `middleware.ts`'s `pathname === "/"` redirect (05-02) closes the previously-404ing post-login landing gap. No live browser session-refresh click-through was performed by either executor session (05-01/05-02-SUMMARY.md say so explicitly) — flagged for human spot-check, but the underlying pattern is the standard, low-risk `@supabase/ssr` session mechanism. |
| 5 | PM (or Admin) can create a Client login (provisional password) and the Client is forced to change it on first login, scoped to clients the PM actually manages (AUTH-09/10) | **FAILED** (scoping) / partial (mechanics work) | `createClientLogin`/`generateProvisionalPassword`/`change-password` flow all function correctly for a legitimate in-scope PM — but `createClientLogin` (`app/pm/clients/[id]/access/actions.ts:59-104`) performs **no check** that the caller is assigned to `clientId` via `pm_clients` before calling the service-role admin client. Confirmed directly in code (not just cited from 05-REVIEW.md): `middleware.ts` only gates by path-prefix role, never per-resource. Any PM can provision a Client login for any client. |
| 6 | RLS blocks a PM from clients they're not assigned to, blocks a Client from other clients' data, and lets Admin see everything (AUTH-06/07/08) | **UNCERTAIN** (policies) / **FAILED** (one write path) | The RLS policies themselves (`supabase/migrations/0004_rls_policies.sql`: `is_admin()`, `pm_assigned_clients()`, `clients_select_scoped`, etc.) are well-formed by static review and were pushed live in 05-01. The pgTAP suite that was supposed to prove this at runtime (`supabase/tests/*.sql`) has never executed — this verification session independently re-confirmed `npx supabase test db` fails with `LegacyDbConnectError` (no Docker daemon available here either). Separately, and independent of pgTAP: the client-access Server Actions (Truth 5/7) demonstrably bypass this exact scoping via the service-role client with no equivalent application-layer check — so the "blocked at the data layer" guarantee does NOT hold for that code path today, confirmed by direct code inspection, not merely cited. |
| 7 | PM (or Admin) can deactivate a Client's access, scoped to clients they manage (AUTH-11) | **FAILED** (scoping) / partial (mechanics work) | `deactivateClientAccess(userId)` (`app/pm/clients/[id]/access/actions.ts:121-138`) bans + deactivates via the service-role client with zero check that `userId` belongs to a `client`-role profile, or that it's associated with a client the caller is assigned to. The only gate is client-side React state (`activeUserId` in `client-access-panel.tsx`), which does not constrain a direct Server Action call. Confirmed directly in code. |

**Score:** 4/7 truths fully verified (Truths 5, 6, 7 fail or are unresolved on the core "enforces role boundaries end-to-end via RLS" contract — ROADMAP Success Criterion 6 explicitly)

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `supabase/migrations/0001_profiles.sql` | profiles table, enums, handle_new_user(), privilege-escalation trigger, RLS enabled | VERIFIED | Present, `enable row level security` present, trigger + function present |
| `supabase/migrations/0002_clients_stub.sql` | clients stub, RLS enabled | VERIFIED | Present, RLS enabled |
| `supabase/migrations/0003_pm_clients.sql` | pm_clients + D-10 unique index | VERIFIED | `uq_profiles_one_client_login_per_client` present, RLS enabled |
| `supabase/migrations/0004_rls_policies.sql` | is_admin()/pm_assigned_clients() + policies | VERIFIED | All four policies + two SECURITY DEFINER functions present, `language plpgsql` (not `sql`, avoiding the inlining pitfall) |
| `middleware.ts` | session gate + role routing + `/`→role-root redirect | VERIFIED & WIRED | Confirmed all branches: pending/rejected+deactivated/must_change_password/role-root, including the `pathname === "/"` fix |
| `app/(auth)/signup/actions.ts`, `/pending`, `/rejected` | PM signup + static gates | VERIFIED & WIRED | Locked copy present verbatim in both static pages |
| `app/admin/approvals/{page,actions}.tsx`, `components/approvals/approval-queue.tsx` | Admin approval queue | VERIFIED & WIRED | Real email column, role select, approve/reject wired to RLS-scoped update |
| `supabase/tests/rls_helpers.sql`, `0001-0003_*_test.sql` | pgTAP RLS proof (AUTH-06/07/08) | **EXISTS, SUBSTANTIVE, BUT UNEXECUTED** | Structurally correct (own review + this session's static read of `0001_rls_pm_scoping_test.sql` confirms real assertions, not stubs), but `supabase test db` has never run to completion (Docker unavailable in every available environment, confirmed independently) |
| `app/pm/clients/[id]/access/actions.ts` | createClientLogin/deactivateClientAccess/findActiveClientLogin | **VERIFIED & WIRED, BUT UNSAFE** | Functions exist, are called by both PM and Admin pages, generate real passwords and real Auth users/bans — but missing the caller-scope authorization check (CR-01/CR-02) |
| `app/pm/clients/[id]/access/page.tsx`, `app/admin/clients/[id]/access/page.tsx` | Create/deactivate screens (PM + Admin mirror) | VERIFIED & WIRED | Both render `ClientAccessPanel`, both call the same (unsafe) actions |
| `app/(auth)/change-password/{actions,page}.tsx` | Forced password-change flow (AUTH-10) | VERIFIED & WIRED | `changePassword()` uses `getUser()` (verified), clears `must_change_password`; page reachable only via the existing middleware gate |
| `lib/security/password.ts` | 12+ char provisional password generator | VERIFIED | `crypto.randomBytes`-based, 16 chars, ~92 bits entropy (IN-04 modulo-bias note is low-severity, acknowledged in-file) |

### Key Link Verification

| From | To | Via | Status | Details |
|------|-----|-----|--------|---------|
| `app/(auth)/login/actions.ts` (`router.push('/')`) | role root | `middleware.ts` `pathname === "/"` redirect | WIRED | Confirmed present in current `middleware.ts` |
| `middleware.ts` rejected/deactivated redirect | `app/(auth)/rejected/page.tsx` | `NextResponse.redirect('/rejected')` | WIRED | Page exists with locked copy |
| `app/admin/approvals/actions.ts` | `profiles.status`/`role` | RLS `is_admin()` + privilege-escalation trigger | WIRED | Confirmed via code read |
| `app/pm/clients/[id]/access/actions.ts` | `supabase.auth.admin.createUser/updateUserById` | service-role admin client | WIRED, but **not gated by caller-scope authorization** | This is the crux of the CR-01/CR-02 gap — the link exists and functions, but is missing the authorization pre-check the rest of the phase relies on |
| `middleware.ts` `must_change_password` | `app/(auth)/change-password` | existing redirect gate | WIRED | Confirmed |

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
|----------|---------|--------|--------|
| TypeScript compiles clean | `npx tsc --noEmit` | No output / exit 0 | PASS |
| pgTAP suite executes | `npx supabase test db` | `LegacyDbConnectError: failed to connect to postgres` (no Docker daemon in this environment) | FAIL (environment-blocked, not a code defect) |

### Probe Execution

No `scripts/*/tests/probe-*.sh` convention exists in this repo; the phase's only executable proof artifacts are the pgTAP files under `supabase/tests/`, covered above (attempted, blocked by missing Docker daemon — confirmed independently in this verification session, matching 05-03-SUMMARY.md's documented blocker).

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
|-------------|------------|--------------|--------|----------|
| AUTH-01 | 05-01 | PM can sign up with email/password | SATISFIED | `app/(auth)/signup/actions.ts` |
| AUTH-02 | 05-01 | New PM signup requires admin approval before access | SATISFIED | `middleware.ts` pending gate + `handle_new_user()` |
| AUTH-03 | 05-02 | Admin can view/approve/reject pending PM signups, rejected not deleted | SATISFIED | `app/admin/approvals/*` |
| AUTH-04 | 05-02 | Admin can assign PM/Admin role to approved signup | SATISFIED | `approveSignup(profileId, role)` |
| AUTH-05 | 05-02 | Session persists across refresh | SATISFIED (structural; live check pending) | `@supabase/ssr` cookie-based `getUser()` |
| AUTH-06 | 05-03 | PM can only access clients they are assigned to (RLS) | **BLOCKED** | RLS policy is correct; pgTAP unexecuted; and the client-access write path bypasses this scoping entirely (CR-01) |
| AUTH-07 | 05-03 | Client can only access their own content (RLS) | NEEDS HUMAN (pgTAP unexecuted) | Policy correct by static review; no runtime proof |
| AUTH-08 | 05-03 | Admin can access all clients/PMs/content | NEEDS HUMAN (pgTAP unexecuted) | Policy correct by static review; no runtime proof |
| AUTH-09 | 05-04 | PM can create a Client login linked to an existing client, no self-signup | **BLOCKED** (scoping) | Mechanically works; missing caller-scope check (CR-01) |
| AUTH-10 | 05-04 | Client forced to change provisional password on first login | SATISFIED | `middleware.ts` gate + `change-password` action/page |
| AUTH-11 | 05-04 | PM (or Admin) can deactivate a Client's access | **BLOCKED** (scoping) | Mechanically works; missing ownership check (CR-02) |

No orphaned requirements — all 11 AUTH-* IDs are declared across the four plans' frontmatter and match REQUIREMENTS.md exactly.

Note: `.planning/REQUIREMENTS.md`'s own checkbox markers (`[x]` only for AUTH-09/10/11, `[ ]` for AUTH-01..08) and its Traceability table (all rows still say "Pending") were not updated to reflect actual completion — a documentation staleness issue, not itself a functional gap, but worth a housekeeping pass.

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
|------|------|---------|----------|--------|
| `app/pm/clients/[id]/access/actions.ts` | 59-104, 121-138 | Missing caller-scope authorization before service-role calls (CR-01/CR-02) | 🛑 Blocker | PM can act on out-of-scope clients / arbitrary user accounts |
| `app/pm/clients/[id]/access/actions.ts` | 28-37 | Swallowed query error in `findActiveClientLogin` (WR-01) | ⚠️ Warning | A DB error could be silently indistinguishable from "no active login" |
| `app/admin/approvals/actions.ts` | 20-62 | `approveSignup`/`rejectSignup` don't check affected-row count (WR-02) | ⚠️ Warning | Misleading success toast possible on a stale/already-processed id; not an authorization bypass |
| `app/admin/approvals/page.tsx` | 15-18 | Dead `getUser()` call presented as a check (WR-03) | ⚠️ Warning | Misleading to future maintainers; RLS is the actual boundary |
| `app/pm/clients/[id]/access/actions.ts` | 90-101 | Fragile substring-based duplicate-detection (WR-04) | ⚠️ Warning | Could silently regress if Supabase error wording changes |
| `lib/validation/auth.ts` | 21-26 | Dead/duplicated `clientLoginSchema` (IN-01) | ℹ️ Info | Drift risk, no functional impact |
| `app/pm/clients/[id]/access/actions.ts` | 127 | Magic ban-duration string (IN-02) | ℹ️ Info | Cosmetic |
| `lib/supabase/{admin,client,server,middleware}.ts` | various | Non-null env assertions (IN-03) | ℹ️ Info | Cryptic failure if misconfigured |
| `lib/security/password.ts` | 26-33 | Modulo bias in password gen (IN-04) | ℹ️ Info | Low severity, acknowledged in-file |

No `TODO`/`FIXME`/`XXX`/`TBD`/`PLACEHOLDER` debt markers found in any phase-modified file (checked via grep across all 25 files listed in the four plans' `files_modified`).

### Human Verification Required

See `human_verification` in frontmatter — three items: (1) run the pgTAP suite in a Docker-capable environment, (2) live browser click-through of the AUTH-01..05 signup/approval/session flow, (3) after the CR-01/CR-02 fix lands, confirm a PM cannot act on an out-of-scope client via direct Server Action invocation.

### Gaps Summary

Phase 5's account-model plumbing (signup, pending gate, admin approval/role assignment, session persistence, role-scoped routing, Client provisioning mechanics, forced password change) is genuinely and substantively built — not stubbed, not placeholder, wired end-to-end, and largely live-verified against a hosted Supabase project in 05-01/05-02.

However, two things prevent the phase goal — "enforces their role's boundaries end-to-end via Supabase RLS" — from being fully achieved as stated:

1. **A confirmed, code-level broken-access-control gap (CR-01/CR-02 in 05-REVIEW.md, independently reproduced in this verification by reading `app/pm/clients/[id]/access/actions.ts` and its callers).** The Client-access provisioning/deactivation Server Actions use the service-role client with no equivalent application-layer scoping check, so a PM can create or kill a Client login for a client outside their `pm_clients` assignment, and can plausibly ban an arbitrary account by UUID. This directly violates ROADMAP Success Criterion 6 ("A PM attempting to access a client they are not assigned to is blocked at the data layer... not just hidden in the UI") for this specific code path — the RLS boundary the rest of the phase relies on is structurally bypassed here, not merely untested.

2. **The RLS proof itself (pgTAP, AUTH-06/07/08) has never run.** The underlying RLS policies are well-written and were pushed live, but the automated regression proof the plan itself calls "the only automated coverage in this phase" is unexecuted due to a Docker-daemon-less sandbox — confirmed independently in this verification session, not just taken on faith from 05-03-SUMMARY.md's claim.

Both gaps require follow-up: gap 1 needs a code fix (add the caller/clientId authorization check per 05-REVIEW.md's suggested fixes); gap 2 needs to be run in a Docker-capable environment before AUTH-06/07/08 can be marked verified.

---

_Verified: 2026-07-14T03:47:10Z_
_Verifier: Claude (gsd-verifier)_
