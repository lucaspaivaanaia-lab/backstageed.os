"use client";

import { useRef, useState, useTransition } from "react";
import { toast } from "sonner";
import {
  uploadClientFile,
  deleteClientFile,
  listClientFiles,
  type ClientFileRow,
} from "@/lib/actions/client-files";
import { autofillBriefingFromFiles } from "@/lib/actions/clients";
import type { BriefingInput } from "@/lib/validation/clients";
import { FILE_LIMIT, atFileLimit } from "@/lib/client-files/limit";
import {
  splitBySlots,
  summarizeUploadOutcomes,
  type UploadOutcome,
} from "@/lib/client-files/multi-upload";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { XIcon, FileTextIcon } from "lucide-react";
import { ErrorBox } from "@/components/ui/error-box";
import { DataCard } from "@/components/ui/data-card";
import { EmptyState } from "@/components/layout/page-shell";
import { TranscriptUpdateSection } from "@/components/clients/transcript-update-section";

const BRIEFING_AUTOFILLED_TOAST =
  "Briefing preenchido pela IA a partir do arquivo. Revise e clique em \"Salvar briefing\".";

type ClientFilesSectionProps = {
  clientId: string;
  initialFiles: ClientFileRow[];
  // Bubbles the AI's proposed briefing up to the parent so it can call
  // form.setValue() for each field — this component never touches the
  // briefing form's state directly (single source of truth stays in
  // ClientDetailForm). Optional so this section stays usable standalone.
  onBriefingAutofilled?: (briefing: BriefingInput) => void;
};

/**
 * "Arquivos do cliente" section — upload/list/remove of client_files (Task
 * 5). No RAG service involved: extraction + storage happen entirely via
 * uploadClientFile/deleteClientFile (Server Actions, RLS-scoped). Renders
 * inside client-detail-form.tsx after "PMs atribuídos".
 */
