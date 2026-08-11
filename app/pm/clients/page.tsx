import Link from "next/link";
import { PlusIcon, UsersIcon, ChevronRightIcon } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { ClientListLink } from "@/components/clients/client-list-link";
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
  briefing: string | null;
};

/**
 * PM client list. D-12: zero additional app-layer filtering beyond the
 * RLS-scoped query — `clients_select_scoped` already returns only clients
 * in `pm_assigned_clients()` for a PM caller.
 */
export default async function PmClientsPage() {
  const supabase = await createClient();

  const { data } = await supabase
    .from("clients")
    .select("id, name, briefing")
    // P1 pivot 2026-08-04: excludes soft-deleted ("Excluir cliente") clients
    // from the active list — archived_at stays set, the row is untouched.
    .is("archived_at", null);

  const clients = (data ?? []) as ClientRow[];

  return (
    <PageShell width="wide">
      <PageTitle
        action={
          <Button asChild>
            <Link href="/pm/clients/new">
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
              <Link href="/pm/clients/new">
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
              <TableHead>Briefing</TableHead>
              <TableHead>
                <span className="sr-only">Abrir</span>
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {clients.map((client) => {
              const briefingEmpty = !client.briefing?.trim();

              // Navigation-flow correction 2026-08-05: a client whose
              // briefing is already filled goes straight to Produção — the
              // briefing form is no longer the default landing screen for
              // an established client. A client with an EMPTY briefing
              // still lands on the briefing form first (same as a freshly
              // created client naturally does, via ClientCreateForm's own
              // redirect to /pm/clients/[id]) — it needs one filled in
              // before Produção is useful. "Editar briefing" (sidebar,
              // visible whenever a client is active) is how a PM reaches
              // the briefing form for an already-filled client afterwards.
              const clientHref = briefingEmpty
                ? `/pm/clients/${client.id}`
                : `/pm/board?client=${client.id}`;

              return (
                <TableRow key={client.id}>
                  <TableCell>
                    <ClientListLink
                      clientId={client.id}
                      href={clientHref}
                      className="flex items-center gap-2 font-medium hover:text-primary"
                    >
                      {client.name}
                    </ClientListLink>
                  </TableCell>
                  <TableCell>
                    {briefingEmpty ? (
                      <StatusBadge tone="neutral">Vazio</StatusBadge>
                    ) : (
                      <StatusBadge tone="success">Preenchido</StatusBadge>
                    )}
                  </TableCell>
                  <TableCell className="text-right">
                    <ClientListLink clientId={client.id} href={clientHref}>
                      <ChevronRightIcon className="size-4 text-muted-foreground" />
                    </ClientListLink>
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
