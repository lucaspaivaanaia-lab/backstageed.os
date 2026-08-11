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
 * Strategic briefing edit form validation (CLI-04). Quick task 260811-kl3
 * collapses the previous 4 fixed narrative/list fields into a single
 * free-text Markdown field — the AI (`autofillBriefingFromFiles`) now
 * proposes its own section structure inside this one field instead of
 * filling fixed keys, and the human still reviews/edits it in one large
 * textarea. D-10: briefing editing remains fully decoupled from RAG
 * readiness — no field references any RAG/context-storage mechanism
 * (client_files or otherwise).
 */
export const briefingSchema = z.object({
  briefing: z.string().trim().max(20000).optional().nullable(),
});

export type BriefingInput = z.infer<typeof briefingSchema>;
