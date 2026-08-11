"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { nextStage, STAGE_ORDER } from "@/lib/cards/stages";
import { isGateBlocked, GATE_BLOCKED_MESSAGE } from "@/lib/cards/checklist-gate";
import { snapshotChecklistForCard } from "@/lib/cards/checklist-snapshot";
import { evaluateMove } from "@/lib/cards/move-rules";
import { isLikelyDriveLink, INVALID_DRIVE_LINK_MESSAGE } from "@/lib/attachments/drive-url";
import { runStructuredExtraction } from "@/lib/ai/structured-extraction";
import { planningDocToExtractionFile } from "@/lib/cards/package-proposal";
import {
  createCardSchema,
  advanceStageSchema,
  toggleChecklistItemSchema,
  moveCardSchema,
  updateCardDetailsSchema,
  attachDriveLinkSchema,
  removeAttachmentSchema,
  createPieceSchema,
  removePieceSchema,
  proposePackagePiecesSchema,
  packagePiecesProposalSchema,
  type CreateCardInput,
  type AdvanceStageInput,
  type ToggleChecklistItemInput,
  type MoveCardInput,
  type UpdateCardDetailsInput,
  type AttachDriveLinkInput,
  type RemoveAttachmentInput,
  type CreatePieceInput,
  type RemovePieceInput,
  type ProposePackagePiecesInput,
  type PackagePieceProposal,
} from "@/lib/validation/cards";

const CARD_CREATE_ERROR = "Não foi possível criar o card. Tente novamente.";
const CARD_NOT_FOUND_ERROR = "Card não encontrado.";
const LAST_STAGE_ERROR = "Este card já está na última etapa.";
const NOT_AUTHENTICATED_ERROR = "Não autenticado.";
const MOVE_FAILED_ERROR = "Não foi possível mover o card. Tente novamente.";
const ASSIGNEE_NOT_ON_CLIENT_ERROR =
  "Este PM não está atribuído a este cliente.";
const MEDIA_ASSIGNEE_NOT_ON_CLIENT_ERROR =
  "Este Designer/Mídia não está atribuído a este cliente.";
const CARD_ROLLBACK_FAILED_ERROR =
  "O card foi criado mas o checklist falhou e não foi possível desfazer. Avise o administrador antes de usar este card.";
const CARD_SAVE_ERROR = "Não foi possível salvar o card. Tente novamente.";
const PACKAGE_NOT_FOUND_ERROR = "Pacote não encontrado.";
const PIECE_PARENT_MUST_BE_PACKAGE_ERROR =
  "Só é possível adicionar peças a um pacote.";
const PIECE_CREATE_ERROR = "Não foi possível criar a peça. Tente novamente.";
const PIECE_NOT_FOUND_ERROR = "Peça não encontrada.";
const PIECE_MUST_BE_PIECE_ERROR = "Só é possível excluir peças.";
const PIECE_DELETE_ERROR = "Não foi possível excluir a peça. Tente novamente.";
const PACKAGE_PROPOSAL_CLIENT_NOT_FOUND_ERROR = "Cliente não encontrado.";
const PACKAGE_PROPOSAL_INVALID_RESULT_ERROR =
  "A IA retornou um resultado inesperado. Tente novamente ou crie as peças manualmente.";

/**
 * Maps migration 0017's deliberate `assignee_not_assigned_to_client`
 * exception token (cards_assignee_membership_trg) to user-facing
 * Portuguese. The trigger — not this mapping — is the actual boundary
 * (D-19); this function only translates its failure for display.
 */
function isAssigneeMembershipError(error: { message?: string } | null): boolean {
  return Boolean(error?.message?.includes("assignee_not_assigned_to_client"));
}

/**
 * Maps this plan's (0029) distinct 'media_assignee_not_on_roster' exception
 * token to user-facing Portuguese -- a SEPARATE token from
 * isAssigneeMembershipError's 'assignee_not_assigned_to_client' above,
 * deliberately non-overlapping, so the two violations are never confused.
 */