export function ClientFilesSection({
  clientId,
  initialFiles,
  onBriefingAutofilled,
}: ClientFilesSectionProps) {
  const [files, setFiles] = useState<ClientFileRow[]>(initialFiles);
  const [isUploadPending, startUploadTransition] = useTransition();
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [isDeletePending, startDeleteTransition] = useTransition();
  const fileInputRef = useRef<HTMLInputElement>(null);
  // Bare native <input type="file"> rendering/click behavior is
  // inconsistent enough across browsers/OSes to cause reports like "the
  // button does nothing" (2026-08-04). Driving it via a hidden input +
  // fileInputRef.current.click() from a real shadcn Button is the
  // standard robust pattern — the button's own click handling is what
  // fires, never the browser's own (possibly finicky) rendering of the
  // native control. `selectedNames` replaces the native "No file chosen"
  // label this hides, and (260805-dkr) now holds every name from a
  // `multiple`-file selection, not just one.
  const [selectedNames, setSelectedNames] = useState<string[]>([]);
  // Batch-upload progress (260805-dkr): non-null only while more than one
  // file is being sent, so the submit button can show "Enviando N de M...".
  const [progress, setProgress] = useState<{
    done: number;
    total: number;
  } | null>(null);

  function handleUpload(formData: FormData) {
    setUploadError(null);
    startUploadTransition(async () => {
      const picked = formData
        .getAll("file")
        .filter((value): value is File => value instanceof File && value.size > 0);

      if (picked.length === 0) {
        setUploadError("Selecione ao menos um arquivo para enviar.");
        return;
      }

      const { accepted, skipped } = splitBySlots(picked, files.length);

      // Loop sequencial obrigatório — NUNCA disparar os uploads em
      // paralelo (nada de aguardar todas as promises de uma vez):
      // uploadClientFile faz read-then-insert do contador de arquivos para
      // checar atFileLimit no banco, então chamadas concorrentes poderiam
      // todas ler o mesmo count pré-insert e ultrapassar o teto de
      // FILE_LIMIT (T-dkr-02).
      const outcomes: UploadOutcome[] = [];
      for (let i = 0; i < accepted.length; i++) {
        const file = accepted[i];
        setProgress({ done: i, total: accepted.length });
        const fd = new FormData();
        fd.append("file", file);
        const result = await uploadClientFile(clientId, fd);
        outcomes.push(
          "error" in result
            ? { filename: file.name, error: result.error }
            : { filename: file.name }
        );
        setProgress({ done: i + 1, total: accepted.length });
      }

      const { successCount, message } = summarizeUploadOutcomes(
        outcomes,
        skipped.map((file) => file.name)
      );
      setUploadError(message);

      if (successCount > 0) {
        if (fileInputRef.current) fileInputRef.current.value = "";
        setSelectedNames([]);
        setFiles(await listClientFiles(clientId));

        // P0 pivot 2026-08-04, item 5: auto-fill the briefing once per
        // batch (never once per file — 260805-dkr), right after at least
        // one file in the batch succeeds. A failure here is silent (no
        // ErrorBox) — the upload itself already succeeded, and auto-fill
        // is a convenience, not a required step; the PM can still fill
        // the briefing by hand.
        const autofill = await autofillBriefingFromFiles(clientId);
        if ("success" in autofill) {
          onBriefingAutofilled?.(autofill.briefing);
          toast.success(BRIEFING_AUTOFILLED_TOAST);
        }
      }
      // successCount === 0: keep the current selection so the user can
      // retry without re-picking every file.

      setProgress(null);
    });
  }

  function handleDelete(fileId: string) {
    setUploadError(null);
    setDeletingId(fileId);
    startDeleteTransition(async () => {
      const result = await deleteClientFile(fileId);
      if ("error" in result) {
        setUploadError(result.error);
        setDeletingId(null);
        return;
      }
      setFiles((current) => current.filter((f) => f.id !== fileId));
      setDeletingId(null);
    });
  }

  return (
    <>
      <DataCard
        title="Arquivos do cliente"
        description={`Até ${FILE_LIMIT} arquivos (PDF/TXT/MD/DOCX) usados como contexto da IA deste cliente.`}
      >
        <div className="flex flex-col gap-4">
          {files.length > 0 ? (
            <ul className="flex flex-col gap-2">
              {files.map((file) => (
                <li
                  key={file.id}
                  className="flex items-center justify-between gap-3 rounded-md border p-3 text-sm"
                >
                  <div className="flex items-center gap-2">
                    <FileTextIcon className="size-4 text-muted-foreground" />
                    <div className="flex flex-col gap-0.5">
                      <span className="font-medium">{file.filename}</span>
                      <span className="text-xs text-muted-foreground">
                        {file.file_type.toUpperCase()} ·{" "}
                        {new Date(file.created_at).toLocaleDateString("pt-BR")}
                      </span>
                    </div>
                  </div>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    aria-label={`Remover ${file.filename}`}
                    disabled={isDeletePending && deletingId === file.id}
                    onClick={() => handleDelete(file.id)}
                  >
                    <XIcon className="size-4" />
                  </Button>
                </li>
              ))}
            </ul>
          ) : (
            <EmptyState
              icon={<FileTextIcon className="size-5" />}
              title="Nenhum arquivo enviado ainda"
              description={`Envie até ${FILE_LIMIT} arquivos para alimentar o contexto da IA deste cliente.`}
            />
          )}

          {atFileLimit(files.length) ? (
            <Badge variant="outline" className="w-fit">
              Limite de {FILE_LIMIT} arquivos atingido — remova um arquivo
              para enviar outro
            </Badge>
          ) : (
            <form action={handleUpload} className="flex flex-col gap-2">
              <div className="flex flex-wrap items-center gap-2">
                <input
                  ref={fileInputRef}
                  type="file"
                  name="file"
                  accept=".pdf,.txt,.md,.docx"
                  multiple
                  disabled={isUploadPending}
                  className="hidden"
                  onChange={(event) =>
                    setSelectedNames(
                      Array.from(event.target.files ?? []).map((f) => f.name)
                    )
                  }
                />
                <Button
                  type="button"
                  variant="outline"
                  disabled={isUploadPending}
                  onClick={() => fileInputRef.current?.click()}
                >
                  Escolher arquivo(s)
                </Button>
                <span className="text-sm text-muted-foreground">
                  {selectedNames.length === 0
                    ? "Nenhum arquivo selecionado"
                    : selectedNames.length === 1
                      ? selectedNames[0]
                      : `${selectedNames.length} arquivos selecionados`}
                </span>
                <Button
                  type="submit"
                  disabled={isUploadPending || selectedNames.length === 0}
                >
                  {isUploadPending
                    ? progress && progress.total > 1
                      ? `Enviando ${progress.done + 1} de ${progress.total}...`
                      : "Enviando..."
                    : "Enviar arquivo(s)"}
                </Button>
              </div>
            </form>
          )}

          {uploadError ? <ErrorBox>{uploadError}</ErrorBox> : null}
        </div>
      </DataCard>
      <TranscriptUpdateSection files={files} />
    </>
  );
}
