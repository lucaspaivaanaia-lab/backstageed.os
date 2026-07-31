"use client";

import { useOptimistic, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";
import { PlusIcon } from "lucide-react";
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  KeyboardSensor,
  useSensor,
  useSensors,
  closestCorners,
} from "@dnd-kit/core";
import type { Announcements, DragEndEvent, DragStartEvent } from "@dnd-kit/core";

import { createCard, advanceStage, toggleChecklistItem, moveCard } from "./actions";
import { createCardSchema, type CreateCardInput } from "@/lib/validation/cards";
import { STAGE_LABELS, STAGE_ORDER, type CardStage } from "@/lib/cards/stages";
import {
  checklistProgress,
  isGateBlocked,
  GATE_BLOCKED_MESSAGE,
} from "@/lib/cards/checklist-gate";
import { evaluateMove } from "@/lib/cards/move-rules";
import {
  DraggableCard,
  cardIdFromDraggableId,
} from "./draggable-card";
import { DroppableColumn, stageFromDroppableId } from "./droppable-column";
import type {
  BoardCard,
  BoardChecklistItem,
  BoardClient,
  BoardColumn,
} from "./page";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { DataCard } from "@/components/ui/data-card";
import { StatusBadge } from "@/components/ui/status-badge";
import { ErrorBox } from "@/components/ui/error-box";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogTrigger,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Form,
  FormField,
  FormItem,
  FormLabel,
  FormControl,
  FormMessage,
} from "@/components/ui/form";
import {
  PageShell,
  PageTitle,
  SectionTitle,
  EmptyState,
} from "@/components/layout/page-shell";

type BoardPanelProps = {
  clients: BoardClient[];
  activeClientId: string | null;
  columns: BoardColumn[];
  // Package parents (stage === null) are excluded from every column and
  // deliberately not rendered yet — plan 03-06's slice (03-RESEARCH.md
  // Pitfall 4). Accepted here only so page.tsx's shape stays stable across
  // plans; this panel does not read it.
  packages: BoardCard[];
  // completed_by id -> display email, resolved server-side (page.tsx) via
  // the privileged resolvePmNames helper — this panel never resolves names
  // itself.
  pmNames: Record<string, string>;
  // Whether the active client has a checklist template assigned. Drives
  // the "Nenhum checklist configurado" informational notice — never used
  // to disable "Avançar" (that stays gated by isGateBlocked alone).
  hasChecklistTemplate: boolean;
};

const CARD_CREATED_TOAST = "Card criado.";

function formatCreatedAt(iso: string): string {
  return new Intl.DateTimeFormat("pt-BR", { dateStyle: "medium" }).format(
    new Date(iso)
  );
}

function formatCompletedAt(iso: string): string {
  return new Intl.DateTimeFormat("pt-BR", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(iso));
}

/**
 * "Criar card" trigger + Dialog (KAN-01, single-post path this plan — the
 * package option is added to this same selector by plan 03-06, so cardType
 * is fixed to "single" here rather than exposed as a field). Reused as-is
 * for both the PageTitle action slot and the "no cards yet" EmptyState
 * action.
 */
