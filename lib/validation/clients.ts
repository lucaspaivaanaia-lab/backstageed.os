import { z } from "zod";

/**
 * Client creation form validation. Enforced BEFORE any privileged
 * `createAdminClient()` write (01-RESEARCH.md Architecture Patterns
 * Pattern 2 — app-layer authorization + zod validation happen before any
 * privileged write).
 */
export const clientCreateSchema = z.object({
  name: z.string().trim().min(1, { message: "Nome é obrigatório." }),
  // No `.default([])` here: keeping this required (rather than optional-
  // with-default) keeps the zod input/output types identical, which
  // zodResolver + react-hook-form's typed `useForm<ClientCreateInput>()`
  // requires. Callers (Server Action `formData.getAll("pmIds")`, the
  // creation form's default `[currentUserId]`) always supply an array,
  // empty or not, so no default is needed in practice.
  pmIds: z.array(z.string().uuid()),
});

export type ClientCreateInput = z.infer<typeof clientCreateSchema>;
