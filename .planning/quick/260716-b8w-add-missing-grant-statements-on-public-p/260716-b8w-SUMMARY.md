---
phase: quick
plan: 260716-b8w
subsystem: database
tags: [postgres, supabase, rls, pgtap, grant]

requires:
  - phase: 05-access-roles
    provides: RLS policies on public.profiles / public.pm_clients (profiles_select_own_or_admin, profiles_update_own_or_admin, profiles_admin_insert, profiles_admin_delete, pm_clients_select_own_or_admin, pm_clients_insert_admin_only, pm_clients_delete_admin_only) from 0004_rls_policies.sql
  - phase: quick-260716-au8
    provides: "supabase/migrations/0008_clients_grants.sql: GRANT SELECT/INSERT/UPDATE on public.clients to authenticated"
provides:
  - "supabase/migrations/0009_profiles_pm_clients_grants.sql: GRANT select/insert/update/delete on public.profiles and GRANT select/insert/delete on public.pm_clients to authenticated"
affects: [05-access-roles, phase-5-follow-up]

tech-stack:
  added: []
  patterns:
    - "Base-table GRANT to authenticated is required in addition to RLS policies, per table, before Postgres will consult RLS at all — same pattern as 0008_clients_grants.sql, now closing the profiles/pm_clients layer of the same gap class"

key-files:
  created:
    - supabase/migrations/0009_profiles_pm_clients_grants.sql
  modified: []

key-decisions:
  - "Granted select/insert/update/delete on public.profiles (all four privileges match its four existing RLS policies exactly)"
  - "Granted select/insert/delete on public.pm_clients only — no update grant, since 0004_rls_policies.sql defines no update policy on pm_clients"
  - "Did not attempt to fix the new AUTH-08 fixture-count failure surfaced by this run (admin sees 3 clients, test expects 2) — out of scope per plan's explicit instruction to stop at the 0009 migration and report the outcome verbatim rather than expanding scope"

patterns-established:
  - "Pattern (reaffirmed): any public-schema table read/written through an RLS-policy-scoped query path needs an explicit GRANT ... TO authenticated in a migration, independent of and in addition to the RLS policies themselves"

requirements-completed: []

duration: 28min
completed: 2026-07-16
---

# Quick Task 260716-b8w: Add profiles + pm_clients GRANT migration Summary

**Added `0009_profiles_pm_clients_grants.sql` granting select/insert/update/delete on `public.profiles` and select/insert/delete on `public.pm_clients` to `authenticated`; re-ran `npx supabase test db` and confirmed the `permission denied for table profiles` error is fully resolved — AUTH-06 and AUTH-07 now pass all subtests — but a new, different, non-permission failure surfaced in AUTH-08 (a fixture data-count mismatch: admin sees 3 clients, test expects 2), so AUTH-08 remains still-blocked while AUTH-06/AUTH-07 are now runtime-proven.**

> **CORRECTION (2026-07-16):** Verified directly against the hosted Supabase project (`ancfwsgyzoostoidqzqj`) — it already has full grants on `public.profiles` and `public.pm_clients` for `authenticated`, granted automatically at provisioning by Supabase's hosted platform. This entire GRANT gap (clients, profiles, pm_clients) only ever existed in the local `supabase start` Docker stack; production was never affected. This migration is still valuable for local-dev/CI parity with production and for making the pgTAP suite runnable at all.

## Performance

- **Duration:** 28 min
- **Started:** 2026-07-16T11:05:00Z (approx.)
- **Completed:** 2026-07-16T11:33:00Z
- **Tasks:** 2 completed
- **Files modified:** 1 (new migration)

## Accomplishments

- Added `supabase/migrations/0009_profiles_pm_clients_grants.sql`, closing the `public.profiles` / `public.pm_clients` GRANT gap that 260716-au8's re-run surfaced one layer beneath the now-fixed `public.clients` gap.
- Applied the migration locally via `npx supabase db reset` (confirmed migration 0009 applied in the reset log, replaying 0001-0009 from scratch).
- Re-ran `npx supabase test db` to completion and captured full verbatim output.
- Confirmed the `permission denied for table profiles` error is completely gone — `0001_rls_pm_scoping_test.sql` (AUTH-06) and `0002_rls_client_scoping_test.sql` (AUTH-07) now report `ok` for all subtests, meaning RLS policies are being evaluated (and correctly enforced) at the Postgres layer for the first time in this project's test history.
- Discovered a new, previously-masked failure in `0003_rls_admin_unrestricted_test.sql` (AUTH-08): the first subtest ("admin sees both fixture clients (unrestricted)") fails because `select count(*) from public.clients` returns `3`, not the expected `2`. This is a data/fixture-count mismatch, not a permission or RLS-policy defect — it was previously hidden behind the `permission denied for table profiles` error that aborted the test file before this assertion ever ran.
- Ran `npx supabase stop` to clean up local Docker services after verification.

