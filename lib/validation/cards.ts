import { z } from "zod";

/**
 * Content card creation + stage-advance form/request validation (KAN-01,
 * KAN-02). A NEW file (not an edit to lib/validation/clients.ts or
 * lib/validation/checklist.ts, which own their own phases' schemas) to
 * avoid a file-ownership conflict between plans. Enforced BEFORE any
 * privileged Supabase call (Security Domain V5 input validation).
 */
export const createCardSchema = z.object({
  clientId: z.string().uuid({ message: "Cliente inválido." }),
  title: z
    .string()
    .trim()
    .min(1, { message: "Título obrigatório." })
    .max(200),
  cardType: z.enum(["single", "package"]),
});

export type CreateCardInput = z.infer<typeof createCardSchema>;

export const advanceStageSchema = z.object({
  cardId: z.string().uuid(),
});

export type AdvanceStageInput = z.infer<typeof advanceStageSchema>;

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

export const toggleChecklistItemSchema = z.object({
  itemId: z.string().uuid(),
  completed: z.boolean(),
});

export type ToggleChecklistItemInput = z.infer<
  typeof toggleChecklistItemSchema
>;
