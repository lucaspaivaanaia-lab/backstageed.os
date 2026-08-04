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
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { XIcon, FileTextIcon } from "lucide-react";
import { ErrorBox } from "@/components/ui/error-box";
import { DataCard } from "@/components/ui/data-card";
import { EmptyState } from "@/components/layout/page-shell";

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

  function handleUpload(formData: FormData) {
    setUploadError(null);
    startUploadTransition(async () => {
      const result = await uploadClientFile(clientId, formData);
      if ("error" in result) {
        setUploadError(result.error);
        return;
      }
      if (fileInputRef.current) fileInputRef.current.value = "";
      const updated = await listClientFiles(clientId);
      setFiles(updated);

      // P0 pivot 2026-08-04, item 5: auto-fill the briefing right after a
      // successful upload. A failure here is silent (no ErrorBox) — the
      // upload itself already succeeded, and auto-fill is a convenience,
      // not a required step; the PM can still fill the briefing by hand.
      const autofill = await autofillBriefingFromFiles(clientId);
      if ("success" in autofill) {
        onBriefingAutofilled?.(autofill.briefing);
        toast.success(BRIEFING_AUTOFILLED_TOAST);
      }
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
            Limite de {FILE_LIMIT} arquivos atingido — remova um arquivo para
            enviar outro
          </Badge>
        ) : (
          <form action={handleUpload} className="flex flex-col gap-2">
            <div className="flex flex-wrap items-center gap-2">
              <input
                ref={fileInputRef}
                type="file"
                name="file"
                accept=".pdf,.txt,.md,.docx"
                disabled={isUploadPending}
                className="text-sm"
              />
              <Button
                type="submit"
                variant="outline"
                disabled={isUploadPending}
              >
                {isUploadPending ? "Enviando..." : "Enviar arquivo"}
              </Button>
            </div>
          </form>
        )}

        {uploadError ? <ErrorBox>{uploadError}</ErrorBox> : null}
      </div>
    </DataCard>
  );
}
