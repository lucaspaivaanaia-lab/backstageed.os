---
phase: quick/260805-kio
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - supabase/tests/0011_rls_pm_status_defense_test.sql
  - supabase/migrations/0021_pm_assigned_clients_status_check.sql
autonomous: false
requirements: [AUTH-06]

must_haves:
  truths:
    - "A PM whose profile status is flipped away from 'approved' by direct SQL immediately loses RLS-level SELECT access to their assigned client, even with their pm_clients row still intact"
    - "A PM whose profile role is changed away from 'pm' likewise loses that access"
    - "An approved PM assigned to client_a still sees client_a — zero regression on AUTH-06"
    - "The pm_clients assignment row is NOT deleted by the fix — access is denied purely by the new predicate"
    - "The full pgTAP suite still reports every test file ok (Files=12, Tests=49)"
    - "Zero application-layer files change — the diff is exactly one new migration plus one new test file"
    - "Migration 0021 is applied to the hosted Supabase project and `npx supabase migration list` shows local and remote in sync through 0021"
  artifacts:
    - path: "supabase/migrations/0021_pm_assigned_clients_status_check.sql"
      provides: "Hardened pm_assigned_clients() that re-verifies the caller's profile role/status"
      contains: "create or replace function public.pm_assigned_clients"
      min_lines: 20
    - path: "supabase/tests/0011_rls_pm_status_defense_test.sql"
      provides: "pgTAP regression proof for the status/role defense-in-depth predicate"
      contains: "select plan(5)"
      min_lines: 60
  key_links:
    - from: "supabase/migrations/0021_pm_assigned_clients_status_check.sql"
      to: "public.profiles"
      via: "join inside pm_assigned_clients() body"
      pattern: "join public\\.profiles"
    - from: "supabase/migrations/0021_pm_assigned_clients_status_check.sql"
      to: "approval_status gate"
      via: "status predicate mirroring is_pm()"
      pattern: "p\\.status = 'approved'"
    - from: "supabase/tests/0011_rls_pm_status_defense_test.sql"
      to: "supabase/tests/rls_helpers.sql"
      via: "psql \\ir include (shared fixture)"
      pattern: "\\\\ir rls_helpers\\.sql"
    - from: "clients_select_scoped / clients_update_scoped"
      to: "public.pm_assigned_clients()"
      via: "unchanged `id in (select public.pm_assigned_clients())` — inherits the stricter behavior automatically"
      pattern: "pm_assigned_clients"
---

<objective>
Close a defense-in-depth gap in `public.pm_assigned_clients()`: today it grants a PM access to a client purely because a `public.pm_clients` row exists, with no independent re-verification that the caller's profile is still `role = 'pm' and status = 'approved'`. Sibling helpers `is_admin()` (0004) and `is_pm()` (0007) both already perform that check; `pm_assigned_clients()` is the one that does not.

This is NOT a live exploit. `middleware.ts` is the primary gate and is already comprehensive, and `listPmRoster()` (`lib/actions/clients.ts`) already filters `.eq("status", "approved")` before a PM can ever be assigned — so no application code path can create a `pm_clients` row for a non-approved PM. The fix exists because the developer routinely runs direct SQL interventions against this database (a manual `insert into pm_clients`, or an out-of-band `update profiles set status = ...`), and RLS alone should still catch such a slip.

Purpose: make the database layer independently correct, so the workflow-level invariant in `listPmRoster()` is a second line of defense rather than the only one.
Output: one new migration (`0021`) replacing the function body, plus one new pgTAP test file that proves the regression, and the migration applied to the hosted project.
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
@$HOME/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/STATE.md
@CLAUDE.md
@supabase/migrations/0004_rls_policies.sql
@supabase/migrations/0007_clients_rls_fix.sql
@supabase/migrations/0001_profiles.sql
@supabase/tests/rls_helpers.sql
@supabase/tests/0001_rls_pm_scoping_test.sql
@supabase/tests/0010_rls_card_attachments_scoping_test.sql

<interfaces>
<!-- Extracted contracts. Do NOT re-derive these from the codebase — use them directly. -->

**Current (vulnerable) definition — `supabase/migrations/0004_rls_policies.sql` lines 34-44:**

```sql
create or replace function public.pm_assigned_clients()
returns setof uuid
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  return query select client_id from public.pm_clients where pm_id = (select auth.uid());
end;
$$;
```

