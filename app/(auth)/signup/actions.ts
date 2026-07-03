"use server";

import { createClient } from "@/lib/supabase/server";
import { signupSchema } from "@/lib/validation/auth";

type SignUpResult = { success: true } | { error: string };

const GENERIC_ERROR =
  "Não foi possível completar a ação. Tente novamente em instantes.";

/**
 * PM self-signup Server Action.
 *
 * Validates input with zod BEFORE calling Supabase (01-RESEARCH.md Pitfall 5
 * — malformed metadata can silently fail the handle_new_user() trigger and
 * surface as an opaque 500). On success, a `profiles` row is created via
 * the trigger with role='pm', status='pending'.
 */
export async function signUp(formData: FormData): Promise<SignUpResult> {
  const parsed = signupSchema.safeParse({
    email: formData.get("email"),
    password: formData.get("password"),
  });

  if (!parsed.success) {
    const fieldError = parsed.error.issues[0]?.message ?? GENERIC_ERROR;
    return { error: fieldError };
  }

  const supabase = await createClient();

  const { error } = await supabase.auth.signUp({
    email: parsed.data.email,
    password: parsed.data.password,
    options: { data: { role: "pm" } },
  });

  if (error) {
    const alreadyRegistered =
      error.code === "user_already_exists" ||
      error.code === "email_exists" ||
      error.message.toLowerCase().includes("already registered") ||
      error.message.toLowerCase().includes("already exists");

    if (alreadyRegistered) {
      return {
        error:
          "Já existe uma conta com este e-mail. Tente fazer login ou use outro e-mail.",
      };
    }
    return { error: GENERIC_ERROR };
  }

  return { success: true };
}
