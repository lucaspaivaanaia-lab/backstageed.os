"use server";

import { createClient } from "@/lib/supabase/server";
import { changePasswordSchema } from "@/lib/validation/client-access";

type UpdatePasswordResult = { success: true } | { error: string };

const GENERIC_ERROR =
  "Não foi possível completar a ação. Tente novamente em instantes.";

/**
 * Completes the PKCE password-reset flow (T-eb7-02). Requires an active
 * recovery session (established by app/auth/callback/route.ts via
 * exchangeCodeForSession) — confirmed here via getUser(), the
 * verified-JWT lookup, never the unverified session cookie alone. On
 * success, immediately signs the recovery session out so the user must
 * log back in with the new password.
 */
export async function updatePassword(
  formData: FormData
): Promise<UpdatePasswordResult> {
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
  if (!user) {
    return { error: "Sessão de recuperação inválida ou expirada." };
  }

  const { error: updateError } = await supabase.auth.updateUser({
    password: parsed.data.password,
  });
  if (updateError) return { error: GENERIC_ERROR };

  await supabase.auth.signOut();

  return { success: true };
}