**Target definition — the exact body migration 0021 must ship. Mirrors `is_pm()`'s existing `role = 'pm' and status = 'approved'` predicate:**

```sql
create or replace function public.pm_assigned_clients()
returns setof uuid
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  return query
    select pc.client_id
    from public.pm_clients pc
    join public.profiles p on p.id = pc.pm_id
    where pc.pm_id = (select auth.uid())
      and p.role = 'pm'
      and p.status = 'approved';
end;
$$;
```

Every attribute of the signature (`setof uuid`, `plpgsql`, `stable`, `security definer`, `set search_path = ''`) is load-bearing and must be preserved verbatim. `plpgsql` in particular is a hard project rule documented in 0004's header — a plain `language sql` function may be inlined by Postgres, losing the `security definer` context and reintroducing "infinite recursion detected in policy".

**Consumers of `pm_assigned_clients()` — both stay byte-for-byte unchanged, they inherit the new behavior automatically:**
- `clients_select_scoped` (0004_rls_policies.sql): `... or id in (select public.pm_assigned_clients()) ...`
- `clients_update_scoped` (0007_clients_rls_fix.sql): same expression in both `using` and `with check`

**Fixed fixture UUIDs from `supabase/tests/rls_helpers.sql` (referenced by literal in every test file):**

| Actor | UUID | Fixture state |
|-------|------|---------------|
| client_a | `11111111-1111-1111-1111-111111111111` | client row |
| client_b | `22222222-2222-2222-2222-222222222222` | client row |
| pm_a | `aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa` | role=pm, status=approved, client_id=NULL, assigned to client_a ONLY |
| client_a_user | `bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb` | role=client, status=approved, client_id=client_a |
| admin_user | `cccccccc-cccc-cccc-cccc-cccccccccccc` | role=admin, status=approved |

**Established technique for mutating `profiles.role`/`profiles.status` inside a test** (from `rls_helpers.sql` lines 114-120): `prevent_profile_privilege_escalation_trg` (0001_profiles.sql) raises `'Only an admin can change role or status'` for any non-admin change to those columns. `public.profiles` IS owned by the local `postgres` role, so the project's established workaround is a scoped `alter table public.profiles disable trigger prevent_profile_privilege_escalation_trg;` / `... enable trigger ...` pair around the single UPDATE — no role switch required (a role switch into `supabase_auth_admin` was tried in quick task 260715-cut and failed with "permission denied to set role"). This ALTER must run as the session-owner role, i.e. after `reset role;`, never while impersonating `authenticated`.

**Auth simulation helper:** `tests.set_auth(uid uuid)` sets `request.jwt.claims` (read by `auth.uid()`) and issues `set local role authenticated`. It must be called from the session-owner role. De-authenticate with `reset role;` followed by `select set_config('request.jwt.claims', '', true);`.
</interfaces>

<baseline>
Measured on this machine immediately before planning, so the executor knows exactly what "unchanged" looks like:

- Highest existing migration: `0020_client_files_update_grant.sql`. Next number is **0021**.
- Highest existing test file: `0010_rls_card_attachments_scoping_test.sql`. Next number is **0011**.
- `npx supabase migration list --local` → all 20 migrations show matching `local`/`remote`. `npx supabase migration up --local` will therefore apply exactly one new migration with no history repair needed.
- Local Supabase Docker stack is already running and healthy (`supabase_db_backstageed-os`); no `supabase start` needed.
- `npx supabase test db` (full suite) baseline: every one of the 10 test files reports `ok`, summary line reads `Files=11, Tests=44`.
- **Known pre-existing quirk — do NOT try to fix it:** the full-suite run always ends in `Result: FAIL` / exit code 1, because pg_prove's glob also picks up `rls_helpers.sql` (a fixture, not a test, with no TAP plan) and reports `Parse errors: No plan found in TAP output`. This is cosmetic and documented in quick task 260716-bjk. Never gate on the full suite's exit code. Gate on the per-file `ok` lines and the `Files=`/`Tests=` summary instead. A single-file run (`npx supabase test db <path>`) does NOT pick up `rls_helpers.sql` and DOES print `Result: PASS` with exit 0 when green — that is the reliable single-file gate.
- No host `psql` binary exists. For direct SQL probes use `docker exec supabase_db_backstageed-os psql -U postgres -d postgres ...`.
</baseline>
</context>

