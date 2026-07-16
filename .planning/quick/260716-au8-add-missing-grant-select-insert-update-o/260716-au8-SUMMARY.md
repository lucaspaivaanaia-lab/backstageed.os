---
phase: quick
plan: 260716-au8
subsystem: database
tags: [postgres, supabase, rls, pgtap, grant]

requires:
  - phase: 05-access-roles
    provides: RLS policies on public.clients (clients_select_scoped, clients_insert_admin_or_pm, clients_update_scoped) from 0004_rls_policies.sql / 0007_clients_rls_fix.sql
provides:
  - "supabase/migrations/0008_clients_grants.sql: GRANT SELECT/INSERT/UPDATE on public.clients to authenticated"
affects: [05-access-roles, phase-5-follow-up]

tech-stack:
  added: []
  patterns:
    - "Base-table GRANT to authenticated is required in addition to RLS policies — local Supabase (matching cloud default) does not auto-expose new public-schema tables to API roles"

key-files:
  created:
    - supabase/migrations/0008_clients_grants.sql
  modified: []

key-decisions:
  - "Granted only SELECT/INSERT/UPDATE on public.clients (no DELETE) — matches the fact that 0004/0007 define no delete policy on clients, so delete remains out of scope for this phase"
  - "Did not add a matching GRANT for public.profiles even though the re-run surfaced the identical failure pattern one layer up — plan explicitly scoped this quick task to the single 0008 clients grant and instructed marking still-blocked rather than attempting further schema change"

patterns-established:
  - "Pattern: any public-schema table read/written through an RLS-policy-scoped query path needs an explicit GRANT ... TO authenticated in a migration, or Postgres rejects the query before RLS is ever evaluated"

requirements-completed: []

duration: 22min
completed: 2026-07-16
---

# Quick Task 260716-au8: Add clients GRANT migration Summary

**Added `0008_clients_grants.sql` granting SELECT/INSERT/UPDATE on `public.clients` to `authenticated`; re-ran `npx supabase test db` and found the suite still fails — same permission-denied pattern, now against `public.profiles` instead of `public.clients` — so AUTH-06/07/08 remain runtime-blocked, one layer further than 05-06-SUMMARY.md diagnosed.**

> **CORRECTION (2026-07-16):** Verified directly against the hosted Supabase project (`ancfwsgyzoostoidqzqj`) — it already has full grants on `public.clients` for `authenticated`, granted automatically at provisioning by Supabase's hosted platform. This GRANT gap only ever existed in the local `supabase start` Docker stack, not in production. "AUTH-06/07/08 remain runtime-blocked" below means blocked from local/CI automated proof, not that production was affected.

## Performance

- **Duration:** 22 min
- **Started:** 2026-07-16T10:35:00Z (approx.)
- **Completed:** 2026-07-16T10:57:14Z
- **Tasks:** 2 completed
- **Files modified:** 1 (new migration)

## Accomplishments
- Added `supabase/migrations/0008_clients_grants.sql`, the missing base-table GRANT for `public.clients` that 05-06-SUMMARY.md identified as the root cause of `permission denied for table clients`.
- Applied the migration locally via `npx supabase db reset` (confirmed migration 0008 applied in the reset log) and re-ran `npx supabase test db` to completion.
- Confirmed via verbatim re-run output that the original `clients` permission error is gone, but an identical-pattern error now surfaces against `public.profiles` — a second, previously-masked gap in the same class of issue.

## Task Commits

Each task was committed atomically:

1. **Task 1: Add 0008_clients_grants.sql migration** - `87edfbf` (feat)
2. **Task 2: Apply the migration locally and re-run the pgTAP suite** - no code commit (verification-only task; this SUMMARY.md is its designated output artifact, and per orchestrator constraints quick-task docs artifacts are committed by the orchestrator after merge, not by the executor)

**Plan metadata:** committed by orchestrator after merge (per constraints, this executor does not commit SUMMARY.md/STATE.md itself as part of task work — see note in orchestrator constraints)

## Files Created/Modified
- `supabase/migrations/0008_clients_grants.sql` - New migration; `grant select, insert, update on public.clients to authenticated;` plus header comment explaining the root cause (no prior migration ever granted base-table privileges on `public.clients`, independent of the correct RLS policies in 0004/0007) and explicitly scoping out `delete` (no delete policy exists on clients).

## Decisions Made
- Granted only SELECT/INSERT/UPDATE (no DELETE) on `public.clients`, matching the plan's explicit instruction and the fact that no delete policy exists on this table in 0004/0007.
- Did not attempt any further schema change (e.g., a matching GRANT for `public.profiles`) after the re-run surfaced a new failure — plan explicitly instructed stopping and marking still-blocked rather than expanding scope, to keep this quick task additive and single-purpose.

## Deviations from Plan

None - plan executed exactly as written. The plan explicitly anticipated the possibility that the suite might still fail with a new/different error and instructed exactly this response (quote it verbatim, do not attempt further schema change, mark still-blocked). That is what happened and what this SUMMARY records.

