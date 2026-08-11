import { z } from "zod";
import { PLANNING_DOC_MAX_LENGTH } from "@/lib/cards/package-proposal";

/**
 * Content card creation + stage-advance form/request validation (KAN-01,
 * KAN-02). A NEW file (not an edit to lib/validation/clients.ts or
 * lib/validation/checklist.ts, which own their own phases' schemas) to
 * avoid a file-ownership conflict between plans. Enforced BEFORE any
 * privileged Supabase call (Security Domain V5 input validation).
 */

// `CARD_STAGE_VALUES` exists only because `z.enum` needs a literal tuple.
// `lib/cards/stages.ts`'s `STAGE_ORDER` remains the single source of truth
// for stage ORDER -- this tuple is a validation-surface mirror of the
// Postgres `card_stage` enum, never a second ordering.
export const CARD_STAGE_VALUES = [
  "briefing",
  "producao",
  "revisao_interna",
  "aprovacao_cliente",
  "agendamento",
] as const;

// `CARD_CHANNEL_VALUES` exists only because `z.enum` needs a literal tuple.
// `lib/cards/channel.ts`'s `CardChannel`/`CHANNEL_LABELS` remain the single
// source of truth for channel semantics/display -- this tuple is a
// validation-surface mirror of the Postgres `card_channel` enum, never a
// second meaning. Mirrors CARD_STAGE_VALUES's own comment above.
export const CARD_CHANNEL_VALUES = ["planejamento", "conteudo"] as const;

export const createCardSchema = z.object({
  clientId: z.string().uuid({ message: "Cliente inválido." }),
  title: z
    .string()
    .trim()
    .min(1, { message: "Título obrigatório." })
    .max(200),
  cardType: z.enum(["single", "package"]),
  // D-14: a card may be created directly in ANY of the five columns, not
  // only Briefing. Ignored for cardType "package" (D-02: a package row has
  // no stage of its own -- cards_package_has_no_stage enforces it).
  stage: z.enum(CARD_STAGE_VALUES).optional(),
  // D-16/D-18: optional plain text, multi-line, no markdown.
  description: z.string().trim().max(5000).optional(),
  // D-19: optional single assignee; membership in the client's pm_clients
  // rows is enforced by the cards_assignee_membership_trg trigger, not
  // here.
  assigneeId: z.string().uuid().optional(),
  // Item 4, 2026-08-05 action plan P3 (260811-lp5-CONTEXT.md), quick task
  // 260811-n0i: a SECOND, purely informational assignee (e.g. Designer/
  // Mídia), coexisting with assigneeId above, never replacing it. Optional
  // like assigneeId -- deliberately NOT required (unlike channel in item 1,
  // 260811-m0t), so no createCard call site needs to change. Membership in
  // the client's pm_clients rows is enforced by the SAME
  // cards_assignee_membership_trg trigger (extended by migration 0029), not
  // here.
  mediaAssigneeId: z.string().uuid().optional(),
  // Item 1, 2026-08-05 action plan P3 (260811-lp5-CONTEXT.md): required,
  // orthogonal to cardType -- every card, single or package, carries this
  // label. No default in the schema itself (the DB column default only
  // covers rows that omit the field entirely, like createPiece's insert --
  // every FORM-driven create always sends an explicit value). Because this
  // is REQUIRED (not .optional()/.default()), every createCard call site
  // in the repo must pass it explicitly -- confirmed during revision that
  // all three call sites (board-panel.tsx x2, chat-panel.tsx x1) do.
  channel: z.enum(CARD_CHANNEL_VALUES),
});

export type CreateCardInput = z.infer<typeof createCardSchema>;

export const advanceStageSchema = z.object({
  cardId: z.string().uuid(),
});

export type AdvanceStageInput = z.infer<typeof advanceStageSchema>;

