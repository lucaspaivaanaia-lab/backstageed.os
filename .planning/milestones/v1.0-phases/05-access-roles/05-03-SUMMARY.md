---
phase: 05-access-roles
plan: 03
subsystem: testing
tags: [pgtap, postgres, rls, supabase, multi-tenancy]

# Dependency graph
requires:
  - phase: 05-01
    provides: "profiles/clients/pm_clients schema, is_admin()/pm_assigned_clients() RLS helpers, prevent_profile_privilege_escalation() column-immutability trigger"
provides:
  - "supabase/tests/rls_helpers.sql -- shared pgTAP fixture (3 actors, 2 clients, 1 pm_clients assignment) + tests.set_auth() JWT-claims role-simulation helper"
  - "supabase/tests/0001_rls_pm_scoping_test.sql -- AUTH-06 + Blocker 1 pgTAP assertions"
  - "supabase/tests/0002_rls_client_scoping_test.sql -- AUTH-07 pgTAP assertions"
  - "supabase/tests/0003_rls_admin_unrestricted_test.sql -- AUTH-08 pgTAP assertions"
affects: [05-04, phase-05-verify-work]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "pgTAP fixture bootstrap disables on_auth_user_created (auth.users trigger) temporarily, then INSERTs (never UPDATEs) directly into public.profiles with final role/status values -- avoids ever invoking the column-immutability BEFORE UPDATE trigger during fixture setup, so that trigger is only ever exercised by the actual test assertions"
    - "Role simulation via set_config('request.jwt.claims', json_build_object('sub', uid, 'role','authenticated')::text, true) + set local role authenticated, matching 05-RESEARCH.md's Validation Architecture pattern"
    - "De-authentication via plain `reset role;` + cleared jwt.claims GUC, not a wrapper function -- avoids needing extra schema grants for the authenticated role mid-test"

key-files:
  created:
    - supabase/tests/rls_helpers.sql
    - supabase/tests/0001_rls_pm_scoping_test.sql
    - supabase/tests/0002_rls_client_scoping_test.sql
    - supabase/tests/0003_rls_admin_unrestricted_test.sql
  modified: []

key-decisions:
  - "Fixture seeds only 3 actors (pm_a, client_a_user, admin_user), not the 4 the plan's prose mentions in passing -- every other part of the plan (Task 2's action text, interfaces, acceptance criteria) consistently references only these 3 named actors, so the '4' appears to be a wording slip, not an unstated 4th actor requirement"
  - "Fixture profiles are seeded via a direct INSERT (never an UPDATE) specifically so fixture bootstrap never has to fight the column-immutability trigger under test -- this is the plan's own documented second option ('insert profiles directly if the trigger is not desired in the fixture')"
  - "Blocker 1's status-immutability assertion updates pm_a's status to 'rejected' (not a no-op 'approved'->'approved') so the trigger's `is distinct from` guard actually fires"

patterns-established:
  - "pgTAP RLS suites live in supabase/tests/*_test.sql, share a single rls_helpers.sql fixture via psql \\i, and never redefine the schema/policies/triggers under test"

requirements-completed: []

# Metrics
duration: ~15min (file authoring; runtime verification blocked, see below)
completed: 2026-07-14
---

# Phase 5 Plan 3: RLS pgTAP Suite Summary

**Four pgTAP SQL files (fixture + three requirement-scoped test files) that exercise 05-01's actual `is_admin()`/`pm_assigned_clients()` helpers and column-immutability trigger for AUTH-06/07/08 and Blocker 1 -- written and statically verified, but NOT yet run to green, because this sandboxed worktree has no Docker/local Postgres stack for `supabase test db` to connect to.**

## Performance

- **Started:** 2026-07-13T23:47:00Z (approx, first file write)
- **Completed:** 2026-07-14T03:01:00Z
- **Tasks:** 2 of 2 authored; Task 2's runtime gate (`supabase test db` exits 0) could not be executed in this environment
- **Files created:** 4

## Accomplishments

