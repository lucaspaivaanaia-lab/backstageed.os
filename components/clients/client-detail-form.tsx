"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter, useSearchParams, usePathname } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";
import { XIcon, PlusIcon, ArrowLeftIcon } from "lucide-react";
import {
  briefingSchema,
  type BriefingInput,
} from "@/lib/validation/clients";
import {
  updateBriefing,
  assignPms,
  archiveClient,
  updateClientTag,
  autofillBriefingFromFiles,
} from "@/lib/actions/clients";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { ErrorBox } from "@/components/ui/error-box";
import { DataCard } from "@/components/ui/data-card";
import { StatusBadge } from "@/components/ui/status-badge";
import { cn } from "@/lib/utils";
import {
  Form,
  FormField,
  FormItem,
  FormLabel,
  FormControl,
  FormMessage,
} from "@/components/ui/form";
import {
  Dialog,
  DialogTrigger,
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
import { PageTitle } from "@/components/layout/page-shell";
import { ClientFilesSection } from "@/components/clients/client-files-section";
import { ClientChecklistSection } from "@/components/clients/client-checklist-section";
import type { ClientFileRow } from "@/lib/actions/client-files";
import type { ClientChecklistSummary } from "@/lib/actions/checklist-templates";

type PmRosterEntry = { id: string; email: string };

type ClientDetailFormProps = {
  client: {
    id: string;
    name: string;
    tag: string;
    briefing: string | null;
  };
  pmRoster: PmRosterEntry[];
  assignedPmIds: string[];
  assignedPmNames: Record<string, string>;
  viewerIsAdmin: boolean;
  initialFiles: ClientFileRow[];
  checklistTemplate: ClientChecklistSummary | null;
  checklistDraft: ClientChecklistSummary | null;
  // P1 pivot 2026-08-04: "/admin/clients" or "/pm/clients" — passed by the
  // route wrapper rather than derived from `viewerIsAdmin` here, since an
  // Admin can browse a client via the PM route too and the back arrow must
  // return to the list the caller actually navigated FROM, not to a list
  // implied by role.
  backHref: string;
};

/**
 * Shared client detail/edit page (Admin + PM route wrappers pass fetched
 * data — this component performs no data fetching itself). Renders, in
 * this locked order (UI-SPEC Visual Focal Points): Display heading (client
 * name) -> "Briefing estratégico" (CLI-04, D-04, D-05, D-06 -- single form,
 * no wizard) -> "PMs atribuídos" (CLI-02, Admin-only edit) -> "Arquivos do
 * cliente" (CLI-03/CTX-01..05, Task 5 -- upload/list/remove client_files).
 */
export function ClientDetailForm({
  client,
  pmRoster,
  assignedPmIds,
  assignedPmNames,
  viewerIsAdmin,
  initialFiles,
  checklistTemplate,
  checklistDraft,
  backHref,
}: ClientDetailFormProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const pathname = usePathname();
  const hasTriggeredAutofillRef = useRef(false);

  // -- Tag do cliente (updateClientTag), available to both Admin and PM --
  const [tagValue, setTagValue] = useState(client.tag);
  const [isTagPending, startTagTransition] = useTransition();
  const [tagError, setTagError] = useState<string | null>(null);
  const [tagSaved, setTagSaved] = useState(false);

  function handleSaveTag() {
    setTagError(null);
    setTagSaved(false);
    startTagTransition(async () => {
      const result = await updateClientTag(client.id, tagValue);
      if ("error" in result) {
        setTagError(result.error);
        return;
      }
      setTagSaved(true);
      // Without this, `client.tag` (the prop, server-fetched) stays stale
      // after a successful save — the "Salvar tag" disabled check
      // (`tagValue.trim() === client.tag`) would then compare against the
      // PRE-save value forever, making a later edit back toward that old
      // value look like "no change" and silently refuse to re-enable the
      // button, even though the database has since moved on.
      router.refresh();
    });
  }

  // -- Excluir cliente (archiveClient), Admin-only, soft delete --
  const [isArchivePending, startArchiveTransition] = useTransition();
  const [archiveError, setArchiveError] = useState<string | null>(null);

  function handleArchive() {
    setArchiveError(null);
    startArchiveTransition(async () => {
      const result = await archiveClient(client.id);
      if ("error" in result) {
        setArchiveError(result.error);
        return;
      }
      router.push(backHref);
    });
  }

  // -- Briefing form (updateBriefing) --
  const [isBriefingPending, startBriefingTransition] = useTransition();
  const [briefingServerError, setBriefingServerError] = useState<
    string | null
  >(null);
  // P1 pivot 2026-08-04: "Salvo" only shows once a save has actually
  // succeeded THIS session, gated together with `!form.formState.isDirty`
  // below — without this flag, a freshly loaded (never-dirty) form would
  // read as "Salvo" before the PM/Admin has saved anything at all.
  const [justSavedBriefing, setJustSavedBriefing] = useState(false);

  const form = useForm<BriefingInput>({
    resolver: zodResolver(briefingSchema),
    defaultValues: {
      briefing: client.briefing ?? "",
    },
  });

  // P0 pivot 2026-08-04, item 5: bubbled up from ClientFilesSection after a
  // successful upload + AI proposal. The proposal only fills the form — it
  // is NEVER submitted automatically; the PM/Admin still has to review and
  // click "Salvar briefing". Quick task 260811-kl3: the AI now proposes one
  // free-form Markdown document (no fixed fields) into this single field.
  function handleBriefingAutofilled(briefing: BriefingInput) {
    form.setValue("briefing", briefing.briefing, { shouldDirty: true });
  }

  // 260810-jl0: consumes the `?autofillBriefing=1` redirect signal appended
  // by client-create-form.tsx after a successful upload+create — this page
  // (unlike the creation screen) already has a mounted briefing form, so it
  // makes the SAME autofillBriefingFromFiles call itself and applies the
  // result via the existing handleBriefingAutofilled function above (no
  // duplicated form.setValue/replace logic). Ref-guarded so it fires at
  // most once per mount even under React Strict Mode's dev double-invoke;
  // the guard is set synchronously, before any `await`, so a second render
  // pass cannot re-enter while the first call is still in flight.
  useEffect(() => {
    if (
      hasTriggeredAutofillRef.current ||
      searchParams.get("autofillBriefing") !== "1"
    ) {
      return;
    }
    hasTriggeredAutofillRef.current = true;

    (async () => {
      const result = await autofillBriefingFromFiles(client.id);
      if ("success" in result) {
        handleBriefingAutofilled(result.briefing);
        toast.success(
          "Briefing preenchido pela IA a partir do arquivo. Revise e clique em \"Salvar briefing\"."
        );
      }
      router.replace(pathname);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // 260808-ci5 (found during live verification): ClientFilesSection and
  // ClientChecklistSection are siblings, so the "a draft is being
  // generated right now" window has to be lifted up here rather than
  // handled locally in either — same shape as handleBriefingAutofilled
  // above, just a boolean instead of a payload.
  const [checklistGenerating, setChecklistGenerating] = useState(false);

  function onSubmitBriefing(values: BriefingInput) {
    setBriefingServerError(null);

    const formData = new FormData();
    if (values.briefing) formData.append("briefing", values.briefing);

    startBriefingTransition(async () => {
      const result = await updateBriefing(client.id, formData);
      if ("error" in result) {
        setBriefingServerError(result.error);
        return;
      }
      // P1 pivot 2026-08-04: re-baseline the form to the just-saved values
      // so `isDirty` goes back to false — the "Salvo" label below reads
      // off `isDirty` rather than a timer, so it reverts to "Salvar
      // briefing" automatically the moment the PM/Admin edits anything
      // again, no extra event wiring needed.
      form.reset(values);
      setJustSavedBriefing(true);
      // Navigation-flow correction 2026-08-05: the briefing form is a
      // detour from Produção now (reached via the "Editar briefing"
      // sidebar item), not the default landing screen — saving always
      // returns to Produção for THIS client, whether it's the very first
      // save on a freshly created client or a later edit. router.push()
      // here (not replace) so the briefing edit stays in browser history —
      // pressing back from Produção returns to the form with the just-
      // saved values still shown, rather than skipping it entirely.
      router.push(`/pm/board?client=${client.id}`);
    });
  }

  // -- PM assignment (assignPms), Admin-only --
  const [isPmPending, startPmTransition] = useTransition();
  const [pmServerError, setPmServerError] = useState<string | null>(null);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [selectedPmIds, setSelectedPmIds] = useState<string[]>(assignedPmIds);

  function togglePm(pmId: string, checked: boolean) {
    setSelectedPmIds((current) =>
      checked ? Array.from(new Set([...current, pmId])) : current.filter((id) => id !== pmId)
    );
  }

  function saveAndClosePicker() {
    setPickerOpen(false);
    savePmAssignment(selectedPmIds);
  }

  function removePm(pmId: string) {
    const next = selectedPmIds.filter((id) => id !== pmId);
    setSelectedPmIds(next);
    savePmAssignment(next);
  }

  function savePmAssignment(pmIds: string[]) {
    setPmServerError(null);
    startPmTransition(async () => {
      const result = await assignPms(client.id, pmIds);
      if ("error" in result) {
        setPmServerError(result.error);
      }
    });
  }

  return (
    <div className="flex flex-col gap-section">
      <Link
        href={backHref}
        className="flex w-fit items-center gap-1 text-meta text-muted-foreground hover:text-foreground"
      >
        <ArrowLeftIcon className="size-4" />
        Voltar para clientes
      </Link>
      <PageTitle className="mb-0">{client.name}</PageTitle>

      <DataCard
        title="Tag do cliente"
        description="Identificador único usado para diferenciar este cliente de outros com nomes parecidos."
      >
        <div className="flex flex-col gap-3">
          <Input
            value={tagValue}
            onChange={(e) => {
              setTagValue(e.target.value);
              setTagSaved(false);
            }}
            disabled={isTagPending}
          />
          <Button
            type="button"
            onClick={handleSaveTag}
            disabled={isTagPending || tagValue.trim() === client.tag}
            className="w-fit"
          >
            {isTagPending ? "Salvando..." : tagSaved ? "Salvo" : "Salvar tag"}
          </Button>
          {tagError ? <ErrorBox>{tagError}</ErrorBox> : null}
        </div>
      </DataCard>

      <DataCard
        title="Briefing estratégico"
        description="Alimenta o contexto da IA deste cliente em todas as conversas do chat."
        badge={
          form.formState.isDirty && !isBriefingPending ? (
            <StatusBadge tone="warning">Alterações não salvas</StatusBadge>
          ) : null
        }
      >
        <Form {...form}>
          <form
            onSubmit={form.handleSubmit(onSubmitBriefing)}
            className="flex flex-col gap-4"
          >
            <FormField
              control={form.control}
              name="briefing"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Briefing estratégico</FormLabel>
                  <FormControl>
                    <Textarea
                      {...field}
                      value={field.value ?? ""}
                      disabled={isBriefingPending}
                      className={cn(
                        "min-h-[400px]",
                        form.formState.isDirty &&
                          "border-warning ring-1 ring-warning/40"
                      )}
                      placeholder="Escreva o briefing estratégico deste cliente em Markdown -- objetivo, tom de voz, público-alvo, pilares de conteúdo, ou qualquer outra estrutura que fizer sentido."
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            {briefingServerError ? (
              <ErrorBox>{briefingServerError}</ErrorBox>
            ) : null}

            <Button
              type="submit"
              disabled={isBriefingPending}
              className="w-fit"
            >
              {isBriefingPending
                ? "Salvando..."
                : justSavedBriefing && !form.formState.isDirty
                  ? "Salvo"
                  : "Salvar briefing"}
            </Button>
          </form>
        </Form>
      </DataCard>

      <DataCard title="PMs atribuídos">
        <div className="flex flex-col gap-4">
          {selectedPmIds.length > 0 ? (
            <div className="flex flex-wrap gap-2">
              {selectedPmIds.map((pmId) => {
                const name = assignedPmNames[pmId] ?? pmId;
                return (
                  <Badge key={pmId} variant="secondary" className="gap-1">
                    {name}
                    {viewerIsAdmin ? (
                      <button
                        type="button"
                        aria-label={`Remover ${name}`}
                        onClick={() => removePm(pmId)}
                        disabled={isPmPending}
                        className="ml-1"
                      >
                        <XIcon className="size-3" />
                      </button>
                    ) : null}
                  </Badge>
                );
              })}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">
              Nenhum PM atribuído ainda.
            </p>
          )}

          {viewerIsAdmin ? (
            <div>
              <Dialog open={pickerOpen} onOpenChange={setPickerOpen}>
                <DialogTrigger asChild>
                  <Button
                    type="button"
                    variant="outline"
                    disabled={isPmPending}
                  >
                    <PlusIcon className="size-4" />
                    Adicionar PM
                  </Button>
                </DialogTrigger>
                <DialogContent>
                  <DialogHeader>
                    <DialogTitle>Selecionar PMs</DialogTitle>
                  </DialogHeader>
                  <div className="flex flex-col gap-3">
                    {pmRoster.map((pm) => (
                      <label
                        key={pm.id}
                        className="flex items-center gap-2 text-sm"
                      >
                        <Checkbox
                          checked={selectedPmIds.includes(pm.id)}
                          onCheckedChange={(checked) =>
                            togglePm(pm.id, checked === true)
                          }
                        />
                        {pm.email}
                      </label>
                    ))}
                  </div>
                  <DialogFooter>
                    <Button type="button" onClick={saveAndClosePicker}>
                      Concluir
                    </Button>
                  </DialogFooter>
                </DialogContent>
              </Dialog>
            </div>
          ) : null}

          {pmServerError ? <ErrorBox>{pmServerError}</ErrorBox> : null}
        </div>
      </DataCard>

      <ClientFilesSection
        clientId={client.id}
        initialFiles={initialFiles}
        onBriefingAutofilled={handleBriefingAutofilled}
        onChecklistGenerating={setChecklistGenerating}
      />

      <ClientChecklistSection
        clientId={client.id}
        viewerIsAdmin={viewerIsAdmin}
        confirmedTemplate={checklistTemplate}
        draftTemplate={checklistDraft}
        generating={checklistGenerating}
      />

      {viewerIsAdmin ? (
        <DataCard
          title="Excluir cliente"
          description="O cliente é removido das listas ativas (board, chat, checklists). Cards, conversas e arquivos já existentes são mantidos, não apagados."
        >
          <div className="flex flex-col gap-4">
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button
                  type="button"
                  variant="destructive"
                  disabled={isArchivePending}
                  className="w-fit"
                >
                  Excluir cliente
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Excluir cliente</AlertDialogTitle>
                  <AlertDialogDescription>
                    {client.name} será removido das listas ativas. Cards,
                    conversas e arquivos deste cliente são mantidos e podem
                    ser restaurados por um desenvolvedor, se necessário.
                    Deseja continuar?
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Cancelar</AlertDialogCancel>
                  <AlertDialogAction
                    variant="destructive"
                    onClick={handleArchive}
                  >
                    Excluir
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
            {archiveError ? <ErrorBox>{archiveError}</ErrorBox> : null}
          </div>
        </DataCard>
      ) : null}
    </div>
  );
}
