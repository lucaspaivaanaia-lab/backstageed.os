---
phase: quick
plan: 260715-cut
type: execute
wave: 1
depends_on: []
autonomous: true
requirements: [AUTH-06, AUTH-07, AUTH-08]
files_modified:
  - supabase/tests/rls_helpers.sql
  - .planning/phases/05-access-roles/05-06-PLAN.md

must_haves:
  truths:
    - "rls_helpers.sql no longer contains any `set role`/`set local role` to supabase_auth_admin or any admin role"
    - "rls_helpers.sql no longer contains any `alter table auth.users disable/enable trigger` statement"
    - "All 3 auth.users fixture rows carry role (and client_id for the client actor) in raw_user_meta_data so handle_new_user() creates each profile correctly"
    - "A scoped `alter table public.profiles disable/enable trigger prevent_profile_privilege_escalation_trg` pair wraps exactly one UPDATE targeting only pm_a and admin_user ids"
  artifacts:
    - path: "supabase/tests/rls_helpers.sql"
      provides: "Redesigned metadata-driven fixture bootstrap"
      contains: "prevent_profile_privilege_escalation_trg"
  key_links:
    - from: "supabase/tests/rls_helpers.sql"
      to: "public.handle_new_user()"
      via: "raw_user_meta_data role/client_id keys read by the on_auth_user_created trigger"
      pattern: "raw_user_meta_data"
---

<objective>
Redesign the actor-provisioning section of `supabase/tests/rls_helpers.sql` (follow-up round 2 to quick task 260715-ca2). The previous fix's `set local role supabase_auth_admin` approach to disabling the `on_auth_user_created` trigger failed at runtime with `permission denied to set role "supabase_auth_admin"` — the local `postgres` role is not a member of that admin role.

New approach (already fully derived — implement exactly, do not re-derive):
- Let `on_auth_user_created` fire normally; drive each actor's profile role/client_id via `raw_user_meta_data` so `handle_new_user()` creates the right profile.
- Replace the old direct profiles INSERT with a narrow, scoped UPDATE that only corrects the hardcoded `pending` status to `approved` for the non-client actors (pm_a, admin_user), wrapping just that UPDATE in a temporary disable/enable of `prevent_profile_privilege_escalation_trg` on `public.profiles` (which the local `postgres` role DOES own, unlike `auth.users`).

Purpose: Get `npx supabase test db` past the fixture bootstrap so AUTH-06/07/08 assertions can run.
Output: Redesigned `rls_helpers.sql` + updated follow-up note in 05-06-PLAN.md.

Cannot be verified in this sandbox (no Docker). Verification is static/grep only; the operator re-runs `npx supabase test db` locally.
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
@$HOME/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@supabase/tests/rls_helpers.sql
@supabase/migrations/0001_profiles.sql

<interfaces>
From supabase/migrations/0001_profiles.sql — handle_new_user() reads (confirm before finalizing JSON):
- `coalesce((new.raw_user_meta_data->>'role')::public.user_role, 'pm')` — role key
- `case when (new.raw_user_meta_data->>'role') = 'client' then 'approved' else 'pending' end` — status hardcoded per role
- `coalesce((new.raw_user_meta_data->>'must_change_password')::boolean, false)`
- `(new.raw_user_meta_data->>'client_id')::uuid` — client_id must be a plain UUID string in the JSON

Fixed actor uuids:
- pm_a          = aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa
- client_a_user = bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb
- admin_user    = cccccccc-cccc-cccc-cccc-cccccccccccc
- client_a      = 11111111-1111-1111-1111-111111111111

Trigger under test (do NOT redefine, only temporarily disable around one UPDATE):
- prevent_profile_privilege_escalation_trg (BEFORE UPDATE on public.profiles)
</interfaces>
</context>

<tasks>

