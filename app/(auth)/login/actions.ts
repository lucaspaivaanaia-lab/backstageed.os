"use server";

import { createClient } from "@/lib/supabase/server";
import { loginSchema } from "@/lib/validation/auth";

type SignInResult = { success: true } | { error: string };

const GENERIC_ERROR =
  "Não foi possível completar a ação. Tente novamente em instantes.";

/**
 * Minimal dev-auth login Server Action (D-01/D-02/D-03 — throwaway
 * Phase 1-4 tooling, no forgot-password, no approval-queue UI beyond what
 * middleware.ts already gates post-login).
 *
 * Validates with zod BEFORE any Supabase call (same convention as
 * app/(auth)/signup/actions.ts, 01-RESEARCH.md Pitfall 5). On any Supabase
 * Auth failure this returns a single generic error string regardless of
 * whether the email doesn't exist or the password is wrong (T-01-02 — never
 * distinguish "email not found" from "wrong password").
 */
export async function signIn(formData: FormData): Promise<SignInResult> {
  const parsed = loginSchema.safeParse({
    email: formData.get("email"),
    password: formData.get("password"),
  });

  if (!parsed.success) {
    const fieldError = parsed.error.issues[0]?.message ?? GENERIC_ERROR;
    return { error: fieldError };
  }

  const supabase = await createClient();

  const { error } = await supabase.auth.signInWithPassword({
    email: parsed.data.email,
    password: parsed.data.password,
  });

  if (error) {
    return { error: "E-mail ou senha incorretos." };
  }

  return { success: true };
}
