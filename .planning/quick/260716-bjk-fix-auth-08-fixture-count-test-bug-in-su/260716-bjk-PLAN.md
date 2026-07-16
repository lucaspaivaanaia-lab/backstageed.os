---
phase: quick
plan: 260716-bjk
type: execute
wave: 1
depends_on: []
files_modified:
  - supabase/tests/0003_rls_admin_unrestricted_test.sql
autonomous: true
requirements: []

must_haves:
  truths:
    - "0003_rls_admin_unrestricted_test.sql's first assertion counts only the fixture's own two known client IDs (client_a, client_b), not all rows in public.clients"
    - "npx supabase test db has been re-run after the fix and the verbatim output is recorded, with an explicit AUTH-06/07/08 pass/still-blocked verdict"
  artifacts:
    - path: "supabase/tests/0003_rls_admin_unrestricted_test.sql"
      provides: "AUTH-08 admin-unrestricted assertion scoped to fixture client IDs instead of an unscoped table count"
    - path: ".planning/quick/260716-bjk-fix-auth-08-fixture-count-test-bug-in-su/260716-bjk-SUMMARY.md"
      provides: "Verbatim npx supabase test db output and explicit AUTH-06/07/08 verdict"
  key_links:
    - from: "supabase/tests/0003_rls_admin_unrestricted_test.sql"
      to: "supabase/tests/rls_helpers.sql"
      via: "fixture client IDs 11111111-...-111111111111 / 22222222-...-222222222222"
      pattern: "where id in \\('11111111-1111-1111-1111-111111111111', '22222222-2222-2222-2222-222222222222'\\)"
---

<objective>
Fix a test-fixture bug (not a schema/permission bug) surfaced by quick task 260716-b8w: `0003_rls_admin_unrestricted_test.sql`'s first assertion does an unscoped `select count(*) from public.clients` expecting `2`, but `0002_clients_stub.sql` seeds a demo client row (`'Cliente Demo'`) directly in migrations, so the live count under the admin's unrestricted view is `3` (1 seed row + the 2 fixture clients client_a/client_b). Scope the assertion to the fixture's own known client IDs instead of changing the expected number, matching the style already used in `0001_rls_pm_scoping_test.sql` and `0002_rls_client_scoping_test.sql` (which already filter their `clients` queries by specific `id`).

Purpose: Close the last known gap blocking AUTH-06/AUTH-07/AUTH-08 runtime verification -- 260716-au8 and 260716-b8w already closed the GRANT-permission gaps (AUTH-06/AUTH-07 now fully pass); this is the final, unrelated fixture-count bug blocking AUTH-08.

Output: `supabase/tests/0003_rls_admin_unrestricted_test.sql`'s first assertion scoped to `id in ('11111111-1111-1111-1111-111111111111', '22222222-2222-2222-2222-222222222222')`, plus a fresh `npx supabase test db` run with its full verbatim output recorded in this quick task's SUMMARY.md.
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
@$HOME/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/STATE.md
@.planning/quick/260716-b8w-add-missing-grant-statements-on-public-p/260716-b8w-SUMMARY.md
@supabase/tests/rls_helpers.sql
@supabase/migrations/0002_clients_stub.sql

<interfaces>
Root cause (confirmed by 0002_clients_stub.sql line 19): `insert into public.clients (name) values ('Cliente Demo');` seeds one extra client row directly in migrations, independent of the two fixture clients `rls_helpers.sql` inserts with fixed IDs:
  client_a = 11111111-1111-1111-1111-111111111111
  client_b = 22222222-2222-2222-2222-222222222222

Existing style already used for this exact problem in 0001_rls_pm_scoping_test.sql / 0002_rls_client_scoping_test.sql:

  select results_eq(
    $$ select count(*) from public.clients where id = '11111111-1111-1111-1111-111111111111' $$,
    $$ values (1::bigint) $$,
    '...'
  );

The failing assertion in 0003_rls_admin_unrestricted_test.sql today (lines 18-23):

  -- AUTH-08: admin sees both fixture clients (client_a and client_b), unrestricted.
  select results_eq(
    $$ select count(*) from public.clients $$,
    $$ values (2::bigint) $$,
    'AUTH-08: admin sees both fixture clients (unrestricted)'
  );

Target fix: scope the query to `where id in (...)` covering both fixture IDs, keep the expected value at `2::bigint` and the test description unchanged. Do NOT touch the pm_clients assertion (lines 25-30) or the profiles assertion (lines 32-37) in this same file -- both already pass per 260716-b8w-SUMMARY.md's condensed TAP output (only 1 of 3 subtests failed in the prior run). Do NOT touch any migration file or any other supabase/tests/*.sql file.
</interfaces>
</context>

<tasks>

