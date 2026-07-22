import Link from "next/link";
import { CheckCircle2, Clock } from "lucide-react";
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

type ClientRow = {
  id: string;
  name: string;
  tropicalia_project_id: string | null;
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
      "id, name, tropicalia_project_id, objective, tone_of_voice, target_audience, content_pillars, pm_clients(pm_id)"
    );

  const clients = (data ?? []) as ClientRow[];

  const pmIds = Array.from(
    new Set(
      clients.flatMap((c) => (c.pm_clients ?? []).map((pc) => pc.pm_id))
    )
  );
  const pmNames = await resolvePmNames(pmIds);

  return (
    <div className="max-w-4xl mx-auto px-6 py-8">
      <div className="flex items-center justify-between mb-8">
        <h1 className="text-[28px] font-semibold leading-[1.2]">Clientes</h1>
        <Button asChild>
          <Link href="/admin/clients/new">Criar cliente</Link>
        </Button>
      </div>

      {clients.length === 0 ? (
        <div className="flex flex-col items-center gap-6 py-12 text-center">
          <div>
            <h2 className="text-xl font-semibold leading-[1.2]">
              Nenhum cliente cadastrado ainda
            </h2>
            <p className="mt-2 text-sm text-muted-foreground">
              Crie o primeiro cliente para organizar produção de conteúdo e
              RAG isolado por cliente.
            </p>
          </div>
          <Button asChild>
            <Link href="/admin/clients/new">Criar cliente</Link>
          </Button>
        </div>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Nome</TableHead>
              <TableHead>PMs atribuídos</TableHead>
              <TableHead>Briefing</TableHead>
              <TableHead>RAG</TableHead>
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
                  <TableCell>
                    {client.tropicalia_project_id ? (
                      <Badge variant="secondary">
                        <CheckCircle2 /> Pronto
                      </Badge>
                    ) : (
                      <Badge variant="outline">
                        <Clock /> Pendente
                      </Badge>
                    )}
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      )}
    </div>
  );
}
