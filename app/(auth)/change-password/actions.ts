"use server";

import { createClient } from "@/lib/supabase/server";
import { changePasswordSchema } from "@/lib/validation/client-access";

type ChangePasswordResult = { success: true } | { error: string };

const GENERIC_ERROR =
  "Não foi possível completar a ação. Tente novamente em instantes.";

/**
 * Forced first-login password change (AUTH-10, D-09). Confirms the caller
 * via getUser() — the verified-JWT lookup, never the unverified session
 * cookie alone, for an authorization decision (05-RESEARCH.md Pattern 3) —
 * then calls the Supabase Auth password-update API, then clears the caller's OWN
 * profiles.must_change_password flag (self-row UPDATE, authorized by the
 * profiles_update_own_or_admin RLS policy and permitted by the
 * prevent_profile_privilege_escalation trigger since role/status are
 * untouched). There is no native Supabase "must change password" flag
 * (05-RESEARCH.md State of the Art / Pattern 1) — this app-layer clear is
 * what actually releases the middleware gate that redirected the user
 * here.
 */
export async function changePassword(
  formData: FormData
): Promise<ChangePasswordResult> {
  const parsed = changePasswordSchema.safeParse({
    password: formData.get("password"),
    confirmPassword: formData.get("confirmPassword"),
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? GENERIC_ERROR };
  }

  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Não autenticado." };

  const { error: updateAuthError } = await supabase.auth.updateUser({
    password: parsed.data.password,
  });
  if (updateAuthError) return { error: GENERIC_ERROR };

  const { error: updateProfileError } = await supabase
    .from("profiles")
    .update({ must_change_password: false })
    .eq("id", user.id);
  if (updateProfileError) return { error: GENERIC_ERROR };

  return { success: true };
}
