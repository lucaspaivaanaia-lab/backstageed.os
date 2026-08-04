import { createClient } from "@/lib/supabase/server";
import { PageShell, PageTitle, SectionTitle } from "@/components/layout/page-shell";
import {
  TemplateList,
  CreateTemplateButton,
} from "@/app/admin/checklist-templates/template-list";
import { ClientAssignment } from "@/app/admin/checklist-templates/client-assignment";

type TemplateItemRow = {
  id: string;
  label: string;
  sort_order: number;
};

type TemplateRow = {
  id: string;
  name: string;
  created_at: string;
  checklist_template_items: TemplateItemRow[] | null;
};

type ClientRow = {
  id: string;
  name: string;
  checklist_template_id: string | null;
};

/**
 * Admin checklist-template management screen (CHK-01, CHK-02). Server
 * Component: fetches templates (with their ordered items) and clients in
 * parallel, sorts each template's items by `sort_order` here so the client
 * components never re-sort, and renders the list + per-client assignment
 * table below the page title.
 */
export default async function ChecklistTemplatesPage() {
  const supabase = await createClient();

  const [templatesResult, clientsResult] = await Promise.all([
    supabase
      .from("checklist_templates")
      .select("id, name, created_at, checklist_template_items(id, label, sort_order)")
      .order("created_at", { ascending: true }),
    supabase
      .from("clients")
      .select("id, name, checklist_template_id")
      // P1 pivot 2026-08-04: excludes soft-deleted ("Excluir cliente")
      // clients from the per-client checklist-assignment table.
      .is("archived_at", null)
      .order("name", { ascending: true }),
  ]);

  const templates = ((templatesResult.data ?? []) as TemplateRow[]).map(
    (template) => ({
      ...template,
      checklist_template_items: [...(template.checklist_template_items ?? [])].sort(
        (a, b) => a.sort_order - b.sort_order
      ),
    })
  );

  const clients = (clientsResult.data ?? []) as ClientRow[];

  return (
    <PageShell width="wide">
      <PageTitle action={<CreateTemplateButton />}>Checklists</PageTitle>

      <div className="flex flex-col gap-section">
        <TemplateList templates={templates} clients={clients} />

        <div className="flex flex-col gap-4">
          <SectionTitle>Checklist por cliente</SectionTitle>
          <ClientAssignment clients={clients} templates={templates} />
        </div>
      </div>
    </PageShell>
  );
}
