-- Phase 1: Client Records & Isolated RAG Setup
-- Extends the Phase 5 stub (id, name, created_at) with the strategic
-- briefing fields (CLI-04) and the Tropicalia project link (CLI-03).
-- RLS was already enabled on public.clients in 0002_clients_stub.sql —
-- ALTER TABLE does not disable it, so no re-enable needed here
-- (CVE-2025-48757 discipline only applies to new CREATE TABLE statements).

alter table public.clients
  add column tropicalia_project_id text,
  add column objective text,
  add column tone_of_voice text,
  add column target_audience text,
  add column content_pillars text[] not null default '{}',
  add column updated_at timestamptz not null default now();