## Issues Encountered

**`npx supabase test db` still fails after the 0008 migration — new failure surfaced, one layer beneath the original.**

Before this quick task (per 05-06-SUMMARY.md), all three RLS test files failed with:
```
ERROR:  permission denied for table clients
HINT:  Grant the required privileges to the current role with: GRANT SELECT ON public.clients TO authenticated;
```

After applying `0008_clients_grants.sql` and running `npx supabase db reset` (log confirmed `Applying migration 0008_clients_grants.sql...`), the original `clients` permission error is resolved. However, `npx supabase test db` re-run now fails with a **different, new** permission error — same pattern, different table:

```
permission denied for table profiles
HINT:  Grant the required privileges to the current role with: GRANT SELECT ON public.profiles TO authenticated;
```

This confirms the same underlying gap (`supabase/config.toml`'s `[api] auto_expose_new_tables` behavior — new public-schema tables are not auto-exposed to API roles by default) also applies to `public.profiles`, which no migration (0001-0008) has ever granted to `authenticated` either. `grep -n -i "grant" supabase/migrations/*.sql` confirms zero GRANT statements existed before this quick task, and this quick task added exactly one (for `clients` only).

Per the plan's explicit instruction, **no further schema change was attempted** — this quick task's scope was limited to the single `clients` GRANT diagnosed by 05-06-SUMMARY.md. The `profiles` gap is a new, distinct finding surfaced only by this test run and is out of scope for 260716-au8.

### Full verbatim `npx supabase test db` output (second/confirmed run, used for the recorded exit code)

```
Connecting to local database...
psql:/Users/lucaspaiva/projects/backstageed.OS/.claude/worktrees/agent-a4ec00e08814df86a/supabase/tests/rls_helpers.sql:143: NOTICE:  schema "tests" already exists, skipping
psql:/Users/lucaspaiva/projects/backstageed.OS/.claude/worktrees/agent-a4ec00e08814df86a/supabase/tests/0001_rls_pm_scoping_test.sql:28: ERROR:  permission denied for table profiles
HINT:  Grant the required privileges to the current role with: GRANT SELECT ON public.profiles TO authenticated;
CONTEXT:  SQL statement " select count(*) from public.clients where id = '11111111-1111-1111-1111-111111111111' "
PL/pgSQL function results_eq(text,text,text) line 7 at OPEN
/Users/lucaspaiva/projects/backstageed.OS/.claude/worktrees/agent-a4ec00e08814df86a/supabase/tests/0001_rls_pm_scoping_test.sql .......... 
Dubious, test returned 3 (wstat 768, 0x300)
Failed 6/6 subtests 
psql:/Users/lucaspaiva/projects/backstageed.OS/.claude/worktrees/agent-a4ec00e08814df86a/supabase/tests/rls_helpers.sql:143: NOTICE:  schema "tests" already exists, skipping
psql:/Users/lucaspaiva/projects/backstageed.OS/.claude/worktrees/agent-a4ec00e08814df86a/supabase/tests/0002_rls_client_scoping_test.sql:25: ERROR:  permission denied for table profiles
HINT:  Grant the required privileges to the current role with: GRANT SELECT ON public.profiles TO authenticated;
CONTEXT:  SQL statement " select count(*) from public.clients where id = '11111111-1111-1111-1111-111111111111' "
PL/pgSQL function results_eq(text,text,text) line 7 at OPEN
/Users/lucaspaiva/projects/backstageed.OS/.claude/worktrees/agent-a4ec00e08814df86a/supabase/tests/0002_rls_client_scoping_test.sql ...... 
Dubious, test returned 3 (wstat 768, 0x300)
Failed 4/4 subtests 
psql:/Users/lucaspaiva/projects/backstageed.OS/.claude/worktrees/agent-a4ec00e08814df86a/supabase/tests/rls_helpers.sql:143: NOTICE:  schema "tests" already exists, skipping
psql:/Users/lucaspaiva/projects/backstageed.OS/.claude/worktrees/agent-a4ec00e08814df86a/supabase/tests/0003_rls_admin_unrestricted_test.sql:23: ERROR:  permission denied for table profiles
HINT:  Grant the required privileges to the current role with: GRANT SELECT ON public.profiles TO authenticated;
CONTEXT:  SQL statement " select count(*) from public.clients "
PL/pgSQL function results_eq(text,text,text) line 7 at OPEN
/Users/lucaspaiva/projects/backstageed.OS/.claude/worktrees/agent-a4ec00e08814df86a/supabase/tests/0003_rls_admin_unrestricted_test.sql .. 
Dubious, test returned 3 (wstat 768, 0x300)
Failed 3/3 subtests 
psql:/Users/lucaspaiva/projects/backstageed.OS/.claude/worktrees/agent-a4ec00e08814df86a/supabase/tests/rls_helpers.sql:143: NOTICE:  schema "tests" already exists, skipping
/Users/lucaspaiva/projects/backstageed.OS/.claude/worktrees/agent-a4ec00e08814df86a/supabase/tests/rls_helpers.sql ....................... 
No subtests run 

Test Summary Report
-------------------
/Users/lucaspaiva/projects/backstageed.OS/.claude/worktrees/agent-a4ec00e08814df86a/supabase/tests/0001_rls_pm_scoping_test.sql        (Wstat: 768 (exited 3) Tests: 0 Failed: 0)
  Non-zero exit status: 3
  Parse errors: Bad plan.  You planned 6 tests but ran 0.
/Users/lucaspaiva/projects/backstageed.OS/.claude/worktrees/agent-a4ec00e08814df86a/supabase/tests/0002_rls_client_scoping_test.sql    (Wstat: 768 (exited 3) Tests: 0 Failed: 0)
  Non-zero exit status: 3
  Parse errors: Bad plan.  You planned 4 tests but ran 0.
/Users/lucaspaiva/projects/backstageed.OS/.claude/worktrees/agent-a4ec00e08814df86a/supabase/tests/0003_rls_admin_unrestricted_test.sql (Wstat: 768 (exited 3) Tests: 0 Failed: 0)
  Non-zero exit status: 3
  Parse errors: Bad plan.  You planned 3 tests but ran 0.
/Users/lucaspaiva/projects/backstageed.OS/.claude/worktrees/agent-a4ec00e08814df86a/supabase/tests/rls_helpers.sql                     (Wstat: 0 Tests: 0 Failed: 0)
  Parse errors: No plan found in TAP output
Files=4, Tests=0,  0 wallclock secs ( 0.01 usr  0.00 sys +  0.01 cusr  0.00 csys =  0.02 CPU)
Result: FAIL
error running container: exit 1
```

**Confirmed exit code:** `1` (verified by re-running the bare command with output redirected via `>`, not through a `tee` pipe, to avoid `PIPESTATUS` ambiguity — `echo $?` printed `1` directly after the command).

### Explicit AUTH-06 / AUTH-07 / AUTH-08 status: STILL BLOCKED (not passing)

- **AUTH-06 (PM scoped to assigned clients):** STILL BLOCKED. `0001_rls_pm_scoping_test.sql` failed all 6 planned subtests with `Bad plan. You planned 6 tests but ran 0` — the test aborted before any RLS assertion ran, due to `permission denied for table profiles`.
- **AUTH-07 (Client scoped to own data):** STILL BLOCKED. `0002_rls_client_scoping_test.sql` failed all 4 planned subtests with the identical `permission denied for table profiles` error before any RLS assertion ran.
- **AUTH-08 (Admin unrestricted):** STILL BLOCKED. `0003_rls_admin_unrestricted_test.sql` failed all 3 planned subtests with the identical `permission denied for table profiles` error before any RLS assertion ran.
- **Overall suite result:** `Result: FAIL`, exit code `1`. Zero `ok` lines were emitted for any of the 13 planned RLS subtests across 0001/0002/0003 — all aborted at the permission-check layer, not the RLS-policy layer.

This is a **new, different** failure than the one 05-06-SUMMARY.md diagnosed (which was specifically about `public.clients`). The `0008_clients_grants.sql` migration added by this quick task correctly resolved the `clients` permission error — this is confirmed by the absence of any `permission denied for table clients` line in the re-run output above, which previously appeared at this exact point (05-06-SUMMARY.md: "permission denied for table clients" at test line 28 of 0001). The suite now fails one step earlier in the same query, on `public.profiles`, which is queried by `is_pm()` / `is_admin()` (both `security definer` functions reading `public.profiles`) before `public.clients` is ever reached.

**Follow-up needed (not performed by this quick task):** A companion migration granting `SELECT` (at minimum) on `public.profiles` to `authenticated` is required to unblock AUTH-06/07/08 runtime verification. This quick task does not add that migration — per its explicit scope, it stops at "still-blocked" and defers further schema change to a separate follow-up (new quick task or Phase 5 update). Phase 5's `05-06-SUMMARY.md` and `ROADMAP.md` status should also be updated by a human or later phase-tracking action to reflect that AUTH-06/07/08 remain runtime-blocked, now on a `profiles` grant rather than a `clients` grant — this quick task does not edit `ROADMAP.md` itself, per project convention.

## User Setup Required

None - no external service configuration required. Local Supabase stack was started, exercised, and stopped as part of this quick task's verification; no persistent local services were left running.

## Next Phase Readiness

- `public.clients` base-table GRANT gap is now closed via `0008_clients_grants.sql` — this migration is complete and correct in isolation.
- AUTH-06/AUTH-07/AUTH-08 remain runtime-blocked, now due to a missing `public.profiles` GRANT surfaced only after this fix. A follow-up quick task or Phase 5 plan update is needed to add a `profiles` GRANT (likely `SELECT` only, since `is_pm()`/`is_admin()` only read `profiles`) and re-verify.
- No further schema changes were made beyond the single `0008_clients_grants.sql` migration, per this quick task's explicit scope boundary.

---
*Phase: quick*
*Completed: 2026-07-16*
