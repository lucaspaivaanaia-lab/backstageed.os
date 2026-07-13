import { z } from "zod";

/**
 * PM self-signup form validation. Enforced BEFORE any Supabase Auth call
 * (see 01-RESEARCH.md Pitfall 5 — malformed metadata can silently fail the
 * `handle_new_user()` trigger and surface as an opaque 500 from Supabase).
 */
export const signupSchema = z.object({
  email: z.string().trim().email({ message: "E-mail inválido." }),
  password: z
    .string()
    .min(8, { message: "A senha deve ter no mínimo 8 caracteres." }),
});

export type SignupInput = z.infer<typeof signupSchema>;

/**
 * Client-login validation, reused by later plans (PM/Admin creates a
 * Client's provisional login linked to an existing client record).
 */
export const clientLoginSchema = z.object({
  email: z.string().trim().email({ message: "E-mail inválido." }),
  client_id: z.string().uuid({ message: "Cliente inválido." }),
});

export type ClientLoginInput = z.infer<typeof clientLoginSchema>;

/**
 * Email+password login validation for the minimal dev-auth `/login` page
 * (D-01/D-02/D-03 — throwaway Phase 1-4 tooling). Enforced BEFORE any
 * Supabase Auth call, same convention as `signupSchema`.
 */
export const loginSchema = z.object({
  email: z.string().trim().email({ message: "E-mail inválido." }),
  password: z.string().min(1, { message: "Senha é obrigatória." }),
});

export type LoginInput = z.infer<typeof loginSchema>;
