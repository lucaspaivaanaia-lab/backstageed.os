import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { resolvePmNames } from "@/lib/actions/clients";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
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
 * PM client list. D-12: zero additional app-layer filtering beyond the
 * RLS-scoped query — `clients_select_scoped` already returns only clients
 * in `pm_assigned_clients()` for a PM caller.
 */
export default async function PmClientsPage() {
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
            <Link href="/pm/clients/new">Criar cliente</Link>
          </Button>
        }
      >
        Clientes
      </PageTitle>

      {clients.length === 0 ? (
        <EmptyState
          title="Nenhum cliente cadastrado ainda"
          description="Crie o primeiro cliente para organizar produção de conteúdo e RAG isolado por cliente."
          action={
            <Button asChild>
              <Link href="/pm/clients/new">Criar cliente</Link>
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
                      href={`/pm/clients/${client.id}`}
                      className="hover:underline"
                    >
                      {client.name}
                    </Link>
                  </TableCell>
                  <TableCell>{assignedPmEmails || "—"}</TableCell>
                  <TableCell>
                    {briefingEmpty ? (
                      <Badge variant="outline">Vazio</Badge>
                    ) : (
                      <Badge variant="secondary">Preenchido</Badge>
                    )}
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
