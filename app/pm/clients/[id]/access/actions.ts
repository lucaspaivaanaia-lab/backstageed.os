"use server";

import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { createClientLoginSchema } from "@/lib/validation/client-access";
import { generateProvisionalPassword } from "@/lib/security/password";
import {
  isClientActionAuthorized,
  isActiveLoginMatch,
} from "@/lib/security/client-access-authz";

const GENERIC_ERROR =
  "Não foi possível completar a ação. Tente novamente em instantes.";
const ALREADY_HAS_LOGIN_ERROR = "Este cliente já possui um acesso ativo.";
const UNAUTHORIZED_ERROR = "Cliente inválido ou fora do seu escopo.";
const UNAUTHENTICATED_ERROR = "Não autenticado.";

/**
 * T-05-01 / T-05-02 / T-05-05 guard: authorizes the AUTHENTICATED caller
 * for a specific clientId BEFORE any service-role admin-client call is
 * constructed. Authorization is derived SOLELY from the RLS-scoped
 * `is_admin()` / `pm_assigned_clients()` RPCs — never from row visibility
 * (e.g. `clients_select_scoped` also grants a `client`-role caller
 * visibility into their own client row, which must NEVER be conflated
 * with "this caller manages this client" per D-01: no self-provisioning).
 * Fails closed: any RPC error is treated as unauthorized, no fallback.
 */
async function assertCallerManagesClient(
  clientId: string
): Promise<{ ok: true } | { error: string }> {
  const scoped = await createClient();

  const {
    data: { user },
  } = await scoped.auth.getUser();
  if (!user) {
    return { error: UNAUTHENTICATED_ERROR };
  }

  const [adminResult, assignedResult] = await Promise.all([
    scoped.rpc("is_admin"),
    scoped.rpc("pm_assigned_clients"),
  ]);

  if (adminResult.error) {
    console.error(
      "assertCallerManagesClient: is_admin() RPC failed",
      adminResult.error
    );
    return { error: UNAUTHORIZED_ERROR };
  }
  if (assignedResult.error) {
    console.error(
      "assertCallerManagesClient: pm_assigned_clients() RPC failed",
      assignedResult.error
    );
    return { error: UNAUTHORIZED_ERROR };
  }

  const isAdmin = adminResult.data === true;
  const assignedClientIds = (assignedResult.data ?? []).map(
    (row: string | { client_id: string }) =>
      typeof row === "string" ? row : row.client_id
  );

  const authorized = isClientActionAuthorized({
    isAdmin,
    assignedClientIds,
    clientId,
  });

  if (!authorized) {
    return { error: UNAUTHORIZED_ERROR };
  }

  return { ok: true };
}

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

  const { data, error } = await admin
    .from("profiles")
    .select("id")
    .eq("client_id", client_id)
    .eq("role", "client")
    .neq("status", "rejected")
    .neq("status", "deactivated")
    .maybeSingle();

  if (error) {
    // WR-01 fix: a swallowed query error here previously masked lookup
    // failures as "no active login" — deactivateClientAccess now depends
    // on this lookup for its ownership check (isActiveLoginMatch), so
    // fail closed and log instead of silently discarding the error.
    console.error("findActiveClientLogin query failed", error);
    return null;
  }

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

  const authz = await assertCallerManagesClient(parsed.data.client_id);
  if ("error" in authz) {
    return { error: authz.error };
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

type DeactivateClientAccessResult = { success: true } | { error: string };

/**
 * PM/Admin deactivates a Client's access (AUTH-11). ROLE-AGNOSTIC (no
 * PM-only assumption) — reused verbatim by the Admin mirror route
 * (Task 4). Bans the user at the Supabase Auth layer via the admin
 * update-user-by-id API with a ~100-year ban duration (reactivation is out of scope per
 * SKELETON.md) AND syncs profiles.status to 'deactivated' — NOT
 * 'rejected' (Warning 3), so a cut-off Client is never conflated with a
 * rejected PM signup — for UI/audit clarity (05-RESEARCH.md Alternatives
 * Considered: use BOTH the auth ban and the status flag, not either/or).
 * Uses the admin client for the profiles update since this is a
 * cross-user write (RLS would otherwise scope a profiles UPDATE to the
 * caller's own row).
 *
 * T-05-02 (IDOR) fix: takes an explicit clientId, authorizes the caller
 * for it via assertCallerManagesClient(), then re-derives the target
 * server-side via findActiveClientLogin(clientId) and requires the
 * caller-supplied userId to match it via isActiveLoginMatch() — BEFORE
 * constructing the admin client or calling updateUserById. This rejects
 * an arbitrary/guessed userId even from an otherwise-authorized caller.
 */
export async function deactivateClientAccess(
  clientId: string,
  userId: string
): Promise<DeactivateClientAccessResult> {
  const authz = await assertCallerManagesClient(clientId);
  if ("error" in authz) {
    return { error: authz.error };
  }

  const active = await findActiveClientLogin(clientId);
  if (!isActiveLoginMatch(active, userId)) {
    return { error: GENERIC_ERROR };
  }

  const admin = createAdminClient();

  const { error: banError } = await admin.auth.admin.updateUserById(userId, {
    ban_duration: "876000h",
  });
  if (banError) return { error: GENERIC_ERROR };

  const { error: statusError } = await admin
    .from("profiles")
    .update({ status: "deactivated" })
    .eq("id", userId);
  if (statusError) return { error: GENERIC_ERROR };

  return { success: true };
}
