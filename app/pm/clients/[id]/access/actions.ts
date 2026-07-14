"use server";

import { createAdminClient } from "@/lib/supabase/admin";
import { createClientLoginSchema } from "@/lib/validation/client-access";
import { generateProvisionalPassword } from "@/lib/security/password";

const GENERIC_ERROR =
  "Não foi possível completar a ação. Tente novamente em instantes.";
const ALREADY_HAS_LOGIN_ERROR = "Este cliente já possui um acesso ativo.";

/**
 * D-10 lookup (Blocker 3): the single query used to decide BOTH whether
 * createClientLogin should proceed (pre-check) AND whether a page should
 * render the create form vs the deactivate control (server-render lookup
 * called directly from app/pm/clients/[id]/access/page.tsx and its Admin
 * mirror, app/admin/clients/[id]/access/page.tsx — same helper, not
 * re-derived per route). Filters profiles for role='client', matching
 * client_id, and status NOT IN ('rejected','deactivated') — the same
 * predicate as the uq_profiles_one_client_login_per_client partial unique
 * index (05-01 migration 0003_pm_clients.sql), so an app-layer pre-check
 * and the DB backstop always agree on what counts as "active".
 */
export async function findActiveClientLogin(
  client_id: string
): Promise<{ userId: string } | null> {
  const admin = createAdminClient();

  const { data } = await admin
    .from("profiles")
    .select("id")
    .eq("client_id", client_id)
    .eq("role", "client")
    .neq("status", "rejected")
    .neq("status", "deactivated")
    .maybeSingle();

  return data ? { userId: data.id } : null;
}

type CreateClientLoginResult =
  | { success: true; userId: string; password: string }
  | { error: string };

/**
 * PM/Admin creates a Client login (AUTH-09) linked to an existing client
 * record. ROLE-AGNOSTIC — no PM-only or `/pm`-only hardcoded assumption;
 * authorization comes from the service-role admin client + middleware
 * path routing, not a caller-role check here. Reused verbatim by the
 * Admin mirror route (app/admin/clients/[id]/access/page.tsx, Task 4) —
 * no duplicated implementation.
 *
 * D-10 (one active Client login per client company): pre-checks via
 * findActiveClientLogin() BEFORE calling the admin createUser API, AND
 * catches the DB partial-unique-index violation
 * (uq_profiles_one_client_login_per_client) as a backstop in case the
 * pre-check raced another request — both map to the SAME friendly error,
 * never a raw unique-violation message.
 */
export async function createClientLogin(
  clientId: string,
  email: string
): Promise<CreateClientLoginResult> {
  const parsed = createClientLoginSchema.safeParse({
    email,
    client_id: clientId,
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? GENERIC_ERROR };
  }

  const existingLogin = await findActiveClientLogin(parsed.data.client_id);
  if (existingLogin) {
    return { error: ALREADY_HAS_LOGIN_ERROR };
  }

  const password = generateProvisionalPassword();
  const admin = createAdminClient();

  const { data, error } = await admin.auth.admin.createUser({
    email: parsed.data.email,
    password,
    email_confirm: true,
    user_metadata: {
      role: "client",
      client_id: parsed.data.client_id,
      must_change_password: true,
    },
  });

  if (error || !data.user) {
    const message = error?.message?.toLowerCase() ?? "";
    const duplicate =
      message.includes("already registered") ||
      message.includes("already exists") ||
      message.includes("duplicate") ||
      message.includes("unique");
    if (duplicate) {
      return { error: ALREADY_HAS_LOGIN_ERROR };
    }
    return { error: GENERIC_ERROR };
  }

  return { success: true, userId: data.user.id, password };
}
