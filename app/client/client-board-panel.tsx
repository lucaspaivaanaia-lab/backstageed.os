"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { approveCard, requestAdjustment } from "./actions";
import { isReadyToPublish } from "@/lib/cards/publish-status";
import { PageShell, PageTitle, SectionTitle, EmptyState } from "@/components/layout/page-shell";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { DataCard } from "@/components/ui/data-card";
import { StatusBadge } from "@/components/ui/status-badge";
import { ErrorBox } from "@/components/ui/error-box";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import {
  Dialog,
  DialogTrigger,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import type { ClientBoardCard, ClientCardAttachment } from "./page";

function formatPublishAt(iso: string): string {
  return new Intl.DateTimeFormat("pt-BR", { dateStyle: "medium", timeStyle: "short" }).format(
    new Date(iso)
  );
}

function ClientAttachmentRow({ attachment }: { attachment: ClientCardAttachment }) {
  return (
    <a
      href={attachment.url}
      target="_blank"
      rel="noreferrer"
      className="text-body text-primary underline"
    >
      {attachment.label ?? attachment.url}
    </a>
  );
}

function ClientCardDialogBody({
  card,
  mode,
}: {
  card: ClientBoardCard;
  mode: "queue" | "history";
}) {
  const [comment, setComment] = useState("");
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const badge =
    mode === "queue" ? (
      <StatusBadge tone="info">Aguardando sua revisão</StatusBadge>
    ) : isReadyToPublish(card) ? (
      <StatusBadge tone="success">Pronto para publicar</StatusBadge>
    ) : (
      <StatusBadge tone="success">Aprovado</StatusBadge>
    );

  function handleApprove() {
    setError(null);
    startTransition(async () => {
      const result = await approveCard({ cardId: card.id });
      if (result.error) {
        setError(result.error);
        return;
      }
      toast.success("Conteúdo aprovado.");
    });
  }

  function handleRequestAdjustment() {
    setError(null);
    startTransition(async () => {
      const result = await requestAdjustment({ cardId: card.id, comment: comment.trim() });
      if (result.error) {
        setError(result.error);
        return;
      }
      toast.success("Ajuste solicitado.");
    });
  }

  return (
    <>
      <DialogHeader>
        <DialogTitle>{card.title}</DialogTitle>
      </DialogHeader>
      <div className="flex flex-col gap-4">
        <div className="flex items-center gap-2">{badge}</div>

        {card.description ? (
          <p className="text-body whitespace-pre-wrap">{card.description}</p>
        ) : null}

        {card.attachments.length > 0 ? (
          <div className="flex flex-col gap-2">
            <SectionTitle>Anexos</SectionTitle>
            <div className="flex flex-col gap-1">
              {card.attachments.map((attachment) => (
                <ClientAttachmentRow key={attachment.id} attachment={attachment} />
              ))}
            </div>
          </div>
        ) : null}

        {mode === "queue" ? (
          <div className="flex flex-col gap-2">
            <SectionTitle>Sua avaliação</SectionTitle>
            <Textarea
              value={comment}
              onChange={(event) => setComment(event.target.value)}
              rows={4}
              placeholder="Descreva o que precisa mudar (obrigatório apenas para solicitar ajuste)"
              disabled={isPending}
            />
            <div className="flex gap-2">
              <Button type="button" onClick={handleApprove} disabled={isPending}>
                {isPending ? "Enviando..." : "Aprovar"}
              </Button>
              <Button
                type="button"
                variant="outline"
                onClick={handleRequestAdjustment}
                disabled={isPending || comment.trim().length === 0}
              >
                {isPending ? "Enviando..." : "Solicitar ajuste"}
              </Button>
            </div>
            {error ? <ErrorBox>{error}</ErrorBox> : null}
          </div>
        ) : null}
      </div>
    </>
  );
}

/**
 * Client's two-tab board (APR-01/APR-02/APR-03, KAN-04, D-01) — "Para
 * revisar" (queue, stage aprovacao_cliente) and "Histórico" (stage
 * agendamento, read-only). Minimal surface only (04-UI-SPEC.md): title,
 * description, attachments. No internal PM-coordination detail is rendered
 * anywhere on this screen.
 */
export function ClientBoardPanel({
  queueCards,
  historyCards,
}: {
  queueCards: ClientBoardCard[];
  historyCards: ClientBoardCard[];
}) {
  return (
    <PageShell>
      <PageTitle>Meu conteúdo</PageTitle>
      <Tabs defaultValue="queue">
        <TabsList>
          <TabsTrigger value="queue">
            {queueCards.length > 0 ? `Para revisar (${queueCards.length})` : "Para revisar"}
          </TabsTrigger>
          <TabsTrigger value="history">Histórico</TabsTrigger>
        </TabsList>

        <TabsContent value="queue">
          {queueCards.length === 0 ? (
            <EmptyState
              title="Nenhum conteúdo para revisar agora"
              description="Quando a equipe enviar um conteúdo para sua aprovação, ele vai aparecer aqui."
            />
          ) : (
            <div className="flex flex-col gap-3">
              {queueCards.map((card) => (
                <Dialog key={card.id}>
                  <DialogTrigger asChild>
                    <div role="button" tabIndex={0} className="cursor-pointer text-left">
                      <DataCard
                        title={card.title}
                        badge={<StatusBadge tone="info">Aguardando sua revisão</StatusBadge>}
                        description={card.description ?? undefined}
                      />
                    </div>
                  </DialogTrigger>
                  <DialogContent>
                    <ClientCardDialogBody card={card} mode="queue" />
                  </DialogContent>
                </Dialog>
              ))}
            </div>
          )}
        </TabsContent>

        <TabsContent value="history">
          {historyCards.length === 0 ? (
            <EmptyState
              title="Nenhum conteúdo aprovado ainda"
              description="Conteúdos que você aprovar vão aparecer aqui, junto com a data de publicação quando ela for definida."
            />
          ) : (
            <div className="flex flex-col gap-3">
              {historyCards.map((card) => (
                <Dialog key={card.id}>
                  <DialogTrigger asChild>
                    <div role="button" tabIndex={0} className="cursor-pointer text-left">
                      <DataCard
                        title={card.title}
                        badge={
                          isReadyToPublish(card) ? (
                            <StatusBadge tone="success">Pronto para publicar</StatusBadge>
                          ) : (
                            <StatusBadge tone="success">Aprovado</StatusBadge>
                          )
                        }
                        description={card.description ?? undefined}
                        meta={card.publish_at ? formatPublishAt(card.publish_at) : undefined}
                      />
                    </div>
                  </DialogTrigger>
                  <DialogContent>
                    <ClientCardDialogBody card={card} mode="history" />
                  </DialogContent>
                </Dialog>
              ))}
            </div>
          )}
        </TabsContent>
      </Tabs>
    </PageShell>
  );
}
