"use client";

import { useState, useTransition } from "react";
import { useForm, useFieldArray } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { CheckCircle2, Clock, XIcon } from "lucide-react";
import {
  briefingSchema,
  type BriefingInput,
} from "@/lib/validation/clients";
import {
  updateBriefing,
  assignPms,
  retryTropicaliaProvisioning,
} from "@/lib/actions/clients";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
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

type PmRosterEntry = { id: string; email: string };

type ClientDetailFormProps = {
  client: {
    id: string;
    name: string;
    objective: string | null;
    toneOfVoice: string | null;
    targetAudience: string | null;
    contentPillars: string[];
    tropicaliaProjectId: string | null;
  };
  pmRoster: PmRosterEntry[];
  assignedPmIds: string[];
  assignedPmNames: Record<string, string>;
  viewerIsAdmin: boolean;
  canRetry: boolean;
};

/**
 * Shared client detail/edit page (Admin + PM route wrappers pass fetched
 * data — this component performs no data fetching itself). Renders, in
 * this locked order (UI-SPEC Visual Focal Points): Display heading (client
 * name) -> "Briefing estratégico" (CLI-04, D-04, D-05, D-06 -- single form,
 * no wizard) -> "PMs atribuídos" (CLI-02, Admin-only edit) -> RAG status
 * (D-08/D-09/D-11).
 */
export function ClientDetailForm({
  client,
  pmRoster,
  assignedPmIds,
  assignedPmNames,
  viewerIsAdmin,
  canRetry,
}: ClientDetailFormProps) {
  // -- Briefing form (updateBriefing) --
  const [isBriefingPending, startBriefingTransition] = useTransition();
  const [briefingServerError, setBriefingServerError] = useState<
    string | null
  >(null);
  const [pillarInput, setPillarInput] = useState("");

  const form = useForm<BriefingInput>({
    resolver: zodResolver(briefingSchema),
    defaultValues: {
      objective: client.objective ?? "",
      toneOfVoice: client.toneOfVoice ?? "",
      targetAudience: client.targetAudience ?? "",
      contentPillars: client.contentPillars,
    },
  });

  const { fields, append, remove } = useFieldArray({
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
      }
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

  // -- RAG retry (retryTropicaliaProvisioning) --
  const [isRetryPending, startRetryTransition] = useTransition();
  const [retryServerError, setRetryServerError] = useState<string | null>(
    null
  );

  function retryProvisioning() {
    setRetryServerError(null);
    startRetryTransition(async () => {
      const result = await retryTropicaliaProvisioning(client.id);
      if ("error" in result) {
        setRetryServerError(result.error);
      }
    });
  }

  return (
    <div className="flex flex-col gap-8">
      <h1 className="text-[28px] font-semibold leading-[1.2]">
        {client.name}
      </h1>

      <section className="flex flex-col gap-6">
        <h2 className="text-xl font-semibold leading-[1.2]">
          Briefing estratégico
        </h2>

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
              <p className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">
                {briefingServerError}
              </p>
            ) : null}

            <Button
              type="submit"
              disabled={isBriefingPending}
              className="w-fit"
            >
              {isBriefingPending ? "Salvando..." : "Salvar briefing"}
            </Button>
          </form>
        </Form>
      </section>

      <section className="flex flex-col gap-4">
        <h2 className="text-xl font-semibold leading-[1.2]">
          PMs atribuídos
        </h2>

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
                <Button type="button" variant="outline" disabled={isPmPending}>
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

        {pmServerError ? (
          <p className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">
            {pmServerError}
          </p>
        ) : null}
      </section>

      <section className="flex flex-col gap-4">
        <h2 className="text-xl font-semibold leading-[1.2]">RAG</h2>

        {client.tropicaliaProjectId ? (
          <Badge variant="secondary" className="w-fit">
            <CheckCircle2 /> Pronto
          </Badge>
        ) : (
          <div className="flex flex-col gap-2">
            <Badge variant="outline" className="w-fit">
              <Clock /> Pendente
            </Badge>
            {canRetry ? (
              <Button
                type="button"
                variant="outline"
                className="w-fit"
                onClick={retryProvisioning}
                disabled={isRetryPending}
              >
                {isRetryPending ? "Tentando..." : "Tentar novamente"}
              </Button>
            ) : (
              <p className="text-sm text-muted-foreground">
                RAG setup pendente.
              </p>
            )}
          </div>
        )}

        {retryServerError ? (
          <p className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">
            {retryServerError}
          </p>
        ) : null}
      </section>
    </div>
  );
}
