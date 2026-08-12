import { nextStage } from "../cards/stages.ts";

/**
 * Pure payload-shape guarantee for the Client's two write actions
 * (approveCard/requestAdjustment, Wave 2's 04-02) -- KAN-04, APR-02, APR-03.
 * RLS (migration 0032's Client branch on cards_update_scoped) decides WHICH
 * card rows a Client may reach; this module decides WHICH COLUMNS --
 * Postgres RLS has no native column-level policy, so the Server Action's
 * hardcoded update payload is the ONLY boundary preventing a Client from
 * writing client_id/channel/assignee_id/media_assignee_id/due_date/
 * publish_at, exactly the same "RLS decides rows, the Server Action decides
 * columns" split lib/security/editor-card-write-scope.ts already established
 * for the Editor role.
 *
 * Free of any Supabase/React import or I/O, so this module can be exercised
 * by its sibling client-card-write-scope.test.ts with Node's built-in test
 * runner -- no live DB, mirrors editor-card-write-scope.ts's own convention.
 */
export const CLIENT_APPROVE_UPDATE_KEYS = ["stage", "updated_at"] as const;

export const CLIENT_ADJUST_UPDATE_KEYS = [
  "stage",
  "client_adjustment_comment",
  "updated_at",
] as const;

export function buildClientApprovePayload(currentStage: "aprovacao_cliente"): {
  stage: ReturnType<typeof nextStage>;
  updated_at: string;
} {
  return { stage: nextStage(currentStage), updated_at: new Date().toISOString() };
}

export function buildClientAdjustPayload(comment: string): {
  stage: "producao";
  client_adjustment_comment: string;
  updated_at: string;
} {
  return {
    stage: "producao",
    client_adjustment_comment: comment,
    updated_at: new Date().toISOString(),
  };
}
