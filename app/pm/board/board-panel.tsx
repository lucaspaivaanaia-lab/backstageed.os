"use client";

import type { ReactNode } from "react";
import { useEffect, useOptimistic, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";
import {
  PlusIcon,
  XIcon,
  ImageIcon,
  VideoIcon,
  FileTextIcon,
  LinkIcon,
  ClipboardPasteIcon,
  MessageSquareIcon,
  FileEditIcon,
} from "lucide-react";
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

import {
  createCard,
  advanceStage,
  toggleChecklistItem,
  moveCard,
  updateCardDetails,
  addAttachment,
  removeAttachment,
  validateCardAgainstChecklist,
  type ChecklistValidationItemResult,
} from "./actions";
import {
  createCardSchema,
  attachDriveLinkSchema,
  type CreateCardInput,
  type AttachDriveLinkInput,
} from "@/lib/validation/cards";
import { STAGE_LABELS, STAGE_ORDER, type CardStage } from "@/lib/cards/stages";
import {
  checklistProgress,
  isGateBlocked,
  GATE_BLOCKED_MESSAGE,
} from "@/lib/cards/checklist-gate";
import { evaluateMove } from "@/lib/cards/move-rules";
import {
  isLikelyDriveLink,
  driveLinkType,
  INVALID_DRIVE_LINK_MESSAGE,
  type DriveLinkType,
} from "@/lib/attachments/drive-url";
import {
  getLastSelectedClientId,
  setLastSelectedClientId,
} from "@/lib/client-selection";
import {
  DraggableCard,
  cardIdFromDraggableId,
} from "./draggable-card";
import { DroppableColumn, stageFromDroppableId } from "./droppable-column";
import type {
  BoardAttachment,
  BoardCard,
  BoardChecklistItem,
  BoardClient,
  BoardColumn,
  BoardPmRosterEntry,
} from "./page";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { DataCard } from "@/components/ui/data-card";
import { StatusBadge } from "@/components/ui/status-badge";
import { Badge } from "@/components/ui/badge";
import { ErrorBox } from "@/components/ui/error-box";
import { Checkbox } from "@/components/ui/checkbox";
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
  DialogDescription,
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
  // completed_by id / assignee_id -> display email, resolved server-side
  // (page.tsx) via the privileged resolvePmNames helper — this panel never
  // resolves names itself.
  pmNames: Record<string, string>;
  // The active client's own assigned PMs (lib/actions/clients.ts,
  // listClientPmRoster), used to scope the assignee picker (D-19). Empty
  // array when no client is active.
  pmRoster: BoardPmRosterEntry[];
  // Whether the active client has a checklist template assigned. Drives
  // the "Nenhum checklist configurado" informational notice — never used
  // to disable "Avançar" (that stays gated by isGateBlocked alone).
  hasChecklistTemplate: boolean;
};

const CARD_CREATED_TOAST = "Card criado.";
const CARD_DETAILS_SAVED_TOAST = "Card atualizado.";
const ATTACHMENT_ADDED_TOAST = "Link anexado.";

// D-08: icon + Portuguese type word only, never a thumbnail/preview.
const ATTACHMENT_TYPE_ICONS: Record<DriveLinkType, typeof ImageIcon> = {
  image: ImageIcon,
  video: VideoIcon,
  pdf: FileTextIcon,
  other: LinkIcon,
};
const ATTACHMENT_TYPE_LABELS: Record<DriveLinkType, string> = {
  image: "Imagem",
  video: "Vídeo",
  pdf: "PDF",
  other: "Outro",
};
// Radix `SelectItem` cannot carry an empty-string `value` (03-01-SUMMARY.md
// solved the identical nullable-FK case) -- this sentinel represents "no
// assignee" in both the create Dialog and the detail Dialog's Responsável
// Select, mapped to `undefined`/`null` only at submit time.
const NONE_VALUE = "none";

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
 * "Criar card" Dialog (KAN-01, single-post path this plan — the package
 * option is added to this same selector by plan 03-06, so cardType is fixed
 * to "single" here rather than exposed as a field). Generalized from a
 * PageTitle-only button (03-02/03-03) into a reusable Dialog three call
 * sites share via an injected `trigger` element (D-14): the top-level
 * PageTitle action and the "no cards yet" EmptyState action (both omit
 * `stage`, so they keep creating in Briefing, unchanged), and a new
 * per-column "+" trigger with `stage` set to that column's own stage. The
 * assignee is deliberately NOT a react-hook-form field — it lives in local
 * state (see `NONE_VALUE` above) and is mapped to `undefined` only at
 * submit time, matching plan 03-01's nullable-FK Select pattern.
 */
