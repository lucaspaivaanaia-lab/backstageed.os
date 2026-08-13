"use client";

import { useRouter } from "next/navigation";

import { STAGE_LABELS } from "@/lib/cards/stages";
import { stalenessTier, stalenessBadgeCopy, stalenessTone } from "@/lib/cards/staleness";
import type { OversightClient, OversightCard } from "./page";
import { StatusBadge } from "@/components/ui/status-badge";
import { ErrorBox } from "@/components/ui/error-box";
import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
} from "@/components/ui/table";
import { PageShell, PageTitle, EmptyState } from "@/components/layout/page-shell";

type OversightPanelProps = {
  clients: OversightClient[];
  cards: OversightCard[];
  // assignee_id -> display email, resolved server-side (page.tsx) via the
  // privileged resolvePmNames helper — this panel never resolves names
  // itself.
  pmNames: Record<string, string>;
  loadError: boolean;
};

/**
 * Admin cross-client oversight dashboard (ADM-01/ADM-02/ADM-03) — a
 * read-only triage surface: zero Server Actions, zero mutations,
 * drill-down by navigation only. Deliberately does not duplicate
 * `/admin/cards`'s checklist/override audit purpose — that screen keeps
 * its own Dialog-based per-card detail; this screen's only interaction is
 * whole-row navigation into `/pm/board`.
 */
export function OversightPanel({
  clients,
  cards,
  pmNames,
  loadError,
}: OversightPanelProps) {
  const clientNames = new Map(clients.map((c) => [c.id, c.name]));

  return (
    <PageShell width="wide">
      <PageTitle>Visão geral</PageTitle>

      {loadError && (
        <div className="mb-6">
          <ErrorBox>
            Não foi possível carregar os dados. Atualize a página e tente
            novamente.
          </ErrorBox>
        </div>
      )}

      {cards.length === 0 ? (
        <EmptyState
          title="Nenhum card ainda"
          description="Nenhum card foi criado ainda em nenhum cliente."
        />
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Cliente</TableHead>
              <TableHead>Título</TableHead>
              <TableHead>Responsável</TableHead>
              <TableHead>Etapa</TableHead>
              <TableHead>Atualizado</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {cards.map((card) => (
              <OversightRow
                key={card.id}
                card={card}
                clientName={clientNames.get(card.client_id) ?? "—"}
                pmNames={pmNames}
              />
            ))}
          </TableBody>
        </Table>
      )}
    </PageShell>
  );
}

function OversightRow({
  card,
  clientName,
  pmNames,
}: {
  card: OversightCard;
  clientName: string;
  pmNames: Record<string, string>;
}) {
  const router = useRouter();
  const assigneeName = card.assignee_id
    ? (pmNames[card.assignee_id] ?? card.assignee_id)
    : "—";

  function activate() {
    router.push(`/pm/board?client=${card.client_id}`);
  }

  return (
    <TableRow
      className="cursor-pointer"
      role="button"
      tabIndex={0}
      aria-label={`Abrir o board de ${clientName}`}
      onClick={activate}
      onKeyDown={(event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          activate();
        }
      }}
    >
      <TableCell>{clientName}</TableCell>
      <TableCell className="font-medium">{card.title}</TableCell>
      <TableCell>{assigneeName}</TableCell>
      <TableCell>
        <StatusBadge tone="neutral">{STAGE_LABELS[card.stage]}</StatusBadge>
      </TableCell>
      <TableCell>
        <StatusBadge tone={stalenessTone(stalenessTier(card.daysSinceUpdate))}>
          {stalenessBadgeCopy(card.daysSinceUpdate)}
        </StatusBadge>
      </TableCell>
    </TableRow>
  );
}