<task type="auto">
  <name>Task 1: Redesign the actor-provisioning section of rls_helpers.sql</name>
  <files>supabase/tests/rls_helpers.sql</files>
  <read_first>
    - supabase/tests/rls_helpers.sql (current state — sections 2 and 3 plus the header comment block get rewritten)
    - supabase/migrations/0001_profiles.sql (handle_new_user() body — confirm exact JSON key casts before writing)
  </read_first>
  <action>
    Step A — auth.users insert (section 2): Remove the `set local role supabase_auth_admin; alter table auth.users disable trigger on_auth_user_created; reset role;` block (lines ~56-58) and the matching re-enable block (~90-92) entirely. Do NOT retry any `set role`/`set local role` to supabase_auth_admin or any other admin role, and do NOT ALTER TABLE auth.users at all. Keep the `insert into auth.users (...) on conflict (id) do nothing` block otherwise structurally identical (same columns, same 3 fixed-uuid rows). Change ONLY the `raw_user_meta_data` value of each row from `'{}'`:
      - pm_a row → `'{"role":"pm"}'`
      - client_a_user row → `'{"role":"client","client_id":"11111111-1111-1111-1111-111111111111"}'`
      - admin_user row → `'{"role":"admin"}'`
    Confirm against handle_new_user() that client_id is read via `(...->>'client_id')::uuid`, so the JSON value must be the plain UUID string (not quoted-as-cast). This lets on_auth_user_created fire and create each profile: pm_a → role=pm/status=pending, client_a_user → role=client/status=approved/client_id set (already fully correct, no further touch), admin_user → role=admin/status=pending.

    Step B — profiles correction (section 3): Delete the entire old `insert into public.profiles (...) on conflict (id) do nothing` block. Replace it with a scoped status correction:
      `alter table public.profiles disable trigger prevent_profile_privilege_escalation_trg;`
      then an `update public.profiles set status = 'approved' where id in ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'cccccccc-cccc-cccc-cccc-cccccccccccc');` (pm_a and admin_user ONLY),
      then `alter table public.profiles enable trigger prevent_profile_privilege_escalation_trg;`.
    Do NOT include client_a_user's id (bbbb...) — it is already correct from Step A and would be an unnecessary no-op on a row that does not need it. public.profiles is owned by the local `postgres` role, so this ALTER TABLE succeeds without any role switch (unlike the failed auth.users attempt). The disable is scoped to this single UPDATE and re-enabled before any test assertions run, so it does not weaken 0001_rls_pm_scoping_test.sql's Blocker-1 assertions (which test the trigger under the simulated PM identity, not during fixture bootstrap).

    Step C — header comment block: Rewrite the long top-of-file comment (currently describing the old auth.users-trigger-disable + direct-INSERT approach) to accurately and concisely describe this new approach: raw_user_meta_data drives handle_new_user() to create correct-role profiles; a scoped disable of prevent_profile_privilege_escalation_trg wraps a single UPDATE fixing the hardcoded `pending` status to `approved` for the two non-client actors; client_a_user needs no correction. Also update section 2 and section 3 header comments to match. Note in a comment that the previous supabase_auth_admin role-switch approach was removed because the local postgres role is not a member of that role.

    Do NOT touch sections 1 (clients), 4 (pm_clients), or the role-simulation helper (tests.set_auth). Do NOT touch supabase/migrations/*, 0004_rls_policies.sql, or the 3 *_test.sql files.
  </action>
  <verify>
    <automated>cd /Users/lucaspaiva/projects/backstageed.OS && ! grep -Eiq 'set +(local +)?role +supabase_auth_admin' supabase/tests/rls_helpers.sql && ! grep -Eiq 'alter +table +auth\.users' supabase/tests/rls_helpers.sql && grep -q '"role":"pm"' supabase/tests/rls_helpers.sql && grep -q '"role":"client","client_id":"11111111-1111-1111-1111-111111111111"' supabase/tests/rls_helpers.sql && grep -q '"role":"admin"' supabase/tests/rls_helpers.sql && grep -q 'disable trigger prevent_profile_privilege_escalation_trg' supabase/tests/rls_helpers.sql && grep -q 'enable trigger prevent_profile_privilege_escalation_trg' supabase/tests/rls_helpers.sql && echo PASS</automated>
  </verify>
  <done>rls_helpers.sql contains no `set role`/`set local role` to any admin role, no `alter table auth.users`, the 3 auth.users rows carry the expected role (and client_id) in raw_user_meta_data, and a scoped disable/enable pair of prevent_profile_privilege_escalation_trg wraps exactly one UPDATE targeting only pm_a and admin_user ids. Grep verify prints PASS.</done>
</task>

<task type="auto">
  <name>Task 2: Update the 05-06-PLAN.md follow-up note for round 2</name>
  <files>.planning/phases/05-access-roles/05-06-PLAN.md</files>
  <read_first>
    - .planning/phases/05-access-roles/05-06-PLAN.md (the existing "Follow-up already applied (quick task 260715-ca2...)" note in the objective)
  </read_first>
  <action>
    Update the existing follow-up note in the objective (the "Follow-up already applied (quick task 260715-ca2, commit `b5829bb`)" paragraph, specifically point 2 about the auth.users trigger fix). Record that a second round was needed: the first attempt's `set local role supabase_auth_admin` wrapper failed at runtime with `permission denied to set role "supabase_auth_admin"` because the local `postgres` role is not a member of that admin role. Describe the new approach — raw_user_meta_data-driven profile creation via handle_new_user() plus a scoped disable of prevent_profile_privilege_escalation_trg around a single status-correction UPDATE (pm_a + admin_user only). Reference this quick task's directory: `.planning/quick/260715-cut-redesign-rls-helpers-sql-fixture-bootstr`. Also add a one-line note that `supabase test db` runs rls_helpers.sql itself as a standalone pgTAP file (it matches the glob), producing a harmless `WARNING: SET LOCAL can only be used in transaction blocks` + `Dubious`/`No subtests run` entry that predates both fix attempts and is not a new regression. Keep the edit concise; do not restructure the rest of the plan.
  </action>
  <verify>
    <automated>cd /Users/lucaspaiva/projects/backstageed.OS && grep -q '260715-cut' .planning/phases/05-access-roles/05-06-PLAN.md && grep -qi 'permission denied' .planning/phases/05-access-roles/05-06-PLAN.md && echo PASS</automated>
  </verify>
  <done>05-06-PLAN.md's follow-up note records the round-2 revision (why the set-role approach failed, the new metadata-driven + scoped-trigger approach, this quick task's directory reference, and the harmless standalone-run warning note). Grep verify prints PASS.</done>
</task>

</tasks>

<verification>
- No `set role`/`set local role` to any admin role and no `alter table auth.users` remain in rls_helpers.sql.
- raw_user_meta_data for all 3 auth.users rows carries the expected role (and client_id for the client actor).
- The scoped `disable/enable trigger prevent_profile_privilege_escalation_trg` pair wraps exactly one UPDATE targeting only pm_a and admin_user.
- 05-06-PLAN.md follow-up note updated for round 2.
- Cannot run `npx supabase test db` here (no Docker) — operator re-runs it locally. Known harmless standalone-run warning (SET LOCAL outside transaction / Dubious) predates this fix; leave a note, don't worsen it.
</verification>

<success_criteria>
- rls_helpers.sql fixture bootstrap redesigned per Steps A/B/C; static grep checks pass.
- 05-06-PLAN.md follow-up note updated to reflect the round-2 approach.
- No changes to supabase/migrations/*, 0004_rls_policies.sql, 0001_profiles.sql, or the 3 *_test.sql files.
</success_criteria>

<output>
Create `.planning/quick/260715-cut-redesign-rls-helpers-sql-fixture-bootstr/260715-cut-SUMMARY.md` when done. Note that verification is static only (no Docker in sandbox) and the operator must re-run `npx supabase test db` locally. Record the known harmless standalone-run warning so it isn't mistaken for a new regression.
</output>
