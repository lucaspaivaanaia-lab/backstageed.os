import { z } from "zod";

/**
 * Client creation form validation. Enforced BEFORE any privileged
 * `createAdminClient()` write (01-RESEARCH.md Architecture Patterns
 * Pattern 2 — app-layer authorization + zod validation happen before any
 * privileged write).
 */
/**
 * Client tag (nome fantasia/código curto) — distinct from `name` (nome de
 * exibição). Format enforced here is shape-only (letters/numbers/hyphen, no
 * spaces); case-insensitive uniqueness across clients is enforced at the
 * database layer by the `clients_tag_key` functional unique index
 * (migration 0025_clients_tag.sql) and translated to a friendly message on
 * a Postgres 23505 error in lib/actions/clients.ts.
 */
const tagSchema = z
  .string()
  .trim()
  .min(1, { message: "Tag é obrigatória." })
  .max(40, { message: "Tag deve ter no máximo 40 caracteres." })
  .regex(/^[A-Za-z0-9-]+$/, {
    message: "Tag deve conter apenas letras, números e hífen, sem espaços.",
  });

export const clientCreateSchema = z.object({
  name: z.string().trim().min(1, { message: "Nome é obrigatório." }),
  tag: tagSchema,
  // No `.default([])` here: keeping this required (rather than optional-
  // with-default) keeps the zod input/output types identical, which
  // zodResolver + react-hook-form's typed `useForm<ClientCreateInput>()`
  // requires. Callers (Server Action `formData.getAll("pmIds")`, the
  // creation form's default `[currentUserId]`) always supply an array,
  // empty or not, so no default is needed in practice.
  pmIds: z.array(z.string().uuid()),
});

export type ClientCreateInput = z.infer<typeof clientCreateSchema>;

export const clientTagUpdateSchema = z.object({ tag: tagSchema });

export type ClientTagUpdateInput = z.infer<typeof clientTagUpdateSchema>;

/**
 * Strategic briefing edit form validation (CLI-04). D-05: objective/
 * toneOfVoice/targetAudience are free-text narrative fields (single
 * textarea each). D-04: contentPillars is a structured add/remove chip
 * list. D-10: briefing editing is fully decoupled from RAG readiness — no
 * field references any RAG/context-storage mechanism (client_files or
 * otherwise) — briefing editing is fully decoupled from context readiness.
 */
export const briefingSchema = z.object({
  objective: z.string().trim().max(5000).optional().nullable(),
  toneOfVoice: z.string().trim().max(5000).optional().nullable(),
  targetAudience: z.string().trim().max(5000).optional().nullable(),
  // No `.default([])` here: same zod input/output type-identity requirement
  // documented for `clientCreateSchema.pmIds` in Plan 01-03 — a `.default()`
  // makes the schema's *input* type `string[] | undefined` while its
  // *output* type (z.infer, what `useForm<BriefingInput>()` is built from)
  // stays `string[]`, breaking `zodResolver`'s typed Resolver assignment.
  // Every caller (Server Action `formData.getAll("contentPillars")`, this
  // form's `defaultValues: { contentPillars: client.contentPillars }`)
  // always supplies an array, empty or not, so no default is needed.
  contentPillars: z.array(z.string().trim().min(1)),
});

export type BriefingInput = z.infer<typeof briefingSchema>;