/**
 * moveCard's input (KAN-02, D-12): unlike advanceStageSchema, this carries a
 * caller-supplied target stage, because drag-and-drop is inherently "put it
 * here" rather than "go one step forward". `toStage` is bounded to the five
 * real stages by the enum below; the moveCard Server Action re-decides
 * legality server-side via evaluateMove regardless of this validation.
 */
export const moveCardSchema = z.object({
  cardId: z.string().uuid(),
  toStage: z.enum(CARD_STAGE_VALUES),
});
export type MoveCardInput = z.infer<typeof moveCardSchema>;

/**
 * updateCardDetails' input (KAN-01, D-16/D-19; channel added by quick task
 * 260811-m0t; mediaAssigneeId added by quick task 260811-n0i): edits the
 * fields createCard can also set at creation time. `description`/
 * `assigneeId`/`mediaAssigneeId` are nullable rather than optional -- the
 * form always submits a value (possibly null) to explicitly clear a
 * description or unassign a card, never omits the key. `channel` is never
 * nullable -- unlike those, there is no "clear" state for it.
 */
export const updateCardDetailsSchema = z.object({
  cardId: z.string().uuid(),
  description: z.string().trim().max(5000).nullable(),
  assigneeId: z.string().uuid().nullable(),
  // Item 4, 260811-n0i: lets a PM set/change/clear a card's second,
  // purely-informational assignee from the detail dialog, alongside
  // Descrição/Responsável/Canal. Nullable, mirroring assigneeId exactly --
  // "sem designer/mídia" is a legitimate, explicit state.
  mediaAssigneeId: z.string().uuid().nullable(),
  // Item 1, 2026-08-05 action plan P3: lets a PM reclassify an existing
  // card's channel from the detail dialog, alongside Descrição/Responsável.
  // Never nullable -- unlike description/assigneeId there is no "clear"
  // state for channel, a card always has exactly one of the two values.
  channel: z.enum(CARD_CHANNEL_VALUES),
});
export type UpdateCardDetailsInput = z.infer<typeof updateCardDetailsSchema>;

export const toggleChecklistItemSchema = z.object({
  itemId: z.string().uuid(),
  completed: z.boolean(),
});

export type ToggleChecklistItemInput = z.infer<
  typeof toggleChecklistItemSchema
>;

/**
 * addAttachment's input (KAN-05, D-07/D-08/D-09). `linkType` is the PM's
 * (possibly overridden) choice from `driveLinkType`'s inference -- never
 * re-inferred server-side, since the whole point of letting the PM override
 * it is that inference from an opaque Drive file id is unreliable
 * (03-RESEARCH.md). `url` shape validity is checked here; the actual
 * Drive-domain boundary is `isLikelyDriveLink`, re-run inside the Server
 * Action from the same shared module the browser uses (03-RESEARCH.md
 * Pitfall 5).
 */
export const attachDriveLinkSchema = z.object({
  cardId: z.string().uuid(),
  url: z.string().trim().url({ message: "URL inválida." }).max(2000),
  label: z.string().trim().max(200).optional(),
  linkType: z.enum(["image", "video", "pdf", "other"]),
});
export type AttachDriveLinkInput = z.infer<typeof attachDriveLinkSchema>;

export const removeAttachmentSchema = z.object({
  attachmentId: z.string().uuid(),
});
export type RemoveAttachmentInput = z.infer<typeof removeAttachmentSchema>;

/**
 * forceAdvanceOverride's input (CHK-04, D-11, plan 03-05). The target stage
 * is NEVER a parameter -- it is always derived server-side from
 * `nextStage(card.stage)`, exactly like `advanceStageSchema`. This schema
 * is intentionally identical in shape to `advanceStageSchema` but kept as
 * its own export -- the two actions are authorized completely differently
 * (Admin-only vs. any assigned PM) and must never be confused for the same
 * code path.
 */
export const forceAdvanceSchema = z.object({
  cardId: z.string().uuid(),
});
export type ForceAdvanceInput = z.infer<typeof forceAdvanceSchema>;

