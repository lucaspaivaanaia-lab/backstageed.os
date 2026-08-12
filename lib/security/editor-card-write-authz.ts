/**
 * Pure authorization predicate for updateCardDescriptionAsEditor
 * (app/editor/actions.ts) -- 04-01 Task 5, third/final revision of this
 * plan. The INVERSE shape of isBoardWriteAuthorized
 * (lib/security/board-write-authz.ts, which allows role in ('admin','pm')):
 * this predicate allows ONLY an approved Editor.
 *
 * Migration 0032 (Task 1, same wave) widens cards_select_scoped/
 * cards_update_scoped with a Client-role OR-branch (own client_id +
 * stage = 'aprovacao_cliente' for select, stage in ('aprovacao_cliente',
 * 'producao', 'agendamento') for the with-check on update).
 * updateCardDescriptionAsEditor had ZERO role/status check of its own --
 * only `if (!user) return { error: NOT_AUTHENTICATED_ERROR };` -- and
 * relied entirely on RLS. Once migration 0032 lands, an authenticated
 * Client caller invoking this Server Action directly (Next.js Server
 * Actions are reachable by their Next-Action reference regardless of which
 * page renders the trigger) on one of their own client's cards currently
 * in aprovacao_cliente would have its re-read succeed (new Client SELECT
 * branch matches) and its `.update({ description, updated_at })` succeed
 * (new Client UPDATE branch's using/with check both match, since the
 * payload never touches stage) -- a live, RLS-permitted write-boundary
 * bypass of approveCard/requestAdjustment's hardcoded payload builders, not
 * defense-in-depth. This predicate is the PRIMARY boundary closing it --
 * cards_update_scoped's media_assignee_id branch (migration 0031) remains
 * defense in depth only, same "database layer independently correct"
 * philosophy as the rest of this codebase.
 *
 * Fail-closed contract: any profile-read error, including "no row", is
 * treated as unauthorized -- mirrored by the `profile === null`
 * short-circuit below (assertEditorCaller, app/editor/actions.ts, passes
 * `null` whenever its own profile re-read errors).
 *
 * Do NOT reuse isBoardWriteAuthorized (wrong shape -- allows admin/pm, not
 * editor) or isEditorProvisionAuthorized (lib/security/editor-access-authz.ts
 * -- governs WHO may PROVISION an Editor login, a different question from
 * WHO this action's caller must be).
 *
 * Free of any Supabase client import or I/O, exercised by its sibling
 * editor-card-write-authz.test.ts with Node's built-in test runner -- no
 * live DB, same convention as board-write-authz.ts/editor-access-authz.ts.
 */
export function isEditorCardWriteAuthorized(
  profile: { role: string | null; status: string | null } | null
): boolean {
  return profile?.status === "approved" && profile.role === "editor";
}
