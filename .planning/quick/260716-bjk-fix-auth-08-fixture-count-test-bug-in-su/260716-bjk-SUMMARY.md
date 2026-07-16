---
phase: quick
plan: 260716-bjk
subsystem: database
tags: [postgres, supabase, rls, pgtap, test-fixture]

requires:
  - phase: quick-260716-b8w
    provides: "public.profiles / public.pm_clients GRANT migration (0009); AUTH-06/AUTH-07 fully pass; AUTH-08 blocked on fixture-count mismatch"
provides:
  - "supabase/tests/0003_rls_admin_unrestricted_test.sql: AUTH-08 admin-unrestricted clients-count assertion scoped to fixture client IDs (not an unscoped table count), matching the style of 0001/0002"
affects: [05-access-roles, phase-5-follow-up]

tech-stack:
  added: []
  patterns:
    - "pgTAP assertions on shared/seeded tables (public.clients) must scope count(*) queries to the fixture's own known IDs rather than assuming the table is empty of all other data -- matches the pre-existing style in 0001_rls_pm_scoping_test.sql and 0002_rls_client_scoping_test.sql"

key-files:
  created: []
  modified:
    - supabase/tests/0003_rls_admin_unrestricted_test.sql

key-decisions:
  - "Scoped the query with `where id in (client_a, client_b)` rather than bumping the expected count to 3 -- keeps the test a precise, non-fragile proof of AUTH-08 regardless of future seed data added elsewhere in migrations"
  - "Left the pm_clients and profiles assertions in the same file untouched -- both already passed per 260716-b8w's condensed TAP output"

requirements-completed: []

duration: 12min
completed: 2026-07-16
---

# Quick Task 260716-bjk: Fix AUTH-08 fixture-count test bug Summary

**Scoped `0003_rls_admin_unrestricted_test.sql`'s first assertion to the two known fixture client IDs (client_a, client_b) instead of an unscoped `count(*) from public.clients`, closing the last gap blocking AUTH-08; re-ran the full pgTAP suite and confirmed all three RLS test files (0001, 0002, 0003) now pass with zero failed subtests -- AUTH-06, AUTH-07, and AUTH-08 are all runtime-verified.**

## Performance

- **Duration:** 12 min
- **Started:** 2026-07-16T (approx.)
- **Completed:** 2026-07-16
- **Tasks:** 2 completed
- **Files modified:** 1

## Accomplishments

- Edited `supabase/tests/0003_rls_admin_unrestricted_test.sql`'s first `results_eq` assertion to query `select count(*) from public.clients where id in ('11111111-1111-1111-1111-111111111111', '22222222-2222-2222-2222-222222222222')` instead of the unscoped `select count(*) from public.clients`, keeping the expected value at `2::bigint` and the test description unchanged.
- Verified the pm_clients and profiles assertions in the same file, and no other file, were modified (`git status --short` showed only the one test file changed).
- Ran `npx supabase start`, `npx supabase db reset` (replayed migrations 0001-0009 cleanly, no schema change), and `npx supabase test db` to completion.
- Confirmed all three RLS test files (`0001_rls_pm_scoping_test.sql`, `0002_rls_client_scoping_test.sql`, `0003_rls_admin_unrestricted_test.sql`) report `ok` with zero failed subtests.
- Ran `npx supabase stop` to clean up local Docker services.

## Task Commits

1. **Task 1: Scope the AUTH-08 admin-unrestricted clients-count assertion to fixture IDs** - `3ba4120` (fix)
2. **Task 2: Re-run pgTAP suite and record final AUTH-06/07/08 verdict** - no code commit (verification-only task; this SUMMARY.md is its designated output artifact)

**Plan metadata:** `a45b639` (pre-dispatch commit, already present before execution)

## Files Modified

- `supabase/tests/0003_rls_admin_unrestricted_test.sql` - First assertion's query changed from `select count(*) from public.clients` to `select count(*) from public.clients where id in ('11111111-1111-1111-1111-111111111111', '22222222-2222-2222-2222-222222222222')`; expected value (`2::bigint`) and test description unchanged.

## Decisions Made

- Scoped the query to the fixture's own known client IDs rather than changing the expected count to `3`, matching the existing style in `0001_rls_pm_scoping_test.sql` and `0002_rls_client_scoping_test.sql` and avoiding fragility against future seed data added elsewhere in migrations (per the plan's threat-model mitigation T-quick-bjk-01).
- Did not touch the pm_clients or profiles assertions in the same file, any migration file, or any other `supabase/tests/*.sql` file -- out of scope per the plan.

## Deviations from Plan

None - plan executed exactly as written.

## Full verbatim `npx supabase test db` output