function isMediaAssigneeMembershipError(error: { message?: string } | null): boolean {
  return Boolean(error?.message?.includes("media_assignee_not_on_roster"));
}

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

  // D-14: a card may be created directly in any of the five columns, not
  // only Briefing. Defaulting to "briefing" preserves the pre-D-14
  // behaviour of the top-level "Criar card" button, which simply omits
  // `stage`. A package card never has a stage of its own (D-02) —
  // cards_package_has_no_stage enforces this at the database layer too.
  const targetStage =
    parsed.data.cardType === "package"
      ? null
      : parsed.data.stage ?? "briefing";

  const { data: card, error: insertError } = await supabase
    .from("cards")
    .insert({
      client_id: client.id,
      title: parsed.data.title,
      card_type: parsed.data.cardType,
      created_by: user.id,
      // The cards_package_has_no_stage check constraint enforces this at
      // the database layer as well — never leave stage to convention.
      stage: targetStage,
      description:
        parsed.data.description && parsed.data.description.length > 0
          ? parsed.data.description
          : null,
      assignee_id: parsed.data.assigneeId ?? null,
      media_assignee_id: parsed.data.mediaAssigneeId ?? null,
      channel: parsed.data.channel,
    })
    .select("id")
    .single();

  if (insertError || !card) {
    if (isAssigneeMembershipError(insertError)) {
      return { error: ASSIGNEE_NOT_ON_CLIENT_ERROR };
    }
    if (isMediaAssigneeMembershipError(insertError)) {
      return { error: MEDIA_ASSIGNEE_NOT_ON_CLIENT_ERROR };
    }
    return { error: CARD_CREATE_ERROR };
  }

  // D-15 snapshot-on-create with a result-checked compensating delete. The
  // card row and its checklist cannot be written in one transaction through
  // the Supabase JS client, and D-15 requires that a card created directly
  // in revisão interna or later ALWAYS carries its snapshot — so the only
  // fail-safe outcome is "no card at all", never "a card sitting in a
  // gated column with no checklist and therefore a vacuously-passing gate".
  if (
    targetStage !== null &&
    STAGE_ORDER.indexOf(targetStage) >= STAGE_ORDER.indexOf("revisao_interna")
  ) {
    const snap = await snapshotChecklistForCard(supabase, card.id, client.id);
    if (!snap.ok) {
      // The delete works because migration 0017 (Task 1 of this plan)
      // ships `grant delete on public.cards to authenticated` plus the
      // `cards_delete_scoped` policy; pgTAP 0009 assertions 5–7 prove it.
      const { error: rollbackError } = await supabase
        .from("cards")
        .delete()
        .eq("id", card.id);

      if (rollbackError) {
        // The fail-safe itself failed: a card is now sitting in a gated
        // column with no checklist, so isGateBlocked([]) would pass
        // vacuously. This must never be silent (CHK-04) -- log the full
        // picture and tell the user the card is not safe to use.
        console.error("[createCard] D-15 compensating delete failed", {
          cardId: card.id,
          stage: targetStage,
          snapshotError: snap.error,
          rollbackError,
        });
        return { error: CARD_ROLLBACK_FAILED_ERROR };
      }

      return { error: snap.error };
    }
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

export type UpdateCardDetailsResult = { error?: string };

/**
 * Edit a card's description and/or assignee (KAN-01, D-16, D-19). This
 * action never accepts a `clientId` — the assignee's legality is decided by
 * cards_assignee_membership_trg against the card's OWN client_id, which the
 * browser cannot influence.
 */
export async function updateCardDetails(
  input: UpdateCardDetailsInput
): Promise<UpdateCardDetailsResult> {
  const parsed = updateCardDetailsSchema.safeParse(input);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Dados inválidos." };
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: NOT_AUTHENTICATED_ERROR };

  // Re-read the card through RLS — never trust that cardId belongs to a
  // client the caller can reach; cards_update_scoped is the real boundary.
  const { data: card } = await supabase
    .from("cards")
    .select("id")
    .eq("id", parsed.data.cardId)
    .single();
  if (!card) return { error: CARD_NOT_FOUND_ERROR };

  const { error } = await supabase
    .from("cards")
    .update({
      description:
        parsed.data.description && parsed.data.description.length > 0
          ? parsed.data.description
          : null,
      assignee_id: parsed.data.assigneeId,
      media_assignee_id: parsed.data.mediaAssigneeId,
      channel: parsed.data.channel,
      due_date: parsed.data.dueDate,
      updated_at: new Date().toISOString(),
    })
    .eq("id", parsed.data.cardId);

  if (error) {
    if (isAssigneeMembershipError(error)) {
      return { error: ASSIGNEE_NOT_ON_CLIENT_ERROR };
    }
    if (isMediaAssigneeMembershipError(error)) {
      return { error: MEDIA_ASSIGNEE_NOT_ON_CLIENT_ERROR };
    }
    return { error: CARD_SAVE_ERROR };
  }

  revalidatePath("/pm/board");
  return {};
}

