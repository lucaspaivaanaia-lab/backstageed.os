import { createClient } from "@/lib/supabase/server";
import { listPmRoster } from "@/lib/actions/clients";
import { ClientCreateForm } from "@/components/clients/client-create-form";
import { PageShell, PageTitle } from "@/components/layout/page-shell";

export default async function PmNewClientPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const pmRoster = await listPmRoster();

  return (
    <PageShell>
      <PageTitle>Novo cliente</PageTitle>
      <ClientCreateForm
        pmRoster={pmRoster}
        currentUserId={user?.id ?? ""}
        basePath="/pm/clients"
      />
    </PageShell>
  );
}
