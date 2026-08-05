"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ImageIcon, VideoIcon, FileTextIcon, LinkIcon } from "lucide-react";

import { forceAdvanceOverride } from "@/lib/actions/card-overrides";
import { STAGE_LABELS } from "@/lib/cards/stages";
import { checklistProgress, isGateBlocked } from "@/lib/cards/checklist-gate";
import type { DriveLinkType } from "@/lib/attachments/drive-url";
import type { AuditCard, AuditClient } from "./page";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogTrigger,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogCancel,
  AlertDialogAction,
} from "@/components/ui/alert-dialog";
import {
  PageShell,
  PageTitle,
  SectionTitle,
  EmptyState,
} from "@/components/layout/page-shell";

const ALL_CLIENTS_VALUE = "all";

// Verbatim UI-SPEC copy (Copywriting Contract) -- never paraphrased.
const FORCE_ADVANCE_CONFIRM_BODY =
  "Este card tem itens do checklist não marcados. Forçar o avanço mesmo assim? Esta ação fica registrada no histórico do card, incluindo quais itens ainda estavam pendentes.";

const ATTACHMENT_TYPE_ICONS: Record<DriveLinkType, typeof ImageIcon> = {
  image: ImageIcon,
  video: VideoIcon,
  pdf: FileTextIcon,
  other: LinkIcon,
};

function formatAuditDate(iso: string): string {
  return new Intl.DateTimeFormat("pt-BR", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(iso));
}

type CardAuditPanelProps = {
  clients: AuditClient[];
  activeClientId: string | null;
  cards: AuditCard[];
  // completed_by / overridden_by / assignee_id id -> display email, resolved
  // server-side (page.tsx) via the privileged resolvePmNames helper — this
  // panel never resolves names itself.
  pmNames: Record<string, string>;
};

/**
 * Admin cross-client card audit screen (CHK-04) — read-plus-override
 * surface, NOT a working board: no drag-and-drop, no card creation. Every
 * row is a card across every client the Admin can see (RLS via
 * `is_admin()`); the row Dialog shows the full checklist/override audit and
 * hosts the D-11 "Forçar avanço" trigger, since 03-UI-SPEC's original
 * placement inside `/pm/board` is unreachable for an Admin
 * (middleware.ts role-routing).
 */
