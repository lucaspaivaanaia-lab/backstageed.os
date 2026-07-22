"use server";

import { headers } from "next/headers";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";

type RequestPasswordResetResult = { success: true };

const emailSchema = z.string().trim().email();

/**
 * Anti-enumeration password-reset request (T-eb7-01). ALWAYS resolves to
 * `{ success: true }` regardless of whether the email is invalid, unknown,
 * or the Supabase call fails — the caller must never be able to infer
 * whether an account exists for the given email, mirroring the single
 * generic error already used by app/(auth)/login/actions.ts.
 *
 * `redirectTo` origin comes ONLY from `headers().get("origin")` — Next.js
 * Server Actions reliably send the Origin header on same-origin POSTs, so
 * it is always present on this path. Deliberately NOT using a site-URL
 * env var (none exists in this project) or any other fallback: a missing
 * origin must short-circuit to the generic success response WITHOUT
 * calling Supabase, never produce a broken "undefined/auth/callback"
 * redirectTo.
 */
export async function requestPasswordReset(
  formData: FormData
): Promise<RequestPasswordResetResult> {
  const parsed = emailSchema.safeParse(formData.get("email"));

  const origin = (await headers()).get("origin");

  if (!parsed.success || !origin) {
    return { success: true };
  }

  const supabase = await createClient();

  await supabase.auth.resetPasswordForEmail(parsed.data, {
    redirectTo: `${origin}/auth/callback?next=/reset-password`,
  });

  return { success: true };
}