<tasks>

<task type="auto" tdd="true">
  <name>Task 1: Write the failing pgTAP regression test (RED)</name>
  <files>supabase/tests/0011_rls_pm_status_defense_test.sql</files>
  <behavior>
    Five assertions, `select plan(5);`. Against the CURRENT (unfixed) `pm_assigned_clients()`, assertions 1 and 5 pass and assertions 2, 3 and 4 fail. That RED result is this task's deliverable — it proves the test actually detects the gap rather than merely restating the fix.

    1. `'controle: PM aprovado ve o client_a atribuido'` — as pm_a (unmodified fixture, status=approved): `select count(*) from public.clients where id = client_a` equals `1::bigint`. Passes before AND after the fix (regression control).
    2. `'PM com status pending perde acesso ao client_a atribuido'` — after pm_a's status is flipped to `'pending'`: same count equals `0::bigint`. Fails before the fix, passes after.
    3. `'PM com status pending nao ve nenhum cliente'` — same authenticated session: `select count(*) from public.clients` equals `0::bigint` (proves the loss is total, not partial; pm_a's `profiles.client_id` is NULL so the client-self branch of `clients_select_scoped` cannot grant anything).
    4. `'PM com role alterado para client perde acesso ao client_a atribuido'` — after restoring status to `'approved'` but setting role to `'client'`: `select count(*) from public.clients where id = client_a` equals `0::bigint`. Covers the `p.role = 'pm'` half of the new predicate. Fails before the fix, passes after.
    5. `'a linha de pm_clients permanece intacta — o bloqueio vem do predicado, nao da remocao do vinculo'` — back as the session-owner role: `select count(*) from public.pm_clients where pm_id = pm_a and client_id = client_a` equals `1::bigint`. Passes before AND after; proves access denial comes from the new predicate, not from fixture damage.
  </behavior>
  <action>
    Create the new test file following the exact structural conventions of `supabase/tests/0001_rls_pm_scoping_test.sql` and `supabase/tests/0010_rls_card_attachments_scoping_test.sql`: a header comment block explaining what is proven and that nothing is redefined here, then `begin;`, then `select plan(5);`, then `\ir rls_helpers.sql`, then the assertions, then `select * from finish();`, then `rollback;`. The `\ir` include comes after `plan()`, matching every existing file. Assertion descriptions are in Portuguese without accents, matching file 0010's style.

    Statement sequence inside the transaction:

    Authenticate as pm_a via `select tests.set_auth('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa');` and emit assertion 1 with `results_eq`, using the two-dollar-quoted-query / `values (1::bigint)` form used throughout the suite.

    Then de-authenticate back to the session owner with `reset role;` and `select set_config('request.jwt.claims', '', true);` — required because the next step needs table ownership. Flip pm_a's status using the established scoped-trigger-disable technique described in the `<interfaces>` block: disable `prevent_profile_privilege_escalation_trg` on `public.profiles`, `update public.profiles set status = 'pending' where id = pm_a`, re-enable the trigger immediately. Add a comment noting this deliberately simulates the out-of-band manual SQL intervention this fix defends against, and that the trigger is re-enabled before any assertion runs so no other test's guarantees are weakened.

    Re-authenticate as pm_a (`tests.set_auth` again — it may be called more than once in a transaction) and emit assertions 2 and 3.

    De-authenticate again, and with the same disable/update/enable pattern set pm_a to `status = 'approved', role = 'client'` in a single UPDATE. Re-authenticate as pm_a and emit assertion 4.

    Finally de-authenticate one last time (`reset role;` + clear the claim) and emit assertion 5 as the session owner, which bypasses RLS because `postgres` owns the table and no `force row level security` is set on `public.pm_clients` — the same pattern assertion 4 of file 0010 relies on.

    Do NOT modify `rls_helpers.sql` — do not add a new pending/rejected fixture actor. Mutating pm_a inside this file's own rolled-back transaction is deliberately chosen so the shared fixture stays byte-for-byte identical and no other test file's expectations shift. Do NOT modify `0001_rls_pm_scoping_test.sql` either; its own "PM sees assigned client_a" assertion stays as the untouched cross-file regression control. Do NOT create the migration in this task.
  </action>
  <verify>
    <automated>npx supabase test db supabase/tests/0011_rls_pm_status_defense_test.sql 2>&1 | tee /tmp/kio-red.txt | tail -20; grep -q 'Result: FAIL' /tmp/kio-red.txt &amp;&amp; grep -q 'Tests: 5 Failed: 3' /tmp/kio-red.txt &amp;&amp; echo RED_OK</automated>
    <automated>test "$(git status --porcelain | grep -c '^?? supabase/tests/0011_rls_pm_status_defense_test.sql$')" = "1" &amp;&amp; test -z "$(git diff --name-only -- supabase/ lib/ app/ components/)" &amp;&amp; echo SCOPE_OK</automated>
  </verify>
  <done>The single-file run prints `Result: FAIL` with exactly 3 of 5 subtests failing (assertions 2, 3, 4 — the ones the fix will turn green), assertions 1 and 5 pass, and the only working-tree change is the one new untracked test file. `RED_OK` and `SCOPE_OK` both printed.</done>
</task>

<task type="auto">
  <name>Task 2: Ship migration 0021 hardening pm_assigned_clients() (GREEN)</name>
  <files>supabase/migrations/0021_pm_assigned_clients_status_check.sql</files>
  <action>
    Create `supabase/migrations/0021_pm_assigned_clients_status_check.sql` containing exactly one statement: the `create or replace function public.pm_assigned_clients()` shown verbatim under "Target definition" in the `<interfaces>` block above. `create or replace function` is this project's established convention for RLS helper changes (0004 uses it for the original definition; 0007 uses it for `is_pm()`), so there is no `drop function` and no policy churn.

    Above the statement, write a header comment in the style of 0004/0007 stating: this is defense-in-depth, not a live exploit fix; the gap was that `pm_assigned_clients()` trusted a `pm_clients` row alone while `is_admin()` (0004) and `is_pm()` (0007) both already re-verify `status = 'approved'`; the predicate added here mirrors `is_pm()` exactly; the real motivator is out-of-band manual SQL (a hand-written `insert into pm_clients`, or a status change applied directly) bypassing `listPmRoster()`'s existing `.eq("status", "approved")` filter; and that `clients_select_scoped` / `clients_update_scoped` are deliberately NOT touched because they already call this function and inherit the stricter behavior.

    Touch nothing else. Do not redefine `is_admin()` or `is_pm()`. Do not add, drop, or alter any policy, table, grant, or trigger. Do not edit any earlier migration file — 0004's original body stays as the historical record. Do not touch `middleware.ts`, `lib/actions/clients.ts`, or any TypeScript/React file.

    Apply the migration to the local database with `npx supabase migration up --local` (local history is already in sync through 0020, so this applies exactly one migration). Do not use `npx supabase db reset` unless `migration up` errors out on history state — a reset would wipe local development data and is not needed here.
  </action>
  <verify>
    <automated>npx supabase migration up --local 2>&amp;1 | tail -5</automated>
    <automated>docker exec supabase_db_backstageed-os psql -U postgres -d postgres -tAc "select pg_get_functiondef('public.pm_assigned_clients()'::regprocedure)" > /tmp/kio-fn.txt; grep -c "join public.profiles" /tmp/kio-fn.txt; grep -c "p.status = 'approved'" /tmp/kio-fn.txt; grep -c "p.role = 'pm'" /tmp/kio-fn.txt; grep -c "SECURITY DEFINER" /tmp/kio-fn.txt; grep -c "plpgsql" /tmp/kio-fn.txt</automated>
    <automated>npx supabase test db supabase/tests/0011_rls_pm_status_defense_test.sql 2>&amp;1 | tee /tmp/kio-green.txt | tail -6; grep -q 'Result: PASS' /tmp/kio-green.txt &amp;&amp; echo GREEN_OK</automated>
    <automated>npx supabase test db 2>&amp;1 | tee /tmp/kio-suite.txt | tail -25; test "$(grep -E 'tests/0[0-9]{3}_.*_test\.sql' /tmp/kio-suite.txt | grep -cv 'ok$')" = "0" &amp;&amp; grep -q 'Files=12, Tests=49' /tmp/kio-suite.txt &amp;&amp; echo SUITE_OK</automated>
    <automated>test -z "$(git status --porcelain | grep -E '\.(ts|tsx|js|jsx|css)$')" &amp;&amp; echo NO_APP_CODE_TOUCHED</automated>
  </verify>
  <done>`pg_get_functiondef` shows the joined, role+status-gated body with `plpgsql`/`SECURITY DEFINER` preserved (all five grep counts ≥ 1). The new test file prints `Result: PASS`. The full suite shows every test file line ending in `ok` with `Files=12, Tests=49` (up from the 11/44 baseline — the extra file is the new test, the extra 5 tests are its assertions; the trailing `Result: FAIL` from the pre-existing `rls_helpers.sql` parse error is expected and ignored). No `.ts`/`.tsx`/`.js`/`.jsx`/`.css` file appears in `git status`. `GREEN_OK`, `SUITE_OK`, `NO_APP_CODE_TOUCHED` all printed.</done>
</task>

<task type="checkpoint:human-verify" gate="blocking">
  <name>Task 3: Apply migration 0021 to the HOSTED Supabase project (ORCHESTRATOR-SCOPED)</name>
  <what-built>
    Migration `supabase/migrations/0021_pm_assigned_clients_status_check.sql` hardens `public.pm_assigned_clients()` to re-verify `role = 'pm' and status = 'approved'`, and `supabase/tests/0011_rls_pm_status_defense_test.sql` proves it with 5 pgTAP assertions. Both are applied and green against the LOCAL database only.

    **This step is for the ORCHESTRATOR to run after merging the executor's worktree — NOT for the worktree executor.** Per the established pattern from quick task 260722-hnm ("Both new migrations applied to hosted Supabase by the orchestrator — executor's worktree lacked MCP access"), an isolated executor worktree generally lacks the network/credential access to push to the hosted project `ancfwsgyzoostoidqzqj`. The executor must stop after Task 2 and leave the hosted push to the orchestrator.
  </what-built>
  <how-to-verify>
    1. Confirm the executor's work is merged and `supabase/migrations/0021_pm_assigned_clients_status_check.sql` exists on the working branch.
    2. Run `npx supabase migration list` and confirm 0021 appears in the `Local` column with an EMPTY `Remote` column (i.e. not yet pushed) — this is the pre-push state.
    3. Run `npx supabase db push`. Confirm it reports applying exactly one migration: `0021_pm_assigned_clients_status_check.sql`. If it proposes applying more than that one file, STOP and report — local/remote history has drifted and pushing blind would be unsafe.
    4. Run `npx supabase migration list` again and confirm every row through 0021 now shows matching `Local` and `Remote` values, with no rows in only one column.
    5. Confirm the hosted function body actually changed, via the Supabase SQL editor (or MCP) on project `ancfwsgyzoostoidqzqj`: `select pg_get_functiondef('public.pm_assigned_clients()'::regprocedure);` — the returned body must contain `join public.profiles`, `p.role = 'pm'`, and `p.status = 'approved'`.
    6. Sanity-check production is unaffected for a normal approved PM: log in to https://backstageed-os.vercel.app as an approved PM and confirm the client list still renders that PM's assigned clients. This is the one behavior that must NOT have changed. Clean up any test data afterwards, per this project's established habit.
  </how-to-verify>
  <resume-signal>Type "approved" once `npx supabase migration list` shows 0021 in sync on both sides, the hosted function body contains the new predicate, and an approved PM still sees their clients in production. Otherwise describe what went wrong.</resume-signal>
</task>

</tasks>

<threat_model>
## Trust Boundaries

| Boundary | Description |
|----------|-------------|
| authenticated JWT → Postgres RLS | A signed-in user's `auth.uid()` is the sole identity input to `pm_assigned_clients()`; every `clients` SELECT/UPDATE authorization decision for a PM flows through it |
| out-of-band SQL (developer / Supabase SQL editor / MCP) → `public.pm_clients` | Rows can be created here without passing through `listPmRoster()`'s `.eq("status","approved")` filter — this is the exact boundary the fix defends |

## STRIDE Threat Register

| Threat ID | Category | Component | Disposition | Mitigation Plan |
|-----------|----------|-----------|-------------|-----------------|
| T-kio-01 | Elevation of Privilege | `public.pm_assigned_clients()` | mitigate | Function body re-verifies `role = 'pm' and status = 'approved'` against `public.profiles`, mirroring `is_pm()`. A `pm_clients` row alone no longer confers access. Proven by assertions 2/3/4 in `0011_rls_pm_status_defense_test.sql` |
| T-kio-02 | Information Disclosure | `clients_select_scoped` | mitigate | Inherited automatically — the policy is unchanged and calls the hardened function. Assertion 3 proves a non-approved PM's total visible client count drops to 0, not merely the one assigned client |
| T-kio-03 | Tampering | `clients_update_scoped` | mitigate | Same inheritance path; `using`/`with check` both call `pm_assigned_clients()`. No policy edit, so no risk of accidentally widening the update surface while narrowing the read surface |
| T-kio-04 | Denial of Service | approved PMs losing access via an over-broad predicate | mitigate | Assertion 1 (in-file) plus `0001_rls_pm_scoping_test.sql`'s untouched AUTH-06 assertions are the regression controls; the full-suite gate requires all 12 files `ok` |
| T-kio-05 | Tampering | `rls_helpers.sql` shared fixture | accept | Mitigated by design: pm_a's mutations happen inside this test file's own `begin;`/`rollback;`, and the fixture file is not edited at all, so no cross-file contamination is possible |
| T-kio-06 | Elevation of Privilege | `prevent_profile_privilege_escalation_trg` disabled inside the test | accept | The scoped disable/enable pair is the project's established, already-shipped fixture technique (`rls_helpers.sql` lines 114-120); the trigger is re-enabled before any assertion runs, and the whole transaction rolls back. Confined to the local test database — never runs against hosted |
| T-kio-SC | Tampering | npm/pip/cargo installs | n/a | No package installs in this plan — zero dependency changes, zero `package.json` edits |
</threat_model>

<verification>
Run after Task 2, before the Task 3 checkpoint:

1. `npx supabase test db` → every `tests/NNNN_*_test.sql` line ends in `ok`; summary reads `Files=12, Tests=49`. The trailing `Result: FAIL` from `rls_helpers.sql`'s missing TAP plan is pre-existing and expected — ignore it and never gate on exit code for the full suite.
2. `npx supabase test db supabase/tests/0011_rls_pm_status_defense_test.sql` → `Result: PASS`.
3. `npx supabase test db supabase/tests/0001_rls_pm_scoping_test.sql` → `Result: PASS` (untouched cross-file AUTH-06 regression control, 6 tests).
4. Scope gate — `git status --porcelain` lists exactly two new files under `supabase/` and nothing else outside `.planning/`:
   `test "$(git status --porcelain | grep -vE '^\?\? \.planning/' | grep -c .)" = "2"`
5. Zero application-layer churn: `git diff --stat -- lib/ app/ components/ middleware.ts package.json` is empty, and `git status --porcelain` contains no `.ts`/`.tsx`/`.js`/`.jsx`/`.css` entry.
6. Migration immutability: `git diff --name-only -- supabase/migrations/` lists no modified pre-existing migration — only `0021_...` as new/untracked.
</verification>

<success_criteria>
- `supabase/migrations/0021_pm_assigned_clients_status_check.sql` exists, contains a single `create or replace function public.pm_assigned_clients()` with the `join public.profiles` + `p.role = 'pm'` + `p.status = 'approved'` predicate, and preserves `setof uuid` / `plpgsql` / `stable` / `security definer` / `set search_path = ''`.
- `supabase/tests/0011_rls_pm_status_defense_test.sql` exists with `plan(5)`, wrapped in `begin;`/`rollback;`, includes `rls_helpers.sql` via `\ir`, and passes.
- The test demonstrably went RED (3/5 failing) before the migration and GREEN (5/5) after — recorded in the SUMMARY.
- Full pgTAP suite: 12 files, 49 tests, zero failures beyond the pre-existing `rls_helpers.sql` parse-error artifact.
- Zero TypeScript/React/config files changed; zero pre-existing migrations edited; `is_admin()`, `is_pm()`, `middleware.ts`, `listPmRoster()`, `clients_select_scoped`, `clients_update_scoped` and the `pending`/`rejected`/`deactivated` workflow all untouched.
- Migration 0021 applied to hosted project `ancfwsgyzoostoidqzqj` by the ORCHESTRATOR, with `npx supabase migration list` showing local/remote in sync through 0021 and an approved PM confirmed still able to see their clients in production.
</success_criteria>

<output>
Create `.planning/quick/260805-kio-fechar-lacuna-de-defesa-em-profundidade-/260805-kio-SUMMARY.md` when done.
</output>
