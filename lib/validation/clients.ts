import { z } from "zod";

/**
 * Client creation form validation. Enforced BEFORE any privileged
 * `createAdminClient()` write (01-RESEARCH.md Architecture Patterns
 * Pattern 2 — app-layer authorization + zod validation happen before any
 * privileged write).
 */
export const clientCreateSchema = z.object({
  name: z.string().trim().min(1, { message: "Nome é obrigatório." }),
  pmIds: z.array(z.string().uuid()).default([]),
});

export type ClientCreateInput = z.infer<typeof clientCreateSchema>;