export type AddAttachmentResult = { error?: string };

/**
 * Attach a Google Drive link to a card (KAN-05, D-07/D-08/D-09). The
 * browser's own `isLikelyDriveLink` check (board-panel.tsx) is a UX
 * affordance only — a stored URL is later rendered as a clickable new-tab
 * link, so this re-run against the SAME shared module is the actual
 * boundary (03-RESEARCH.md Pitfall 5, T-03-18).
 */
export async function addAttachment(
  input: AttachDriveLinkInput
): Promise<AddAttachmentResult> {
  const parsed = attachDriveLinkSchema.safeParse(input);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Dados inválidos." };
  }

  if (!isLikelyDriveLink(parsed.data.url)) {
    return { error: INVALID_DRIVE_LINK_MESSAGE };
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: NOT_AUTHENTICATED_ERROR };

  // Re-read the card through RLS — never trust that cardId belongs to a
  // client the caller can reach; cards_select_scoped is the real boundary.
  const { data: card } = await supabase
    .from("cards")
    .select("id")
    .eq("id", parsed.data.cardId)
    .single();
  if (!card) return { error: CARD_NOT_FOUND_ERROR };

  const { error } = await supabase.from("card_attachments").insert({
    card_id: parsed.data.cardId,
    url: parsed.data.url,
    label: parsed.data.label && parsed.data.label.length > 0 ? parsed.data.label : null,
    link_type: parsed.data.linkType,
    created_by: user.id,
  });

  if (error) {
    return { error: error.message };
  }

  revalidatePath("/pm/board");
  return {};
}

export type RemoveAttachmentResult = { error?: string };

/**
 * Remove a Drive attachment. No `cardId`/`clientId` is ever accepted from
 * the browser — the `card_attachments_delete_scoped` RLS policy (migration
 * 0018) is what scopes this to the caller's assigned clients, so a foreign
 * attachment id simply matches no row.
 */
export async function removeAttachment(
  input: RemoveAttachmentInput
): Promise<RemoveAttachmentResult> {
  const parsed = removeAttachmentSchema.safeParse(input);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Dados inválidos." };
  }

  const supabase = await createClient();

  const { error } = await supabase
    .from("card_attachments")
    .delete()
    .eq("id", parsed.data.attachmentId);

  if (error) {
    return { error: error.message };
  }

  revalidatePath("/pm/board");
  return {};
}

export type ChecklistValidationItemResult = {
  itemId: string;
  label: string;
  passed: boolean;
  justification: string;
};

export type ValidateCardResult =
  | {
      success: true;
      results: ChecklistValidationItemResult[];
      revisedDescription: string | null;
      previousDescription: string;
    }
  | { error: string };

const VALIDATE_NO_CHECKLIST_ERROR =
  "Este card ainda não tem itens de checklist para validar.";
const VALIDATE_INVALID_RESULT_ERROR =
  "A IA retornou um resultado inesperado. Revise o checklist manualmente.";

