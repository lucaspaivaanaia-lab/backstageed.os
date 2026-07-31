"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { nextStage, STAGE_ORDER } from "@/lib/cards/stages";
import { isGateBlocked, GATE_BLOCKED_MESSAGE } from "@/lib/cards/checklist-gate";
import { snapshotChecklistForCard } from "@/lib/cards/checklist-snapshot";
import { evaluateMove } from "@/lib/cards/move-rules";
import {
  createCardSchema,
  advanceStageSchema,
  toggleChecklistItemSchema,
  moveCardSchema,
  type CreateCardInput,
  type AdvanceStageInput,
  type ToggleChecklistItemInput,
  type MoveCardInput,
} from "@/lib/validation/cards";

const CARD_CREATE_ERROR = "Não foi possível criar o card. Tente novamente.";
const CARD_NOT_FOUND_ERROR = "Card não encontrado.";
const LAST_STAGE_ERROR = "Este card já está na última etapa.";
const NOT_AUTHENTICATED_ERROR = "Não autenticado.";
const MOVE_FAILED_ERROR = "Não foi possível mover o card. Tente novamente.";

export type CreateCardResult =
  | { success: true; cardId: string }
  | { error: string };

/**
 * Create a content card (KAN-01, single-post path this plan; package option
 * is added to this same selector by plan 03-06). Both this action and
 * advanceStage below are RLS-scoped only, never the service-role client —
 * a PM writing a card for their own assigned client is exactly what
 * `cards_insert_scoped` permits (03-02-PLAN.md threat T-03-08), so no
 * privilege escalation is warranted.
 */
export async function createCard(
  input: CreateCardInput
): Promise<CreateCardResult> {
  const parsed = createCardSchema.safeParse(input);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Dados inválidos." };
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Não autenticado." };

  // Re-resolve the client via RLS — never trust the clientId argument on
  // its own (T-03-08). A null result means the caller is not assigned to
  // that client.
  const { data: client } = await supabase
    .from("clients")
    .select("id")
    .eq("id", parsed.data.clientId)
    .single();

  if (!client) {
    return { error: CARD_CREATE_ERROR };
  }

  const { data: card, error: insertError } = await supabase
    .from("cards")
    .insert({
      client_id: client.id,
      title: parsed.data.title,
      card_type: parsed.data.cardType,
      created_by: user.id,
      // The cards_package_has_no_stage check constraint enforces this at
      // the database layer as well — never leave stage to convention.
      stage: parsed.data.cardType === "single" ? "briefing" : null,
    })
    .select("id")
    .single();

  if (insertError || !card) {
    return { error: CARD_CREATE_ERROR };
  }

  revalidatePath("/pm/board");
  return { success: true, cardId: card.id };
}

export type AdvanceStageResult = { error?: string };

/**
 * Advance a card to the next stage via an explicit "Avançar" action (D-05,
 * no drag-and-drop). The target stage is NEVER a caller-supplied parameter
 * — it is always derived server-side from `nextStage(card.stage)` after
 * re-reading the card through RLS (T-03-09).
 */
export async function advanceStage(
  input: AdvanceStageInput
): Promise<AdvanceStageResult> {
  const parsed = advanceStageSchema.safeParse(input);
  if (!parsed.success) {
    return { error: CARD_NOT_FOUND_ERROR };
  }

  const supabase = await createClient();

  const { data: card } = await supabase
    .from("cards")
    .select("id, client_id, stage, card_type")
    .eq("id", parsed.data.cardId)
    .single();

  // A package parent has no stage of its own (D-02) — treat it the same as
  // "not found" for this action, it is never advance-able directly.
  if (!card || !card.stage) {
    return { error: CARD_NOT_FOUND_ERROR };
  }

  const target = nextStage(card.stage);
  if (target === null) {
    return { error: LAST_STAGE_ERROR };
  }

  // Block A — the gate (CHK-03, T-03-12): re-read the card's own checklist
  // rows server-side, never accept a completion claim from the caller (the
  // client never sends one). Evaluated BEFORE computing/applying the
  // update, only when the card is currently in revisão interna.
  //
  // (a) The Admin override lives in a separate exported action (plan
  //     03-05's `forceAdvanceOverride`).
  // (b) The drag-triggered path lives in a separate exported action (plan
  //     03-07's `moveCard`), which re-runs this same predicate.
  // (c) This function must never gain a bypass parameter — a second
  //     bypass path here would defeat the CHK-04 audit guarantee.
  if (card.stage === "revisao_interna") {
    const { data: items } = await supabase
      .from("card_checklist_items")
      .select("completed_at")
      .eq("card_id", card.id);

    if (isGateBlocked(items ?? [])) {
      return { error: GATE_BLOCKED_MESSAGE };
    }
  }

  // Block B — the snapshot (D-04), executed when the card is ENTERING
  // revisão interna, BEFORE the stage update. Order matters and is
  // deliberate (03-RESEARCH.md Pitfall 3): the snapshot insert runs FIRST
  // and its error is checked; only on success does the stage update run.
  // The Supabase JS client offers no multi-statement transaction, so this
  // ordering is what makes a mid-request failure fail safe — worst case
  // the card stays put with an inert item list, never advances with an
  // unguarded empty one.
  if (target === "revisao_interna") {
    const snap = await snapshotChecklistForCard(
      supabase,
      card.id,
      card.client_id
    );
    if (!snap.ok) {
      return { error: snap.error };
    }
  }

  const { error } = await supabase
    .from("cards")
    .update({ stage: target, updated_at: new Date().toISOString() })
    .eq("id", parsed.data.cardId);

  if (error) {
    return { error: error.message };
  }

  revalidatePath("/pm/board");
  return {};
}

