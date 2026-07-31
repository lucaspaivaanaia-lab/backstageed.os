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
