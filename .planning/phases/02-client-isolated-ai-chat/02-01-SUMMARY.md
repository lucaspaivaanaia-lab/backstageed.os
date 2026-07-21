---
phase: 02-client-isolated-ai-chat
plan: 01
subsystem: database
tags: [postgres, supabase, rls, pgtap, messages]

# Dependency graph
requires:
  - phase: 05-access-roles
    provides: "is_admin() / pm_assigned_clients() SECURITY DEFINER helpers and the RLS policy shape reused here (0004_rls_policies.sql)"
provides:
  - "public.messages table (client_id FK cascade, role CHECK user/assistant, created_at) with RLS enabled"
  - "messages_select_scoped / messages_insert_scoped RLS policies scoping reads/writes to pm_assigned_clients() or is_admin()"
  - "GRANT SELECT, INSERT on public.messages to authenticated in the same migration (closes the local-vs-hosted privilege gap pattern from 0008/0009)"
  - "pgTAP proof (0004_rls_messages_scoping_test.sql) that a PM cannot read or insert another client's messages"
affects: ["02-04 (chat Route Handler)", "02-05 (curation Server Action)"]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "RLS-scoped table policies reuse existing is_admin()/pm_assigned_clients() helpers rather than inlining cross-table subqueries (Pitfall 1, carried over from Phase 5)"
    - "GRANT statements ship in the SAME migration that creates a new RLS-enabled table, never deferred to a follow-up migration (Pitfall #4)"

key-files:
  created:
    - supabase/migrations/0010_messages.sql
    - supabase/tests/0004_rls_messages_scoping_test.sql
  modified: []

key-decisions:
  - "No thread_id column added — D-03 keeps a single ongoing history per client; multi-thread support is a trivial additive migration deferred to a later phase if it ever lands."
  - "Insert-rejection assertion in the pgTAP test uses throws_like matching '%row-level security%' rather than checking for 0 persisted rows, since the INSERT policy violation raises a Postgres error synchronously."

patterns-established:
  - "Every new RLS-enabled table's migration must include its GRANT to authenticated in the same file as the CREATE TABLE + policies (recurring Phase 5 lesson, now applied proactively in Phase 2)."

requirements-completed: []  # CTX-01/CTX-02 NOT marked complete — Task 3 (hosted verification checkpoint) has not been approved yet. Do not mark complete until the human confirms public.messages is live on hosted.

# Metrics
duration: ~25min (Tasks 1-2 only; Task 3 checkpoint pending)
completed: 2026-07-21
---

# Phase 2 Plan 01: Messages Table + RLS Scoping Summary

**`public.messages` table with client-scoped RLS (reusing is_admin()/pm_assigned_clients()) and GRANT shipped in the same migration, proven locally by pgTAP — hosted application still awaiting human verification (Task 3 checkpoint).**

## Performance

- **Duration:** ~25 min (Tasks 1-2)
- **Started:** 2026-07-21T17:45:00-03:00 (approx)
- **Completed:** Tasks 1-2 complete; Task 3 (checkpoint:human-verify) reached and NOT resolved
- **Tasks:** 2 of 3 completed (Task 3 is a blocking human-verify checkpoint)
- **Files modified:** 2 created

## Accomplishments
- Created `public.messages` with `client_id` FK (`references public.clients(id) on delete cascade`), `role` CHECK constraint (`'user'`/`'assistant'`), and `created_at timestamptz default now()`.
- Added `messages_select_scoped` and `messages_insert_scoped` RLS policies, both routed through the existing `is_admin()` / `pm_assigned_clients()` SECURITY DEFINER helpers from `0004_rls_policies.sql` — no inlined cross-table subquery.
- Included `grant select, insert on public.messages to authenticated;` in the SAME migration file (`0010_messages.sql`), directly addressing Pitfall #4 (the recurring local-vs-hosted privilege gap that required follow-up migrations 0008/0009 in Phase 5).
- Wrote `0004_rls_messages_scoping_test.sql` proving: (1) pm_a sees exactly 1 message for their assigned client_a, (2) pm_a sees 0 messages for unassigned client_b, (3) pm_a's attempt to INSERT a message for client_b is rejected by the RLS insert policy (`throws_like` matching `%row-level security%`).
- Applied migration 0010 to the LOCAL Supabase stack via `npx supabase db reset` — applied cleanly alongside all prior migrations (0001-0009).
- Ran `npx supabase test db` — all 4 real test files (`0001`, `0002`, `0003`, `0004_rls_messages_scoping_test.sql`) report `ok` with **zero `not ok` lines** and **no `permission denied for table messages`** anywhere in the output, confirming the GRANT is effective locally.

