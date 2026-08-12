"use server";

import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { createEditorLoginSchema } from "@/lib/validation/editor-access";
import { generateProvisionalPassword } from "@/lib/security/password";
import { isEditorProvisionAuthorized } from "@/lib/security/editor-access-authz";

const GENERIC_ERROR =
  "Não foi possível completar a ação. Tente novamente em instantes.";
const UNAUTHORIZED_ERROR = "Sem permissão para criar acessos de Editor.";
const UNAUTHENTICATED_ERROR = "Não autenticado.";
const DUPLICATE_ERROR = "Já existe uma conta com este e-mail.";

type CreateEditorLoginResult =
  | { success: true; userId: string; password: string }
  | { error: string };

/**
 * PM/Admin creates an Editor login (item 3, 260811-oe0-CONTEXT.md). Unlike
 * createClientLogin (app/pm/clients/[id]/access/actions.ts), this takes NO
 * clientId -- an Editor account has no natural 1:1 client relationship (it
 * works across whichever cards it gets assigned to via media_assignee_id,
 * potentially spanning multiple clients), so authorization is "caller is
 * is_admin() OR is_pm() (ANY approved PM, not scoped to a specific
 * client)" rather than assertCallerManagesClient(clientId)
 * (260811-oe0-RESEARCH.md Section 5). Reused verbatim by the Admin mirror
 * route (app/admin/editors/page.tsx).
 */
export async function createEditorLogin(
  email: string
): Promise<CreateEditorLoginResult> {
  const parsed = createEditorLoginSchema.safeParse({ email });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? GENERIC_ERROR };
  }

  const scoped = await createClient();
  const {
    data: { user },
  } = await scoped.auth.getUser();
  if (!user) return { error: UNAUTHENTICATED_ERROR };

  const [adminResult, pmResult] = await Promise.all([
    scoped.rpc("is_admin"),
    scoped.rpc("is_pm"),
  ]);
  if (adminResult.error || pmResult.error) {
    console.error(
      "createEditorLogin: authorization RPC failed",
      adminResult.error ?? pmResult.error
    );
    return { error: UNAUTHORIZED_ERROR };
  }

  const authorized = isEditorProvisionAuthorized({
    isAdmin: adminResult.data === true,
    isPm: pmResult.data === true,
  });
  if (!authorized) {
    return { error: UNAUTHORIZED_ERROR };
  }

  const password = generateProvisionalPassword();
  const admin = createAdminClient();

  const { data, error } = await admin.auth.admin.createUser({
    email: parsed.data.email,
    password,
    email_confirm: true,
    user_metadata: {
      role: "editor",
      must_change_password: true,
    },
  });

  if (error || !data.user) {
    const message = error?.message?.toLowerCase() ?? "";
    const duplicate =
      message.includes("already registered") ||
      message.includes("already exists") ||
      message.includes("duplicate") ||
      message.includes("unique");
    if (duplicate) {
      return { error: DUPLICATE_ERROR };
    }
    return { error: GENERIC_ERROR };
  }

  return { success: true, userId: data.user.id, password };
}