export function CardAuditPanel({
  clients,
  activeClientId,
  cards,
  pmNames,
}: CardAuditPanelProps) {
  const router = useRouter();

  function handleClientFilterChange(value: string) {
    if (value === ALL_CLIENTS_VALUE) {
      router.push("/admin/cards");
      return;
    }
    router.push(`/admin/cards?client=${value}`);
  }

  const clientNames = new Map(clients.map((c) => [c.id, c.name]));

  return (
    <PageShell width="wide">
      <PageTitle>Cards</PageTitle>

      <div className="mb-8">
        <Select
          value={activeClientId ?? ALL_CLIENTS_VALUE}
          onValueChange={handleClientFilterChange}
        >
          <SelectTrigger className="w-full max-w-sm">
            <SelectValue placeholder="Todos os clientes" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL_CLIENTS_VALUE}>Todos os clientes</SelectItem>
            {clients.map((client) => (
              <SelectItem key={client.id} value={client.id}>
                {client.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {cards.length === 0 ? (
        <EmptyState
          title="Nenhum card ainda"
          description="Nenhum card foi criado para os clientes selecionados."
        />
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Cliente</TableHead>
              <TableHead>Título</TableHead>
              <TableHead>Responsável</TableHead>
              <TableHead>Etapa</TableHead>
              <TableHead>Checklist</TableHead>
              <TableHead>Anexos</TableHead>
              <TableHead>
                <span className="sr-only">Avanço forçado</span>
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {cards.map((card) => (
              <CardAuditRow
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

function CardAuditRow({
  card,
  clientName,
  pmNames,
}: {
  card: AuditCard;
  clientName: string;
  pmNames: Record<string, string>;
}) {
  // Controlled Dialog (not DialogTrigger asChild) — TableRow is a plain
  // function component (not React.forwardRef), so wrapping it as a Slot
  // child would trigger a ref-forwarding warning. A row-level onClick
  // driving explicit open state avoids that entirely while still opening
  // the exact same DialogContent.
  const [open, setOpen] = useState(false);
  const progress = checklistProgress(card.checklistItems);
  const assigneeName = card.assignee_id
    ? (pmNames[card.assignee_id] ?? card.assignee_id)
    : "—";
  const hasOverride = card.overrides.length > 0;

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <TableRow
        className="cursor-pointer"
        role="button"
        tabIndex={0}
        onClick={() => setOpen(true)}
        onKeyDown={(event) => {
          if (event.key === "Enter" || event.key === " ") {
            event.preventDefault();
            setOpen(true);
          }
        }}
      >
        <TableCell>{clientName}</TableCell>
        <TableCell className="font-medium">{card.title}</TableCell>
        <TableCell>{assigneeName}</TableCell>
        <TableCell>
          {card.stage ? (
            <StatusBadge tone="neutral">{STAGE_LABELS[card.stage]}</StatusBadge>
          ) : (
            <StatusBadge tone="neutral">Pacote</StatusBadge>
          )}
        </TableCell>
        <TableCell>
          {progress.total === 0 ? (
            "—"
          ) : (
            <StatusBadge
              tone={progress.checked === progress.total ? "success" : "warning"}
            >
              {progress.checked}/{progress.total}
            </StatusBadge>
          )}
        </TableCell>
        <TableCell>{card.attachments.length}</TableCell>
        <TableCell>
          {hasOverride ? (
            <StatusBadge tone="danger">Avanço forçado</StatusBadge>
          ) : null}
        </TableCell>
      </TableRow>
      <CardAuditDialogContent card={card} pmNames={pmNames} />
    </Dialog>
  );
}

function CardAuditDialogContent({
  card,
  pmNames,
}: {
  card: AuditCard;
  pmNames: Record<string, string>;
}) {
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const gateBlocked =
    card.stage === "revisao_interna" && isGateBlocked(card.checklistItems);
  const showForceAdvance = card.stage === "revisao_interna" && gateBlocked;

  function handleForceAdvance() {
    setError(null);
    startTransition(async () => {
      const result = await forceAdvanceOverride({ cardId: card.id });
      if (result.error) {
        setError(result.error);
      }
    });
  }

  return (
    <DialogContent>
      <DialogHeader>
        <DialogTitle>{card.title}</DialogTitle>
      </DialogHeader>
      <div className="flex flex-col gap-4">
        <StatusBadge tone="neutral">
          {card.stage ? STAGE_LABELS[card.stage] : "Pacote"}
        </StatusBadge>

        <div className="flex flex-col gap-2">
          <SectionTitle>Descrição</SectionTitle>
          <p className="text-body whitespace-pre-wrap">
            {card.description && card.description.length > 0
              ? card.description
              : "Sem descrição."}
          </p>
        </div>

        <div className="flex flex-col gap-2">
          <SectionTitle>Anexos</SectionTitle>
          {card.attachments.length === 0 ? (
            <span className="text-meta text-muted-foreground">
              Nenhum anexo.
            </span>
          ) : (
            <div className="flex flex-col gap-2">
              {card.attachments.map((attachment) => {
                const Icon = ATTACHMENT_TYPE_ICONS[attachment.link_type];
                return (
                  <div
                    key={attachment.id}
                    className="flex items-center gap-xs"
                  >
                    <Icon className="size-4 shrink-0 text-muted-foreground" />
                    <a
                      href={attachment.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="truncate text-body underline-offset-4 hover:underline"
                    >
                      {attachment.label && attachment.label.length > 0
                        ? attachment.label
                        : attachment.url}
                    </a>
                    <Badge variant="outline">{attachment.link_type}</Badge>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {card.checklistItems.length > 0 ? (
          <div className="flex flex-col gap-2">
            <SectionTitle>Checklist de revisão</SectionTitle>
            <div className="flex flex-col gap-2">
              {card.checklistItems.map((item) => {
                const checked = item.completed_at !== null;
                const completedByName = item.completed_by
                  ? (pmNames[item.completed_by] ?? item.completed_by)
                  : null;
                return (
                  <div key={item.id} className="flex flex-col gap-1">
                    <div className="flex items-center gap-1">
                      <input
                        type="checkbox"
                        checked={checked}
                        disabled
                        readOnly
                        aria-label={item.label}
                      />
                      <span className="text-body">{item.label}</span>
                    </div>
                    {checked && item.completed_at ? (
                      <span className="text-meta text-muted-foreground">
                        Marcado por {completedByName} em{" "}
                        {formatAuditDate(item.completed_at)}
                      </span>
                    ) : null}
                  </div>
                );
              })}
            </div>
          </div>
        ) : null}

        {card.overrides.length > 0 ? (
          <div className="flex flex-col gap-2">
            <SectionTitle>Histórico de avanços forçados</SectionTitle>
            <div className="flex flex-col gap-2">
              {card.overrides.map((override) => {
                const overriddenByName =
                  pmNames[override.overridden_by] ?? override.overridden_by;
                return (
                  <div key={override.id} className="flex flex-col gap-0.5">
                    <span className="text-meta text-muted-foreground">
                      Marcado por {overriddenByName} em{" "}
                      {formatAuditDate(override.occurred_at)} —{" "}
                      {STAGE_LABELS[override.from_stage]} para{" "}
                      {STAGE_LABELS[override.to_stage]}
                    </span>
                    <span className="text-meta text-muted-foreground">
                      Itens pendentes: {override.unchecked_item_labels.join(", ")}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        ) : null}
      </div>

      {error ? <ErrorBox>{error}</ErrorBox> : null}

      {showForceAdvance ? (
        <DialogFooter>
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button type="button" variant="destructive" disabled={isPending}>
                {isPending ? "Forçando avanço..." : "Forçar avanço"}
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Forçar avanço do card</AlertDialogTitle>
                <AlertDialogDescription>
                  {FORCE_ADVANCE_CONFIRM_BODY}
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancelar</AlertDialogCancel>
                <AlertDialogAction
                  variant="destructive"
                  onClick={handleForceAdvance}
                >
                  Forçar avanço
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </DialogFooter>
      ) : null}
    </DialogContent>
  );
}
