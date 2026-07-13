import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { listPmRoster, resolvePmNames } from "@/lib/actions/clients";
import { ClientDetailForm } from "@/components/clients/client-detail-form";

type PageProps = { params: Promise<{ id: string }> };

/**
 * PM client detail/edit page. `clients_select_scoped` (Plan 01-02) only
 * returns this client row if the caller is Admin OR already in
 * `pm_assigned_clients()` for it — a PM navigating directly to another
 * PM's client id (the RLS boundary check in this plan's own Task 3) gets
 * `notFound()` here, BEFORE any admin-client read runs (T-01-18).
 */
export default async function PmClientDetailPage({ params }: PageProps) {
  const { id } = await params;
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const [{ data: client }, { data: profile }] = await Promise.all([
    supabase
      .from("clients")
      .select(
        "id, name, objective, tone_of_voice, target_audience, content_pillars, tropicalia_project_id"
      )
      .eq("id", id)
      .single(),
    user
      ? supabase.from("profiles").select("role").eq("id", user.id).single()
      : Promise.resolve({ data: null }),
  ]);

  if (!client) notFound();

  const admin = createAdminClient();
  const { data: pmClientRows } = await admin
    .from("pm_clients")
    .select("pm_id")
    .eq("client_id", client.id);

  const assignedPmIds = (pmClientRows ?? []).map((row) => row.pm_id);
  const assignedPmNames = await resolvePmNames(assignedPmIds);
  const pmRoster = await listPmRoster();

  const canRetry =
    Boolean(process.env.TROPICALIA_API_KEY) &&
    client.tropicalia_project_id === null;

  return (
    <div className="max-w-3xl mx-auto px-6 py-8">
      <ClientDetailForm
        client={{
          id: client.id,
          name: client.name,
          objective: client.objective,
          toneOfVoice: client.tone_of_voice,
          targetAudience: client.target_audience,
          contentPillars: client.content_pillars ?? [],
          tropicaliaProjectId: client.tropicalia_project_id,
        }}
        pmRoster={pmRoster}
        assignedPmIds={assignedPmIds}
        assignedPmNames={assignedPmNames}
        viewerIsAdmin={profile?.role === "admin"}
        canRetry={canRetry}
      />
    </div>
  );
}
