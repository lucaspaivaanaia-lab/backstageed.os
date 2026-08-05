---
phase: quick/260805-kio
plan: 01
subsystem: database
tags: [postgres, rls, pgtap, supabase, security-definer]

# Dependency graph
requires:
  - phase: 05-access-roles (05-01)
    provides: is_admin(), pm_assigned_clients(), clients_select_scoped/clients_update_scoped RLS policies, prevent_profile_privilege_escalation_trg
provides:
  - Hardened public.pm_assigned_clients() that re-verifies role='pm' and status='approved' against public.profiles, mirroring is_pm()'s existing predicate
  - pgTAP regression proof (0011_rls_pm_status_defense_test.sql) that a pm_clients row alone no longer confers access once a PM's profile is flipped away from approved/pm
affects: [phase-05-access-roles, any future RLS helper touching pm_clients/profiles]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "RLS helper defense-in-depth: every SECURITY DEFINER helper that grants cross-table access re-verifies role/status against public.profiles at read time, not just at assignment time (mirrors is_admin()/is_pm())"

key-files:
  created:
    - supabase/migrations/0021_pm_assigned_clients_status_check.sql
    - supabase/tests/0011_rls_pm_status_defense_test.sql
  modified: []

key-decisions:
  - "Followed the plan's exact target function body verbatim (join public.profiles, p.role = 'pm' and p.status = 'approved'), preserving setof uuid / plpgsql / stable / security definer / set search_path = '' unchanged"
  - "Migration applied only to the LOCAL Supabase stack by this executor; hosted push to project ancfwsgyzoostoidqzqj is explicitly deferred to the orchestrator (Task 3, blocking checkpoint) per the established 260722-hnm pattern of isolated worktrees lacking hosted push access"

patterns-established:
  - "Simulating out-of-band manual SQL intervention inside a single test file's own begin;/rollback; transaction (disable/enable prevent_profile_privilege_escalation_trg around a scoped UPDATE) rather than editing the shared rls_helpers.sql fixture -- keeps the shared fixture byte-for-byte identical across all test files"

requirements-completed: [AUTH-06]

# Metrics
duration: 7min
completed: 2026-08-05
---

# Quick Task 260805-kio: Fechar lacuna de defesa em profundidade Summary

**Hardened `public.pm_assigned_clients()` to re-verify `role = 'pm' and status = 'approved'` against `public.profiles`, closing the one RLS helper that trusted a `pm_clients` row alone — proven RED (3/5 failing) then GREEN (5/5 passing) via a new pgTAP test file.**

## Performance

- **Duration:** ~7 min (Task 1 commit to Task 2 commit)
- **Started:** 2026-08-05T15:00:17-03:00 (Task 1 commit)
- **Completed:** 2026-08-05T15:01:31-03:00 (Task 2 commit)
- **Tasks:** 2 of 3 (Task 3 is an orchestrator-scoped blocking checkpoint, not executed by this worktree — see below)
- **Files modified:** 2 (both new)

## Accomplishments
- New migration `0021_pm_assigned_clients_status_check.sql`: `create or replace function public.pm_assigned_clients()` now joins `public.profiles` and requires `p.role = 'pm' and p.status = 'approved'`, mirroring `is_pm()`'s existing predicate. Applied to the local Supabase stack.
- New pgTAP test `0011_rls_pm_status_defense_test.sql` (`plan(5)`) that demonstrably went RED before the fix and GREEN after.
- Zero application-layer files touched; zero pre-existing migrations edited; `clients_select_scoped`/`clients_update_scoped` untouched (they inherit the stricter behavior automatically).

## TDD Gate Compliance

RED and GREEN gates both confirmed empirically by this executor (not merely asserted):

