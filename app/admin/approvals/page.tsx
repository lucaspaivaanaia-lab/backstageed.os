import { createClient } from "@/lib/supabase/server";
import { ApprovalQueue } from "@/components/approvals/approval-queue";

/**
 * Admin approval queue (AUTH-03/AUTH-04). Server Component: fetches every
 * `pending` profile (id, email, created_at) via the RLS-scoped server
 * client — `profiles.email` is the mandated source for each signup's real
 * email (populated by handle_new_user() from auth.users.email; this client
 * cannot read auth.users directly). Passes plain data down to the
 * interactive Client Component.
 */
export default async function AdminApprovalsPage() {
  const supabase = await createClient();

  // Defense-in-depth read of the caller (middleware already gates
  // cross-role access to this route; RLS is the real authorization
  // boundary for the profiles SELECT below).
  await supabase.auth.getUser();

  const { data } = await supabase
    .from("profiles")
    .select("id, email, created_at")
    .eq("status", 'pending')
    .order("created_at", { ascending: true });

  const signups = (data ?? []) as {
    id: string;
    email: string | null;
    created_at: string;
  }[];

  return (
    <div className="max-w-4xl mx-auto px-6 py-8">
      <h1 className="text-[28px] font-semibold leading-[1.2] mb-8">
        Aprovações pendentes
      </h1>
      <ApprovalQueue signups={signups} />
    </div>
  );
}
