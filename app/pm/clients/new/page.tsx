import { createClient } from "@/lib/supabase/server";
import { listPmRoster } from "@/lib/actions/clients";
import { ClientCreateForm } from "@/components/clients/client-create-form";

export default async function PmNewClientPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const pmRoster = await listPmRoster();

  return (
    <div className="max-w-3xl mx-auto px-6 py-8">
      <h1 className="text-[28px] font-semibold leading-[1.2] mb-8">
        Novo cliente
      </h1>
      <ClientCreateForm
        pmRoster={pmRoster}
        currentUserId={user?.id ?? ""}
        basePath="/pm/clients"
      />
    </div>
  );
}
