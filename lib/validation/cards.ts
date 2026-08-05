import { z } from "zod";

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
 * updateCardDetails' input (KAN-01, D-16/D-19): edits the two fields
 * createCard can also set at creation time. Both fields are nullable rather
 * than optional -- the form always submits a value (possibly null) to
 * explicitly clear a description or unassign a card, never omits the key.
 */
export const updateCardDetailsSchema = z.object({
  cardId: z.string().uuid(),
  description: z.string().trim().max(5000).nullable(),
  assigneeId: z.string().uuid().nullable(),
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
 * Domain, the Information Disclosure row). A piece is created title-only;
 * its description and assignee are set afterwards through the piece's own
 * card detail Dialog via `updateCardDetails`, so no duplicate creation
 * surface is introduced.
 */
export const createPieceSchema = z.object({
  parentCardId: z.string().uuid(),
  title: z
    .string()
    .trim()
    .min(1, { message: "Título obrigatório." })
    .max(200),
});
export type CreatePieceInput = z.infer<typeof createPieceSchema>;
