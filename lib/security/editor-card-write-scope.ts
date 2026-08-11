/**
 * Pure payload-shape guarantee for the Editor's card-description write
 * (item 3, 260811-oe0-CONTEXT.md/-RESEARCH.md Section 3, Design A). RLS
 * (cards_update_scoped's media_assignee_id branch, migration 0031) decides
 * WHICH card rows an Editor may reach; this module decides WHICH COLUMNS --
 * Postgres RLS has no native column-level policy, so the Server Action's
 * hardcoded update payload is the ONLY boundary preventing an Editor from
 * writing stage/assignee_id/media_assignee_id/channel/due_date, exactly the
 * same "RLS decides rows, the Server Action decides columns" split every
 * other action in app/pm/board/actions.ts already follows (e.g.
 * toggleChecklistItem never writes label/sort_order regardless of caller).
 *
 * Free of any Supabase client import or I/O, so this module can be
 * exercised by its sibling editor-card-write-scope.test.ts with Node's
 * built-in test runner -- no live DB, mirrors client-access-authz.ts's own
 * convention.
 */
export const EDITOR_CARD_UPDATE_KEYS = ["description", "updated_at"] as const;

export function buildEditorCardUpdatePayload(description: string | null): {
  description: string | null;
  updated_at: string;
} {
  return { description, updated_at: new Date().toISOString() };
}