- `supabase/tests/rls_helpers.sql`: a deterministic, fixed-uuid pgTAP fixture seeding two clients (`client_a`, `client_b`), three actors (`pm_a` assigned to `client_a` ONLY, `client_a_user` scoped to `client_a`, `admin_user`), and a `tests.set_auth(uid)` role-simulation helper that sets `request.jwt.claims` + `set local role authenticated`. Redefines nothing from 05-01 -- verified by grep (`create function public.is_admin`, `create .*policy`, `create table`, and the trigger's function name all return 0 matches in this file).
- `supabase/tests/0001_rls_pm_scoping_test.sql` (AUTH-06 + Blocker 1): 6 pgTAP assertions -- PM sees `client_a`, is blocked from `client_b`, sees exactly 1 client total; `throws_like` proves the PM cannot self-escalate `role` to admin or self-alter `status`; a `lives_ok` positive control proves the trigger is column-scoped (PM can still update `must_change_password` on their own row).
- `supabase/tests/0002_rls_client_scoping_test.sql` (AUTH-07): 4 pgTAP assertions -- the Client sees their own client, is blocked from the other client, sees exactly 1 profile row total, and that row is their own.
- `supabase/tests/0003_rls_admin_unrestricted_test.sql` (AUTH-08): 3 pgTAP assertions -- admin sees both fixture clients, all `pm_clients` rows, and all `profiles` rows.
- All static/structural acceptance checks specified in the plan (grep-based) pass: `plan(`/`finish(` present in every file, `throws_ok|throws_like` count == 2 in file 0001, zero occurrences of any forbidden redefinition pattern (`create policy`, `create function public.is_admin`, `create function public.pm_assigned`, or the trigger's function name) across any test file, and `client_b` is referenced by name adjacent to the expected-0 assertion in file 0001.

## Task Commits

Each task was committed atomically:

1. **Task 1: pgTAP fixture + role-simulation helper** - `b8d6c20` (test)
2. **Task 2: pgTAP assertions for AUTH-06/07/08 + Blocker 1** - `d15fe05` (test) -- files written and statically verified; the runtime gate (`supabase test db` exits 0) is UNRUN (see Blockers below)

## Files Created/Modified

- `supabase/tests/rls_helpers.sql` - shared fixture (2 clients, 3 actors, 1 pm_clients row) + `tests.set_auth(uid)` helper
- `supabase/tests/0001_rls_pm_scoping_test.sql` - AUTH-06 + Blocker 1 assertions
- `supabase/tests/0002_rls_client_scoping_test.sql` - AUTH-07 assertions
- `supabase/tests/0003_rls_admin_unrestricted_test.sql` - AUTH-08 assertions

## Decisions Made

- **Fixture bootstrap avoids ever invoking the column-immutability trigger.** `handle_new_user()` always sets `status='pending'` for non-`client` roles, so `pm_a`/`admin_user` would need a status-changing UPDATE to reach `status='approved'` -- but that UPDATE is exactly what `prevent_profile_privilege_escalation_trg` (the system under test in file 0001) rejects when no admin exists yet (a bootstrap ordering problem, since no admin profile exists until the fixture itself creates one). Resolved by temporarily disabling `on_auth_user_created` (a different trigger, on `auth.users`) around the `auth.users` insert, then inserting the final `public.profiles` rows directly via a single INSERT -- never an UPDATE -- so the trigger under test is never touched by fixture setup, only by the actual assertions. This is the plan's own explicitly sanctioned second option ("insert profiles directly if the trigger is not desired in the fixture").
- **De-authentication uses plain SQL, not a wrapper function.** `tests.set_auth(uid)` is only ever called while still the session-owner role (pre-switch), so no extra grants are needed. Calling a schema-qualified `tests.clear_auth()` function *while already impersonating* `authenticated` would require `GRANT USAGE ON SCHEMA tests` / `GRANT EXECUTE` to that role first -- avoided entirely by inlining `reset role;` + `select set_config('request.jwt.claims', '', true);` directly in each test file instead.
- **Blocker 1's status assertion targets a real transition.** `pm_a` is already `status='approved'` in the fixture, so `update ... set status = 'approved'` would be a no-op the trigger's `is distinct from` guard would silently allow through (no actual attempted change). The assertion instead attempts `status = 'rejected'` -- a genuine distinct-value change -- so the trigger's rejection is actually exercised.

## Deviations from Plan

### Auto-fixed Issues

None in the Rule 1-3 sense (no bugs found in 05-01's shipped schema/helpers/trigger; no missing critical functionality; no blocking issue solvable by code change).

## Issues Encountered

**Environment gap: no Docker / local Postgres stack available in this worktree.**
- `npx supabase start` fails: `Cannot connect to the Docker daemon at unix:///var/run/docker.sock. Is the docker daemon running?`
- `npx supabase test db` fails identically (`LegacyDbConnectError: failed to connect to postgres`).
- `npx supabase status` fails the same way.
- No fallback Postgres (`psql`/`pg_ctl`/`postgres` binaries) or container runtime (`docker`/`podman`/`colima`) is present in this sandbox.
- This is exactly the condition 05-03-PLAN.md Task 2 itself anticipates and gates on: *"If `supabase start` / local stack cannot be brought up in this environment, this task is BLOCKING: stop and flag that the pgTAP suite must be run against a local Supabase stack before the phase can be verified -- do NOT mark the task done on unrun tests."*
- Per that explicit instruction, Task 2's runtime verification is NOT marked done and `requirements-completed` above is left empty rather than claiming AUTH-06/07/08 as verified.

## Blockers

**BLOCKING: `supabase test db` has not been run to green.** The four SQL files are written, internally consistent with 05-01's actual shipped schema (verified column-by-column against `supabase/migrations/0001_profiles.sql`, `0002_clients_stub.sql`, `0003_pm_clients.sql`, `0004_rls_policies.sql`), and pass every grep-based structural acceptance check the plan specifies -- but none of the pgTAP assertions have actually executed against a live Postgres instance, because this worktree has no Docker daemon and no local Postgres stack.

**Required before this plan (and the AUTH-06/07/08 portion of Phase 5) can be considered verified:**
1. In an environment with Docker available, run `npx supabase start` (or `supabase start` if globally installed) to bring up the local stack.
2. Run `npx supabase test db` (or `supabase test db`) from the repo root.
3. If green (`ok`/`# Passed` lines, no `not ok`/`# Failed`), the suite is verified as-is -- no further action needed.
4. If any assertion fails, treat it as a Rule 1 bug in this plan's test files (not in 05-01's shipped migrations, which were independently verified live in 05-01-SUMMARY.md) and fix the failing test file, then re-run.

This blocker should be surfaced to `/gsd:verify-work` for Phase 5 and re-checked before the phase is marked complete.

## User Setup Required

**Docker Desktop (or an equivalent local container runtime) must be installed and running** in whatever environment ultimately executes `supabase test db` for this plan's verification. See Blockers above for the exact commands to run once available.

## Next Phase Readiness

- All four pgTAP files exist, are committed, and are structurally sound against 05-01's actual shipped schema.
- **Not ready to close out AUTH-06/07/08 as verified** until `supabase test db` is run to green in a Docker-capable environment (see Blockers).
- No changes were made to any 05-01 migration, helper function, policy, or trigger -- this plan is purely additive test tooling.

---
*Phase: 05-access-roles*
*Completed: 2026-07-14*

## Self-Check: PASSED (with a documented runtime-verification blocker)

- `supabase/tests/rls_helpers.sql` -- FOUND on disk.
- `supabase/tests/0001_rls_pm_scoping_test.sql` -- FOUND on disk.
- `supabase/tests/0002_rls_client_scoping_test.sql` -- FOUND on disk.
- `supabase/tests/0003_rls_admin_unrestricted_test.sql` -- FOUND on disk.
- Commit `b8d6c20` -- FOUND in `git log --oneline`.
- Commit `d15fe05` -- FOUND in `git log --oneline`.
- Static/grep-based structural acceptance checks (plan/finish presence, throws_ok|throws_like count, zero forbidden redefinitions) -- all PASSED, reproduced in this summary's Accomplishments section.
- Dynamic acceptance check (`supabase test db` exits 0) -- NOT PASSED / NOT RUN, documented above as a Blocker rather than silently skipped.
