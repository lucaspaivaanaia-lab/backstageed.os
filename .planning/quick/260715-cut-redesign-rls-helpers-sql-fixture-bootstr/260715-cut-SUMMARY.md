---
phase: quick
plan: 260715-cut
subsystem: database
tags: [postgres, pgtap, rls, supabase, triggers, fixtures]

# Dependency graph
requires:
  - phase: 05-access-roles
    provides: profiles table, handle_new_user() trigger, prevent_profile_privilege_escalation_trg (0001_profiles.sql), and the pgTAP RLS test suite (rls_helpers.sql + 0001/0002/0003_*_test.sql) from 05-06
provides:
  - Redesigned rls_helpers.sql fixture bootstrap that no longer requires switching into the supabase_auth_admin role
affects: [05-access-roles, pgtap RLS suite execution]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "pgTAP fixture bootstrap driving Postgres trigger-owned tables via raw_user_meta_data instead of disabling triggers on tables the connecting role does not own"
    - "Scoped disable/enable of a trigger on a table the connecting role DOES own (public.profiles), wrapping a single narrow UPDATE, instead of role-switching into an admin role the connecting role isn't a member of"

key-files:
  created: []
  modified:
    - supabase/tests/rls_helpers.sql
    - .planning/phases/05-access-roles/05-06-PLAN.md

key-decisions:
  - "Never attempt any set role/set local role into supabase_auth_admin or ALTER TABLE auth.users — the local postgres test role is not a member of that admin role and does not own auth.users, so both approaches fail at runtime regardless of transaction scoping"
  - "Let on_auth_user_created fire normally, driving profile role/client_id via raw_user_meta_data so handle_new_user() creates each actor's profile with the correct role and client_id in one step"
  - "Correct the hardcoded pending status to approved via a single scoped UPDATE wrapped in disable/enable of prevent_profile_privilege_escalation_trg on public.profiles (a table the local postgres role does own), rather than any auth.users-side trigger manipulation"
  - "Exclude client_a_user from the status-correction UPDATE — handle_new_user() already sets status='approved' for role='client', so touching that row would be an unnecessary no-op"

requirements-completed: []  # AUTH-06/07/08 are NOT verified by this quick task — it only fixes the fixture-bootstrap blocker. Runtime proof still requires an operator-run `npx supabase test db` (tracked in 05-06-PLAN.md, not here). Do not mark these complete until that run is green.

# Metrics
duration: ~12min
completed: 2026-07-15
---

# Quick Task 260715-cut: Redesign rls_helpers.sql Fixture Bootstrap Summary

**Replaced the failed `set local role supabase_auth_admin` fixture-bootstrap approach with a metadata-driven design: `raw_user_meta_data` drives `handle_new_user()` to create each actor's profile, and a scoped `prevent_profile_privilege_escalation_trg` disable/enable wraps a single status-correction UPDATE.**

## Performance

- **Duration:** ~12 min
- **Started:** 2026-07-15T12:09:00Z (approx)
- **Completed:** 2026-07-15T12:21:06Z
- **Tasks:** 2 completed
- **Files modified:** 2

## Accomplishments
- `rls_helpers.sql`'s actor-provisioning section no longer touches `auth.users`' triggers or attempts any role switch into `supabase_auth_admin` — the round-1 fix (quick task 260715-ca2) failed at runtime with `permission denied to set role "supabase_auth_admin"` because the local `postgres` test role is not a member of that admin role.
- All 3 `auth.users` fixture rows now carry `role` (and `client_id` for the client actor) in `raw_user_meta_data`, letting the existing `on_auth_user_created` trigger and `handle_new_user()` (0001_profiles.sql) create each profile correctly and structurally, with no bypass of the system under test.
- A narrow, scoped `alter table public.profiles disable/enable trigger prevent_profile_privilege_escalation_trg` pair now wraps exactly one UPDATE (correcting `pm_a` and `admin_user` from the hardcoded `pending` to `approved`) — `public.profiles` is owned by the local `postgres` role, so this succeeds without any role switch, unlike the failed `auth.users` attempt.
- `.planning/phases/05-access-roles/05-06-PLAN.md`'s follow-up note updated to record the round-2 revision, including the reason the round-1 fix failed and a reference to this quick task's directory.

## Task Commits

Each task was committed atomically:

1. **Task 1: Redesign the actor-provisioning section of rls_helpers.sql** - `23301d4` (fix)
2. **Task 2: Update the 05-06-PLAN.md follow-up note for round 2** - `9b04636` (docs)

**Plan metadata:** (added by orchestrator after this summary)

