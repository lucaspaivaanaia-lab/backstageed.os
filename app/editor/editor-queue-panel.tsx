"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { STAGE_LABELS } from "@/lib/cards/stages";
import { checklistProgress } from "@/lib/cards/checklist-gate";
import { updateCardDescriptionAsEditor } from "./actions";
import { toggleChecklistItem } from "@/app/pm/board/actions";
import { PageShell, PageTitle, SectionTitle, EmptyState } from "@/components/layout/page-shell";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { DataCard } from "@/components/ui/data-card";
import { StatusBadge } from "@/components/ui/status-badge";
import { ErrorBox } from "@/components/ui/error-box";
import {
  Dialog,
  DialogTrigger,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import type { EditorQueueCard, EditorChecklistItem, EditorAttachment } from "./page";

function formatDueDate(iso: string | null): string {
  if (!iso) return "Sem prazo";
  return new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short" }).format(
    new Date(iso)
  );
}

function EditorChecklistItemRow({
  item,
  pmNames,
}: {
  item: EditorChecklistItem;
  pmNames: Record<string, string>;
}) {
  const [isPending, startTransition] = useTransition();
  const checked = item.completed_at !== null;

  function handleCheckedChange(next: boolean) {
    startTransition(async () => {
      await toggleChecklistItem({ itemId: item.id, completed: next });
    });
  }

  const completedByName = item.completed_by
    ? (pmNames[item.completed_by] ?? item.completed_by)
    : null;

  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-center gap-1">
        <Checkbox
          checked={checked}
          disabled={isPending}
          onCheckedChange={(next) => handleCheckedChange(next === true)}
        />
        <span className="text-body">{item.label}</span>
      </div>
      {checked && item.completed_at ? (
        <span className="text-meta text-muted-foreground">
          Marcado por {completedByName} em{" "}
          {new Intl.DateTimeFormat("pt-BR", { dateStyle: "medium", timeStyle: "short" }).format(
            new Date(item.completed_at)
          )}
        </span>
      ) : null}
    </div>
  );
}

function EditorAttachmentRow({ attachment }: { attachment: EditorAttachment }) {
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

function EditorCardDialogBody({
  card,
  pmNames,
}: {
  card: EditorQueueCard;
  pmNames: Record<string, string>;
}) {
  const [draftDescription, setDraftDescription] = useState(card.description ?? "");
  const [isSaving, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const hasChanges = draftDescription.trim() !== (card.description ?? "");

  function handleSave() {
    setError(null);
    startTransition(async () => {
      const result = await updateCardDescriptionAsEditor({
        cardId: card.id,
        description: draftDescription.trim().length > 0 ? draftDescription.trim() : null,
      });
      if (result.error) {
        setError(result.error);
        return;
      }
      toast.success("Descrição salva.");
    });
  }

  return (
    <>
      <DialogHeader>
        <DialogTitle>{card.title}</DialogTitle>
      </DialogHeader>
      <div className="flex flex-col gap-4">
        <div className="flex items-center gap-2">
          <StatusBadge tone="neutral">{card.stage ? STAGE_LABELS[card.stage] : "—"}</StatusBadge>
          <span className="text-meta text-muted-foreground">
            {card.clientName} · {formatDueDate(card.due_date)}
          </span>
        </div>

        <div className="flex flex-col gap-2">
          <SectionTitle>Descrição</SectionTitle>
          <Textarea
            value={draftDescription}
            onChange={(event) => setDraftDescription(event.target.value)}
            rows={6}
            placeholder="Sem descrição."
            disabled={isSaving}
          />
          <Button
            type="button"
            onClick={handleSave}
            disabled={isSaving || !hasChanges}
            className="w-fit"
          >
            {isSaving ? "Salvando..." : "Salvar descrição"}
          </Button>
          {error ? <ErrorBox>{error}</ErrorBox> : null}
        </div>

        {card.attachments.length > 0 ? (
          <div className="flex flex-col gap-2">
            <SectionTitle>Anexos</SectionTitle>
            <div className="flex flex-col gap-1">
              {card.attachments.map((attachment) => (
                <EditorAttachmentRow key={attachment.id} attachment={attachment} />
              ))}
            </div>
          </div>
        ) : null}

        {card.checklistItems.length > 0 ? (
          <div className="flex flex-col gap-2">
            <SectionTitle>Checklist de revisão</SectionTitle>
            <div className="flex flex-col gap-2">
              {card.checklistItems.map((item) => (
                <EditorChecklistItemRow key={item.id} item={item} pmNames={pmNames} />
              ))}
            </div>
          </div>
        ) : null}
      </div>
    </>
  );
}

/**
 * Editor's queue (item 3, 260811-oe0-CONTEXT.md) -- a plain, ordered list,
 * NOT a Kanban board (Claude's Discretion: no "Avançar", no drag-and-drop,
 * no stage columns -- the Editor cannot advance stage or move cards at
 * all). Each row opens a Dialog restricted to Descrição (via
 * updateCardDescriptionAsEditor) + checklist toggle (via the SAME
 * toggleChecklistItem Server Action app/pm/board's board-panel.tsx already
 * uses -- card_checklist_items_update_scoped's new Editor branch, migration
 * 0031, is what makes this call succeed for the Editor's own cards) +
 * read-only attachments -- no assignee/channel/due_date field anywhere in
 * this component.
 */
export function EditorQueuePanel({
  cards,
  pmNames,
}: {
  cards: EditorQueueCard[];
  pmNames: Record<string, string>;
}) {
  return (
    <PageShell>
      <PageTitle>Meus cards</PageTitle>
      {cards.length === 0 ? (
        <EmptyState
          title="Nenhum card atribuído"
          description="Você ainda não é o Designer/Mídia de nenhum card."
        />
      ) : (
        <div className="flex flex-col gap-3">
          {cards.map((card) => {
            const progress = checklistProgress(card.checklistItems);
            return (
              <Dialog key={card.id}>
                <DialogTrigger asChild>
                  <div role="button" tabIndex={0} className="cursor-pointer text-left">
                    <DataCard
                      title={card.title}
                      meta={`${card.clientName} · ${formatDueDate(card.due_date)}`}
                      badge={
                        <StatusBadge tone="neutral">
                          {card.stage ? STAGE_LABELS[card.stage] : "—"}
                        </StatusBadge>
                      }
                      description={
                        card.checklistItems.length > 0
                          ? `${progress.checked}/${progress.total} itens do checklist`
                          : undefined
                      }
                    />
                  </div>
                </DialogTrigger>
                <DialogContent>
                  <EditorCardDialogBody card={card} pmNames={pmNames} />
                </DialogContent>
              </Dialog>
            );
          })}
        </div>
      )}
    </PageShell>
  );
}
