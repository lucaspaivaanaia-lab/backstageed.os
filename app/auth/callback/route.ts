import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

/**
 * PKCE callback for the password-reset email link (T-eb7-04). Exchanges the
 * `code` query param for a recovery session, then redirects to `next`
 * (defaults to /reset-password). Reachable while logged out — this path is
 * added to middleware.ts PUBLIC_PATHS in Task 5.
 */
export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const next = searchParams.get("next") ?? "/reset-password";

  if (code) {
    const supabase = await createClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) {
      return NextResponse.redirect(new URL(next, origin));
    }
  }

  return NextResponse.redirect(new URL("/login?error=reset", origin));
}