function CreateCardDialog({
  clientId,
  stage,
  pmRoster,
  trigger,
}: {
  clientId: string | null;
  stage?: CardStage;
  pmRoster: BoardPmRosterEntry[];
  trigger: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const [isPending, startTransition] = useTransition();
  const [serverError, setServerError] = useState<string | null>(null);
  const [assigneeValue, setAssigneeValue] = useState(NONE_VALUE);

  const defaultValues: CreateCardInput = {
    clientId: clientId ?? "",
    title: "",
    cardType: "single",
    stage: stage ?? "briefing",
    description: "",
  };

  const form = useForm<CreateCardInput>({
    resolver: zodResolver(createCardSchema),
    defaultValues,
  });

  function handleOpenChange(next: boolean) {
    setOpen(next);
    if (next) {
      setServerError(null);
      form.reset(defaultValues);
      setAssigneeValue(NONE_VALUE);
    }
  }

  function onSubmit(values: CreateCardInput) {
    setServerError(null);
    const assigneeId = assigneeValue === NONE_VALUE ? undefined : assigneeValue;
    startTransition(async () => {
      const result = await createCard({
        ...values,
        stage: stage ?? "briefing",
        assigneeId,
      });
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
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Criar card</DialogTitle>
          {stage && stage !== "briefing" ? (
            <DialogDescription>
              O card será criado na etapa {STAGE_LABELS[stage]}.
            </DialogDescription>
          ) : null}
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
            <FormField
              control={form.control}
              name="description"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Conteúdo do post</FormLabel>
                  <FormControl>
                    <Textarea
                      {...field}
                      rows={4}
                      placeholder="O texto do post que será revisado e publicado."
                      disabled={isPending}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <div className="flex flex-col gap-1">
              <Label>Responsável</Label>
              <Select
                value={assigneeValue}
                onValueChange={setAssigneeValue}
                disabled={isPending}
              >
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="Sem responsável" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={NONE_VALUE}>Sem responsável</SelectItem>
                  {pmRoster.map((pm) => (
                    <SelectItem key={pm.id} value={pm.id}>
                      {pm.email}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {pmRoster.length === 0 ? (
                <span className="text-meta text-muted-foreground">
                  Nenhum PM atribuído a este cliente.
                </span>
              ) : null}
            </div>
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

const IMPORTED_TITLE_FALLBACK = "Conteúdo importado do chat";

/**
 * "Importar do chat" Dialog (P0 pivot 2026-08-04, item 2). A single paste
 * box, not the structured title+description form `CreateCardDialog` above
 * uses — the PM copies a block of AI-generated content straight from
 * `/pm/chat` and drops it here without having to split it into fields
 * themselves. The pasted text's first non-empty line becomes the card
 * title (truncated to createCardSchema's 200-char limit; a blank paste
 * falls back to a fixed label so the required-title validation never
 * blocks the import), and the full text becomes the description. Always
 * creates in Briefing (D-14's default, matching "primeira coluna" — this
 * is the ONE entry point that does NOT accept a `stage` override, unlike
 * the per-column "+" triggers). Reuses `createCard` directly — no new
 * Server Action, since createCardSchema already covers this shape.
 */
function ImportFromChatDialog({ clientId }: { clientId: string | null }) {
  const [open, setOpen] = useState(false);
  const [isPending, startTransition] = useTransition();
  const [serverError, setServerError] = useState<string | null>(null);
  const [pastedText, setPastedText] = useState("");

  function handleOpenChange(next: boolean) {
    setOpen(next);
    if (next) {
      setServerError(null);
      setPastedText("");
    }
  }

  function handleImport() {
    if (!clientId) return;
    setServerError(null);
    const trimmed = pastedText.trim();
    const firstLine = trimmed.split("\n")[0]?.trim() ?? "";
    const title =
      firstLine.length > 0
        ? firstLine.slice(0, 200)
        : IMPORTED_TITLE_FALLBACK;

    startTransition(async () => {
      const result = await createCard({
        clientId,
        title,
        cardType: "single",
        stage: "briefing",
        description: trimmed.slice(0, 5000),
      });
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
        <Button
          type="button"
          variant="outline"
          disabled={!clientId}
          title="Cole aqui o texto gerado no Chat para criar o card automaticamente."
        >
          <ClipboardPasteIcon className="size-4" />
          Importar do chat
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Importar conteúdo do chat</DialogTitle>
          <DialogDescription>
            Cole abaixo o conteúdo gerado no chat. O card será criado na
            etapa Briefing — a primeira linha vira o título.
          </DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-4">
          <Textarea
            value={pastedText}
            onChange={(event) => setPastedText(event.target.value)}
            rows={10}
            placeholder="Cole aqui o conteúdo gerado no chat..."
            disabled={isPending}
          />
          {serverError ? <ErrorBox>{serverError}</ErrorBox> : null}
          <Button
            type="button"
            onClick={handleImport}
            disabled={isPending || pastedText.trim().length === 0}
            className="w-fit"
          >
            {isPending ? "Importando..." : "Importar e criar card"}
          </Button>
        </div>
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
 * One "Anexos" row (KAN-05, D-07/D-08). No thumbnail/preview is ever
 * fetched (D-08) — icon-by-type + label only. The remove trigger opens an
 * `AlertDialog` using the UI-SPEC copy verbatim; confirming calls
 * `removeAttachment` inside `useTransition`. `rel="noopener noreferrer"`
 * on the link is the reverse-tabnabbing mitigation (T-03-20) — the opened
 * Drive tab never gets a `window.opener` handle back to the board.
 */
function AttachmentRow({ attachment }: { attachment: BoardAttachment }) {
  const [isPending, startTransition] = useTransition();
  const Icon = ATTACHMENT_TYPE_ICONS[attachment.link_type];

  function handleRemove() {
    startTransition(async () => {
      await removeAttachment({ attachmentId: attachment.id });
    });
  }

  return (
    <div className="flex items-center justify-between gap-2">
      <div className="flex min-w-0 items-center gap-xs">
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
        <Badge variant="outline">
          {ATTACHMENT_TYPE_LABELS[attachment.link_type]}
        </Badge>
      </div>
      <AlertDialog>
        <AlertDialogTrigger asChild>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="size-8 shrink-0"
            aria-label="Remover anexo"
            disabled={isPending}
          >
            <XIcon className="size-4" />
          </Button>
        </AlertDialogTrigger>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remover anexo</AlertDialogTitle>
            <AlertDialogDescription>
              Esse link será removido do card. Deseja continuar?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction variant="destructive" onClick={handleRemove}>
              Remover
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

/**
 * The "Anexar link" form (KAN-05, D-07/D-09). `driveLinkType` seeds the
 * type Select as the URL is typed, but the PM can freely override it — a
 * Drive share link's opaque file id carries no extension, so inference
 * alone is unreliable (03-RESEARCH.md). `isLikelyDriveLink` runs on blur
 * for instant feedback; the Server Action re-runs the SAME check
 * server-side (Pitfall 5) as the actual boundary.
 */
function AttachDriveLinkForm({ cardId }: { cardId: string }) {
  const [url, setUrl] = useState("");
  const [label, setLabel] = useState("");
  const [linkType, setLinkType] = useState<DriveLinkType>("other");
  const [touchedUrl, setTouchedUrl] = useState(false);
  const [serverError, setServerError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const trimmedUrl = url.trim();
  const showInvalid = touchedUrl && trimmedUrl.length > 0 && !isLikelyDriveLink(trimmedUrl);

  function handleUrlChange(next: string) {
    setUrl(next);
    if (next.trim().length > 0) {
      setLinkType(driveLinkType(next));
    }
  }

  function handleSubmit() {
    setServerError(null);
    const input: AttachDriveLinkInput = {
      cardId,
      url: trimmedUrl,
      label: label.trim().length > 0 ? label.trim() : undefined,
      linkType,
    };
    const parsed = attachDriveLinkSchema.safeParse(input);
    if (!parsed.success) {
      setServerError(parsed.error.issues[0]?.message ?? "Dados inválidos.");
      return;
    }
    startTransition(async () => {
      const result = await addAttachment(parsed.data);
      if (result.error) {
        setServerError(result.error);
        return;
      }
      toast.success(ATTACHMENT_ADDED_TOAST);
      setUrl("");
      setLabel("");
      setLinkType("other");
      setTouchedUrl(false);
    });
  }

  return (
    <div className="flex flex-col gap-2">
      <Input
        value={url}
        onChange={(event) => handleUrlChange(event.target.value)}
        onBlur={() => setTouchedUrl(true)}
        placeholder="https://drive.google.com/..."
        disabled={isPending}
      />
      {showInvalid ? (
        <span className="text-meta text-destructive">{INVALID_DRIVE_LINK_MESSAGE}</span>
      ) : null}
      <Input
        value={label}
        onChange={(event) => setLabel(event.target.value)}
        placeholder="Rótulo (opcional)"
        disabled={isPending}
      />
      <Select
        value={linkType}
        onValueChange={(next) => setLinkType(next as DriveLinkType)}
        disabled={isPending}
      >
        <SelectTrigger className="w-full">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="image">Imagem</SelectItem>
          <SelectItem value="video">Vídeo</SelectItem>
          <SelectItem value="pdf">PDF</SelectItem>
          <SelectItem value="other">Outro</SelectItem>
        </SelectContent>
      </Select>
      <Button
        type="button"
        onClick={handleSubmit}
        disabled={isPending || trimmedUrl.length === 0 || showInvalid}
        className="w-fit"
      >
        {isPending ? "Anexando..." : "Anexar link"}
      </Button>
      {serverError ? <ErrorBox>{serverError}</ErrorBox> : null}
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
  pmRoster,
  hasChecklistTemplate,
}: {
  card: BoardCard;
  pmNames: Record<string, string>;
  pmRoster: BoardPmRosterEntry[];
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

  // D-16/D-18/D-19: the description/assignee draft always seeds from the
  // server-supplied card, never from a form default it has to reconcile —
  // there is no separate read-mode/edit-mode toggle, the Textarea and
  // Select are always editable (Task 2, action C.1).
  const [draftDescription, setDraftDescription] = useState(card.description ?? "");
  const [draftAssignee, setDraftAssignee] = useState(card.assignee_id ?? NONE_VALUE);
  const [detailsError, setDetailsError] = useState<string | null>(null);
  const [isSavingDetails, startDetailsTransition] = useTransition();

  // T-03-55: if the card's current assignee has since been unassigned from
  // the client, `pmRoster` no longer contains it — append it explicitly so
  // the Select can still represent (and round-trip) the current value
  // instead of silently collapsing to "Sem responsável" on the next save.
  const assigneeOptions =
    card.assignee_id && !pmRoster.some((pm) => pm.id === card.assignee_id)
      ? [
          ...pmRoster,
          { id: card.assignee_id, email: pmNames[card.assignee_id] ?? card.assignee_id },
        ]
      : pmRoster;

  const normalizedDraftDescription = draftDescription.trim();
  const currentAssigneeValue = card.assignee_id ?? NONE_VALUE;
  const hasDetailChanges =
    normalizedDraftDescription !== (card.description ?? "") ||
    draftAssignee !== currentAssigneeValue;

  // P0 pivot 2026-08-04, item 3: "Revalidar" runs the AI checklist check on
  // demand — purely advisory, never persisted (see validateCardAgainstChecklist's
  // own doc comment). Resets to null on every open of a fresh Dialog instance
  // since it lives in component state, not server data — a stale verdict
  // from a previous edit never lingers silently.
  const [aiValidation, setAiValidation] = useState<
    ChecklistValidationItemResult[] | null
  >(null);
  const [isValidating, startValidateTransition] = useTransition();
  const [validateError, setValidateError] = useState<string | null>(null);

  function handleRevalidate() {
    setValidateError(null);
    startValidateTransition(async () => {
      const result = await validateCardAgainstChecklist(card.id);
      if ("error" in result) {
        setValidateError(result.error);
        return;
      }
      setAiValidation(result.results);
    });
  }

  function handleAdvance() {
    setError(null);
    startTransition(async () => {
      const result = await advanceStage({ cardId: card.id });
      if (result.error) {
        setError(result.error);
      }
    });
  }

  function handleSaveDetails() {
    setDetailsError(null);
    startDetailsTransition(async () => {
      const result = await updateCardDetails({
        cardId: card.id,
        description:
          normalizedDraftDescription.length > 0 ? normalizedDraftDescription : null,
        assigneeId: draftAssignee === NONE_VALUE ? null : draftAssignee,
      });
      if (result.error) {
        setDetailsError(result.error);
        return;
      }
      toast.success(CARD_DETAILS_SAVED_TOAST);
    });
  }

  const metaSegments = [`Criado em ${formatCreatedAt(card.created_at)}`];
  if (card.assignee_id) {
    metaSegments.push(
      `Responsável: ${pmNames[card.assignee_id] ?? card.assignee_id}`
    );
  }
  if (card.attachments.length === 1) {
    metaSegments.push("1 anexo");
  } else if (card.attachments.length > 1) {
    metaSegments.push(`${card.attachments.length} anexos`);
  }
  const cardMeta = metaSegments.join(" · ");

  return (
    <Dialog>
      <DialogTrigger asChild>
        <div role="button" tabIndex={0} className="cursor-pointer text-left">
          <DataCard
            title={card.title}
            meta={cardMeta}
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

          {aiValidation ? (
            <div className="flex flex-col gap-2 rounded-md border p-3">
              <span className="text-body font-medium">
                Validação da IA: {aiValidation.filter((r) => r.passed).length}/
                {aiValidation.length} itens aprovados
              </span>
              {aiValidation
                .filter((r) => !r.passed)
                .map((r) => (
                  <div key={r.itemId} className="flex flex-col gap-0.5">
                    <span className="text-body">Não passou: {r.label}</span>
                    <span className="text-meta text-muted-foreground">
                      {r.justification}
                    </span>
                  </div>
                ))}
            </div>
          ) : null}

          <div className="flex flex-col gap-2">
            <SectionTitle>Descrição</SectionTitle>
            <Textarea
              value={draftDescription}
              onChange={(event) => setDraftDescription(event.target.value)}
              rows={5}
              placeholder="Sem descrição."
              disabled={isSavingDetails}
            />
          </div>

          <div className="flex flex-col gap-2">
            <SectionTitle>Responsável</SectionTitle>
            <Select
              value={draftAssignee}
              onValueChange={setDraftAssignee}
              disabled={isSavingDetails}
            >
              <SelectTrigger className="w-full">
                <SelectValue placeholder="Sem responsável" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={NONE_VALUE}>Sem responsável</SelectItem>
                {assigneeOptions.map((pm) => (
                  <SelectItem key={pm.id} value={pm.id}>
                    {pm.email}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {pmRoster.length === 0 ? (
              <span className="text-meta text-muted-foreground">
                Nenhum PM atribuído a este cliente.
              </span>
            ) : null}
            <Button
              type="button"
              onClick={handleSaveDetails}
              disabled={isSavingDetails || !hasDetailChanges}
              className="w-fit"
            >
              {isSavingDetails ? "Salvando..." : "Salvar alterações"}
            </Button>
            {detailsError ? <ErrorBox>{detailsError}</ErrorBox> : null}
          </div>

          <div className="flex flex-col gap-2">
            <SectionTitle>Anexos</SectionTitle>
            {card.attachments.length === 0 ? (
              <EmptyState
                title="Nenhum anexo"
                description="Cole um link do Google Drive abaixo para anexar imagem, vídeo ou PDF a este card."
              />
            ) : (
              <div className="flex flex-col gap-2">
                {card.attachments.map((attachment) => (
                  <AttachmentRow key={attachment.id} attachment={attachment} />
                ))}
              </div>
            )}
            <AttachDriveLinkForm cardId={card.id} />
          </div>

          {showChecklistSection ? (
            <div className="flex flex-col gap-2">
              <div className="flex items-center justify-between gap-2">
                <SectionTitle>Checklist de revisão</SectionTitle>
                {card.checklistItems.length > 0 ? (
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={handleRevalidate}
                    disabled={isValidating}
                  >
                    {isValidating ? "Revalidando..." : "Revalidar com IA"}
                  </Button>
                ) : null}
              </div>
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
              {validateError ? <ErrorBox>{validateError}</ErrorBox> : null}
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
  pmRoster,
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
    // P2 pivot 2026-08-04: remember this choice so /pm/chat (and a future
    // board visit with no ?client= in the URL) can default back to it —
    // see lib/client-selection.ts.
    setLastSelectedClientId(clientId);
  }

  // P2 pivot 2026-08-04: if the URL has no ?client= (activeClientId prop is
  // null), fall back to whatever was last selected here or in chat — but
  // only if that id is still in THIS caller's own roster (`clients` is
  // already RLS-scoped server-side; a foreign/stale id is silently
  // ignored). A router.replace() is a navigation call, not a React
  // setState, so this effect doesn't trip react-hooks/set-state-in-effect
  // the way calling a state setter directly here would.
  //
  // Client-scoped navigation (same pivot): if there's STILL no usable
  // client after that fallback — first-ever visit, cleared localStorage,
  // or a stale id that no longer matches this PM's roster — redirect to
  // the client list instead of rendering an empty board. Produção should
  // never be reachable with no client context, matching the sidebar only
  // exposing this link once a client has been selected at least once.
  useEffect(() => {
    if (activeClientId) return;
    const lastId = getLastSelectedClientId();
    if (lastId && clients.some((c) => c.id === lastId)) {
      router.replace(`/pm/board?client=${lastId}`);
      return;
    }
    router.replace("/pm/clients");
  }, [activeClientId, clients, router]);

  return (
    <PageShell width="wide">
      <PageTitle
        action={
          <div className="flex items-center gap-2">
            <ImportFromChatDialog clientId={activeClientId} />
            <CreateCardDialog
              clientId={activeClientId}
              pmRoster={pmRoster}
              trigger={
                <Button type="button" disabled={!activeClientId}>
                  <PlusIcon className="size-4" />
                  Criar card
                </Button>
              }
            />
          </div>
        }
      >
        Produção
      </PageTitle>

      <div className="mb-8 flex flex-wrap items-center justify-between gap-4">
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

        {activeClient ? (
          <div className="flex items-center gap-2">
            <Button variant="outline" asChild>
              <Link href="/pm/chat">
                <MessageSquareIcon className="size-4" />
                Chat
              </Link>
            </Button>
            <Button variant="outline" asChild>
              <Link href={`/pm/clients/${activeClient.id}`}>
                <FileEditIcon className="size-4" />
                Editar briefing
              </Link>
            </Button>
          </div>
        ) : null}
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
          action={
            <CreateCardDialog
              clientId={activeClientId}
              pmRoster={pmRoster}
              trigger={
                <Button type="button" disabled={!activeClientId}>
                  <PlusIcon className="size-4" />
                  Criar card
                </Button>
              }
            />
          }
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
                  <div className="flex items-center gap-2">
                    <StatusBadge tone="neutral">{column.cards.length}</StatusBadge>
                    <CreateCardDialog
                      clientId={activeClientId}
                      stage={column.stage}
                      pmRoster={pmRoster}
                      trigger={
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          className="size-8"
                          aria-label={`Criar card em ${STAGE_LABELS[column.stage]}`}
                          disabled={!activeClientId}
                        >
                          <PlusIcon className="size-4" />
                        </Button>
                      }
                    />
                  </div>
                </div>
                <DroppableColumn stage={column.stage}>
                  {column.cards.map((card) => (
                    <DraggableCard key={card.id} cardId={card.id} title={card.title}>
                      <BoardCardItem
                        card={card}
                        pmNames={pmNames}
                        pmRoster={pmRoster}
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
