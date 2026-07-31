"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";
import { PlusIcon } from "lucide-react";

import { createCard, advanceStage } from "./actions";
import { createCardSchema, type CreateCardInput } from "@/lib/validation/cards";
import { STAGE_LABELS } from "@/lib/cards/stages";
import type { BoardCard, BoardClient, BoardColumn } from "./page";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { DataCard } from "@/components/ui/data-card";
import { StatusBadge } from "@/components/ui/status-badge";
import { ErrorBox } from "@/components/ui/error-box";
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
import { PageShell, PageTitle, EmptyState } from "@/components/layout/page-shell";

type BoardPanelProps = {
  clients: BoardClient[];
  activeClientId: string | null;
  columns: BoardColumn[];
  // Package parents (stage === null) are excluded from every column and
  // deliberately not rendered yet — plan 03-06's slice (03-RESEARCH.md
  // Pitfall 4). Accepted here only so page.tsx's shape stays stable across
  // plans; this panel does not read it.
  packages: BoardCard[];
};

const CARD_CREATED_TOAST = "Card criado.";

function formatCreatedAt(iso: string): string {
  return new Intl.DateTimeFormat("pt-BR", { dateStyle: "medium" }).format(
    new Date(iso)
  );
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
 * A single Kanban card + its detail Dialog (KAN-02, D-05). "Avançar" is a
 * plain Server Action call inside useTransition — no client-side stage
 * computation, `nextStage` runs only on the server (app/pm/board/actions.ts).
 * Server errors render verbatim inside ErrorBox, never paraphrased.
 */
function BoardCardItem({ card }: { card: BoardCard }) {
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const isLastStage = card.stage === "agendamento";

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
          />
        </div>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{card.title}</DialogTitle>
        </DialogHeader>
        <StatusBadge tone="neutral">
          {card.stage ? STAGE_LABELS[card.stage] : "—"}
        </StatusBadge>
        {error ? <ErrorBox>{error}</ErrorBox> : null}
        <DialogFooter>
          <Button
            type="button"
            disabled={isLastStage || isPending}
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
 * Client switcher + five-column Kanban board (KAN-03, D-10). The active
 * client lives in the URL (`?client=<id>`) so it survives a reload and a
 * revalidate — switching pushes a new URL rather than holding local state.
 * No drag-and-drop, no drop targets (D-05): columns are static, ordered by
 * STAGE_ORDER server-side in page.tsx.
 */
export function BoardPanel({ clients, activeClientId, columns }: BoardPanelProps) {
  const router = useRouter();

  const activeClient = clients.find((c) => c.id === activeClientId) ?? null;
  const hasCards = columns.some((column) => column.cards.length > 0);

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
        <div className="flex gap-6 overflow-x-auto pb-4">
          {columns.map((column) => (
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
              <div className="flex flex-col gap-4">
                {column.cards.map((card) => (
                  <BoardCardItem key={card.id} card={card} />
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </PageShell>
  );
}
