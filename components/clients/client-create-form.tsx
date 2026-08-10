"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";
import { XIcon, PlusIcon } from "lucide-react";
import {
  clientCreateSchema,
  type ClientCreateInput,
} from "@/lib/validation/clients";
import { createClientRecord } from "@/lib/actions/clients";
import { uploadClientFile } from "@/lib/actions/client-files";
import { generateChecklistDraftFromFiles } from "@/lib/actions/checklist-templates";
import {
  splitBySlots,
  summarizeUploadOutcomes,
  type UploadOutcome,
} from "@/lib/client-files/multi-upload";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { ErrorBox } from "@/components/ui/error-box";
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

type ClientCreateFormProps = {
  pmRoster: PmRosterEntry[];
  currentUserId: string;
  basePath: string;
};

/**
 * Shared client creation form (Admin + PM route wrappers below pass
 * `basePath` so this component never hardcodes a role root). Performs no
 * data fetching itself — `pmRoster` is fetched server-side by the caller.
 */
export function ClientCreateForm({
  pmRoster,
  currentUserId,
  basePath,
}: ClientCreateFormProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [serverError, setServerError] = useState<string | null>(null);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploadProgress, setUploadProgress] = useState<{
    done: number;
    total: number;
  } | null>(null);

  const form = useForm<ClientCreateInput>({
    resolver: zodResolver(clientCreateSchema),
    defaultValues: { name: "", tag: "", pmIds: [currentUserId] },
  });

  function onSubmit(values: ClientCreateInput) {
    setServerError(null);

    const formData = new FormData();
    formData.append("name", values.name);
    formData.append("tag", values.tag);
    for (const id of values.pmIds) {
      formData.append("pmIds", id);
    }

    startTransition(async () => {
      const result = await createClientRecord(formData);
      if ("error" in result) {
        setServerError(result.error);
        return;
      }
      const clientId = result.clientId;

      let successCount = 0;

      if (selectedFiles.length > 0) {
        const { accepted, skipped } = splitBySlots(selectedFiles, 0);

        // Loop sequencial obrigatório — NUNCA disparar os uploads em
        // paralelo: uploadClientFile faz read-then-insert do contador de
        // arquivos para checar atFileLimit no banco, então chamadas
        // concorrentes poderiam todas ler o mesmo count pré-insert e
        // ultrapassar o teto de FILE_LIMIT (T-jl0-03, mesmo raciocínio de
        // T-dkr-02 em client-files-section.tsx).
        const outcomes: UploadOutcome[] = [];
        for (let i = 0; i < accepted.length; i++) {
          const file = accepted[i];
          setUploadProgress({ done: i, total: accepted.length });
          const fd = new FormData();
          fd.append("file", file);
          const uploadResult = await uploadClientFile(clientId, fd);
          outcomes.push(
            "error" in uploadResult
              ? { filename: file.name, error: uploadResult.error }
              : { filename: file.name }
          );
          setUploadProgress({ done: i + 1, total: accepted.length });
        }

        const summary = summarizeUploadOutcomes(
          outcomes,
          skipped.map((file) => file.name)
        );
        successCount = summary.successCount;
        if (summary.message) {
          toast.error(summary.message);
        }

        if (successCount > 0) {
          await generateChecklistDraftFromFiles(clientId);
        }

        setUploadProgress(null);
      }

      router.push(
        successCount > 0
          ? `${basePath}/${clientId}?autofillBriefing=1`
          : `${basePath}/${clientId}`
      );
    });
  }

  const selectedPmIds = form.watch("pmIds");

  function togglePm(pmId: string, checked: boolean) {
    const current = form.getValues("pmIds");
    if (checked) {
      form.setValue("pmIds", Array.from(new Set([...current, pmId])));
    } else {
      form.setValue(
        "pmIds",
        current.filter((id) => id !== pmId)
      );
    }
  }

  function removePm(pmId: string) {
    const current = form.getValues("pmIds");
    form.setValue(
      "pmIds",
      current.filter((id) => id !== pmId)
    );
  }

  return (
    <Form {...form}>
      <form
        onSubmit={form.handleSubmit(onSubmit)}
        className="flex flex-col gap-6"
      >
        <div className="flex gap-4">
          <div className="flex-1">
            <FormField
              control={form.control}
              name="name"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Nome</FormLabel>
                  <FormControl>
                    <Input {...field} disabled={isPending} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
          </div>
          <div className="flex-1">
            <FormField
              control={form.control}
              name="tag"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Tag</FormLabel>
                  <FormControl>
                    <Input {...field} disabled={isPending} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
          </div>
        </div>

        <div className="flex flex-col gap-3">
          <FormLabel>PMs atribuídos</FormLabel>
          <div>
            <Dialog open={pickerOpen} onOpenChange={setPickerOpen}>
              <DialogTrigger asChild>
                <Button type="button" variant="outline" disabled={isPending}>
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
                  <Button type="button" onClick={() => setPickerOpen(false)}>
                    Concluir
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          </div>
          {selectedPmIds.length > 0 ? (
            <div className="flex flex-wrap gap-2">
              {selectedPmIds.map((pmId) => {
                const email =
                  pmRoster.find((pm) => pm.id === pmId)?.email ?? pmId;
                return (
                  <Badge key={pmId} variant="secondary" className="gap-1">
                    {email}
                    <button
                      type="button"
                      aria-label={`Remover ${email}`}
                      onClick={() => removePm(pmId)}
                      disabled={isPending}
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

        <div className="flex flex-col gap-3">
          <FormLabel>Arquivos do cliente (opcional)</FormLabel>
          <div className="flex flex-wrap items-center gap-2">
            <input
              ref={fileInputRef}
              type="file"
              name="file"
              accept=".pdf,.txt,.md,.docx"
              multiple
              disabled={isPending}
              className="hidden"
              onChange={(event) =>
                setSelectedFiles(Array.from(event.target.files ?? []))
              }
            />
            <Button
              type="button"
              variant="outline"
              disabled={isPending}
              onClick={() => fileInputRef.current?.click()}
            >
              Escolher arquivo(s)
            </Button>
            <span className="text-sm text-muted-foreground">
              {selectedFiles.length === 0
                ? "Nenhum arquivo selecionado"
                : selectedFiles.length === 1
                  ? selectedFiles[0].name
                  : `${selectedFiles.length} arquivos selecionados`}
            </span>
          </div>
          <p className="text-xs text-muted-foreground">
            Arquivos anexados aqui já geram automaticamente um rascunho de
            checklist e uma proposta de briefing pela IA — nenhum upload
            manual adicional é necessário.
          </p>
        </div>

        {serverError ? <ErrorBox>{serverError}</ErrorBox> : null}

        <Button type="submit" disabled={isPending} className="w-full">
          {isPending
            ? uploadProgress && uploadProgress.total > 1
              ? `Enviando ${uploadProgress.done + 1} de ${uploadProgress.total}...`
              : "Criando..."
            : "Criar cliente"}
        </Button>
      </form>
    </Form>
  );
}
