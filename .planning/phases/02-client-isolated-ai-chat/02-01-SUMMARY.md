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

requirements-completed: [CTX-01, CTX-02]  # Marked complete — Task 3 hosted verification approved by orchestrator (confirmed live via Supabase MCP directly).

# Metrics
duration: ~25min (Tasks 1-2) + Task 3 checkpoint (resolved by orchestrator via Supabase MCP)
completed: 2026-07-21
---

# Phase 2 Plan 01: Messages Table + RLS Scoping Summary

**`public.messages` table with client-scoped RLS (reusing is_admin()/pm_assigned_clients()) and GRANT shipped in the same migration, proven locally by pgTAP and confirmed live on hosted project `ancfwsgyzoostoidqzqj` (migration version 20260721205750).**

## Performance

- **Duration:** ~25 min (Tasks 1-2) + Task 3 checkpoint resolution
- **Started:** 2026-07-21T17:45:00-03:00 (approx)
- **Completed:** All 3 tasks complete — Task 3 (checkpoint:human-verify) approved
- **Tasks:** 3 of 3 completed
- **Files modified:** 2 created

## Accomplishments
- Created `public.messages` with `client_id` FK (`references public.clients(id) on delete cascade`), `role` CHECK constraint (`'user'`/`'assistant'`), and `created_at timestamptz default now()`.
- Added `messages_select_scoped` and `messages_insert_scoped` RLS policies, both routed through the existing `is_admin()` / `pm_assigned_clients()` SECURITY DEFINER helpers from `0004_rls_policies.sql` — no inlined cross-table subquery.
- Included `grant select, insert on public.messages to authenticated;` in the SAME migration file (`0010_messages.sql`), directly addressing Pitfall #4 (the recurring local-vs-hosted privilege gap that required follow-up migrations 0008/0009 in Phase 5).
- Wrote `0004_rls_messages_scoping_test.sql` proving: (1) pm_a sees exactly 1 message for their assigned client_a, (2) pm_a sees 0 messages for unassigned client_b, (3) pm_a's attempt to INSERT a message for client_b is rejected by the RLS insert policy (`throws_like` matching `%row-level security%`).
- Applied migration 0010 to the LOCAL Supabase stack via `npx supabase db reset` — applied cleanly alongside all prior migrations (0001-0009).
- Ran `npx supabase test db` — all 4 real test files (`0001`, `0002`, `0003`, `0004_rls_messages_scoping_test.sql`) report `ok` with **zero `not ok` lines** and **no `permission denied for table messages`** anywhere in the output, confirming the GRANT is effective locally.
- **Hosted application confirmed:** the orchestrator applied/verified the migration directly via the Supabase MCP (this executor's session had no MCP tool access) — `public.messages` is live on hosted project `ancfwsgyzoostoidqzqj` as migration version `20260721205750`, with RLS enabled, the `messages_client_id_fkey → public.clients` foreign key, the `role` CHECK constraint, and the `grant select, insert to authenticated` all present exactly as shipped in `0010_messages.sql`.

## Task Commits

Each task was committed atomically:

1. **Task 1: Create the messages migration and its pgTAP scoping test** - `c972e42` (feat)
2. **Task 2: Apply the messages migration and run the RLS suite** - no new commit (verification-only task; `0010_messages.sql` was already committed in Task 1's commit, and applying/testing it locally produced no file changes to stage)
3. **Task 3: Confirm messages migration is live on hosted** - checkpoint:human-verify, **approved** — resolved by the orchestrator, who applied/confirmed the migration directly via the Supabase MCP (hosted migration version `20260721205750`). No new file changes in this worktree for this task; the SUMMARY.md update recording the approval is committed separately (see commit hash in the plan-completion note below).

_Note: Plan metadata commit follows worktree-mode conventions — the orchestrator commits SUMMARY.md (and REQUIREMENTS.md) per `<parallel_execution>`, not a separate `docs(...)` plan-completion commit from this executor._

## Files Created/Modified
- `supabase/migrations/0010_messages.sql` - `public.messages` table + RLS policies + GRANT to authenticated, all in one migration
- `supabase/tests/0004_rls_messages_scoping_test.sql` - pgTAP proof of PM message read/insert scoping

## Decisions Made
- Followed the plan's recommended migration verbatim (matches `02-RESEARCH.md`'s Code Examples section exactly): no `thread_id` column, GRANT co-located with CREATE TABLE.
- Chose `throws_like` for the insert-rejection assertion (pattern already used in `0001_rls_pm_scoping_test.sql` for the role/status self-escalation case) over a "0 rows persisted" `results_eq`, since an RLS INSERT policy violation raises a synchronous Postgres error rather than silently no-op'ing.

## Deviations from Plan

None - plan executed exactly as written. The only deviation from the plan's default execution path is who performed the hosted `apply_migration` step (the orchestrator, via Supabase MCP, rather than this worktree executor, which had no MCP tool access) — this is the explicitly anticipated fallback path described in the plan's Task 2/Task 3 instructions, not an unplanned deviation.

## Issues Encountered

None for Tasks 1-2. `npx supabase test db`'s overall process exit code is 1, but this is a **pre-existing, unrelated cosmetic issue** already documented in `.planning/STATE.md` (quick task `260716-bjk`): `pg_prove`'s glob picks up `rls_helpers.sql` (a fixture helper, not a TAP test file) and reports "No plan found in TAP output" for it. All 4 actual test files (including the new `0004_rls_messages_scoping_test.sql`) report `ok` with zero `not ok` lines, and there is no `permission denied for table messages` anywhere in the output — the acceptance criteria for Task 2 are met despite the non-zero overall exit code.

## Checkpoint Reached (Task 3) — RESOLVED

**Type:** human-verify (gate="blocking")
**Status:** APPROVED

**What was built:** The `messages` table migration (`0010_messages.sql`) with RLS + GRANT, verified green against the local pgTAP suite (see Accomplishments above).

**Hosted application:** This executor did not have access to Supabase MCP tools (`apply_migration`, `list_migrations`, `list_tables`) in its environment/session, so hosted application was not attempted or claimed from this worktree, per the plan's explicit instruction not to fabricate success.

**Resolution:** The orchestrator confirmed via the Supabase MCP directly that `public.messages` is live on hosted project `ancfwsgyzoostoidqzqj` — migration version `20260721205750`, applied by the orchestrator since this session lacked MCP access. Verified: RLS enabled, `messages_client_id_fkey → public.clients`, `role` CHECK constraint present, and `grant select, insert to authenticated` included in what was applied, matching `0010_messages.sql` exactly. The orchestrator's resume signal was "approved."

## User Setup Required

None - the Task 3 checkpoint (hosted migration confirmation) was resolved by the orchestrator directly via the Supabase MCP; no environment variables or dashboard configuration are required for this plan.

## Next Phase Readiness

- Schema + RLS isolation for `messages` is fully proven both locally (pgTAP, zero `not ok`) and on hosted (`ancfwsgyzoostoidqzqj`, migration `20260721205750`) — ready for the chat Route Handler (02-04) and curation Server Action (02-05) to build on.
- No blockers. CTX-01/CTX-02 requirements are marked complete in this summary's frontmatter following Task 3 approval.

---
*Phase: 02-client-isolated-ai-chat*
*Completed: 2026-07-21 — all 3 tasks complete (Task 3 checkpoint approved by orchestrator)*

## Self-Check: PASSED

- FOUND: supabase/migrations/0010_messages.sql
- FOUND: supabase/tests/0004_rls_messages_scoping_test.sql
- FOUND commit: c972e42 (Task 1)
- FOUND commit: 8550b33 (initial SUMMARY.md commit)
