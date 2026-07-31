-- Phase 3: Content Production Kanban -- Plan 03-01.
-- CHK-02: assigns exactly one checklist template to each client. A nullable
-- FK column, not a join table -- this is a strict 1:1 assignment per D-03's
-- wording ("assigns one template to each client"), so a join table would be
-- unnecessary indirection.
--
-- RLS is already enabled on public.clients (0002_clients_stub.sql) and an
-- ALTER TABLE ADD COLUMN does not disable it (CVE-2025-48757 discipline only
-- applies to new CREATE TABLE statements, per the precedent comment in
-- 0006_clients_full_record.sql) -- so no re-enable and no new policy is
-- needed here. The existing "clients_select_scoped" (0004_rls_policies.sql)
-- and "clients_update_scoped" (0007_clients_rls_fix.sql, superseding
-- 0004's clients_update_admin_only) policies already cover reads and
-- writes of this new column exactly as they cover every other column on
-- this table.

alter table public.clients
  add column checklist_template_id uuid references public.checklist_templates(id);