## Files Created/Modified
- `supabase/tests/rls_helpers.sql` - Rewrote header comment (round-2 approach), section 2 (`auth.users` insert now carries `raw_user_meta_data` role/client_id, no trigger disable/role switch), and section 3 (direct profiles INSERT replaced with a scoped trigger-disable + single status-correction UPDATE + trigger-enable)
- `.planning/phases/05-access-roles/05-06-PLAN.md` - Extended the existing "Follow-up already applied" note in the objective with a "Round 2" paragraph documenting the new failure, the new approach, and the quick-task directory reference

## Decisions Made
- Do not retry any role-switch-based approach to disabling `auth.users` triggers — the local `postgres` test role can neither own nor become a member of `supabase_auth_admin` in this environment, so any such approach is a dead end regardless of transaction scoping (`set local` vs plain `set`).
- Use `raw_user_meta_data` (already read by `handle_new_user()`) as the single source of truth for each fixture actor's role/client_id, keeping the fixture aligned with the trigger it drives rather than working around it.
- Scope the `prevent_profile_privilege_escalation_trg` disable as tightly as possible (one UPDATE, immediately re-enabled before any test assertions run) so it cannot weaken `0001_rls_pm_scoping_test.sql`'s Blocker-1 assertions, which exercise the trigger under a simulated PM identity — a completely separate code path from fixture bootstrap.

## Deviations from Plan

None - plan executed exactly as written. The initial draft of the rewritten header comment literally quoted the old forbidden SQL fragments (`set local role supabase_auth_admin`, `alter table auth.users disable trigger ...`) for explanatory purposes, which caused the plan's own negative-match grep verification to fail (Task 1's automated check greps for the ABSENCE of those exact patterns anywhere in the file, including comments). This was caught by running the plan's own `<verify>` command before considering the task done, and fixed by rephrasing the comment to describe the old approach without literally reproducing the matched SQL strings. Not logged as a numbered deviation since it did not change scope, behavior, or the SQL logic itself — only comment wording to satisfy the plan's own verification criteria as written.

## Issues Encountered
None beyond the comment-wording self-correction described above.

## Verification Performed

Static/grep-only, per the plan's constraints (no Docker in this sandbox):
- `! grep -Eiq 'set +(local +)?role +supabase_auth_admin' supabase/tests/rls_helpers.sql` — passes (no such pattern anywhere in the file, including comments)
- `! grep -Eiq 'alter +table +auth\.users' supabase/tests/rls_helpers.sql` — passes
- `grep -q '"role":"pm"' supabase/tests/rls_helpers.sql` — passes
- `grep -q '"role":"client","client_id":"11111111-1111-1111-1111-111111111111"' supabase/tests/rls_helpers.sql` — passes
- `grep -q '"role":"admin"' supabase/tests/rls_helpers.sql` — passes
- `grep -q 'disable trigger prevent_profile_privilege_escalation_trg' supabase/tests/rls_helpers.sql` — passes
- `grep -q 'enable trigger prevent_profile_privilege_escalation_trg' supabase/tests/rls_helpers.sql` — passes
- `grep -q '260715-cut' .planning/phases/05-access-roles/05-06-PLAN.md` — passes
- `grep -qi 'permission denied' .planning/phases/05-access-roles/05-06-PLAN.md` — passes
- Confirmed via `git diff --name-only` that only `supabase/tests/rls_helpers.sql` and `.planning/phases/05-access-roles/05-06-PLAN.md` were changed — no edits to `supabase/migrations/*`, `0004_rls_policies.sql`, `0001_profiles.sql`, or the 3 `*_test.sql` files.

**Cannot be verified in this sandbox (no Docker):** `npx supabase test db` was not run here. The operator must re-run it locally against a Docker-capable Supabase stack. Expect a harmless `WARNING: SET LOCAL can only be used in transaction blocks` plus a `Dubious`/`No subtests run` entry for the standalone run of `rls_helpers.sql` itself (it matches the `*.sql` test-file glob used by `supabase test db`, so pg_prove runs it directly outside any test file's `begin;`/`rollback;` wrapper) — this predates both fix attempts (round 1 and round 2) and is not a new regression introduced by this change.

## User Setup Required

None - no external service configuration required. The only remaining manual step is re-running `npx supabase test db` locally (Docker-capable environment), which is tracked as the still-open Task 1 of `.planning/phases/05-access-roles/05-06-PLAN.md`.

## Next Phase Readiness
- `rls_helpers.sql`'s fixture bootstrap no longer contains any approach known to fail against the local Supabase stack's role/ownership model. The operator can proceed directly to re-running `npx supabase test db` without expecting either the round-1 (`must be owner of table users`) or round-2 (`permission denied to set role`) failure.
- AUTH-06/07/08 remain "policy correct by static review, runtime unproven" until that live run completes and is recorded in `05-06-PLAN.md`'s own SUMMARY — this quick task only unblocks the fixture bootstrap, it does not itself execute or verify the pgTAP assertions.

---
*Phase: quick*
*Completed: 2026-07-15*

## Self-Check: PASSED
