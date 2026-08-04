"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useForm, useFieldArray } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { XIcon, PlusIcon, ArrowLeftIcon } from "lucide-react";
import {
  briefingSchema,
  type BriefingInput,
} from "@/lib/validation/clients";
import { updateBriefing, assignPms } from "@/lib/actions/clients";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { ErrorBox } from "@/components/ui/error-box";
import { DataCard } from "@/components/ui/data-card";
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
    objective: string | null;
    toneOfVoice: string | null;
    targetAudience: string | null;
    contentPillars: string[];
  };
  pmRoster: PmRosterEntry[];
  assignedPmIds: string[];
  assignedPmNames: Record<string, string>;
  viewerIsAdmin: boolean;
  initialFiles: ClientFileRow[];
  checklistTemplate: ClientChecklistSummary | null;
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
  backHref,
}: ClientDetailFormProps) {
  // -- Briefing form (updateBriefing) --
  const [isBriefingPending, startBriefingTransition] = useTransition();
  const [briefingServerError, setBriefingServerError] = useState<
    string | null
  >(null);
  const [pillarInput, setPillarInput] = useState("");
  // P1 pivot 2026-08-04: "Salvo" only shows once a save has actually
  // succeeded THIS session, gated together with `!form.formState.isDirty`
  // below — without this flag, a freshly loaded (never-dirty) form would
  // read as "Salvo" before the PM/Admin has saved anything at all.
  const [justSavedBriefing, setJustSavedBriefing] = useState(false);

  const form = useForm<BriefingInput>({
    resolver: zodResolver(briefingSchema),
    defaultValues: {
      objective: client.objective ?? "",
      toneOfVoice: client.toneOfVoice ?? "",
      targetAudience: client.targetAudience ?? "",
      contentPillars: client.contentPillars,
    },
  });

  const { fields, append, remove, replace } = useFieldArray({
    control: form.control,
    name: "contentPillars" as never,
  });

  const contentPillars = form.watch("contentPillars");

  function addPillar() {
    const value = pillarInput.trim();
    if (!value) return;
    append(value as never);
    setPillarInput("");
  }

  // P0 pivot 2026-08-04, item 5: bubbled up from ClientFilesSection after a
  // successful upload + AI proposal. `replace` (not `append`/`setValue`) is
  // useFieldArray's own array-safe bulk-update — it keeps `fields` (what
  // the pillar Badge list below renders) in sync with form state, which a
  // plain `form.setValue("contentPillars", ...)` is not guaranteed to do.
  // The proposal only fills the form — it is NEVER submitted automatically;
  // the PM/Admin still has to review and click "Salvar briefing".
  function handleBriefingAutofilled(briefing: BriefingInput) {
    form.setValue("objective", briefing.objective, { shouldDirty: true });
    form.setValue("toneOfVoice", briefing.toneOfVoice, { shouldDirty: true });
    form.setValue("targetAudience", briefing.targetAudience, {
      shouldDirty: true,
    });
    replace(briefing.contentPillars as never[]);
  }

  function onSubmitBriefing(values: BriefingInput) {
    setBriefingServerError(null);

    const formData = new FormData();
    if (values.objective) formData.append("objective", values.objective);
    if (values.toneOfVoice) formData.append("toneOfVoice", values.toneOfVoice);
    if (values.targetAudience)
      formData.append("targetAudience", values.targetAudience);
    for (const pillar of values.contentPillars) {
      formData.append("contentPillars", pillar);
    }

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
        title="Briefing estratégico"
        description="Alimenta o contexto da IA deste cliente em todas as conversas do chat."
      >
        <Form {...form}>
          <form
            onSubmit={form.handleSubmit(onSubmitBriefing)}
            className="flex flex-col gap-4"
          >
            <FormField
              control={form.control}
              name="objective"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Objetivo</FormLabel>
                  <FormControl>
                    <Textarea
                      {...field}
                      value={field.value ?? ""}
                      disabled={isBriefingPending}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="toneOfVoice"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Tom de voz</FormLabel>
                  <FormControl>
                    <Textarea
                      {...field}
                      value={field.value ?? ""}
                      disabled={isBriefingPending}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="targetAudience"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Público-alvo</FormLabel>
                  <FormControl>
                    <Textarea
                      {...field}
                      value={field.value ?? ""}
                      disabled={isBriefingPending}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <div className="flex flex-col gap-2">
              <FormLabel>Pilares de conteúdo</FormLabel>
              <div className="flex gap-2">
                <Input
                  value={pillarInput}
                  onChange={(e) => setPillarInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      addPillar();
                    }
                  }}
                  disabled={isBriefingPending}
                  placeholder="Adicionar pilar de conteúdo"
                />
                <Button
                  type="button"
                  variant="outline"
                  onClick={addPillar}
                  disabled={isBriefingPending}
                >
                  Adicionar
                </Button>
              </div>
              {fields.length > 0 ? (
                <div className="flex flex-wrap gap-2">
                  {fields.map((fieldItem, index) => {
                    const pillar = contentPillars[index] ?? "";
                    return (
                      <Badge
                        key={fieldItem.id}
                        variant="secondary"
                        className="gap-1"
                      >
                        {pillar}
                        <button
                          type="button"
                          aria-label={`Remover ${pillar}`}
                          onClick={() => remove(index)}
                          disabled={isBriefingPending}
                          className="ml-1"
                        >
                          <XIcon className="size-3" />
                        </button>
                      </Badge>
                    );
                  })}
                </div>
              ) : null}
            </div>

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
      />

      {viewerIsAdmin ? (
        <ClientChecklistSection
          clientId={client.id}
          currentTemplate={checklistTemplate}
        />
      ) : null}
    </div>
  );
}
