"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

type ActionResult = { error?: string };

/**
 * Approve a pending PM signup, assigning the selected role (AUTH-03/AUTH-04).
 *
 * Authorization boundary: the RLS-scoped server client (@/lib/supabase/server,
 * never the service-role client) plus the `profiles` UPDATE RLS policy scoped to
 * `is_admin()` and the `prevent_profile_privilege_escalation()` trigger
 * (05-01 migrations) — this call succeeds ONLY because the caller is an
 * authenticated admin. The literal-role guard below is defense-in-depth
 * (T-05-09), not the security boundary itself: a Server Action argument has
 * no runtime type enforcement once it crosses the client/server boundary,
 * so an injected/unexpected role string must still be rejected explicitly.
 */
export async function approveSignup(
  profileId: string,
  role: 'pm' | 'admin'
): Promise<ActionResult> {
  if (role !== 'pm' && role !== 'admin') {
    return { error: "Papel inválido." };
  }

  const supabase = await createClient();

  const { error } = await supabase
    .from("profiles")
    .update({ status: 'approved', role })
    .eq("id", profileId);

  if (error) {
    return { error: error.message };
  }

  revalidatePath("/admin/approvals");
  return {};
}

/**
 * Reject a pending PM signup. Marks the row `status='rejected'` — NEVER
 * deletes it (D-05: kept for audit/reactivation history). Authorization
 * boundary is identical to approveSignup above.
 */
export async function rejectSignup(profileId: string): Promise<ActionResult> {
  const supabase = await createClient();

  const { error } = await supabase
    .from("profiles")
    .update({ status: 'rejected' })
    .eq("id", profileId);

  if (error) {
    return { error: error.message };
  }

  revalidatePath("/admin/approvals");
  return {};
}
