"use client";

import { useRef, useState, useTransition } from "react";
import {
  uploadClientFile,
  deleteClientFile,
  listClientFiles,
  type ClientFileRow,
} from "@/lib/actions/client-files";
import { FILE_LIMIT, atFileLimit } from "@/lib/client-files/limit";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { XIcon } from "lucide-react";
import { SectionTitle } from "@/components/layout/page-shell";

type ClientFilesSectionProps = {
  clientId: string;
  initialFiles: ClientFileRow[];
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
    <section className="flex flex-col gap-4">
      <SectionTitle>Arquivos do cliente</SectionTitle>

      {files.length > 0 ? (
        <ul className="flex flex-col gap-2">
          {files.map((file) => (
            <li
              key={file.id}
              className="flex items-center justify-between gap-3 rounded-md border p-3 text-sm"
            >
              <div className="flex flex-col gap-0.5">
                <span className="font-medium">{file.filename}</span>
                <span className="text-xs text-muted-foreground">
                  {file.file_type.toUpperCase()} ·{" "}
                  {new Date(file.created_at).toLocaleDateString("pt-BR")}
                </span>
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
        <p className="text-sm text-muted-foreground">
          Nenhum arquivo enviado ainda.
        </p>
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

      {uploadError ? (
        <p className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">
          {uploadError}
        </p>
      ) : null}
    </section>
  );
}
