"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import {
  approveCardSchema,
  requestAdjustmentSchema,
  type ApproveCardInput,
  type RequestAdjustmentInput,
} from "@/lib/validation/cards";
import { buildClientApprovePayload } from "@/lib/security/client-card-write-scope";

const NOT_AUTHENTICATED_ERROR = "Não autenticado.";
const CLIENT_ONLY_ERROR = "Apenas o Cliente pode realizar esta ação.";
const CARD_NOT_FOUND_ERROR = "Card não encontrado.";
const WRONG_STAGE_ERROR = "Este conteúdo não está mais disponível para revisão.";
const ACTION_SAVE_ERROR = "Não foi possível registrar sua avaliação. Tente novamente.";

/**
 * App-layer authorization — the PRIMARY boundary for approveCard/
 * requestAdjustment below (APR-02/APR-03, T-04-04b). Re-reads the caller's
 * own profiles row directly, mirroring assertPmOrAdminCaller's (app/pm/
 * board/actions.ts) and assertEditorCaller's (app/editor/actions.ts) exact
 * shape and "fails closed on any read error, including no row" discipline.
 * migration 0032's Client branch on cards_select_scoped/cards_update_scoped
 * is defense in depth here, never the primary gate — this function is what
 * actually proves the caller is an approved Client before either action
 * below touches a card row.
 */
async function assertClientCaller(
  supabase: Awaited<ReturnType<typeof createClient>>,
  userId: string
): Promise<boolean> {
  const { data: profile, error } = await supabase
    .from("profiles")
    .select("role, status")
    .eq("id", userId)
    .single();
  if (error) return false;
  return profile?.status === "approved" && profile.role === "client";
}

export type ApproveCardResult = { error?: string };

/**
 * The Client's one-click approval action (APR-02, KAN-04). Re-reads the
 * target card's stage through RLS immediately before writing — never trusts
 * a stage claim from the browser (T-04-02b) — then writes EXCLUSIVELY
 * through buildClientApprovePayload's hardcoded {stage, updated_at} shape
 * (T-04-05), via a plain `.update()`: 'agendamento' (this action's only
 * legal target stage) IS inside cards_select_scoped's own Client branch
 * (migration 0032), so the post-image row remains visible under RLS and no
 * SECURITY DEFINER RPC is needed here — see 04-01-SUMMARY.md's own decision
 * note and this migration file's header comment for why requestAdjustment
 * below is different.
 */
export async function approveCard(input: ApproveCardInput): Promise<ApproveCardResult> {
  const parsed = approveCardSchema.safeParse(input);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Dados inválidos." };
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: NOT_AUTHENTICATED_ERROR };

  if (!(await assertClientCaller(supabase, user.id))) {
    return { error: CLIENT_ONLY_ERROR };
  }

  const { data: card } = await supabase
    .from("cards")
    .select("id, stage")
    .eq("id", parsed.data.cardId)
    .single();
  if (!card) return { error: CARD_NOT_FOUND_ERROR };
  if (card.stage !== "aprovacao_cliente") return { error: WRONG_STAGE_ERROR };

  const { error } = await supabase
    .from("cards")
    .update(buildClientApprovePayload(card.stage))
    .eq("id", parsed.data.cardId);

  if (error) return { error: ACTION_SAVE_ERROR };

  revalidatePath("/client");
  return {};
}

export type RequestAdjustmentResult = { error?: string };

/**
 * The Client's "Solicitar ajuste" action (APR-03, KAN-04). Same stage-gate
 * discipline as approveCard above, but the actual write CANNOT be a plain
 * `.update()`: 04-01's own execution discovered, live, that Postgres
 * requires an UPDATE's post-image row to also satisfy the table's SELECT
 * policy, and a Client must never SELECT a 'producao' card (locked
 * must-have) — so this transition is structurally unreachable via RLS
 * alone. Instead this calls `client_request_adjustment`, the SECURITY
 * DEFINER RPC migration 0032 added specifically for this one transition —
 * it re-derives caller identity/status, row ownership, and the current-stage
 * gate itself before writing, so the app-layer re-read below is a
 * fail-fast/better-UX check, not the only boundary. See
 * supabase/migrations/0032_client_approval_scheduling.sql Section 4 and
 * 04-01-SUMMARY.md's "Decisions Made" for the full reasoning.
 */
export async function requestAdjustment(
  input: RequestAdjustmentInput
): Promise<RequestAdjustmentResult> {
  const parsed = requestAdjustmentSchema.safeParse(input);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Dados inválidos." };
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: NOT_AUTHENTICATED_ERROR };

  if (!(await assertClientCaller(supabase, user.id))) {
    return { error: CLIENT_ONLY_ERROR };
  }

  const { data: card } = await supabase
    .from("cards")
    .select("id, stage")
    .eq("id", parsed.data.cardId)
    .single();
  if (!card) return { error: CARD_NOT_FOUND_ERROR };
  if (card.stage !== "aprovacao_cliente") return { error: WRONG_STAGE_ERROR };

  const { error } = await supabase.rpc("client_request_adjustment", {
    p_card_id: parsed.data.cardId,
    p_comment: parsed.data.comment,
  });

  if (error) return { error: ACTION_SAVE_ERROR };

  revalidatePath("/client");
  return {};
}