## Task Commits

Each task was committed atomically:

1. **Task 1: Create the messages migration and its pgTAP scoping test** - `c972e42` (feat)
2. **Task 2: Apply the messages migration and run the RLS suite** - no new commit (verification-only task; `0010_messages.sql` was already committed in Task 1's commit, and applying/testing it locally produced no file changes to stage)

**Task 3 not started:** checkpoint:human-verify — see "Checkpoint Reached" below.

_Note: Plan metadata commit is deferred — the orchestrator commits SUMMARY.md per worktree-mode instructions, not a separate `docs(...)` plan-completion commit, since the plan is not yet fully complete pending Task 3._

## Files Created/Modified
- `supabase/migrations/0010_messages.sql` - `public.messages` table + RLS policies + GRANT to authenticated, all in one migration
- `supabase/tests/0004_rls_messages_scoping_test.sql` - pgTAP proof of PM message read/insert scoping

## Decisions Made
- Followed the plan's recommended migration verbatim (matches `02-RESEARCH.md`'s Code Examples section exactly): no `thread_id` column, GRANT co-located with CREATE TABLE.
- Chose `throws_like` for the insert-rejection assertion (pattern already used in `0001_rls_pm_scoping_test.sql` for the role/status self-escalation case) over a "0 rows persisted" `results_eq`, since an RLS INSERT policy violation raises a synchronous Postgres error rather than silently no-op'ing.

## Deviations from Plan

None - plan executed exactly as written for Tasks 1 and 2.

## Issues Encountered

None for Tasks 1-2. `npx supabase test db`'s overall process exit code is 1, but this is a **pre-existing, unrelated cosmetic issue** already documented in `.planning/STATE.md` (quick task `260716-bjk`): `pg_prove`'s glob picks up `rls_helpers.sql` (a fixture helper, not a TAP test file) and reports "No plan found in TAP output" for it. All 4 actual test files (including the new `0004_rls_messages_scoping_test.sql`) report `ok` with zero `not ok` lines, and there is no `permission denied for table messages` anywhere in the output — the acceptance criteria for Task 2 are met despite the non-zero overall exit code.

## Checkpoint Reached (Task 3)

**Type:** human-verify (gate="blocking")
**Status:** NOT resolved — awaiting human confirmation

**What was built:** The `messages` table migration (`0010_messages.sql`) with RLS + GRANT, verified green against the local pgTAP suite (see Accomplishments above).

**Attempted hosted application:** This executor does not have access to Supabase MCP tools (`apply_migration`, `list_migrations`, `list_tables`) in this environment/session — no MCP server exposing those tools was available to call. Per the plan's explicit instruction ("If the MCP tool lacks write access in this environment, do not fabricate success — leave hosted application to the human-verify checkpoint in Task 3"), hosted application was NOT attempted or claimed. This is consistent with Phase 5's project history, where hosted migrations 0008/0009 were applied by the user through their own Supabase connection.

**What's awaited (per plan's `<how-to-verify>`):**
1. Confirm the migration is live on the hosted project `ancfwsgyzoostoidqzqj`: use the Supabase MCP `list_migrations` tool (or `list_tables`) and confirm a `messages` migration / `public.messages` table is present.
2. If it is NOT present, apply `supabase/migrations/0010_messages.sql` via your own Supabase connection (the same path used for 0008/0009), then re-check.
3. Confirm `public.messages` has RLS enabled and a GRANT to `authenticated` (the migration includes both).

**Resume signal:** Type "approved" once `public.messages` is confirmed live on the hosted project, or describe what's missing.

## User Setup Required

None beyond the Task 3 checkpoint above — no new environment variables or dashboard configuration required for this plan.

## Next Phase Readiness

- Local schema + RLS isolation for `messages` is fully proven and ready for the chat Route Handler (02-04) and curation Server Action (02-05) to build on.
- **Blocker:** Hosted application of `0010_messages.sql` is unconfirmed. CTX-01/CTX-02 requirements are NOT marked complete in this summary's frontmatter pending Task 3 approval — the orchestrator should re-run or resume this plan's Task 3 checkpoint before treating this plan as done.

---
*Phase: 02-client-isolated-ai-chat*
*Completed: Tasks 1-2 only, 2026-07-21 — Task 3 checkpoint pending*
