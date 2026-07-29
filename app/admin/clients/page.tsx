import Link from "next/link";
import { PlusIcon, UsersIcon, ChevronRightIcon } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { resolvePmNames } from "@/lib/actions/clients";
import { Button } from "@/components/ui/button";
import { StatusBadge } from "@/components/ui/status-badge";
import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
} from "@/components/ui/table";
import {
  PageShell,
  PageTitle,
  EmptyState,
} from "@/components/layout/page-shell";

type ClientRow = {
  id: string;
  name: string;
  objective: string | null;
  tone_of_voice: string | null;
  target_audience: string | null;
  content_pillars: string[] | null;
  pm_clients: { pm_id: string }[] | null;
};

/**
 * Admin client list. D-12: zero additional app-layer filtering beyond the
 * RLS-scoped query — `clients_select_scoped` already returns every client
 * for an Admin caller via `is_admin()`.
 */
export default async function AdminClientsPage() {
  const supabase = await createClient();

  const { data } = await supabase
    .from("clients")
    .select(
      "id, name, objective, tone_of_voice, target_audience, content_pillars, pm_clients(pm_id)"
    );

  const clients = (data ?? []) as ClientRow[];

  const pmIds = Array.from(
    new Set(
      clients.flatMap((c) => (c.pm_clients ?? []).map((pc) => pc.pm_id))
    )
  );
  const pmNames = await resolvePmNames(pmIds);

  return (
    <PageShell width="wide">
      <PageTitle
        action={
          <Button asChild>
            <Link href="/admin/clients/new">
              <PlusIcon className="size-4" />
              Criar cliente
            </Link>
          </Button>
        }
      >
        Clientes
      </PageTitle>

      {clients.length === 0 ? (
        <EmptyState
          icon={<UsersIcon className="size-5" />}
          title="Nenhum cliente cadastrado ainda"
          description="Crie o primeiro cliente para organizar produção de conteúdo e RAG isolado por cliente."
          action={
            <Button asChild>
              <Link href="/admin/clients/new">
                <PlusIcon className="size-4" />
                Criar cliente
              </Link>
            </Button>
          }
        />
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Nome</TableHead>
              <TableHead>PMs atribuídos</TableHead>
              <TableHead>Briefing</TableHead>
              <TableHead>
                <span className="sr-only">Abrir</span>
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {clients.map((client) => {
              const briefingEmpty =
                !client.objective &&
                !client.tone_of_voice &&
                !client.target_audience &&
                (client.content_pillars ?? []).length === 0;

              const assignedPmEmails = (client.pm_clients ?? [])
                .map((pc) => pmNames[pc.pm_id])
                .filter(Boolean)
                .join(", ");

              return (
                <TableRow key={client.id}>
                  <TableCell>
                    <Link
                      href={`/admin/clients/${client.id}`}
                      className="flex items-center gap-2 font-medium hover:text-primary"
                    >
                      {client.name}
                    </Link>
                  </TableCell>
                  <TableCell>{assignedPmEmails || "—"}</TableCell>
                  <TableCell>
                    {briefingEmpty ? (
                      <StatusBadge tone="neutral">Vazio</StatusBadge>
                    ) : (
                      <StatusBadge tone="success">Preenchido</StatusBadge>
                    )}
                  </TableCell>
                  <TableCell className="text-right">
                    <Link href={`/admin/clients/${client.id}`}>
                      <ChevronRightIcon className="size-4 text-muted-foreground" />
                    </Link>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      )}
    </PageShell>
  );
}
