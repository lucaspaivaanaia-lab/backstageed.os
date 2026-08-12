/**
 * Pure authorization predicate for the PM/Admin-facing card-write Server
 * Actions in app/pm/board/actions.ts (updateCardDetails, advanceStage,
 * moveCard). Mirrors the exact "profiles.status === 'approved' &&
 * role in ('admin','pm')" app-layer check already established by
 * createClientRecord (lib/actions/clients.ts) and forceAdvanceOverride's
 * own stricter admin-only variant (lib/actions/card-overrides.ts) -- RLS
 * is defense in depth, never the primary gate, same precedent.
 *
 * Added by the 260811-oe0 checker revision: migration 0031 widened
 * cards_update_scoped to include `media_assignee_id = auth.uid()` so a
 * dedicated, column-restricted Editor Server Action
 * (updateCardDescriptionAsEditor, app/editor/actions.ts) could reach its
 * own assigned cards. Because Next.js Server Actions are resolved by a
 * Next-Action header, not by which page rendered them, an authenticated
 * Editor could otherwise invoke updateCardDetails/advanceStage/moveCard
 * DIRECTLY on any card where they are media_assignee_id -- these three
 * actions had no role check of their own and relied entirely on RLS, so
 * the RLS widening alone would have let an Editor advance stage,
 * reassign, or edit Canal/Prazo, breaking this plan's own locked
 * must-have ("Editor nunca pode... estruturalmente, não só por
 * convenção").
 *
 * Free of any Supabase client import or I/O, exercised by its sibling
 * board-write-authz.test.ts with Node's built-in test runner -- no live
 * DB, same convention as client-access-authz.ts/editor-access-authz.ts.
 */
export function isBoardWriteAuthorized(
  profile: { role: string | null; status: string | null } | null
): boolean {
  return (
    profile?.status === "approved" &&
    (profile.role === "admin" || profile.role === "pm")
  );
}
