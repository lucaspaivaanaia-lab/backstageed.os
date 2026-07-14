import { z } from "zod";

/**
 * Create-client-login form validation (AUTH-09). A NEW file (not an edit
 * to lib/validation/auth.ts, which is owned by 05-01) per 05-04-PLAN.md's
 * interfaces section, to avoid a file-ownership conflict between plans.
 * Enforced BEFORE any Supabase admin call (05-RESEARCH.md Pitfall 5 —
 * malformed metadata can silently fail the handle_new_user() trigger).
 */
export const createClientLoginSchema = z.object({
  email: z.string().trim().email({ message: "E-mail inválido." }),
  client_id: z.string().uuid({ message: "Cliente inválido." }),
});

export type CreateClientLoginInput = z.infer<typeof createClientLoginSchema>;

/**
 * Forced first-login password-change pair validation (AUTH-10, D-09) — new
 * password (>= 8 chars, same floor as lib/validation/auth.ts's
 * signupSchema) + confirm field must match. Defined here rather than in
 * lib/validation/auth.ts for the same file-ownership reason as above.
 */
export const changePasswordSchema = z
  .object({
    password: z
      .string()
      .min(8, { message: "A senha deve ter no mínimo 8 caracteres." }),
    confirmPassword: z.string(),
  })
  .refine((data) => data.password === data.confirmPassword, {
    message: "As senhas não coincidem.",
    path: ["confirmPassword"],
  });

export type ChangePasswordInput = z.infer<typeof changePasswordSchema>;