export type ToggleChecklistItemResult = { error?: string };

/**
 * Records who checked/unchecked a checklist item and when (CHK-03, CHK-04,
 * T-03-13). The RLS write policy from Task 1
 * (`card_checklist_items_write_scoped`) is what scopes this to the
 * caller's assigned clients — no `card_id`/`client_id` argument is ever
 * accepted from the browser, so an item id belonging to another client's
 * card simply matches no row (T-03-14).
 */
export async function toggleChecklistItem(
  input: ToggleChecklistItemInput
): Promise<ToggleChecklistItemResult> {
  const parsed = toggleChecklistItemSchema.safeParse(input);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Dados inválidos." };
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: NOT_AUTHENTICATED_ERROR };

  const { error } = await supabase
    .from("card_checklist_items")
    .update({
      completed_at: parsed.data.completed ? new Date().toISOString() : null,
      completed_by: parsed.data.completed ? user.id : null,
    })
    .eq("id", parsed.data.itemId);

  if (error) {
    return { error: error.message };
  }

  revalidatePath("/pm/board");
  return {};
}

export type MoveCardResult = { error?: string };

/**
 * Place a card in an arbitrary column (KAN-02, D-12, plan 03-08's drag
 * handler). Unlike advanceStage above, this action DOES accept a
 * caller-supplied target stage, because drag-and-drop is inherently "put it
 * here" rather than "go one step forward" -- that makes the target an
 * untrusted input. Three things make it safe: (a) the zod enum in
 * moveCardSchema, which bounds it to the five real stages, (b) evaluateMove
 * re-run server-side over a server-side re-read of the checklist, and (c)
 * cards_update_scoped, which bounds the write to the caller's assigned
 * clients. The browser's own copy of evaluateMove (03-08) is a UX
 * affordance only, never the security boundary.
 */
export async function moveCard(input: MoveCardInput): Promise<MoveCardResult> {
  const parsed = moveCardSchema.safeParse(input);
  if (!parsed.success) {
    return { error: CARD_NOT_FOUND_ERROR };
  }

  const supabase = await createClient();

  const { data: card } = await supabase
    .from("cards")
    .select("id, client_id, stage, card_type")
    .eq("id", parsed.data.cardId)
    .single();

  // A package parent has no stage of its own (D-02) — it is never movable,
  // same rule advanceStage already applies.
  if (!card || !card.stage) {
    return { error: CARD_NOT_FOUND_ERROR };
  }

  // A drop back onto the origin column is a silent no-op, not an error.
  if (card.stage === parsed.data.toStage) {
    return {};
  }

  // Never accept a completion claim from the caller — re-read the
  // checklist server-side, exactly like advanceStage does.
  const { data: items } = await supabase
    .from("card_checklist_items")
    .select("completed_at")
    .eq("card_id", card.id);

  const decision = evaluateMove(card.stage, parsed.data.toStage, items ?? []);
  if (!decision.allowed) {
    // Returning decision.reason verbatim is what makes the drag path show
    // the identical GATE_BLOCKED_MESSAGE / MOVE_SKIPS_REVIEW_MESSAGE the
    // button path (or the skip rule) already shows (D-13).
    return { error: decision.reason };
  }

  // Snapshot BEFORE the stage update, same Pitfall 3 ordering advanceStage
  // uses — a mid-request failure must leave the card where it was, never
  // move it into a gated stage with no checklist. snapshotChecklistForCard
  // is idempotent, so dragging a card back and forth across revisão interna
  // never duplicates or resets its items. Unlike createCard, moveCard needs
  // no compensating delete: the card already existed before this request,
  // so the fail-safe here is simply "do not move it".
  if (
    STAGE_ORDER.indexOf(parsed.data.toStage) >=
    STAGE_ORDER.indexOf("revisao_interna")
  ) {
    const snap = await snapshotChecklistForCard(
      supabase,
      card.id,
      card.client_id
    );
    if (!snap.ok) {
      return { error: snap.error };
    }
  }

  const { error: updateError } = await supabase
    .from("cards")
    .update({ stage: parsed.data.toStage, updated_at: new Date().toISOString() })
    .eq("id", card.id);

  if (updateError) {
    return { error: MOVE_FAILED_ERROR };
  }

  revalidatePath("/pm/board");
  return {};
}
