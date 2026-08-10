-- Quick task 260808-ci5 gap fix (found via /gsd:verify-work after Task 3's
-- live checkpoint, then confirmed live in production: 4 of 5 real clients
-- affected).
--
-- 0023_checklist_templates_owner_scoping.sql defaulted `owner_client_id` to
-- NULL for every pre-existing `checklist_templates` row (correct at the
-- time -- a pre-existing row has no "generated as a draft for this client"
-- provenance to infer). But the new "Ver/editar checklist" button
-- (components/clients/client-checklist-section.tsx) and
-- `confirmChecklistDraft` (lib/actions/checklist-templates.ts) both
-- require a non-null `owner_client_id` -- `confirmChecklistDraft`
-- explicitly rejects `owner_client_id is null` as "not an owner-scoped
-- template, must go through the Admin-only updateTemplate flow instead."
-- That made "Ver/editar checklist" open fine but silently fail to save
-- for every client whose active checklist predates this feature.
--
-- Backfills `owner_client_id` from `clients.checklist_template_id` for any
-- template that is EXACTLY ONE client's current active checklist -- the
-- only case where "this template belongs to that client" is unambiguous.
-- Confirmed live against the hosted project before writing this migration:
-- all 5 existing checklist_templates rows are each referenced by exactly
-- one client (no sharing), so this backfill is a precise, lossless fix for
-- the actual data, not a guess. A template referenced by zero clients
-- (orphaned) or by more than one (genuinely shared/library, CHK-01's
-- original reusable-template model) is deliberately left untouched --
-- those keep going through the existing Admin-only
-- /admin/checklist-templates screen, not the new PM-usable draft/confirm/
-- edit flow, exactly as 0023 intended.

update public.checklist_templates t
set owner_client_id = c.id
from public.clients c
where c.checklist_template_id = t.id
  and t.owner_client_id is null
  and (
    select count(*)
    from public.clients c2
    where c2.checklist_template_id = t.id
  ) = 1;
