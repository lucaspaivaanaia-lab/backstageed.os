-- P1 pivot 2026-08-04: Admin-only client soft delete ("Excluir cliente").
-- Decision: soft delete/archive, not a real DELETE — a real client is
-- about to go into production and an accidental hard delete would take
-- its cards/messages/files/checklist history with it, irrecoverably.
--
-- `archived_at` is nullable; null means active (the current, unmarked
-- state of every existing row). Setting it hides the client from active
-- LIST queries (client lists, board/chat client switchers, checklist
-- assignment) at the app layer -- this is NOT an RLS change, the existing
-- clients_select_scoped policy (0004/0008/0014) already governs WHO can
-- see a client; archived_at only governs whether an active list surfaces
-- it. A direct-link visit to an archived client's own detail/board/chat
-- page still works -- soft delete declutters lists, it does not lock out
-- existing data.
alter table public.clients
  add column archived_at timestamptz;

-- Active-list queries filter on this column (`archived_at is null`) --
-- index it so that filter stays cheap as the client roster grows.
create index clients_archived_at_idx on public.clients (archived_at);
