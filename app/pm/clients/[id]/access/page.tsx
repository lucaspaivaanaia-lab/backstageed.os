import { notFound } from "next/navigation";
import { findActiveClientLogin } from "./actions";
import { ClientAccessPanel } from "@/components/clients/client-access-panel";
import { PageShell } from "@/components/layout/page-shell";

type PageProps = { params: Promise<{ id: string }> };

/**
 * PM-facing Client-access screen (AUTH-09/10/11). Runs the D-10 pre-check
 * lookup — profiles.client_id / role='client' / status not in
 * ('rejected','deactivated') — via findActiveClientLogin() on EVERY
 * server render, the SAME helper createClientLogin's own pre-check uses,
 * so the "Desativar acesso" control's visibility never depends on
 * same-session createClientLogin output (AUTH-11 typically fires in a
 * later session/day, not the session that provisioned the login).
 *
 * All interactive UI + locked UI-SPEC copy is owned by the shared
 * ClientAccessPanel client component (components/clients/client-access-
 * panel.tsx), reused verbatim by the Admin mirror route
 * (app/admin/clients/[id]/access/page.tsx, D-02/AUTH-11).
 *
 * Locked copy this page's tree renders (verbatim, UI-SPEC Copywriting
 * Contract — quoted here in full on single lines for traceability):
 * - One-time provisional-password callout: "Esta senha não será mostrada novamente."
 * - Deactivate confirmation: "Desativar acesso: O cliente não conseguirá mais fazer login na plataforma até que o acesso seja reativado. Confirmar desativação?"
 */
export default async function PmClientAccessPage({ params }: PageProps) {
  const { id: client_id } = await params;
  if (!client_id) notFound();

  const existingLogin = await findActiveClientLogin(client_id);

  return (
    <PageShell width="narrow">
      <ClientAccessPanel
        clientId={client_id}
        existingLoginUserId={existingLogin?.userId ?? null}
      />
    </PageShell>
  );
}