function CreateCardButton({ clientId }: { clientId: string | null }) {
  const [open, setOpen] = useState(false);
  const [isPending, startTransition] = useTransition();
  const [serverError, setServerError] = useState<string | null>(null);

  const form = useForm<CreateCardInput>({
    resolver: zodResolver(createCardSchema),
    defaultValues: { clientId: clientId ?? "", title: "", cardType: "single" },
  });

  function handleOpenChange(next: boolean) {
    setOpen(next);
    if (next) {
      setServerError(null);
      form.reset({ clientId: clientId ?? "", title: "", cardType: "single" });
    }
  }

  function onSubmit(values: CreateCardInput) {
    setServerError(null);
    startTransition(async () => {
      const result = await createCard(values);
      if ("error" in result) {
        setServerError(result.error);
        return;
      }
      toast.success(CARD_CREATED_TOAST);
      setOpen(false);
    });
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>
        <Button type="button" disabled={!clientId}>
          <PlusIcon className="size-4" />
          Criar card
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Criar card</DialogTitle>
        </DialogHeader>
        <Form {...form}>
          <form
            onSubmit={form.handleSubmit(onSubmit)}
            className="flex flex-col gap-4"
          >
            <FormField
              control={form.control}
              name="title"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Título</FormLabel>
                  <FormControl>
                    <Input {...field} disabled={isPending} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            {serverError ? <ErrorBox>{serverError}</ErrorBox> : null}
            <Button type="submit" disabled={isPending} className="w-fit">
              {isPending ? "Criando..." : "Criar card"}
            </Button>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}

/**
 * Checklist item row (CHK-03/CHK-04): a Checkbox + label, toggled via the
 * `toggleChecklistItem` Server Action inside `useTransition`. Interactive
 * only while the owning card's stage is exactly `revisao_interna` — in
 * later stages the checkbox renders `disabled` so the record stays
 * readable but immutable. The checked state and audit line always derive
 * from the server-supplied `item`, never local-only state.
 */
function ChecklistItemRow({
  item,
  pmNames,
  interactive,
}: {
  item: BoardChecklistItem;
  pmNames: Record<string, string>;
  interactive: boolean;
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
          disabled={!interactive || isPending}
          onCheckedChange={(next) => handleCheckedChange(next === true)}
        />
        <span className="text-body">{item.label}</span>
      </div>
      {checked && item.completed_at ? (
        <span className="text-meta text-muted-foreground">
          Marcado por {completedByName} em {formatCompletedAt(item.completed_at)}
        </span>
      ) : null}
    </div>
  );
}

/**
 * A single Kanban card + its detail Dialog (KAN-02, D-05, CHK-03). "Avançar"
 * is a plain Server Action call inside useTransition — no client-side
 * stage computation, `nextStage` runs only on the server
 * (app/pm/board/actions.ts). Server errors render verbatim inside
 * ErrorBox, never paraphrased. The checklist section and the "Avançar"
 * disabled attribute derive entirely from the server-supplied
 * `card.checklistItems` via the shared `checklistProgress`/`isGateBlocked`
 * predicates — never recomputed from local-only state.
 */
function BoardCardItem({
  card,
  pmNames,
  hasChecklistTemplate,
}: {
  card: BoardCard;
  pmNames: Record<string, string>;
  hasChecklistTemplate: boolean;
}) {
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const isLastStage = card.stage === "agendamento";

  const progress = checklistProgress(card.checklistItems);
  const gateBlocked = card.stage === "revisao_interna" && isGateBlocked(card.checklistItems);
  const showChecklistSection =
    card.stage !== null &&
    STAGE_ORDER.indexOf(card.stage) >= STAGE_ORDER.indexOf("revisao_interna");
  const isInRevisaoInterna = card.stage === "revisao_interna";

  function handleAdvance() {
    setError(null);
    startTransition(async () => {
      const result = await advanceStage({ cardId: card.id });
      if (result.error) {
        setError(result.error);
      }
    });
  }

  return (
    <Dialog>
      <DialogTrigger asChild>
        <div role="button" tabIndex={0} className="cursor-pointer text-left">
          <DataCard
            title={card.title}
            meta={`Criado em ${formatCreatedAt(card.created_at)}`}
            badge={
              card.stage === "revisao_interna" ? (
                hasChecklistTemplate ? (
                  <StatusBadge
                    tone={progress.checked === progress.total ? "success" : "warning"}
                  >
                    {progress.checked}/{progress.total} concluídos
                  </StatusBadge>
                ) : (
                  <StatusBadge tone="neutral">Sem checklist</StatusBadge>
                )
              ) : undefined
            }
          />
        </div>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{card.title}</DialogTitle>
        </DialogHeader>
        <div className="flex flex-col gap-4">
          <StatusBadge tone="neutral">
            {card.stage ? STAGE_LABELS[card.stage] : "—"}
          </StatusBadge>

          {showChecklistSection ? (
            <div className="flex flex-col gap-2">
              <SectionTitle>Checklist de revisão</SectionTitle>
              {card.checklistItems.length === 0 && !hasChecklistTemplate ? (
                <EmptyState
                  title="Nenhum checklist configurado"
                  description="Este cliente ainda não tem um checklist de revisão atribuído. Peça a um Admin para configurar um em Checklists."
                />
              ) : (
                <div className="flex flex-col gap-2">
                  {card.checklistItems.map((item) => (
                    <ChecklistItemRow
                      key={item.id}
                      item={item}
                      pmNames={pmNames}
                      interactive={isInRevisaoInterna}
                    />
                  ))}
                </div>
              )}
            </div>
          ) : null}
        </div>

        {gateBlocked ? (
          <span className="text-meta text-muted-foreground">
            {GATE_BLOCKED_MESSAGE}
          </span>
        ) : null}
        {error ? <ErrorBox>{error}</ErrorBox> : null}
        <DialogFooter>
          <Button
            type="button"
            disabled={isLastStage || isPending || gateBlocked}
            onClick={handleAdvance}
          >
            {isPending ? "Avançando..." : "Avançar"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/**
 * Finds a card by id across every column's `cards` array. Returns `null`
 * when the id is not found (e.g. a stale draggable id after a revalidate) —
 * every caller of this helper must treat that as a silent no-op, never a
 * crash.
 */
function findCard(cols: BoardColumn[], cardId: string): BoardCard | null {
  for (const column of cols) {
    const found = column.cards.find((c) => c.id === cardId);
    if (found) return found;
  }
  return null;
}

const SCREEN_READER_INSTRUCTIONS = {
  draggable:
    "Para mover um card com o teclado, foque a alça de arrastar e pressione espaço. Use as setas para escolher a coluna e pressione espaço novamente para soltar. Pressione Escape para cancelar.",
};

/**
 * Client switcher + five-column Kanban board (KAN-03, D-10, D-12, D-13). The
 * active client lives in the URL (`?client=<id>`) so it survives a reload
 * and a revalidate — switching pushes a new URL rather than holding local
 * state. D-12 (supersedes D-05): the board now supports drag-and-drop card
 * movement, in addition to the unchanged "Avançar" button — dnd-kit's
 * `DndContext` wraps only the five-column region, with pointer + keyboard
 * sensors, Portuguese screen-reader announcements, an optimistic move via
 * `useOptimistic`, and a client-side `evaluateMove` pre-check for instant
 * snap-back feedback (D-13) before the `moveCard` Server Action — the real
 * security boundary — re-validates and writes.
 */
export function BoardPanel({
  clients,
  activeClientId,
  columns,
  pmNames,
  hasChecklistTemplate,
}: BoardPanelProps) {
  const router = useRouter();

  const activeClient = clients.find((c) => c.id === activeClientId) ?? null;
  const hasCards = columns.some((column) => column.cards.length > 0);

  // Optimistic layer only — removes the round-trip flicker while `moveCard`
  // is in flight. `moveCard`'s own `revalidatePath("/pm/board")` is the
  // authority; React discards this optimistic state automatically once the
  // transition settles, whether the server accepted or rejected the move.
  const [optimisticColumns, applyOptimisticMove] = useOptimistic(
    columns,
    (state: BoardColumn[], move: { cardId: string; toStage: CardStage }) => {
      const movingCard = findCard(state, move.cardId);
      if (!movingCard) return state;
      return state.map((column) => {
        if (column.stage === move.toStage) {
          return {
            ...column,
            cards: [
              ...column.cards.filter((c) => c.id !== move.cardId),
              { ...movingCard, stage: move.toStage },
            ],
          };
        }
        return {
          ...column,
          cards: column.cards.filter((c) => c.id !== move.cardId),
        };
      });
    }
  );

  const sensors = useSensors(
    // 8px activation distance lets a plain click on the card body still
    // open the detail Dialog instead of starting a drag.
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    // KeyboardSensor makes D-12's accessibility requirement real.
    useSensor(KeyboardSensor)
  );

  const [activeCard, setActiveCard] = useState<BoardCard | null>(null);
  const [isMoving, startMoveTransition] = useTransition();

  function handleDragStart(event: DragStartEvent) {
    const cardId = cardIdFromDraggableId(String(event.active.id));
    if (!cardId) return;
    setActiveCard(findCard(optimisticColumns, cardId));
  }

  function handleDragEnd(event: DragEndEvent) {
    setActiveCard(null);

    const cardId = cardIdFromDraggableId(String(event.active.id));
    if (!cardId) return;

    const toStage = event.over
      ? stageFromDroppableId(String(event.over.id))
      : null;
    // Dropped outside any column — the card snaps back on its own, nothing
    // to call.
    if (!toStage) return;

    const card = findCard(optimisticColumns, cardId);
    if (!card || !card.stage) return;

    // Dropping back on the origin column is a silent no-op.
    if (card.stage === toStage) return;

    // D-13: the client-side pre-check for instant snap-back feedback. No
    // optimistic update is applied on a rejection — the card simply stays
    // where it visually is, and the toast carries the shared constant
    // verbatim, never a locally retyped string.
    const decision = evaluateMove(card.stage, toStage, card.checklistItems);
    if (!decision.allowed) {
      toast.error(decision.reason);
      return;
    }

    startMoveTransition(async () => {
      applyOptimisticMove({ cardId, toStage });
      const result = await moveCard({ cardId, toStage });
      if (result.error) toast.error(result.error);
    });
  }

  function handleDragCancel() {
    setActiveCard(null);
  }

  const announcements: Announcements = {
    onDragStart({ active }) {
      const cardId = cardIdFromDraggableId(String(active.id));
      const card = cardId ? findCard(optimisticColumns, cardId) : null;
      if (!card) return undefined;
      return `Card ${card.title} selecionado. Use as setas para escolher a coluna.`;
    },
    onDragOver({ active, over }) {
      const cardId = cardIdFromDraggableId(String(active.id));
      const card = cardId ? findCard(optimisticColumns, cardId) : null;
      const stage = over ? stageFromDroppableId(String(over.id)) : null;
      if (!card || !stage) return undefined;
      return `Card ${card.title} sobre a coluna ${STAGE_LABELS[stage]}.`;
    },
    onDragEnd({ active, over }) {
      const cardId = cardIdFromDraggableId(String(active.id));
      const card = cardId ? findCard(optimisticColumns, cardId) : null;
      if (!card) return undefined;
      const stage = over ? stageFromDroppableId(String(over.id)) : null;
      if (!stage) {
        return `Card ${card.title} solto fora de uma coluna. Nada foi alterado.`;
      }
      return `Card ${card.title} solto na coluna ${STAGE_LABELS[stage]}.`;
    },
    onDragCancel({ active }) {
      const cardId = cardIdFromDraggableId(String(active.id));
      const card = cardId ? findCard(optimisticColumns, cardId) : null;
      if (!card || !card.stage) return undefined;
      return `Movimentação cancelada. O card ${card.title} permanece em ${STAGE_LABELS[card.stage]}.`;
    },
  };

  function handleSwitchClient(clientId: string) {
    router.push(`/pm/board?client=${clientId}`);
  }

  return (
    <PageShell width="wide">
      <PageTitle action={<CreateCardButton clientId={activeClientId} />}>
        Produção
      </PageTitle>

      <div className="mb-8">
        <Select
          value={activeClientId ?? undefined}
          onValueChange={handleSwitchClient}
        >
          <SelectTrigger className="w-full max-w-sm">
            <SelectValue placeholder="Selecionar cliente" />
          </SelectTrigger>
          <SelectContent>
            {clients.map((client) => (
              <SelectItem key={client.id} value={client.id}>
                {client.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {!activeClient ? (
        <EmptyState
          title="Nenhum cliente selecionado"
          description="Selecione um cliente acima para ver o board de produção."
        />
      ) : !hasCards ? (
        <EmptyState
          title="Nenhum card ainda"
          description="Crie o primeiro card deste cliente para começar a organizar a produção."
          action={<CreateCardButton clientId={activeClientId} />}
        />
      ) : (
        <DndContext
          sensors={sensors}
          collisionDetection={closestCorners}
          accessibility={{
            announcements,
            screenReaderInstructions: SCREEN_READER_INSTRUCTIONS,
          }}
          onDragStart={handleDragStart}
          onDragEnd={handleDragEnd}
          onDragCancel={handleDragCancel}
        >
          <div
            className="flex gap-6 overflow-x-auto pb-4"
            aria-busy={isMoving}
          >
            {optimisticColumns.map((column) => (
              <div
                key={column.stage}
                className="flex w-[280px] shrink-0 flex-col gap-2"
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="text-body font-medium">
                    {STAGE_LABELS[column.stage]}
                  </span>
                  <StatusBadge tone="neutral">{column.cards.length}</StatusBadge>
                </div>
                <DroppableColumn stage={column.stage}>
                  {column.cards.map((card) => (
                    <DraggableCard key={card.id} cardId={card.id} title={card.title}>
                      <BoardCardItem
                        card={card}
                        pmNames={pmNames}
                        hasChecklistTemplate={hasChecklistTemplate}
                      />
                    </DraggableCard>
                  ))}
                </DroppableColumn>
              </div>
            ))}
          </div>
          <DragOverlay>
            {activeCard ? (
              <DataCard title={activeCard.title} className="cursor-grabbing shadow-lg" />
            ) : null}
          </DragOverlay>
        </DndContext>
      )}
    </PageShell>
  );
}
