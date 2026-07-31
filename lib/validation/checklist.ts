import { z } from "zod";

/**
 * Checklist-template CRUD form validation (CHK-01). A NEW file — never
 * extends `lib/validation/clients.ts`, to keep file ownership clean between
 * plans (03-01-PLAN.md Task 3).
 *
 * No `.default([])` on `items`: same zod input/output type-identity
 * requirement documented for `clientCreateSchema.pmIds` and
 * `briefingSchema.contentPillars` in `lib/validation/clients.ts` — a
 * `.default()` makes the schema's *input* type `{label:string}[] |
 * undefined` while its *output* type (z.infer, what
 * `useForm<ChecklistTemplateInput>()` is built from) stays
 * `{label:string}[]`, breaking `zodResolver`'s typed Resolver assignment.
 * Every caller always supplies an array, empty or not, so no default is
 * needed.
 */
export const checklistTemplateSchema = z.object({
  name: z
    .string()
    .trim()
    .min(1, { message: "Nome obrigatório." })
    .max(120),
  items: z
    .array(
      z.object({
        label: z.string().trim().min(1).max(200),
      })
    )
    .min(1, { message: "Adicione ao menos um item." }),
});

export type ChecklistTemplateInput = z.infer<typeof checklistTemplateSchema>;

/**
 * Per-client template assignment (CHK-02). `templateId: null` means
 * "unassign" — the "Nenhum" option in the assignment Select.
 */
export const assignTemplateSchema = z.object({
  clientId: z.string().uuid(),
  templateId: z.string().uuid().nullable(),
});

export type AssignTemplateInput = z.infer<typeof assignTemplateSchema>;
