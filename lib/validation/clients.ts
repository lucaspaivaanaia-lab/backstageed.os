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

/**
 * Strategic briefing edit form validation (CLI-04). D-05: objective/
 * toneOfVoice/targetAudience are free-text narrative fields (single
 * textarea each). D-04: contentPillars is a structured add/remove chip
 * list. D-10: briefing editing is fully decoupled from RAG readiness — no
 * field here references `tropicalia_project_id`.
 */
export const briefingSchema = z.object({
  objective: z.string().trim().max(5000).optional().nullable(),
  toneOfVoice: z.string().trim().max(5000).optional().nullable(),
  targetAudience: z.string().trim().max(5000).optional().nullable(),
  contentPillars: z.array(z.string().trim().min(1)).default([]),
});

export type BriefingInput = z.infer<typeof briefingSchema>;
