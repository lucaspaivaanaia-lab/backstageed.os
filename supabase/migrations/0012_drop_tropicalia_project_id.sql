-- Quick task 260722-hnm: Migrar RAG de Tropicalia para Supabase.
--
-- Remove por completo a coluna tropicalia_project_id de public.clients --
-- o auto-provisioning de project na Tropicalia (Fase 1 / LUC-16) e removido
-- por inteiro em favor de public.client_files (0011_client_files.sql). A
-- migration original 0006_clients_full_record.sql que introduziu a coluna
-- NAO e editada (historico preservado).

alter table public.clients drop column tropicalia_project_id;