- **RED** (`28c3b8b08762826712356b0c2022b31d6617e57e`, before the migration existed): `npx supabase test db supabase/tests/0011_rls_pm_status_defense_test.sql` → `Result: FAIL`, `Files=1, Tests=5 ... Failed: 3` (subtests 2, 3, 4 failed; 1 and 5 passed) — exactly as the plan's `<behavior>` predicted.
- **GREEN** (`2c7315db50cf4dfa477b36fa74a1d3380e7af747`, after `npx supabase migration up --local` applied 0021): `npx supabase test db supabase/tests/0011_rls_pm_status_defense_test.sql` → `Result: PASS`, `Files=1, Tests=5`, all 5/5 green.
- Full suite after GREEN: `npx supabase test db` → every `tests/0NNN_*_test.sql` line ends `ok`, `Files=12, Tests=49` (up from the pre-task baseline `Files=11, Tests=44`). The trailing `Result: FAIL` / exit 1 is the documented pre-existing cosmetic artifact (pg_prove's glob also picks up `rls_helpers.sql`, a fixture with no TAP plan) — not a regression, per the plan's `<baseline>`.
- Cross-file regression control `0001_rls_pm_scoping_test.sql` (untouched, exercises the original AUTH-06 assertion) independently re-run: `Result: PASS`, `Files=1, Tests=6`.

## Task Commits

Each task was committed atomically:

1. **Task 1: Write the failing pgTAP regression test (RED)** - `28c3b8b` (test)
2. **Task 2: Ship migration 0021 hardening pm_assigned_clients() (GREEN)** - `2c7315d` (feat)

**Plan metadata:** (this SUMMARY.md, committed separately per this run's constraints — see note below)

_Task 3 (apply migration to the hosted Supabase project) is a `checkpoint:human-verify` gate scoped to the ORCHESTRATOR, not this executor's worktree — see "Next Phase Readiness" below._

## Files Created/Modified
- `supabase/migrations/0021_pm_assigned_clients_status_check.sql` - `create or replace function public.pm_assigned_clients()`, joins `public.profiles`, adds `p.role = 'pm' and p.status = 'approved'` predicate; signature (`setof uuid` / `plpgsql` / `stable` / `security definer` / `set search_path = ''`) preserved verbatim
- `supabase/tests/0011_rls_pm_status_defense_test.sql` - 5-assertion pgTAP proof; mutates pm_a's `status`/`role` inside its own `begin;`/`rollback;` transaction using the established scoped-trigger-disable technique, never touching the shared `rls_helpers.sql` fixture

## Decisions Made
- Followed the plan's verbatim target SQL for the migration body exactly as specified in the plan's `<interfaces>` block — no improvisation on the predicate.
- Stopped after Task 2 as instructed: did not run `npx supabase db push` and did not attempt Task 3, since that step requires hosted-project credentials/network access this isolated worktree does not have, matching the established pattern from quick task 260722-hnm.

## Deviations from Plan

None - plan executed exactly as written. No auto-fixes were needed; the plan's verbatim SQL and exact task sequencing worked on the first attempt with no debugging required.

## Issues Encountered

None. The local Supabase Docker stack (`supabase_db_backstageed-os`) was already running and healthy; `node_modules` was missing in this worktree (a known, gitignored environment quirk) and was restored via `npm ci` before Task 1, with zero new dependencies introduced.

## User Setup Required

None - no external service configuration required by Tasks 1-2. Task 3 (below) requires the ORCHESTRATOR to run `npx supabase db push` against the hosted project with existing credentials/MCP access; no new setup, just an existing workflow the isolated executor worktree cannot reach.

## Next Phase Readiness

**Task 3 is PENDING — orchestrator action required, not run by this executor:**

Per the plan, Task 3 (`checkpoint:human-verify`, `gate="blocking"`) applies migration `0021_pm_assigned_clients_status_check.sql` to the HOSTED Supabase project `ancfwsgyzoostoidqzqj`. This isolated executor worktree lacks the network/credential access to push there (documented precedent: quick task 260722-hnm, "Both new migrations applied to hosted Supabase by the orchestrator — executor's worktree lacked MCP access"). The migration and its proof are complete and green locally; the orchestrator must, after merging this worktree:

1. Confirm `supabase/migrations/0021_pm_assigned_clients_status_check.sql` exists on the merged branch.
2. Run `npx supabase migration list` and confirm 0021 shows in `Local` with an empty `Remote` (pre-push state).
3. Run `npx supabase db push`, confirming it applies exactly one migration (0021). If it proposes more, STOP — history has drifted.
4. Re-run `npx supabase migration list` and confirm every row through 0021 now matches `Local`/`Remote`.
5. Confirm the hosted function body via SQL editor/MCP: `select pg_get_functiondef('public.pm_assigned_clients()'::regprocedure);` must contain `join public.profiles`, `p.role = 'pm'`, `p.status = 'approved'`.
6. Sanity-check production: log in as an approved PM at https://backstageed-os.vercel.app and confirm their client list still renders (the one behavior that must NOT change). Clean up test data afterward.

No other blockers or concerns. `is_admin()`, `is_pm()`, `middleware.ts`, `listPmRoster()`, `clients_select_scoped`, `clients_update_scoped`, and the `pending`/`rejected`/`deactivated` workflow are all confirmed untouched.

## Self-Check: PASSED

- FOUND: supabase/migrations/0021_pm_assigned_clients_status_check.sql
- FOUND: supabase/tests/0011_rls_pm_status_defense_test.sql
- FOUND commit: 28c3b8b
- FOUND commit: 2c7315d

---
*Phase: quick/260805-kio*
*Completed: 2026-08-05*