/**
 * "Revalidar" (P0 pivot 2026-08-04, item 3; content self-correction added
 * by quick task 260808-ci5, item 2 — D-06-amendment). Every click re-reads
 * the card's CURRENT title/description, the client's CURRENT
 * `client_files`, and the card's CURRENT checklist items, and returns a
 * fresh pass/fail-with-justification verdict per item — this per-item
 * report is STILL purely advisory and NEVER persisted (no write to
 * `card_checklist_items`), exactly as before. It does NOT touch
 * `completed_at`/`completed_by` (the PM's own manual check-off, CHK-03/
 * CHK-04's actual audit trail) and it does NOT gate "Avançar" in any way
 * (no new state machine, no auto-advance — the PM can ignore the AI's
 * verdict and advance manually exactly as before).
 *
 * NEW in 260808-ci5 (D-06-amendment — supersedes D-06 for `description`
 * ONLY): the same call also asks the model to return a full rewritten post
 * text that maximizes the chance of passing every checklist item, and — if
 * that text differs from the card's current description — WRITES it
 * straight to `cards.description` in this same request, no confirmation
 * dialog first. This is the ONLY behavioral change from the original
 * advisory-only version; the hard boundary (see the write below) is that
 * this function NEVER writes `card_checklist_items` and NEVER calls
 * `advanceStage`/`moveCard` — CHK-03's manual-conference gate stays
 * completely untouched.
 *
 * Items are matched to results BY ARRAY POSITION, not by asking the model
 * to echo back a UUID — the instruction lists items as "1. label\n2.
 * label...", the tool schema asks for a same-length, same-order results
 * array, and this function zips index i's item back onto index i's
 * result. A model that returns the wrong array length is treated as an
 * invalid result (VALIDATE_INVALID_RESULT_ERROR), never partially applied.
 *
 * Reuses the SAME shared engine (lib/ai/structured-extraction.ts) that
 * checklist generation and briefing auto-fill use.
 */
