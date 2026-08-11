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
  Trash2Icon,
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
  createPiece,
  removePiece,
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
import { CHANNEL_LABELS, type CardChannel } from "@/lib/cards/channel";
import { packageRollupLabel } from "@/lib/cards/package-rollup";
import { cardFieldsFromChatText } from "@/lib/cards/chat-import";
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
  BoardOverride,
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
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
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
  // Package parents (stage === null, per cards_package_has_no_stage) are
  // excluded from every column and rendered as their own "Pacotes" region
  // above the board instead (03-RESEARCH.md Pitfall 4, plan 03-06).
  packages: BoardCard[];
  // Per-package id, the ordered list of its pieces' CURRENT stages — feeds
  // packageRollupLabel, computed at render time here, never stored (D-02,
  // 03-RESEARCH.md Anti-Patterns).
  piecesByPackageId: Record<string, CardStage[]>;
  // A piece names its package on the board (Task 2, action E) without a
  // client-side lookup.
  parentTitleById: Record<string, string>;
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
 * "Criar card" Dialog (KAN-01, single AND package paths, plan 03-06).
 * Generalized from a PageTitle-only button (03-02/03-03) into a reusable
 * Dialog three call sites share via an injected `trigger` element (D-14):
 * the top-level PageTitle action and the "no cards yet" EmptyState action
 * (both omit `stage`, so they keep creating in Briefing by default, and are
 * the ONLY two call sites that render the "Tipo" (Post único/Pacote)
 * selector — see `showCardTypeSelector`), and a per-column "+" trigger with
 * `stage` set to that column's own stage (which always creates a "single"
 * card, since a package has no stage of its own). When "Pacote" is
 * selected, the Descrição/Responsável fields are hidden and sent as
 * `undefined` at submit time, mirroring the package Dialog's own omission
 * of those sections (D-02). The assignee is deliberately NOT a
 * react-hook-form field — it lives in local state (see `NONE_VALUE` above)
 * and is mapped to `undefined` only at submit time, matching plan 03-01's
 * nullable-FK Select pattern.
 *
 * Quick task 260805-fuu unified the former standalone "Importar do chat"
 * Dialog into a second tab here ("Colar do chat", D-B/D-C/D-D) — a single,
 * obvious "Criar card" entry point replaces the two separate buttons that
 * used to sit side by side in the header. Both tabs share this Dialog's
 * `stage` prop identically: the paste tab is no longer hardcoded to
 * Briefing, it now creates in whatever stage the trigger passed (D-B).
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
  const [activeTab, setActiveTab] = useState<"escrever" | "colar">("escrever");
  const [isPending, startTransition] = useTransition();
  const [serverError, setServerError] = useState<string | null>(null);
  const [assigneeValue, setAssigneeValue] = useState(NONE_VALUE);
  const [mediaAssigneeValue, setMediaAssigneeValue] = useState(NONE_VALUE);
  const [pastedText, setPastedText] = useState("");

  const targetStage = stage ?? "briefing";
  // Task 2, action D (rescope_notice point 1): the card-type selector
  // belongs ONLY to call sites with no `stage` prop -- the top-level "Criar
  // card" button and the "no cards yet" EmptyState. The five per-column "+"
  // triggers always pass a `stage` and therefore always create a "single"
  // card in that column: a package has no stage of its own, so offering
  // "Pacote" from a column trigger would be self-contradictory.
  const showCardTypeSelector = stage === undefined;

  const defaultValues: CreateCardInput = {
    clientId: clientId ?? "",
    title: "",
    cardType: "single",
    channel: "conteudo",
    stage: targetStage,
    description: "",
  };

  const form = useForm<CreateCardInput>({
    resolver: zodResolver(createCardSchema),
    defaultValues,
  });

  const cardTypeValue = form.watch("cardType");
  const isPackageType = showCardTypeSelector && cardTypeValue === "package";

  function handleOpenChange(next: boolean) {
    setOpen(next);
    if (next) {
      setServerError(null);
      form.reset(defaultValues);
      setAssigneeValue(NONE_VALUE);
      setMediaAssigneeValue(NONE_VALUE);
      setActiveTab("escrever");
      setPastedText("");
    }
  }

  function handleTabChange(next: string) {
    setActiveTab(next as "escrever" | "colar");
    setServerError(null);
  }

  function onSubmit(values: CreateCardInput) {
    setServerError(null);
    // A package has no Descrição/Responsável of its own (D-02, mirroring the
    // package Dialog's own omission of those sections) -- send both as
    // undefined rather than whatever stale value the now-hidden fields hold.
    const assigneeId = isPackageType
      ? undefined
      : assigneeValue === NONE_VALUE
        ? undefined
        : assigneeValue;
    const mediaAssigneeId = isPackageType
      ? undefined
      : mediaAssigneeValue === NONE_VALUE
        ? undefined
        : mediaAssigneeValue;
    const description = isPackageType ? undefined : values.description;
    startTransition(async () => {
      const result = await createCard({
        ...values,
        stage: targetStage,
        description,
        assigneeId,
        mediaAssigneeId,
      });
      if ("error" in result) {
        setServerError(result.error);
        return;
      }
      toast.success(CARD_CREATED_TOAST);
      setOpen(false);
    });
  }

  function handlePasteImport() {
    if (!clientId) return;
    setServerError(null);
    const { title, description } = cardFieldsFromChatText(pastedText);

    startTransition(async () => {
      const result = await createCard({
        clientId,
        title,
        cardType: "single",
        stage: targetStage,
        description,
        // Item 1, 260811-m0t: paste-from-chat always defaults to Conteúdo,
        // no picker -- pasted chat text is definitionally finished content,
        // never a planning document.
        channel: "conteudo",
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
        <Tabs value={activeTab} onValueChange={handleTabChange}>
          <TabsList>
            <TabsTrigger value="escrever">Escrever</TabsTrigger>
            <TabsTrigger
              value="colar"
              title="Cole aqui o texto gerado no Chat para criar o card automaticamente."
            >
              <ClipboardPasteIcon className="size-4" />
              Colar do chat
            </TabsTrigger>
          </TabsList>
          <TabsContent value="escrever">
            <Form {...form}>
              <form
                onSubmit={form.handleSubmit(onSubmit)}
                className="flex flex-col gap-4"
              >
                {showCardTypeSelector ? (
                  <FormField
                    control={form.control}
                    name="cardType"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Tipo</FormLabel>
                        <FormControl>
                          <Select
                            value={field.value}
                            onValueChange={field.onChange}
                            disabled={isPending}
                          >
                            <SelectTrigger className="w-full">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="single">Post único</SelectItem>
                              <SelectItem value="package">Pacote</SelectItem>
                            </SelectContent>
                          </Select>
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                ) : null}
                <FormField
                  control={form.control}
                  name="channel"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Canal</FormLabel>
                      <FormControl>
                        <Select
                          value={field.value}
                          onValueChange={field.onChange}
                          disabled={isPending}
                        >
                          <SelectTrigger className="w-full">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="planejamento">{CHANNEL_LABELS.planejamento}</SelectItem>
                            <SelectItem value="conteudo">{CHANNEL_LABELS.conteudo}</SelectItem>
                          </SelectContent>
                        </Select>
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
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
                {!isPackageType ? (
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
                ) : null}
                {!isPackageType ? (
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
                ) : null}
                {!isPackageType ? (
                  <div className="flex flex-col gap-1">
                    <Label>Designer/Mídia</Label>
                    <Select
                      value={mediaAssigneeValue}
                      onValueChange={setMediaAssigneeValue}
                      disabled={isPending}
                    >
                      <SelectTrigger className="w-full">
                        <SelectValue placeholder="Sem designer/mídia" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value={NONE_VALUE}>Sem designer/mídia</SelectItem>
                        {pmRoster.map((pm) => (
                          <SelectItem key={pm.id} value={pm.id}>
                            {pm.email}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                ) : null}
                {serverError ? <ErrorBox>{serverError}</ErrorBox> : null}
                <Button type="submit" disabled={isPending} className="w-fit">
                  {isPending ? "Criando..." : "Criar card"}
                </Button>
              </form>
            </Form>
          </TabsContent>
          <TabsContent value="colar">
            <DialogDescription>
              Cole abaixo o conteúdo gerado no chat. A primeira linha vira o
              título. O card será criado na etapa{" "}
              {STAGE_LABELS[targetStage]}.
            </DialogDescription>
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
              onClick={handlePasteImport}
              disabled={isPending || pastedText.trim().length === 0}
              className="w-fit"
            >
              {isPending ? "Importando..." : "Importar e criar card"}
            </Button>
          </TabsContent>
        </Tabs>
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
 * The D-11 override marker (CHK-04) — rendered inside the checklist section
 * header exactly as 03-UI-SPEC's override-audit contract requires when a
 * card has one or more `card_checklist_overrides` rows. Read-only: a plain
 * `<details>`/`<summary>` toggle, not a new component, listing every
 * override's who/when/forced-transition/frozen-unchecked-labels line so a
 * bypass is never silent on the PM's own board.
 */
function OverrideHistory({
  overrides,
  pmNames,
}: {
  overrides: BoardOverride[];
  pmNames: Record<string, string>;
}) {
  if (overrides.length === 0) return null;

  return (
    <div className="flex flex-col gap-2">
      <StatusBadge tone="danger">Avanço forçado</StatusBadge>
      <details className="text-meta text-muted-foreground">
        <summary className="cursor-pointer">
          Ver histórico de avanços forçados
        </summary>
        <div className="mt-2 flex flex-col gap-3">
          {overrides.map((override) => {
            const overriddenByName =
              pmNames[override.overridden_by] ?? override.overridden_by;
            return (
              <div key={override.id} className="flex flex-col gap-0.5">
                <span>
                  Marcado por {overriddenByName} em{" "}
                  {formatCompletedAt(override.occurred_at)} —{" "}
                  {STAGE_LABELS[override.from_stage]} para{" "}
                  {STAGE_LABELS[override.to_stage]}
                </span>
                <span>
                  Itens pendentes no momento: {override.unchecked_item_labels.join(", ")}
                </span>
              </div>
            );
          })}
        </div>
      </details>
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
 * The card detail Dialog's CONTENT (KAN-02, D-05, CHK-03) — extracted from
 * the trigger-carrying card so it can be reused by two different Dialog
 * shells (plan 03-06, Task 2 action C): `BoardCardItem`'s own uncontrolled
 * Dialog for a card sitting in a stage column, and `PieceDetailDialog`'s
 * externally-controlled Dialog opened from a piece row inside the package
 * Dialog. "Avançar" is a plain Server Action call inside useTransition — no
 * client-side stage computation, `nextStage` runs only on the server
 * (app/pm/board/actions.ts). Server errors render verbatim inside ErrorBox,
 * never paraphrased. The checklist section and the "Avançar" disabled
 * attribute derive entirely from the server-supplied `card.checklistItems`
 * via the shared `checklistProgress`/`isGateBlocked` predicates — never
 * recomputed from local-only state.
 */
function CardDetailDialogBody({
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
  const [draftMediaAssignee, setDraftMediaAssignee] = useState(card.media_assignee_id ?? NONE_VALUE);
  const [draftChannel, setDraftChannel] = useState<CardChannel>(card.channel);
  const [detailsError, setDetailsError] = useState<string | null>(null);
  const [isSavingDetails, startDetailsTransition] = useTransition();

  // 260808-ci5, item 2 (D-06-amendment bugfix): `validateCardAgainstChecklist`
  // persists its AI rewrite straight to `cards.description` WITHOUT calling
  // `revalidatePath`, so the `card` prop below stays stale (still holding the
  // PRE-revision text) until the next navigation. That means comparing
  // `draftDescription` back against `card.description` after "Desfazer
  // revisão" reverts the TEXTAREA to match the (stale) prop and makes
  // `hasDetailChanges` false — disabling "Salvar alterações" and silently
  // leaving the AI's rewrite persisted in the database even though the PM
  // just asked to undo it. This flag forces the Save button back on after an
  // undo so the PM's revert actually reaches the server.
  const [descriptionRevertPending, setDescriptionRevertPending] = useState(false);

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

  // T-03-55 shape, applied to the second assignee field (Item 4, 260811-n0i):
  // if the card's current media assignee has since been unassigned from the
  // client, `pmRoster` no longer contains it -- append it explicitly so the
  // Select can still represent (and round-trip) the current value.
  const mediaAssigneeOptions =
    card.media_assignee_id && !pmRoster.some((pm) => pm.id === card.media_assignee_id)
      ? [
          ...pmRoster,
          {
            id: card.media_assignee_id,
            email: pmNames[card.media_assignee_id] ?? card.media_assignee_id,
          },
        ]
      : pmRoster;

  const normalizedDraftDescription = draftDescription.trim();
  const currentAssigneeValue = card.assignee_id ?? NONE_VALUE;
  const currentMediaAssigneeValue = card.media_assignee_id ?? NONE_VALUE;
  const hasDetailChanges =
    normalizedDraftDescription !== (card.description ?? "") ||
    draftAssignee !== currentAssigneeValue ||
    draftMediaAssignee !== currentMediaAssigneeValue ||
    draftChannel !== card.channel ||
    descriptionRevertPending;

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

  // 260808-ci5, item 2 (D-06-amendment): non-null only right after a
  // revalidate call actually rewrote cards.description — holds the
  // PRE-revision text so "Desfazer revisão" can restore it into
  // draftDescription. Reset to null on every fresh Dialog instance, same
  // as aiValidation — a stale Undo target from a previous edit never
  // lingers silently.
  const [preRevisionDescription, setPreRevisionDescription] = useState<
    string | null
  >(null);

  function handleRevalidate() {
    setValidateError(null);
    startValidateTransition(async () => {
      const result = await validateCardAgainstChecklist(card.id);
      if ("error" in result) {
        setValidateError(result.error);
        return;
      }
      setAiValidation(result.results);
      if (result.revisedDescription !== null) {
        setPreRevisionDescription(result.previousDescription);
        setDraftDescription(result.revisedDescription);
      } else {
        setPreRevisionDescription(null);
      }
    });
  }

  function handleUndoRevision() {
    if (preRevisionDescription === null) return;
    setDraftDescription(preRevisionDescription);
    setPreRevisionDescription(null);
    // The AI's rewrite is already persisted server-side (see the state
    // comment above) — force "Salvar alterações" back on so this revert
    // isn't purely cosmetic.
    setDescriptionRevertPending(true);
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
        mediaAssigneeId: draftMediaAssignee === NONE_VALUE ? null : draftMediaAssignee,
        channel: draftChannel,
      });
      if (result.error) {
        setDetailsError(result.error);
        return;
      }
      setDescriptionRevertPending(false);
      toast.success(CARD_DETAILS_SAVED_TOAST);
    });
  }

  return (
    <>
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

        {preRevisionDescription !== null ? (
          <div className="flex items-center justify-between gap-2 rounded-md border p-3">
            <span className="text-body">
              O rascunho foi revisado pela IA para atender ao checklist.
            </span>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={handleUndoRevision}
            >
              Desfazer revisão
            </Button>
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
          <SectionTitle>Designer/Mídia</SectionTitle>
          <Select
            value={draftMediaAssignee}
            onValueChange={setDraftMediaAssignee}
            disabled={isSavingDetails}
          >
            <SelectTrigger className="w-full">
              <SelectValue placeholder="Sem designer/mídia" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={NONE_VALUE}>Sem designer/mídia</SelectItem>
              {mediaAssigneeOptions.map((pm) => (
                <SelectItem key={pm.id} value={pm.id}>
                  {pm.email}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="flex flex-col gap-2">
          <SectionTitle>Canal</SectionTitle>
          <Select
            value={draftChannel}
            onValueChange={(value) => setDraftChannel(value as CardChannel)}
            disabled={isSavingDetails}
          >
            <SelectTrigger className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="planejamento">{CHANNEL_LABELS.planejamento}</SelectItem>
              <SelectItem value="conteudo">{CHANNEL_LABELS.conteudo}</SelectItem>
            </SelectContent>
          </Select>
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
            <OverrideHistory overrides={card.overrides} pmNames={pmNames} />
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
    </>
  );
}

/**
 * A single Kanban card (KAN-02, D-05, CHK-03) — the `DataCard` trigger plus
 * its own uncontrolled Dialog wrapping `CardDetailDialogBody`. Pieces append
 * one more `meta` segment naming their parent package (plan 03-06, Task 2
 * action E) — pushed onto the existing segments array rather than
 * rewriting the composition, so a piece's meta can read e.g. "Criado em
 * 31/07/2026 · Responsável: pm@x.com · 2 anexos · Pacote: Campanha de
 * lançamento".
 */
function BoardCardItem({
  card,
  pmNames,
  pmRoster,
  hasChecklistTemplate,
  parentTitleById,
}: {
  card: BoardCard;
  pmNames: Record<string, string>;
  pmRoster: BoardPmRosterEntry[];
  hasChecklistTemplate: boolean;
  parentTitleById: Record<string, string>;
}) {
  const progress = checklistProgress(card.checklistItems);

  const metaSegments = [`Criado em ${formatCreatedAt(card.created_at)}`];
  if (card.assignee_id) {
    metaSegments.push(
      `Responsável: ${pmNames[card.assignee_id] ?? card.assignee_id}`
    );
  }
  if (card.media_assignee_id) {
    metaSegments.push(
      `Designer/Mídia: ${pmNames[card.media_assignee_id] ?? card.media_assignee_id}`
    );
  }
  if (card.attachments.length === 1) {
    metaSegments.push("1 anexo");
  } else if (card.attachments.length > 1) {
    metaSegments.push(`${card.attachments.length} anexos`);
  }
  if (card.card_type === "piece" && card.parent_card_id) {
    const parentTitle = parentTitleById[card.parent_card_id];
    if (parentTitle) {
      metaSegments.push(`Pacote: ${parentTitle}`);
    }
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
              <div className="flex flex-col items-end gap-1">
                <StatusBadge tone={card.channel === "planejamento" ? "info" : "neutral"}>
                  {CHANNEL_LABELS[card.channel]}
                </StatusBadge>
                {card.stage === "revisao_interna" ? (
                  hasChecklistTemplate ? (
                    <StatusBadge
                      tone={progress.checked === progress.total ? "success" : "warning"}
                    >
                      {progress.checked}/{progress.total} concluídos
                    </StatusBadge>
                  ) : (
                    <StatusBadge tone="neutral">Sem checklist</StatusBadge>
                  )
                ) : null}
              </div>
            }
          />
        </div>
      </DialogTrigger>
      <DialogContent>
        <CardDetailDialogBody
          card={card}
          pmNames={pmNames}
          pmRoster={pmRoster}
          hasChecklistTemplate={hasChecklistTemplate}
        />
      </DialogContent>
    </Dialog>
  );
}

/**
 * The piece detail Dialog opened from a piece row inside the package Dialog
 * (plan 03-06, Task 2 action C) — an EXTERNALLY-controlled Dialog (`card`
 * null closes it) wrapping the exact same `CardDetailDialogBody` a
 * standalone card's own Dialog uses, so Descrição/Responsável/Anexos/
 * Checklist and the "Avançar" gate all behave identically for a piece
 * opened this way as for a piece opened directly from its stage column.
 */
function PieceDetailDialog({
  card,
  onOpenChange,
  pmNames,
  pmRoster,
  hasChecklistTemplate,
}: {
  card: BoardCard | null;
  onOpenChange: (open: boolean) => void;
  pmNames: Record<string, string>;
  pmRoster: BoardPmRosterEntry[];
  hasChecklistTemplate: boolean;
}) {
  return (
    <Dialog open={card !== null} onOpenChange={onOpenChange}>
      <DialogContent>
        {card ? (
          <CardDetailDialogBody
            card={card}
            pmNames={pmNames}
            pmRoster={pmRoster}
            hasChecklistTemplate={hasChecklistTemplate}
          />
        ) : null}
      </DialogContent>
    </Dialog>
  );
}

/**
 * The "Pacotes" region's per-package row (plan 03-06, Task 2 actions B/C,
 * D-01/D-02, T-03-33b). Rendered OUTSIDE the drag-and-drop context and
 * wraps neither of the column board's own draggable/droppable wrappers — a
 * package has `stage = null` (cards_package_has_no_stage), so it has no
 * legal drop target and `moveCard` would reject it; making it draggable
 * would only produce dead gestures. The rollup badge is computed at render
 * time by the pure `packageRollupLabel` over `pieceStages`, never stored
 * (D-02, 03-RESEARCH.md Anti-Patterns). The package Dialog itself renders
 * none of the four sections a full card detail Dialog has (D-02/A3) — a
 * package is an organisational container whose per-piece children carry the
 * real content and ownership; clicking a piece row closes this Dialog and hands
 * off to `onOpenPieceDetail`, which opens that piece's own full card detail
 * Dialog (the same one standalone cards use).
 */
/**
 * A single piece row inside a package's "Ver peças" dialog (quick task
 * 260808-c9s). Renders the unchanged click-to-open-detail button plus a new
 * delete AlertDialog trigger as SIBLINGS inside an outer <div> — a nested
 * <button> inside a <button> is invalid HTML, so the outer clickable
 * <button> from before this task is replaced with a plain <div> wrapper.
 */
function PieceRow({
  piece,
  onOpenDetail,
}: {
  piece: BoardCard;
  onOpenDetail: (pieceId: string) => void;
}) {
  const [isPending, startTransition] = useTransition();
  const [serverError, setServerError] = useState<string | null>(null);

  function handleRemove() {
    setServerError(null);
    startTransition(async () => {
      const result = await removePiece({ cardId: piece.id });
      if (result.error) {
        setServerError(result.error);
      }
    });
  }

  return (
    <div>
      <div className="flex items-center justify-between gap-2 rounded-md border p-2">
        <button
          type="button"
          onClick={() => onOpenDetail(piece.id)}
          className="flex min-w-0 flex-1 items-center justify-between gap-2 text-left"
        >
          <span className="text-body">{piece.title}</span>
          <StatusBadge tone="neutral">
            {piece.stage ? STAGE_LABELS[piece.stage] : "—"}
          </StatusBadge>
        </button>
        <AlertDialog>
          <AlertDialogTrigger asChild>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="size-8 shrink-0"
              aria-label="Excluir peça"
              disabled={isPending}
            >
              <Trash2Icon className="size-4" />
            </Button>
          </AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Excluir peça</AlertDialogTitle>
              <AlertDialogDescription>
                Essa peça e todo o seu checklist/anexos serão excluídos
                permanentemente. Deseja continuar?
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancelar</AlertDialogCancel>
              <AlertDialogAction variant="destructive" onClick={handleRemove}>
                Excluir
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
      {serverError ? <ErrorBox>{serverError}</ErrorBox> : null}
    </div>
  );
}

function PackageRow({
  pkg,
  pieceStages,
  pieces,
  onOpenPieceDetail,
}: {
  pkg: BoardCard;
  pieceStages: CardStage[];
  pieces: BoardCard[];
  onOpenPieceDetail: (pieceId: string) => void;
}) {
  const [dialogOpen, setDialogOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [serverError, setServerError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function handleAddPiece() {
    setServerError(null);
    startTransition(async () => {
      const result = await createPiece({ parentCardId: pkg.id, title });
      if ("error" in result) {
        setServerError(result.error);
        return;
      }
      setTitle("");
    });
  }

  function handlePieceClick(pieceId: string) {
    setDialogOpen(false);
    onOpenPieceDetail(pieceId);
  }

  return (
    <div className="flex items-center justify-between gap-4 rounded-md border p-4">
      <div className="flex flex-col gap-1">
        <span className="text-body font-medium">{pkg.title}</span>
        <div className="flex items-center gap-1">
          <StatusBadge tone={pkg.channel === "planejamento" ? "info" : "neutral"}>
            {CHANNEL_LABELS[pkg.channel]}
          </StatusBadge>
          <StatusBadge tone="info">{packageRollupLabel(pieceStages)}</StatusBadge>
        </div>
      </div>
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogTrigger asChild>
          <Button type="button" variant="outline">
            Ver peças
          </Button>
        </DialogTrigger>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{pkg.title}</DialogTitle>
          </DialogHeader>
          <div className="flex flex-col gap-2">
            {pieces.length === 0 ? (
              <EmptyState
                title="Nenhuma peça"
                description="Adicione a primeira peça deste pacote abaixo."
              />
            ) : (
              pieces.map((piece) => (
                <PieceRow
                  key={piece.id}
                  piece={piece}
                  onOpenDetail={handlePieceClick}
                />
              ))
            )}
          </div>
          <DialogFooter className="flex-col items-stretch gap-2 sm:flex-col">
            <Input
              value={title}
              onChange={(event) => setTitle(event.target.value)}
              placeholder="Título da peça"
              disabled={isPending}
            />
            {serverError ? <ErrorBox>{serverError}</ErrorBox> : null}
            <Button
              type="button"
              onClick={handleAddPiece}
              disabled={isPending || title.trim().length === 0}
              className="w-fit"
            >
              {isPending ? "Adicionando..." : "Adicionar peça"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
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
  packages,
  piecesByPackageId,
  parentTitleById,
  pmNames,
  pmRoster,
  hasChecklistTemplate,
}: BoardPanelProps) {
  const router = useRouter();

  const activeClient = clients.find((c) => c.id === activeClientId) ?? null;
  const hasCards = columns.some((column) => column.cards.length > 0);

  // Plan 03-06 (KAN-01 package half): which piece's detail Dialog is
  // currently open because it was opened from a package's "Ver peças"
  // dialog (Task 2, action C) rather than from its own stage-column card.
  // `null` means none — `PieceDetailDialog` treats a null card as closed.
  const [openPieceId, setOpenPieceId] = useState<string | null>(null);

  // Item 1, 260811-m0t: board-level channel filter (Todos/Planejamento/
  // Conteúdo). Purely client-side -- no new query, no new RLS -- narrows
  // which cards render per stage column and in the Pacotes section.
  const [channelFilter, setChannelFilter] = useState<CardChannel | "all">("all");

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

  // A piece opened from a package dialog is found the same way a dragged
  // card is — across every column's `cards` array, since a piece lives in
  // its own stage column exactly like a standalone card.
  const openPieceCard = openPieceId ? findCard(optimisticColumns, openPieceId) : null;

  // Item 1, 260811-m0t: filtered derivations for the channel filter --
  // optimisticColumns/packages themselves stay UNCHANGED (still the source
  // findCard/drag logic reads from).
  const visibleColumns =
    channelFilter === "all"
      ? optimisticColumns
      : optimisticColumns.map((column) => ({
          ...column,
          cards: column.cards.filter((c) => c.channel === channelFilter),
        }));
  const visiblePackages =
    channelFilter === "all"
      ? packages
      : packages.filter((p) => p.channel === channelFilter);

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
          <Select
            value={channelFilter}
            onValueChange={(value) => setChannelFilter(value as CardChannel | "all")}
          >
            <SelectTrigger className="w-full max-w-[200px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos os canais</SelectItem>
              <SelectItem value="planejamento">{CHANNEL_LABELS.planejamento}</SelectItem>
              <SelectItem value="conteudo">{CHANNEL_LABELS.conteudo}</SelectItem>
            </SelectContent>
          </Select>
        ) : null}

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

      {activeClient && visiblePackages.length > 0 ? (
        <div className="mb-8 flex flex-col gap-4">
          <SectionTitle>Pacotes</SectionTitle>
          {visiblePackages.map((pkg) => (
            <PackageRow
              key={pkg.id}
              pkg={pkg}
              pieceStages={piecesByPackageId[pkg.id] ?? []}
              pieces={optimisticColumns
                .flatMap((column) => column.cards)
                .filter((card) => card.parent_card_id === pkg.id)}
              onOpenPieceDetail={setOpenPieceId}
            />
          ))}
        </div>
      ) : null}

      <PieceDetailDialog
        card={openPieceCard}
        onOpenChange={(next) => {
          if (!next) setOpenPieceId(null);
        }}
        pmNames={pmNames}
        pmRoster={pmRoster}
        hasChecklistTemplate={hasChecklistTemplate}
      />

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
            {visibleColumns.map((column) => (
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
                        parentTitleById={parentTitleById}
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
