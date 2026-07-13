---
phase: 01-client-records-isolated-rag-setup
plan: 02
subsystem: database
tags: [supabase, postgres, rls, migrations]

requires:
  - phase: 05-access-roles (05-01)
    provides: "clients stub table (id, name, created_at), is_admin()/pm_assigned_clients() SECURITY DEFINER helpers, admin-only clients RLS from 0004_rls_policies.sql"
provides:
  - "clients table extended with tropicalia_project_id (CLI-03) and the four structured briefing fields objective/tone_of_voice/target_audience/content_pillars (CLI-04), plus updated_at"
  - "is_pm() SECURITY DEFINER helper mirroring is_admin() exactly"
  - "clients_insert_admin_or_pm and clients_update_scoped RLS policies replacing the admin-only policies that blocked PM create/edit"
  - "Both migrations (0006, 0007) applied to the live Supabase project (ancfwsgyzoostoidqzqj / backstageed.OS), confirmed via live pg_proc/pg_policies/information_schema queries"
affects: [01-03, 01-04]

tech-stack:
  added: []
  patterns:
    - "New SECURITY DEFINER helper functions must mirror is_admin()'s exact shape: language plpgsql, stable, security definer, set search_path = '' -- never language sql (Pitfall 1, inlining risk)"
    - "Client creation's PM self-link write goes through a privileged admin-client transaction (Plan 01-03), never a broadened pm_clients RLS policy (Pitfall 3 discipline)"

key-files:
  created:
    - "supabase/migrations/0006_clients_full_record.sql"
    - "supabase/migrations/0007_clients_rls_fix.sql"
  modified: []

key-decisions:
  - "Task 2's required explanatory comment (mandated by the plan's own <action> text) mentions 'pm_clients' in prose, which technically fails the acceptance criteria's literal grep -c 'pm_clients' == 0 check. Resolved as a plan self-contradiction, not a code bug: verified no actual SQL statement in 0007 creates/drops/alters anything on public.pm_clients (grep for 'on public.pm_clients', 'alter table public.pm_clients', 'create/drop policy...pm_clients' all return zero matches) -- the substantive Pitfall 3 guarantee (this migration does not touch pm_clients RLS) holds; only the literal comment-inclusive grep count is non-zero."
  - "supabase CLI is not on PATH in this worktree but is a declared devDependency (package.json 'supabase': '^2.109.0') -- used `npx supabase` for all commands (link, migration list, db push, db query) rather than treating its absence from PATH as a genuine checkpoint/blocker."
  - "Verified the live Supabase project before linking: matched NEXT_PUBLIC_SUPABASE_URL's subdomain (ancfwsgyzoostoidqzqj) from .env.local against `supabase projects list` output, confirming the project named 'backstageed.OS' (ACTIVE_HEALTHY) before running `supabase link --project-ref ancfwsgyzoostoidqzqj`."
  - "Used `supabase db query --linked \"<sql>\"` (not `db execute`, which does not exist in this CLI version) for all live-DB verification queries, per Task 3's mandate to confirm state via live query rather than local file/migration-list inspection alone."

patterns-established:
  - "Live-DB verification after supabase db push uses `npx supabase db query --linked \"<sql>\"` against pg_proc/pg_policies/information_schema.columns, not just `supabase migration list`."

requirements-completed: [CLI-01, CLI-03, CLI-04]

duration: ~25min
completed: 2026-07-13
---

# Phase 1 Plan 02: Clients table full record + RLS fix Summary

**Two migrations (0006, 0007) extend `clients` with `tropicalia_project_id` and the four structured briefing fields, add an `is_pm()` SECURITY DEFINER helper, and replace the admin-only insert/update RLS policies with PM-scoped ones — both applied and verified live against the Supabase project `ancfwsgyzoostoidqzqj`, unblocking Plans 01-03 and 01-04.**

## Performance

- **Duration:** ~25 min
- **Started:** 2026-07-13T14:40:00Z (approx.)
- **Completed:** 2026-07-13T15:05:00Z (approx.)
- **Tasks:** 3 of 3 complete
- **Files modified:** 2 created (both SQL migration files; Task 3 was a live push with no file changes)

## Accomplishments
- `0006_clients_full_record.sql`: single `ALTER TABLE public.clients ADD COLUMN ...` statement adding `tropicalia_project_id text` (CLI-03), `objective text`, `tone_of_voice text`, `target_audience text` (D-05 free-text narrative fields), `content_pillars text[] not null default '{}'` (D-04 structured list), and `updated_at timestamptz not null default now()`. No `CREATE TABLE` or RLS re-enable (correctly relies on RLS already enabled in `0002_clients_stub.sql`).
- `0007_clients_rls_fix.sql`: `is_pm()` SECURITY DEFINER helper defined with the exact `language plpgsql stable security definer set search_path = ''` shape as `is_admin()`. Drops `clients_insert_admin_only`/`clients_update_admin_only` and replaces them with `clients_insert_admin_or_pm` (admin OR pm can insert) and `clients_update_scoped` (admin OR `id in pm_assigned_clients()` on both USING and WITH CHECK). `pm_clients` RLS is provably untouched — no SQL statement in the file references or modifies `public.pm_clients`.
- Both migrations pushed to the live Supabase project (`ancfwsgyzoostoidqzqj`, "backstageed.OS") via `npx supabase db push`. `supabase migration list` confirms both `0006` and `0007` now show matching local/remote timestamps.
- Live-DB verification queries (via `npx supabase db query --linked`) confirm:
  - `is_pm()` exists in `pg_proc` with `prosecdef = true` (SECURITY DEFINER), matching `is_admin()`.
  - `pg_policies` for `clients` shows exactly `clients_insert_admin_or_pm`, `clients_select_scoped`, `clients_update_scoped` — the two old admin-only policies are gone.
  - `information_schema.columns` for `clients` includes all six new columns (`content_pillars`, `objective`, `target_audience`, `tone_of_voice`, `tropicalia_project_id`, `updated_at`) alongside the original `id`, `name`, `created_at`.

