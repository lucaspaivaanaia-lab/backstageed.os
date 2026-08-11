/**
 * Pure authorization predicate for createEditorLogin (item 3,
 * 260811-oe0-CONTEXT.md). Intentionally free of any Supabase client import
 * or I/O, mirroring client-access-authz.ts's own convention -- exercised by
 * its sibling editor-access-authz.test.ts with Node's built-in test
 * runner, no live DB.
 */

/**
 * Editor provisioning is authorized for is_admin() OR is_pm() (ANY
 * approved PM, not scoped to a specific client) -- unlike Client
 * provisioning (isClientActionAuthorized, client-access-authz.ts), which
 * requires the caller to manage the ONE client the login is scoped to. An
 * Editor account has no such single owning client.
 */
export function isEditorProvisionAuthorized(input: {
  isAdmin: boolean;
  isPm: boolean;
}): boolean {
  return input.isAdmin || input.isPm;
}