## Task Commits

Each task was committed atomically:

1. **Task 1: Author 0009_profiles_pm_clients_grants.sql** - `b0b0aed` (feat)
2. **Task 2: Apply migration and re-run pgTAP suite** - no code commit (verification-only task; this SUMMARY.md is its designated output artifact)

**Plan metadata:** `4f699b8` (pre-dispatch commit, already present before execution)

## Files Created/Modified

- `supabase/migrations/0009_profiles_pm_clients_grants.sql` - New migration; `grant select, insert, update, delete on public.profiles to authenticated;` and `grant select, insert, delete on public.pm_clients to authenticated;`, plus header comment explaining the root cause (no prior migration 0001-0008 ever granted base-table privileges on `public.profiles` or `public.pm_clients`, independent of the correct RLS policies in 0004_rls_policies.sql) and explicitly noting `pm_clients` intentionally omits `update` (no update policy exists on it).

## Decisions Made

- Granted all four privileges (select/insert/update/delete) on `public.profiles`, matching its four existing RLS policies exactly (profiles_select_own_or_admin, profiles_update_own_or_admin, profiles_admin_insert, profiles_admin_delete).
- Granted only select/insert/delete on `public.pm_clients`, deliberately omitting `update` since `0004_rls_policies.sql` defines no update policy on this table — matches the pattern already established by `0008_clients_grants.sql`'s equivalent scoping decision.
- Did not attempt to diagnose or fix the new AUTH-08 fixture-count failure. The plan explicitly instructed: "Do not attempt any further schema change beyond the 0009 migration regardless of outcome -- if the suite still fails, quote the failure verbatim and mark the outcome as still-blocked." This new failure is unrelated to GRANT statements (it is a row-count mismatch, not a permission error), so it is out of scope for this quick task and is reported as a new finding for a follow-up task.

## Deviations from Plan

None - plan executed exactly as written. The plan anticipated exactly this scenario (suite might still fail with a new/different error after the GRANT fix) and instructed exactly this response: quote it verbatim, do not attempt further schema change, report the precise pass/still-blocked status per requirement. That is what happened and what this SUMMARY records.

## Issues Encountered

**`npx supabase test db` now passes AUTH-06 and AUTH-07 in full, but AUTH-08 fails on a new, non-permission issue.**

Before this quick task (per 260716-au8-SUMMARY.md), all three RLS test files aborted immediately with:
```
permission denied for table profiles
HINT:  Grant the required privileges to the current role with: GRANT SELECT ON public.profiles TO authenticated;
```

