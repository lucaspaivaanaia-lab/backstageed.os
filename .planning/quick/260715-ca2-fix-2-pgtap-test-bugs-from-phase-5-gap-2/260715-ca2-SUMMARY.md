---
quick_task: 260715-ca2
slug: fix-2-pgtap-test-bugs-from-phase-5-gap-2
subsystem: testing
tags: [postgres, pgtap, supabase, rls]

related_phase: 05-access-roles
related_plan: 05-06-PLAN.md

key-files:
  modified:
    - supabase/tests/0001_rls_pm_scoping_test.sql
    - supabase/tests/0002_rls_client_scoping_test.sql
    - supabase/tests/0003_rls_admin_unrestricted_test.sql
    - supabase/tests/rls_helpers.sql

key-decisions:
  - "Use \\ir (include-relative) instead of \\i for the shared fixture include, since \\i resolves against the invoking process's cwd (breaks inside pg_prove's Docker container) while \\ir resolves against the including script's own directory."
  - "Use transaction-scoped `set local role supabase_auth_admin` / `reset role` around the two `alter table auth.users ... trigger` statements instead of any permanent grant — auth.users is owned by supabase_auth_admin, not the connecting postgres role, and postgres is a member of supabase_auth_admin by default in the local Supabase stack."

status: complete
duration: ~5min
completed: 2026-07-15
---

# Quick Task 260715-ca2: Fix 2 pgTAP test bugs from Phase 5 gap 2

**Fixed two real bugs in the pgTAP RLS test suite (`supabase/tests/`) that were only discoverable by actually running `npx supabase test db` against a live Postgres instance — something no prior session in this project had a working Docker daemon to do.**

## Performance

- **Duration:** ~5 min
- **Completed:** 2026-07-15
- **Tasks:** 2/2
- **Files modified:** 5 (4 SQL test files + 1 phase plan doc note)

## Context

Phase 5's gap-closure plan `05-06-PLAN.md` (checkpoint: run the pgTAP suite to green) anticipated that a first live run might surface bugs in the test files themselves, and explicitly deferred any such fix to a follow-up rather than doing it inside that human-verify checkpoint. The operator ran `npx supabase test db` locally with Docker for the first time and hit exactly that: two distinct, unrelated bugs, both in test fixture/harness code, not in the shipped migrations or RLS policies under test.

## Accomplishments

1. **Fixed broken `\i` include path** (`0001_rls_pm_scoping_test.sql:18`, `0002_rls_client_scoping_test.sql:15`, `0003_rls_admin_unrestricted_test.sql:13`): `\i supabase/tests/rls_helpers.sql` resolves relative to psql's invoking working directory. Inside the `pg_prove` Docker container `supabase test db` spins up, that cwd is not the repo root, so the include failed with `No such file or directory`. Replaced with `\ir rls_helpers.sql` in all three files — `\ir` resolves relative to the currently-executing script's own directory, which works regardless of invocation cwd since all four files live together in `supabase/tests/`.

2. **Fixed `must be owner of table users` on the auth.users trigger toggle** (`rls_helpers.sql`, both the disable and enable statements): `ALTER TABLE ... DISABLE/ENABLE TRIGGER` requires table ownership (or superuser) in Postgres. `auth.users` is owned by `supabase_auth_admin` in the local Supabase stack, not by the `postgres` role the test runner connects as — and `postgres` is not a true superuser there (superuser-equivalent tasks are reserved for dedicated roles). Wrapped both `alter table auth.users ... trigger on_auth_user_created` statements in transaction-scoped `set local role supabase_auth_admin; ... reset role;`, matching Supabase's own documented idiom for scripts needing direct `auth.users` DDL access. The `insert into auth.users (...)` statement itself was left untouched since it already succeeds under the connecting role's existing DML grants.

3. **Synced `05-06-PLAN.md`** with a note documenting that these two anticipated-but-deferred test-file bugs were found and fixed by this quick task (commit `b5829bb`), so the phase plan doc doesn't read as stale when 05-06's checkpoint is next revisited.

## What was NOT touched

- No file under `supabase/migrations/` — the shipped RLS policies and triggers under test are unchanged.
- The `insert into auth.users (...)` statement in `rls_helpers.sql` — unchanged, was never the source of the error.
- No permanent grant or role membership change — `set local role` / `reset role` is transaction-scoped and rolls back with each test file's own `begin;`/`rollback;` wrapping.

## Verification

Static/grep-only in this sandbox (no Docker available here either):
- `\ir rls_helpers.sql` present, `\i supabase/tests/rls_helpers.sql` absent, in all three `*_test.sql` files.
- `set local role supabase_auth_admin` / `reset role` present around both `alter table auth.users ... trigger` lines in `rls_helpers.sql`.

**Not yet confirmed:** an actual green `npx supabase test db` run. The operator needs to re-run it locally to confirm both fixes are correct and the suite now passes — this is still 05-06-PLAN.md's outstanding checkpoint (AUTH-06/07/08 remain unverified until that run is green).

## Retest command

```bash
npx supabase test db
```

If Docker was already started for the previous run, `npx supabase start` does not need to be re-run first.

## Commits

- `b5829bb` — `fix(quick-260715-ca2): fix pgTAP include path + auth.users trigger ownership`
- (merge) `6b45b25` — `chore: merge quick task worktree (worktree-agent-a6da7ac93844b8326)`
