"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

/**
 * Global logout Server Action used by the persistent nav shells
 * (components/layout/app-nav.tsx) for both /pm/* and /admin/*. Ends the
 * Supabase session and returns the user to /login.
 */
export async function signOut(): Promise<void> {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/login");
}