export async function validateCardAgainstChecklist(
  cardId: string
): Promise<ValidateCardResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: NOT_AUTHENTICATED_ERROR };

  // Re-read the card through RLS — never trust that cardId belongs to a
  // client the caller can reach; cards_select_scoped is the real boundary.
  const { data: card } = await supabase
    .from("cards")
    .select("id, title, description, client_id")
    .eq("id", cardId)
    .single();
  if (!card) return { error: CARD_NOT_FOUND_ERROR };

  const { data: client } = await supabase
    .from("clients")
    .select("id, name, tag")
    .eq("id", card.client_id)
    .single();
  if (!client) return { error: CARD_NOT_FOUND_ERROR };

  const { data: items } = await supabase
    .from("card_checklist_items")
    .select("id, label, sort_order")
    .eq("card_id", cardId)
    .order("sort_order", { ascending: true });

  if (!items || items.length === 0) {
    return { error: VALIDATE_NO_CHECKLIST_ERROR };
  }

  const { data: clientFiles } = await supabase
    .from("client_files")
    .select("filename, content")
    .eq("client_id", card.client_id);

  const cardContentFile = {
    filename: "Conteúdo do card (título + descrição)",
    content: `Título: ${card.title}\n\nDescrição: ${card.description ?? "(sem descrição)"}`,
  };

  const itemsList = items
    .map((item, i) => `${i + 1}. ${item.label}`)
    .join("\n");

  // Quick task 260811-imw: unfiltered select — shared_knowledge_files has
  // no client_id column; shared_knowledge_files_select_all_authenticated
  // (open to any authenticated role by design) is the real boundary here,
  // via the SAME RLS-scoped supabase client already in scope above.
  const { data: sharedKnowledgeFiles } = await supabase
    .from("shared_knowledge_files")
    .select("filename, content");
  const sharedFiles = sharedKnowledgeFiles ?? [];

  const result = await runStructuredExtraction({
    clientName: client.name,
    clientTag: client.tag,
    files: [cardContentFile, ...(clientFiles ?? [])],
    sharedFiles,
    instruction:
      "Avalie o conteúdo do card acima (arquivo 'Conteúdo do card') " +
      "contra CADA item do checklist de revisão abaixo, usando também os " +
      "demais arquivos de referência do cliente como critério (manual de " +
      "marca, regras de conteúdo, etc.). Para cada item, NA MESMA ORDEM " +
      "listada, diga se o conteúdo PASSA ou NÃO PASSA nesse critério, com " +
      "uma justificativa curta (1 frase, em português). Retorne exatamente " +
      `${items.length} resultado(s), um por item, na mesma ordem.\n\n` +
      `Checklist:\n${itemsList}\n\n` +
      "Além disso, reescreva o TEXTO COMPLETO do rascunho do post " +
      "('revisedDescription') de forma a maximizar a chance de passar em " +
      "TODOS os itens do checklist, preservando o tom de voz e a intenção " +
      "original do cliente — não invente informações novas, apenas " +
      "ajuste/corrija o texto existente. Se o conteúdo já passa em todos " +
      "os itens, retorne o texto original sem alterações em " +
      "'revisedDescription'.",
    toolName: "report_validation",
    toolDescription:
      "Registra o resultado da validação de cada item do checklist, na ordem dada, e o texto revisado do rascunho do post.",
    inputSchema: {
      type: "object",
      properties: {
        results: {
          type: "array",
          items: {
            type: "object",
            properties: {
              passed: { type: "boolean" },
              justification: { type: "string" },
            },
            required: ["passed", "justification"],
          },
        },
        revisedDescription: {
          type: "string",
          description:
            "Texto completo do rascunho do post, revisado para maximizar a chance de passar em todos os itens do checklist (ou o texto original, sem alterações, se já passa em todos).",
        },
      },
      required: ["results", "revisedDescription"],
    },
  });

  if (!result.ok) {
    return { error: result.error };
  }

  const raw = result.data as { results?: unknown; revisedDescription?: unknown };
  if (!Array.isArray(raw.results) || raw.results.length !== items.length) {
    console.error(
      "[validateCardAgainstChecklist] AI result length mismatch",
      raw
    );
    return { error: VALIDATE_INVALID_RESULT_ERROR };
  }

  const rawResults = raw.results as { passed?: unknown; justification?: unknown }[];
  const results: ChecklistValidationItemResult[] = items.map((item, i) => ({
    itemId: item.id,
    label: item.label,
    passed: rawResults[i]?.passed === true,
    justification:
      typeof rawResults[i]?.justification === "string"
        ? (rawResults[i].justification as string)
        : "",
  }));

  const previousDescription = card.description ?? "";

  // D-06-amendment (260808-ci5): the per-item report above is unaffected by
  // anything below — a model that misbehaves on this NEW field must never
  // break the existing pass/fail report, so a missing/invalid
  // revisedDescription is logged and treated as "no rewrite", not a
  // function-level error.
  let revisedDescription: string | null = null;
  if (
    typeof raw.revisedDescription !== "string" ||
    raw.revisedDescription.trim().length === 0
  ) {
    console.error(
      "[validateCardAgainstChecklist] AI omitted or returned an empty revisedDescription",
      raw
    );
  } else {
    const revisedTrimmed = raw.revisedDescription.trim();
    if (revisedTrimmed !== previousDescription.trim()) {
      // D-06-amendment hard boundary: this write touches ONLY
      // `cards.description`/`updated_at`. It must NEVER be extended to
      // touch `stage`, `assignee_id`, or `card_checklist_items`, and this
      // function must NEVER call `advanceStage`/`moveCard` — CHK-03's
      // manual-conference gate stays completely untouched by this
      // self-correction feature. Uses the SAME RLS-scoped `supabase`
      // client already constructed above (`cards_update_scoped` is the
      // real boundary, identical to `updateCardDetails`).
      const { error: descriptionUpdateError } = await supabase
        .from("cards")
        .update({ description: revisedTrimmed, updated_at: new Date().toISOString() })
        .eq("id", cardId);
      if (descriptionUpdateError) {
        console.error(
          "[validateCardAgainstChecklist] failed to persist revisedDescription",
          descriptionUpdateError
        );
      } else {
        revisedDescription = revisedTrimmed;
      }
    }
  }

  return { success: true, results, revisedDescription, previousDescription };
}

export type CreatePieceResult =
  | { success: true; cardId: string }
  | { error: string };

/**
 * Create a piece under a package (KAN-01 package half, D-01/D-02, plan
 * 03-06, threats T-03-31/T-03-32). A piece always belongs to the SAME
 * client as its parent package: `client_id` is copied from the RE-READ
 * PARENT ROW below, never from any browser-supplied value -- that is what
 * keeps the denormalization consistent and the RLS policies flat, since a
 * piece is scoped by its OWN `client_id`. Letting the browser supply it
 * would be a cross-client write primitive (03-RESEARCH.md Security Domain,
 * the Information Disclosure row).
 */
