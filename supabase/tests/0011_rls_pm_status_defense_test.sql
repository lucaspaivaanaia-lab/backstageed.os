-- Phase 5: Access & Roles -- defense-in-depth regression proof for AUTH-06.
--
-- Proves that public.pm_assigned_clients() independently re-verifies the
-- caller's profile role/status (role = 'pm' and status = 'approved'),
-- mirroring is_pm()'s existing predicate, instead of granting access purely
-- because a public.pm_clients row exists. Nothing is redefined here -- the
-- fix itself lives in supabase/migrations/0021_pm_assigned_clients_status_check.sql.
--
-- pm_a's profile is mutated (status/role) directly inside this file's own
-- begin;/rollback; transaction to simulate the out-of-band manual SQL
-- intervention this defense-in-depth gap defends against. rls_helpers.sql
-- itself is never edited -- no new fixture actor is added -- so no other
-- test file's expectations shift.

begin;
select plan(5);

\ir rls_helpers.sql

-- 1. Controle: PM aprovado (unmodified fixture) ve o client_a atribuido.
--    Passes before AND after the fix -- regression control.
select tests.set_auth('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa');

select results_eq(
  $$ select count(*) from public.clients where id = '11111111-1111-1111-1111-111111111111' $$,
  $$ values (1::bigint) $$,
  'controle: PM aprovado ve o client_a atribuido'
);

-- De-authenticate back to the session owner -- required to mutate
-- public.profiles (table ownership, not RLS, is what allows this).
reset role;
select set_config('request.jwt.claims', '', true);

-- Simulate an out-of-band manual SQL intervention: flip pm_a's status to
-- 'pending' directly, bypassing listPmRoster()'s .eq("status","approved")
-- filter entirely. The trigger disable/enable pair is the project's
-- established fixture technique (rls_helpers.sql lines 114-120) -- the
-- trigger is re-enabled immediately, before any assertion runs, so no other
-- test's guarantees are weakened.
alter table public.profiles disable trigger prevent_profile_privilege_escalation_trg;

update public.profiles
set status = 'pending'
where id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';

alter table public.profiles enable trigger prevent_profile_privilege_escalation_trg;

-- Re-authenticate as pm_a to exercise RLS with the now-pending profile.
select tests.set_auth('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa');

-- 2. PM com status pending perde acesso ao client_a atribuido.
--    Fails before the fix, passes after.
select results_eq(
  $$ select count(*) from public.clients where id = '11111111-1111-1111-1111-111111111111' $$,
  $$ values (0::bigint) $$,
  'PM com status pending perde acesso ao client_a atribuido'
);

-- 3. PM com status pending nao ve nenhum cliente -- proves the loss is
--    total, not partial; pm_a's profiles.client_id is NULL so the
--    client-self branch of clients_select_scoped cannot grant anything.
select results_eq(
  $$ select count(*) from public.clients $$,
  $$ values (0::bigint) $$,
  'PM com status pending nao ve nenhum cliente'
);

-- De-authenticate again to mutate the profile a second time.
reset role;
select set_config('request.jwt.claims', '', true);

-- Restore status to 'approved' but change role away from 'pm' -- covers the
-- p.role = 'pm' half of the new predicate.
alter table public.profiles disable trigger prevent_profile_privilege_escalation_trg;

update public.profiles
set status = 'approved', role = 'client'
where id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';

alter table public.profiles enable trigger prevent_profile_privilege_escalation_trg;

select tests.set_auth('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa');

-- 4. PM com role alterado para client perde acesso ao client_a atribuido.
--    Fails before the fix, passes after.
select results_eq(
  $$ select count(*) from public.clients where id = '11111111-1111-1111-1111-111111111111' $$,
  $$ values (0::bigint) $$,
  'PM com role alterado para client perde acesso ao client_a atribuido'
);

-- De-authenticate one last time -- assertion 5 runs as the session owner,
-- which bypasses RLS because postgres owns public.pm_clients and no force
-- row level security is set on it (same pattern as file 0010's assertion 4).
reset role;
select set_config('request.jwt.claims', '', true);

-- 5. A linha de pm_clients permanece intacta -- o bloqueio vem do
--    predicado, nao da remocao do vinculo. Passes before AND after.
select results_eq(
  $$ select count(*) from public.pm_clients where pm_id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa' and client_id = '11111111-1111-1111-1111-111111111111' $$,
  $$ values (1::bigint) $$,
  'a linha de pm_clients permanece intacta -- o bloqueio vem do predicado, nao da remocao do vinculo'
);

select * from finish();
rollback;
