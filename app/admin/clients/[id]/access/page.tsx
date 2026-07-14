import { notFound } from "next/navigation";
import { findActiveClientLogin } from "@/app/pm/clients/[id]/access/actions";
import { ClientAccessPanel } from "@/components/clients/client-access-panel";

type PageProps = { params: Promise<{ id: string }> };

/**
 * Admin-scoped mirror of app/pm/clients/[id]/access/page.tsx (D-02,
 * AUTH-11). The 05-01 middleware.ts role-redirect is a path-prefix match
 * on profile.role, NOT a permission/superset check — an Admin navigating
 * to /pm/clients/[id]/access is bounced to /admin before that page
 * renders, so an Admin genuinely cannot use the PM route. This route
 * gives Admin the identical create+deactivate capability, following the
 * Phase 1 admin/pm client-detail-form mirroring precedent (two route
 * roots, shared underlying component/logic, no duplication).
 *
 * REUSE, not duplication: imports findActiveClientLogin,
 * createClientLogin, and deactivateClientAccess (via ClientAccessPanel)
 * from the PM route's actions.ts — no auth.admin.* logic is redefined
 * under app/admin/clients/[id]/access. Runs the SAME server-render D-10
 * lookup (profiles.client_id / role='client' / status not in
 * ('rejected','deactivated')) on every render, so the "Desativar acesso"
 * control's visibility never depends on same-session state.
 *
 * Locked copy this page's tree renders (verbatim, UI-SPEC Copywriting
 * Contract — quoted here in full on single lines for traceability, same
 * as the PM route):
 * - One-time provisional-password callout: "Esta senha não será mostrada novamente."
 * - Deactivate confirmation: "Desativar acesso: O cliente não conseguirá mais fazer login na plataforma até que o acesso seja reativado. Confirmar desativação?"
 *
 * Does NOT touch middleware.ts or app/pm/clients/[id]/access/page.tsx —
 * PM->/admin isolation (middleware's role-redirect) is unaffected by this
 * mirror.
 */
export default async function AdminClientAccessPage({ params }: PageProps) {
  const { id: client_id } = await params;
  if (!client_id) notFound();

  const existingLogin = await findActiveClientLogin(client_id);

  return (
    <div className="max-w-xl mx-auto px-6 py-8">
      <ClientAccessPanel
        clientId={client_id}
        existingLoginUserId={existingLogin?.userId ?? null}
      />
    </div>
  );
}
