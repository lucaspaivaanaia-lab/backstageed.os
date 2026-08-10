-- Quick task 260808-ci5: Repensar como a IA participa do ciclo de
-- checklist do cliente -- item 1 (geracao automatica + aprovacao PM-ou-
-- Admin do checklist gerado pela IA).
--
-- Opens `checklist_templates`/`checklist_template_items` writes to a PM,
-- strictly scoped via `pm_assigned_clients()` (0021_pm_assigned_clients_
-- status_check.sql) to templates the PM's own assigned client OWNS
-- (`owner_client_id`). Shared/library templates (`owner_client_id is null`,
-- CHK-01's reusable-template model, D-03) stay Admin-only via the untouched
-- `checklist_templates_admin_write` / `checklist_template_items_admin_write`
-- policies shipped in 0013_checklist_templates.sql -- RLS policies are OR'd
-- per command, so this migration only ADDS a second permissive write path,
-- it does not narrow or replace the existing admin-only one.
--
-- `status` defaults to `'confirmed'` so every pre-existing row (all
-- Admin-authored, all currently gating a client via
-- clients.checklist_template_id) is unaffected by this migration -- no
-- backfill needed, no existing checklist silently becomes a "draft".
--
-- D-Checklist-Approval (260808-ci5-CONTEXT.md): both PM and Admin can
-- review/edit/confirm an AI-generated draft checklist for their own
-- assigned client(s); a draft only becomes the client's ACTIVE/gating
-- checklist (clients.checklist_template_id) at the moment of explicit
-- confirmation (lib/actions/checklist-templates.ts#confirmChecklistDraft),
-- never automatically on generation -- this migration is silent on THAT
-- distinction, it only unlocks the write path a PM needs to reach it; the
-- app-layer Server Action is what enforces the confirm-is-the-only-gate-
-- moment rule.
--
-- D-06-amendment boundary (260808-ci5-CONTEXT.md, item 2 -- content
-- self-correction): this migration does NOT touch that boundary at all. It
-- makes zero changes to `cards`, `card_checklist_items`, or any table/
-- policy involved in CHK-03/CHK-04's manual-conference gate. That change is
-- entirely app-layer (app/pm/board/actions.ts#validateCardAgainstChecklist),
-- with no new RLS surface.

alter table public.checklist_templates
  add column status text not null default 'confirmed'
    check (status in ('draft', 'confirmed')),
  add column owner_client_id uuid references public.clients(id) on delete cascade;

create policy "checklist_templates_owner_write"
on public.checklist_templates
for all
to authenticated
using (
  owner_client_id is not null
  and (
    (select public.is_admin())
    or owner_client_id in (select public.pm_assigned_clients())
  )
)
with check (
  owner_client_id is not null
  and (
    (select public.is_admin())
    or owner_client_id in (select public.pm_assigned_clients())
  )
);

create policy "checklist_template_items_owner_write"
on public.checklist_template_items
for all
to authenticated
using (
  exists (
    select 1
    from public.checklist_templates t
    where t.id = checklist_template_items.template_id
      and t.owner_client_id is not null
      and (
        (select public.is_admin())
        or t.owner_client_id in (select public.pm_assigned_clients())
      )
  )
)
with check (
  exists (
    select 1
    from public.checklist_templates t
    where t.id = checklist_template_items.template_id
      and t.owner_client_id is not null
      and (
        (select public.is_admin())
        or t.owner_client_id in (select public.pm_assigned_clients())
      )
  )
);

-- No new `grant` statements -- 0013_checklist_templates.sql already granted
-- `select, insert, update, delete on public.checklist_templates/
-- checklist_template_items to authenticated`; the policies above only add a
-- second permissive write path scoped to `owner_client_id`, they do not
-- require any new base-table privilege.