After applying `0009_profiles_pm_clients_grants.sql` and running `npx supabase db reset` (log confirmed `Applying migration 0009_profiles_pm_clients_grants.sql...`), that error is completely gone. `0001_rls_pm_scoping_test.sql` and `0002_rls_client_scoping_test.sql` both report `ok` (all subtests passing). `0003_rls_admin_unrestricted_test.sql` runs 3 subtests and fails 1: the admin-sees-both-clients count assertion expects `2` but the database returns `3`. This is a fixture/data issue (an extra client row exists beyond the two seeded by `rls_helpers.sql`'s `insert into public.clients (id, name) values (...11111111..., ...22222222...)`), not a GRANT or RLS-policy defect — it was previously masked by the permission-denied abort that fired before this specific assertion was ever reached.

### Full verbatim `npx supabase test db` output

```
Connecting to local database...
/Users/lucaspaiva/projects/backstageed.OS/.claude/worktrees/agent-ac594216ce2236703/supabase/tests/0001_rls_pm_scoping_test.sql .......... ok
/Users/lucaspaiva/projects/backstageed.OS/.claude/worktrees/agent-ac594216ce2236703/supabase/tests/0002_rls_client_scoping_test.sql ...... ok
/Users/lucaspaiva/projects/backstageed.OS/.claude/worktrees/agent-ac594216ce2236703/supabase/tests/0003_rls_admin_unrestricted_test.sql ..
# Failed test 1: "AUTH-08: admin sees both fixture clients (unrestricted)"
#     Results differ beginning at row 1:
#         have: (3)
#         want: (2)
# Looks like you failed 1 test of 3
Failed 1/3 subtests
/Users/lucaspaiva/projects/backstageed.OS/.claude/worktrees/agent-ac594216ce2236703/supabase/tests/rls_helpers.sql .......................
No subtests run

Test Summary Report
-------------------
/Users/lucaspaiva/projects/backstageed.OS/.claude/worktrees/agent-ac594216ce2236703/supabase/tests/0003_rls_admin_unrestricted_test.sql (Wstat: 0 Tests: 3 Failed: 1)
  Failed test:  1
/Users/lucaspaiva/projects/backstageed.OS/.claude/worktrees/agent-ac594216ce2236703/supabase/tests/rls_helpers.sql                     (Wstat: 0 Tests: 0 Failed: 0)
  Parse errors: No plan found in TAP output
Files=4, Tests=13,  0 wallclock secs ( 0.01 usr  0.01 sys +  0.01 cusr  0.00 csys =  0.03 CPU)
Result: FAIL
error running container: exit 1
exit_code=1
```

**Confirmed exit code:** `1` (captured directly via `npx supabase test db; echo "exit_code=$?"` in the same shell invocation, no pipe involved).

### Explicit AUTH-06 / AUTH-07 / AUTH-08 status

- **AUTH-06 (PM scoped to assigned clients): PASS.** `0001_rls_pm_scoping_test.sql` reports `ok` — all 6 planned subtests passed, including "PM sees assigned client_a", "PM is blocked from unassigned client_b", and "PM total visible client count equals exactly 1". No `permission denied` and no other error. AUTH-06 is now fully runtime-verified.
- **AUTH-07 (Client scoped to own data): PASS.** `0002_rls_client_scoping_test.sql` reports `ok` — all 4 planned subtests passed, including "Client sees own client (client_a)", "Client is blocked from another client (client_b)", and the two no-cross-client-profile-leakage assertions. AUTH-07 is now fully runtime-verified.
- **AUTH-08 (Admin unrestricted): STILL BLOCKED (partially).** `0003_rls_admin_unrestricted_test.sql` runs all 3 planned subtests (no longer aborts on a permission error) but fails subtest 1 ("admin sees both fixture clients (unrestricted)": expected count `2`, got `3`). Subtests 2 ("admin sees all pm_clients assignment rows") and 3 ("admin sees all profiles rows") are not individually confirmed as passing/failing in the condensed TAP summary line (`Failed 1/3 subtests` — only test 1 is explicitly reported as failed by name; tests 2 and 3 are implied to have passed since only 1 of 3 is listed as failed). The RLS policy itself (`clients_select_scoped` allowing admin unrestricted access) appears to be working correctly at the mechanism level — the failure is a data-count mismatch (an extra, unaccounted-for client row), not a policy or GRANT defect.
- **Overall suite result:** `Result: FAIL`, exit code `1`. This is a **new, different** failure class than the `permission denied for table profiles` error this quick task targeted and resolved. The GRANT gap this quick task was scoped to close (public.profiles / public.pm_clients) is fully closed — evidenced by zero `permission denied` lines anywhere in the re-run output above, and by AUTH-06/AUTH-07 passing in full for the first time.

Per the plan's explicit instruction, **no further schema change was attempted** to fix the AUTH-08 fixture-count mismatch — this quick task's scope was limited to the single `profiles`/`pm_clients` GRANT migration. The extra-client-row issue is a new, distinct finding surfaced only now that the permission layer no longer masks it, and is out of scope for 260716-b8w.

**Follow-up needed (not performed by this quick task):** Investigate why `select count(*) from public.clients` returns `3` instead of the `2` seeded by `rls_helpers.sql` (client_a, client_b) under the admin test's transaction. Likely candidates (not verified here, per scope boundary): a stale/leftover row from a prior `db reset` not being fully cleared, a data seed executed outside `rls_helpers.sql`'s `on conflict (id) do nothing` block, or a trigger/side-effect elsewhere in migrations 0001-0009 that inserts a client row as a side effect (e.g., during profile/user creation). A follow-up quick task should diagnose this specific row-count discrepancy and re-run `npx supabase test db` to confirm AUTH-08 fully passes.

## User Setup Required

None - no external service configuration required. Local Supabase stack was started, exercised (start / db reset / test db), and stopped as part of this quick task's verification; no persistent local services were left running.

## Next Phase Readiness

- `public.profiles` and `public.pm_clients` base-table GRANT gap is now closed via `0009_profiles_pm_clients_grants.sql` — this migration is complete and correct in isolation, matching each table's existing RLS policy set exactly.
- AUTH-06 and AUTH-07 are now fully runtime-verified (all subtests pass, no permission errors, no policy failures).
- AUTH-08 remains partially blocked: the RLS mechanism itself appears functional but a client-row-count mismatch (3 vs expected 2) fails one of its three subtests. A follow-up quick task or Phase 5 plan update is needed to diagnose and fix the fixture/data-count issue before AUTH-08 (and therefore the full three-requirement set) can be marked runtime-complete.
- No further schema changes were made beyond the single `0009_profiles_pm_clients_grants.sql` migration, per this quick task's explicit scope boundary.

## Self-Check: PASSED

- `supabase/migrations/0009_profiles_pm_clients_grants.sql` - FOUND (verified via `test -f` in Task 1's automated verification, and confirmed present in the reset log as `Applying migration 0009_profiles_pm_clients_grants.sql...`).
- Commit `b0b0aed` - FOUND (verified via `git log --oneline` showing `b0b0aed feat(260716-b8w): add GRANT statements for profiles and pm_clients` at HEAD~... in this branch's history).

---
*Phase: quick*
*Completed: 2026-07-16*