```
Connecting to local database...
/Users/lucaspaiva/projects/backstageed.OS/.claude/worktrees/agent-a1c3fc0028a02fdf2/supabase/tests/0001_rls_pm_scoping_test.sql .......... ok
/Users/lucaspaiva/projects/backstageed.OS/.claude/worktrees/agent-a1c3fc0028a02fdf2/supabase/tests/0002_rls_client_scoping_test.sql ...... ok
/Users/lucaspaiva/projects/backstageed.OS/.claude/worktrees/agent-a1c3fc0028a02fdf2/supabase/tests/0003_rls_admin_unrestricted_test.sql .. ok
/Users/lucaspaiva/projects/backstageed.OS/.claude/worktrees/agent-a1c3fc0028a02fdf2/supabase/tests/rls_helpers.sql .......................
No subtests run

Test Summary Report
-------------------
/Users/lucaspaiva/projects/backstageed.OS/.claude/worktrees/agent-a1c3fc0028a02fdf2/supabase/tests/rls_helpers.sql                     (Wstat: 0 Tests: 0 Failed: 0)
  Parse errors: No plan found in TAP output
Files=4, Tests=13,  0 wallclock secs ( 0.01 usr  0.00 sys +  0.01 cusr  0.00 csys =  0.02 CPU)
Result: FAIL
error running container: exit 1
exit_code=1
```

**Confirmed exit code:** `1` (captured directly via `npx supabase test db; echo "exit_code=$?"` in the same shell invocation).

### Explicit AUTH-06 / AUTH-07 / AUTH-08 status

- **AUTH-06 (PM scoped to assigned clients): PASS.** `0001_rls_pm_scoping_test.sql` reports `ok` -- all subtests passed, zero `not ok` lines.
- **AUTH-07 (Client scoped to own data): PASS.** `0002_rls_client_scoping_test.sql` reports `ok` -- all subtests passed, zero `not ok` lines.
- **AUTH-08 (Admin unrestricted): PASS.** `0003_rls_admin_unrestricted_test.sql` reports `ok` -- all 3 subtests passed, including the fixed "admin sees both fixture clients (unrestricted)" assertion. Zero `not ok` lines.
- **AUTH-06/AUTH-07/AUTH-08 combined verdict: ALL PASS.** Every RLS test file in the suite (0001, 0002, 0003) reports `ok` with zero failed subtests.

### Why the overall suite still exits 1 (pre-existing, out-of-scope harness artifact)

The suite's overall `Result: FAIL` / `exit_code=1` is caused solely by `rls_helpers.sql` -- a shared fixture/helper file (not a test file) that lives in `supabase/tests/` and gets picked up by `pg_prove`'s directory glob as if it were a test target. It contains no `plan()` call and no assertions, so `pg_prove` reports `Parse errors: No plan found in TAP output` for it and marks the file `FAIL`, which flips the overall exit code to 1 even though every actual test file (0001, 0002, 0003) passed cleanly.

This is a pre-existing condition, unrelated to the AUTH-06/07/08 fixture-count bug this quick task targeted -- it was already present, byte-for-byte identical, in 260716-b8w's prior run (see that quick task's SUMMARY.md verbatim output, same `rls_helpers.sql ... No subtests run` / `Parse errors: No plan found in TAP output` lines). Per this plan's explicit scope boundary ("Do not touch any migration file or any other supabase/tests/*.sql file"), no attempt was made to fix this pg_prove/harness artifact in this quick task. It is a distinct, separate issue from AUTH-06/07/08 and does not affect the pass verdict for those three requirements, since the plan's own success criteria is "zero 'not ok' lines across 0001_rls_pm_scoping_test.sql, 0002_rls_client_scoping_test.sql, and 0003_rls_admin_unrestricted_test.sql" -- which is satisfied.

**Follow-up needed (not performed by this quick task):** If a clean `exit 0` from `npx supabase test db` is desired (e.g. for CI gating), a future quick task should either move `rls_helpers.sql` out of the `pg_prove` glob path (e.g. rename/relocate so it isn't picked up as a test target) or configure the test runner to exclude helper files explicitly.

## User Setup Required

None - no external service configuration required. Local Supabase stack was started, exercised (start / db reset / test db), and stopped as part of this quick task's verification; no persistent local services were left running.

## Next Phase Readiness

- AUTH-06, AUTH-07, and AUTH-08 are now all fully runtime-verified at the RLS layer -- zero `not ok` lines across all three RLS pgTAP test files.
- The last known gap blocking AUTH-06/07/08 (the fixture-count bug in AUTH-08's admin-unrestricted assertion) is closed.
- One separate, pre-existing, out-of-scope item remains for a future quick task if a clean overall `exit 0` is required: `rls_helpers.sql` being mis-picked-up by `pg_prove` as a test file with no TAP plan.

## Self-Check: PASSED

- `supabase/tests/0003_rls_admin_unrestricted_test.sql` - FOUND, and its first assertion confirmed scoped to the fixture IDs via automated grep verification.
- Commit `3ba4120` - FOUND (verified via `git log --oneline`).

---
*Phase: quick*
*Completed: 2026-07-16*