<task type="auto">
  <name>Task 1: Scope the AUTH-08 admin-unrestricted clients-count assertion to fixture IDs</name>
  <files>supabase/tests/0003_rls_admin_unrestricted_test.sql</files>
  <action>
  Edit only the first results_eq assertion (currently `select count(*) from public.clients` expecting `2::bigint`). Change the query to count only the two fixture client IDs:

  select count(*) from public.clients where id in ('11111111-1111-1111-1111-111111111111', '22222222-2222-2222-2222-222222222222')

  Keep the expected value at `values (2::bigint)` and the test description string ('AUTH-08: admin sees both fixture clients (unrestricted)') unchanged. This matches the scoping style already used for the equivalent problem in 0001_rls_pm_scoping_test.sql and 0002_rls_client_scoping_test.sql, and avoids the fragility of hardcoding a total-row-count that will break again whenever future seed data is added to migrations.

  Do not modify the second assertion (pm_clients count, lines ~25-30) or the third assertion (profiles count, lines ~32-37) in this file -- both already pass. Do not modify any migration file or any other supabase/tests/*.sql file.
  </action>
  <verify>
    <automated>bash -c "grep -v '^--' supabase/tests/0003_rls_admin_unrestricted_test.sql > /tmp/auth08.sql && grep -qc \"select count(\\*) from public.clients where id in ('11111111-1111-1111-1111-111111111111', '22222222-2222-2222-2222-222222222222')\" /tmp/auth08.sql && grep -qc 'values (2::bigint)' /tmp/auth08.sql"</automated>
  </verify>
  <done>The first assertion in 0003_rls_admin_unrestricted_test.sql queries public.clients scoped to the fixture's two known client IDs and still expects 2::bigint; the pm_clients and profiles assertions in the same file are byte-identical to before; no other file is modified.</done>
</task>

<task type="auto">
  <name>Task 2: Re-run pgTAP suite and record final AUTH-06/07/08 verdict</name>
  <files>none (verification only)</files>
  <action>
  Run npx supabase start (if not already running), then npx supabase db reset to replay all migrations from scratch (no schema change in this task, but resets fixture state cleanly), then npx supabase test db to completion. Capture the full verbatim output. Record it in the quick task's SUMMARY.md along with an explicit statement of whether AUTH-06, AUTH-07, and AUTH-08 now ALL pass (exit 0, zero "not ok" lines across 0001_rls_pm_scoping_test.sql, 0002_rls_client_scoping_test.sql, and 0003_rls_admin_unrestricted_test.sql). If anything still fails, quote it verbatim and mark the outcome as still-blocked -- do not attempt any further change beyond this one test-file fix regardless of outcome. Finish by running npx supabase stop to clean up local services.
  </action>
  <verify>
    <automated>npx supabase test db; echo "exit_code=$?"</automated>
  </verify>
  <done>SUMMARY.md contains the full verbatim npx supabase test db output from this run and an explicit pass/still-blocked verdict for AUTH-06/AUTH-07/AUTH-08 together; npx supabase stop has been run.</done>
</task>

</tasks>

<threat_model>
## Trust Boundaries

| Boundary | Description |
|----------|-------------|
| test fixture -> assertion | pgTAP test assertions must reflect the actual, intentional data shape (fixture rows + any seeded migration rows), not an assumption that no other data exists |

## STRIDE Threat Register

| Threat ID | Category | Component | Disposition | Mitigation Plan |
|-----------|----------|-----------|-------------|-----------------|
| T-quick-bjk-01 | Tampering (test integrity) | 0003_rls_admin_unrestricted_test.sql assertion 1 | mitigate | Scope the count query to the fixture's own known client IDs (id in (...)) rather than loosening the expected value, so the test remains a precise, non-fragile proof of AUTH-08's unrestricted-admin-visibility guarantee regardless of future seed data added elsewhere in migrations. |
</threat_model>

<verification>
- supabase/tests/0003_rls_admin_unrestricted_test.sql's first assertion is scoped to the two fixture client IDs; expected value remains 2::bigint.
- The pm_clients and profiles assertions in the same file are unchanged from before this task.
- No migration file or any other supabase/tests/*.sql file was modified (git diff shows only 0003_rls_admin_unrestricted_test.sql plus this quick task's own SUMMARY.md/STATE.md).
- npx supabase test db was re-run locally after npx supabase db reset, with full verbatim output recorded in SUMMARY.md.
- SUMMARY.md states explicitly whether AUTH-06/AUTH-07/AUTH-08 now ALL pass or remain still-blocked, citing the verbatim output.
</verification>

<success_criteria>
- 0003_rls_admin_unrestricted_test.sql's AUTH-08 clients-count assertion scoped to fixture IDs, matching the style of 0001/0002.
- Local Supabase stack exercised (start/reset/test/stop) and the pgTAP re-run's full verbatim output captured in SUMMARY.md.
- AUTH-06/AUTH-07/AUTH-08 status explicitly recorded as passing (all green, exit 0, zero "not ok" lines) or still-blocked (with verbatim evidence).
</success_criteria>

<output>
Create `.planning/quick/260716-bjk-fix-auth-08-fixture-count-test-bug-in-su/260716-bjk-SUMMARY.md` when done
</output>
</content>