export async function createPiece(
  input: CreatePieceInput
): Promise<CreatePieceResult> {
  const parsed = createPieceSchema.safeParse(input);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Dados inválidos." };
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: NOT_AUTHENTICATED_ERROR };

  // Re-read the parent through RLS — never trust that parentCardId belongs
  // to a client the caller can reach; cards_select_scoped is the real
  // boundary (T-03-31).
  const { data: parent } = await supabase
    .from("cards")
    .select("id, client_id, card_type")
    .eq("id", parsed.data.parentCardId)
    .single();
  if (!parent) return { error: PACKAGE_NOT_FOUND_ERROR };

  // A piece can only hang off a package, never off a single card or another
  // piece (T-03-32) — cards_piece_requires_parent enforces the non-null
  // parent at the database layer, but not which TYPE of parent, so this
  // app-layer check is the actual boundary for that rule.
  if (parent.card_type !== "package") {
    return { error: PIECE_PARENT_MUST_BE_PACKAGE_ERROR };
  }

  const { data: card, error: insertError } = await supabase
    .from("cards")
    .insert({
      // client_id copied from the RE-READ PARENT ROW, never from any
      // browser-supplied value (T-03-31).
      client_id: parent.client_id,
      parent_card_id: parent.id,
      card_type: "piece",
      stage: "briefing",
      title: parsed.data.title,
      created_by: user.id,
      // Item 2, 260811-nnw (Pitfall 1): was hardcoded null -- now persists
      // an AI-proposed (or manually typed, once the detail Dialog gains a
      // create-time field, out of this plan's scope) description instead of
      // silently discarding it. Same trim-then-null-if-empty rule createCard
      // already applies to its own description field.
      description:
        parsed.data.description && parsed.data.description.length > 0
          ? parsed.data.description
          : null,
      assignee_id: null,
      media_assignee_id: null,
    })
    .select("id")
    .single();

  if (insertError || !card) {
    return { error: PIECE_CREATE_ERROR };
  }

  // A piece always starts at briefing, so no checklist snapshot is needed
  // here — the D-15 snapshot-on-create logic in createCard only fires for
  // cards created directly in revisão interna or later. This piece picks up
  // its own snapshot the normal way, when it first reaches revisão interna
  // via advanceStage or moveCard, exactly like a standalone card.
  revalidatePath("/pm/board");
  return { success: true, cardId: card.id };
}

export type RemovePieceResult = { error?: string };

/**
 * Delete a piece from inside its package's "Ver peças" list (quick task
 * 260808-c9s, T-03-56). `cards_delete_scoped` (0017) is NOT card_type-scoped
 * and must never become so, because createCard's D-15 compensating delete
 * needs it to also cover `single` cards. This function is therefore the
 * ONLY place `card_type='piece'` is enforced for a piece deletion, and it is
 * enforced independent of RLS, not as a substitute for it. Note that
 * `card_checklist_items`, `card_attachments`, and `card_checklist_overrides`
 * all cascade-delete on `card_id` (0016/0018/0022), so no manual cleanup of
 * child rows is needed here.
 */
export async function removePiece(
  input: RemovePieceInput
): Promise<RemovePieceResult> {
  const parsed = removePieceSchema.safeParse(input);
  if (!parsed.success) {
    return { error: PIECE_NOT_FOUND_ERROR };
  }

  const supabase = await createClient();

  // Re-read the target through RLS — never trust a card_type implied by the
  // caller; cards_delete_scoped is the client-scope boundary, but it is NOT
  // type-scoped, so the check below is what actually restricts this action
  // to pieces.
  const { data: card } = await supabase
    .from("cards")
    .select("id, card_type")
    .eq("id", parsed.data.cardId)
    .single();
  if (!card) return { error: PIECE_NOT_FOUND_ERROR };

  if (card.card_type !== "piece") {
    return { error: PIECE_MUST_BE_PIECE_ERROR };
  }

  const { error } = await supabase.from("cards").delete().eq("id", card.id);

  if (error) {
    return { error: PIECE_DELETE_ERROR };
  }

  revalidatePath("/pm/board");
  return {};
}

export type ProposePackagePiecesResult =
  | { success: true; pieces: PackagePieceProposal[] }
  | { error: string };