## Task Commits

1. **Task 1: ALTER clients into the full record (tropicalia_project_id + briefing fields)** - `e73f43d` (feat)
2. **Task 2: Fix clients RLS (is_pm() helper, PM-scoped insert/update) without touching pm_clients** - `d7d8201` (feat)
3. **Task 3: [BLOCKING] Push both migrations to the live Supabase project** - no file-changing commit (operational push + live verification only; both migration files were already committed in Tasks 1/2)

**Plan metadata:** (deferred — orchestrator owns the final metadata commit for worktree-mode plans per parallel-execution instructions)

## Files Created/Modified
- `supabase/migrations/0006_clients_full_record.sql` - ALTER TABLE adding tropicalia_project_id + 4 briefing fields + updated_at
- `supabase/migrations/0007_clients_rls_fix.sql` - is_pm() helper + clients_insert_admin_or_pm + clients_update_scoped, pm_clients untouched

## Decisions Made
- See `key-decisions` in frontmatter: (1) plan self-contradiction on the `pm_clients` grep-0 acceptance criterion vs. the plan's own mandated explanatory comment, resolved by verifying the substantive no-SQL-touches-pm_clients guarantee rather than the literal comment-inclusive grep; (2) used `npx supabase` since the CLI is a devDependency but not on PATH; (3) matched project ref from `.env.local`'s `NEXT_PUBLIC_SUPABASE_URL` against `supabase projects list` before linking; (4) used `supabase db query --linked` (the correct subcommand in this CLI version — `db execute` does not exist) for live verification.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] `supabase` CLI not on PATH — routed through `npx`**
- **Found during:** Task 3
- **Issue:** `supabase` command not found directly; the plan's action text assumes a bare `supabase db push` invocation.
- **Fix:** Confirmed `supabase` is a declared devDependency in `package.json` (`"supabase": "^2.109.0"`) and used `npx supabase <subcommand>` for every CLI invocation (`link`, `migration list`, `db push`, `db query`). This is a package already declared and lockfile-resolved, not a new/unvetted install — excluded from the package-install checkpoint rule.
- **Files modified:** None (shell invocation only).
- **Verification:** `npx supabase --version` returned `2.109.0`; all subsequent commands succeeded.
- **Committed in:** N/A (no file change)

**2. [Rule 1 - Bug] `supabase db execute --sql` does not exist in this CLI version**
- **Found during:** Task 3
- **Issue:** The plan's action text suggests `supabase db execute`; this CLI version (2.109.0) has no `execute` subcommand and errors with `UnknownSubcommand`.
- **Fix:** Used the correct subcommand, `supabase db query --linked "<sql>"`, for all three live-DB verification queries (is_pm existence, clients policies, clients columns), plus an additional query confirming `is_pm()`'s `prosecdef = true`.
- **Files modified:** None.
- **Verification:** All four queries returned expected rows (documented in Accomplishments above).
- **Committed in:** N/A (no file change)

---

**Total deviations:** 2 auto-fixed (both Rule 3/Rule 1, CLI invocation mechanics only — no code or migration content changed as a result)
**Impact on plan:** Both auto-fixes are mechanical (correct CLI invocation), not scope changes. No SQL content differs from what the plan specified.

## Issues Encountered
- `supabase db push` printed a non-fatal Docker warning (`failed to cache migrations catalog: ... Cannot connect to the Docker daemon`) — this is a local migration-catalog caching optimization, not a blocker; the push itself succeeded and was independently confirmed via `migration list` and live-DB queries.
- The plan's Task 2 acceptance criteria contains an internal contradiction: the `<action>` text mandates an explanatory comment that must reference `pm_clients` by name, while the acceptance criteria demands `grep -c 'pm_clients' == 0`. Documented above under Decisions Made; the substantive guarantee (no SQL statement modifies `pm_clients`) is verified and holds.

## User Setup Required
None. `.env.local` (already present in this worktree, orchestrator-provided) had everything needed: `SUPABASE_ACCESS_TOKEN` for `supabase link`/`db push`/`db query`, and `NEXT_PUBLIC_SUPABASE_URL` to derive/confirm the project ref.

## Next Phase Readiness
- The data-layer contract Plans 01-03 (client creation) and 01-04 (briefing edit) build against is now live: a PM can INSERT into `clients`, and can UPDATE only clients already in their `pm_assigned_clients()` set (or any client if Admin).
- `pm_clients` RLS remains exactly as defined in `0004_rls_policies.sql` — Plan 01-03 must still implement the creating-PM self-link via a privileged admin-client transaction (Pattern 2 from 01-RESEARCH.md), not a broadened RLS policy.
- All six new `clients` columns exist live and are ready for Plan 01-03 (client creation form writing `tropicalia_project_id` post-provisioning) and Plan 01-04 (briefing edit form writing the four structured fields).
- No blockers for the next wave.

## Known Stubs
None. This plan is schema/RLS-only (no UI, no stubbed data paths).

## Threat Flags
None beyond what the plan's own `<threat_model>` already covers (T-01-05 through T-01-08, T-01-SC) — all mitigations were implemented exactly as specified and confirmed live (is_pm() SECURITY DEFINER shape, dual USING/WITH CHECK scoping on clients_update_scoped, zero pm_clients modification, live-DB confirmation via `supabase migration list` and `db query`).

---
*Phase: 01-client-records-isolated-rag-setup*
*Completed: 2026-07-13*