/**
 * createPiece's input (KAN-01 package half, D-01/D-02, plan 03-06,
 * T-03-31). Deliberately has NO `clientId` field -- a piece's client is
 * always copied server-side from its re-read parent package row inside
 * `createPiece`, never taken from the browser (03-RESEARCH.md Security
 * Domain, the Information Disclosure row). A piece created manually
 * (PackageRow's "Adicionar peça") is still title-only, its description set
 * afterwards through the piece's own card detail Dialog via
 * `updateCardDetails` -- `description` below is OPTIONAL specifically so
 * that call site needs zero changes. Item 2 of the 2026-08-05 action plan's
 * P3 (260811-nnw-CONTEXT.md, Pitfall 1): batch-generated pieces
 * (proposePackagePieces) DO send it, so the AI-authored content survives
 * creation instead of being silently discarded.
 */
export const createPieceSchema = z.object({
  parentCardId: z.string().uuid(),
  title: z
    .string()
    .trim()
    .min(1, { message: "Título obrigatório." })
    .max(200),
  // Mirrors createCardSchema's own `.max(5000)` description limit exactly.
  description: z.string().trim().max(5000).optional(),
});
export type CreatePieceInput = z.infer<typeof createPieceSchema>;

/**
 * removePiece's input (KAN-01 package half, quick task 260808-c9s). Just the
 * target card's id -- this schema validates shape only, never the
 * `card_type='piece'` business rule, which is enforced entirely inside the
 * `removePiece` Server Action (same division of labor as every other schema
 * in this file).
 */
export const removePieceSchema = z.object({
  cardId: z.string().uuid(),
});
export type RemovePieceInput = z.infer<typeof removePieceSchema>;

/**
 * proposePackagePieces' input (KAN-01 package half, item 2 of the
 * 2026-08-05 action plan's P3, 260811-nnw-CONTEXT.md D-2/D-6). `text` is the
 * PM-pasted planning document, treated as a synthetic "arquivo" by
 * `planningDocToExtractionFile` (lib/cards/package-proposal.ts) -- the exact
 * pattern `validateCardAgainstChecklist`'s `cardContentFile` already uses.
 * `.max()` mirrors PLANNING_DOC_MAX_LENGTH exactly (imported from the same
 * module, never a second copy of the number) -- Pitfall 2,
 * 260811-nnw-RESEARCH.md: no other paste-text flow in this codebase caps
 * INPUT length, this is the first one to.
 */
export const proposePackagePiecesSchema = z.object({
  clientId: z.string().uuid({ message: "Cliente inválido." }),
  text: z
    .string()
    .trim()
    .min(1, { message: "Cole o texto do documento de planejamento." })
    .max(PLANNING_DOC_MAX_LENGTH, {
      message: "Documento muito longo. Cole um trecho menor.",
    }),
});
export type ProposePackagePiecesInput = z.infer<
  typeof proposePackagePiecesSchema
>;

/**
 * Shape of the AI's proposal after `proposePackagePieces` (app/pm/board/
 * actions.ts) re-validates its `runStructuredExtraction` output -- never
 * trusted as pre-shaped for a database write (Security Domain V5), same
 * discipline `checklistTemplateSchema` already applies to checklist
 * generation. Deliberately NO `.max()` on the array -- mirrors
 * `checklistTemplateSchema.items`'s own precedent (lib/validation/
 * checklist.ts, no Zod upper bound, the item-count ceiling is requested
 * only in the AI instruction text); a PM reviewing a slightly-over-10
 * proposal can simply remove the extras rather than the whole generation
 * failing outright (260811-nnw-RESEARCH.md Assumption A2).
 */
export const packagePiecesProposalSchema = z.object({
  pieces: z
    .array(
      z.object({
        title: z.string().trim().min(1).max(200),
        description: z.string().trim().max(5000),
      })
    )
    .min(1, { message: "A IA não propôs nenhuma peça." }),
});
export type PackagePiecesProposal = z.infer<typeof packagePiecesProposalSchema>;
export type PackagePieceProposal = PackagePiecesProposal["pieces"][number];