/**
 * AI proposal step of "IA propõe, humano confirma" for batch package-piece
 * generation (item 2 of the 2026-08-05 action plan's P3,
 * 260811-nnw-CONTEXT.md D-2/D-3/D-4). Mirrors `proposeChecklistFromFiles`'s
 * (lib/actions/checklist-templates.ts) NO-intermediate-write shape exactly,
 * per D-4 -- returns the proposal, writes NOTHING to the database. The
 * PM-pasted text is wrapped as a synthetic "arquivo"
 * (`planningDocToExtractionFile`, lib/cards/package-proposal.ts) and placed
 * FIRST in `files`, ahead of the client's own `client_files` -- the planning
 * document is the PRIMARY source of the proposed pieces here,
 * `client_files`/`sharedFiles` are supporting context for tone/brand only,
 * the reverse of `validateCardAgainstChecklist`'s own ordering where the
 * card's text is the thing BEING checked against the client's files.
 *
 * Callable by any PM assigned to the client (NOT admin-only) -- the
 * RLS-scoped client re-read below is the real boundary, same authorization
 * shape as `generateChecklistDraftFromFiles`.
 */
export async function proposePackagePieces(
  input: ProposePackagePiecesInput
): Promise<ProposePackagePiecesResult> {
  const parsed = proposePackagePiecesSchema.safeParse(input);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Dados inválidos." };
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: NOT_AUTHENTICATED_ERROR };

  // Re-read the client through RLS -- never trust that clientId is valid on
  // its own; clients_select_scoped is the real boundary (admin-or-assigned-PM).
  const { data: client } = await supabase
    .from("clients")
    .select("id, name, tag")
    .eq("id", parsed.data.clientId)
    .single();
  if (!client) {
    return { error: PACKAGE_PROPOSAL_CLIENT_NOT_FOUND_ERROR };
  }

  const { data: clientFiles } = await supabase
    .from("client_files")
    .select("filename, content")
    .eq("client_id", client.id);

  // Quick task 260811-imw pattern: unfiltered select -- shared_knowledge_files
  // has no client_id column; shared_knowledge_files_select_all_authenticated
  // is the real boundary here, via the SAME RLS-scoped supabase client above.
  const { data: sharedKnowledgeFiles } = await supabase
    .from("shared_knowledge_files")
    .select("filename, content");
  const sharedFiles = sharedKnowledgeFiles ?? [];

  const planningDocFile = planningDocToExtractionFile(parsed.data.text);

  const result = await runStructuredExtraction({
    clientName: client.name,
    clientTag: client.tag,
    files: [planningDocFile, ...(clientFiles ?? [])],
    sharedFiles,
    instruction:
      "Leia o documento de planejamento acima (arquivo " +
      `'${planningDocFile.filename}') e proponha peças de conteúdo ` +
      "(posts) a partir dele -- cada peça com um título curto e uma " +
      "descrição (o texto completo do post, pronto para revisão interna). " +
      "Proponha no máximo 10 peças. Use os demais arquivos de referência " +
      "do cliente (manual de marca, briefing, regras de conteúdo, etc.) " +
      "apenas como contexto de tom e estilo -- a fonte das peças em si é " +
      "sempre o documento de planejamento, nunca os arquivos de referência.",
    toolName: "propose_package_pieces",
    toolDescription:
      "Registra a proposta de peças de conteúdo extraídas do documento de planejamento.",
    inputSchema: {
      type: "object",
      properties: {
        pieces: {
          type: "array",
          items: {
            type: "object",
            properties: {
              title: { type: "string", description: "Título curto da peça." },
              description: {
                type: "string",
                description: "Texto completo proposto para o post.",
              },
            },
            required: ["title", "description"],
          },
          description: "Peças propostas a partir do documento (no máximo 10).",
        },
      },
      required: ["pieces"],
    },
  });

  if (!result.ok) {
    return { error: result.error };
  }

  const raw = result.data as { pieces?: unknown };
  const parsedProposal = packagePiecesProposalSchema.safeParse({
    pieces: raw.pieces,
  });
  if (!parsedProposal.success) {
    console.error(
      "[proposePackagePieces] AI output failed packagePiecesProposalSchema validation",
      parsedProposal.error
    );
    return { error: PACKAGE_PROPOSAL_INVALID_RESULT_ERROR };
  }

  return { success: true, pieces: parsedProposal.data.pieces };
}
