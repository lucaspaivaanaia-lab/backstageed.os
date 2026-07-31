"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { nextStage } from "@/lib/cards/stages";
import {
  createCardSchema,
  advanceStageSchema,
  type CreateCardInput,
  type AdvanceStageInput,
} from "@/lib/validation/cards";

const CARD_CREATE_ERROR = "Não foi possível criar o card. Tente novamente.";
const CARD_NOT_FOUND_ERROR = "Card não encontrado.";
const LAST_STAGE_ERROR = "Este card já está na última etapa.";

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
