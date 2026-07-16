/**
 * Pure authorization predicates for the Client-access Server Actions
 * (createClientLogin / deactivateClientAccess). Intentionally free of any
 * Supabase client import or I/O so this module can be imported by its
 * sibling `client-access-authz.test.ts` via a relative path and exercised
 * with Node's built-in test runner — no live DB, no service-role key, no
 * Docker (05-REVIEW.md CR-01/CR-02, AUTH-06/AUTH-09/AUTH-11).
 */

/**
 * Encodes the CR-01 authorization rule: a caller may act on a clientId
 * only when they are an admin OR the clientId is one of their assigned
 * clients (`public.pm_assigned_clients()`). Never derived from row
 * visibility (T-05-05) — callers must pass the RPC-derived isAdmin /
 * assignedClientIds values in.
 */
export function isClientActionAuthorized(input: {
  isAdmin: boolean;
  assignedClientIds: string[];
  clientId: string;
}): boolean {
  return (
    input.isAdmin || input.assignedClientIds.includes(input.clientId)
  );
}

/**
 * Encodes the CR-02 IDOR guard: the caller-supplied userId must equal the
 * currently-active client login for the clientId (server-re-derived via
 * findActiveClientLogin), never trusted as-is.
 */
export function isActiveLoginMatch(
  active: { userId: string } | null,
  userId: string
): boolean {
  return active !== null && active.userId === userId;
}
