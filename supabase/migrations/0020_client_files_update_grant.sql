-- P2 pivot 2026-08-04: meeting-transcript base-file update flow needs to
-- UPDATE an existing client_files row's `content` column
-- (updateClientFileContent, lib/actions/client-files.ts). 0011_client_files.sql
-- only ever shipped SELECT/INSERT/DELETE -- UPDATE was never needed until
-- now, so it was never added. Confirmed live: without this, `.update()`
-- returns success with zero rows actually changed (RLS silently excludes
-- the row from the UPDATE's target set rather than erroring), which is why
-- the transcript-update flow showed a "Arquivo base atualizado." toast
-- while the database content stayed untouched.
--
-- Same PM/Admin scoping as the other three policies on this table, using
-- BOTH `using` (which existing rows are updatable) and `with check` (the
-- row must still satisfy the same scope after the update) -- required for
-- an UPDATE policy, unlike SELECT/INSERT/DELETE which only need one.
--
-- GRANT ships in this same migration (repeated Pitfall, every phase):
-- hosted Supabase auto-grants base table privileges at provisioning, local
-- `supabase start` does not.

create policy "client_files_update_scoped"
on public.client_files
for update
to authenticated
using (
  (select public.is_admin())
  or client_id in (select public.pm_assigned_clients())
)
with check (
  (select public.is_admin())
  or client_id in (select public.pm_assigned_clients())
);

grant update on public.client_files to authenticated;
