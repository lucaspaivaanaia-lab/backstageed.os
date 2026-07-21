import { z } from "zod";

/**
 * Chat + save-to-knowledge form/request validation (CTX-01..CTX-05). A NEW
 * file (not an edit to lib/validation/clients.ts, which owns the client
 * creation/briefing schemas) per 02-02-PLAN.md's interfaces section, to
 * avoid a file-ownership conflict between plans. Enforced BEFORE any
 * privileged Supabase/Tropicalia/Claude call (Security Domain V5 input
 * validation).
 */
export const sendMessageSchema = z.object({
  clientId: z.string().uuid({ message: "Cliente inválido." }),
  // .max(4000) bounds the Claude/Tropicalia payload size per 02-RESEARCH.md
  // Security Domain V5 ("reasonable max length to bound Claude/Tropicalia
  // payload size").
  content: z
    .string()
    .trim()
    .min(1, { message: "Mensagem não pode estar vazia." })
    .max(4000),
});

export type SendMessageInput = z.infer<typeof sendMessageSchema>;

/**
 * Save-to-knowledge Server Action input (CTX-03/CTX-04, D-04) — the PM
 * checks off which persisted messages to package into a new curated `.md`
 * file; at least one message must be selected.
 */
export const saveKnowledgeSchema = z.object({
  clientId: z.string().uuid({ message: "Cliente inválido." }),
  messageIds: z
    .array(z.string().uuid())
    .min(1, { message: "Selecione ao menos uma mensagem." }),
});

export type SaveKnowledgeInput = z.infer<typeof saveKnowledgeSchema>;
