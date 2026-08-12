import { z } from "zod";

/**
 * Create-Editor-login form validation (item 3, 260811-oe0-CONTEXT.md).
 * Deliberately has NO client_id field -- unlike createClientLoginSchema
 * (lib/validation/client-access.ts), an Editor account has no single
 * owning client (260811-oe0-RESEARCH.md Section 5).
 */
export const createEditorLoginSchema = z.object({
  email: z.string().trim().email({ message: "E-mail inválido." }),
});

export type CreateEditorLoginInput = z.infer<typeof createEditorLoginSchema>;
