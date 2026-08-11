"use client";

import { useRef, useState, useTransition } from "react";
import {
  uploadSharedKnowledgeFile,
  deleteSharedKnowledgeFile,
  listSharedKnowledgeFiles,
  type SharedKnowledgeFileRow,
} from "@/lib/actions/shared-knowledge";
import { Button } from "@/components/ui/button";
import { XIcon, FileTextIcon } from "lucide-react";
import { ErrorBox } from "@/components/ui/error-box";
import { DataCard } from "@/components/ui/data-card";
import { EmptyState } from "@/components/layout/page-shell";

type SharedKnowledgeSectionProps = {
  initialFiles: SharedKnowledgeFileRow[];
};

/**
 * "Arquivos de conhecimento comum" section (quick task 260811-imw, item 9
 * do plano de acao de 2026-08-05) — mirrors
 * `components/clients/client-files-section.tsx`'s visual/interaction
 * pattern, deliberately simplified: no `clientId`, no
 * briefing-autofill/checklist-draft callbacks, no per-file `FILE_LIMIT`
 * badge (this table has no per-client prompt budget concept). Every file
 * here is injected into EVERY client's AI context, not scoped to one.
 */
export function SharedKnowledgeSection({
  initialFiles,
}: SharedKnowledgeSectionProps) {
  const [files, setFiles] = useState<SharedKnowledgeFileRow[]>(initialFiles);
  const [isUploadPending, startUploadTransition] = useTransition();
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [isDeletePending, startDeleteTransition] = useTransition();
  const fileInputRef = useRef<HTMLInputElement>(null);
  // Hidden input + real Button pattern (client-files-section.tsx) — a bare
  // native <input type="file"> is inconsistent enough across browsers/OSes
  // to be worth avoiding.
  const [selectedName, setSelectedName] = useState<string>("");

  function handleUpload(formData: FormData) {
    setUploadError(null);
    startUploadTransition(async () => {
      const result = await uploadSharedKnowledgeFile(formData);
      if ("error" in result) {
        setUploadError(result.error);
        return;
      }
      if (fileInputRef.current) fileInputRef.current.value = "";
      setSelectedName("");
      setFiles(await listSharedKnowledgeFiles());
    });
  }

  function handleDelete(fileId: string) {
    setUploadError(null);
    setDeletingId(fileId);
    startDeleteTransition(async () => {
      const result = await deleteSharedKnowledgeFile(fileId);
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
      title="Arquivos de conhecimento comum"
      description="Esses arquivos são injetados no contexto de IA de TODOS os clientes, não apenas de um — use para regras/orientações gerais válidas para qualquer conta atendida."
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
            description="Envie um arquivo (PDF/TXT/MD/DOCX) com orientações válidas para todos os clientes."
          />
        )}

        <form action={handleUpload} className="flex flex-col gap-2">
          <div className="flex flex-wrap items-center gap-2">
            <input
              ref={fileInputRef}
              type="file"
              name="file"
              accept=".pdf,.txt,.md,.docx"
              disabled={isUploadPending}
              className="hidden"
              onChange={(event) =>
                setSelectedName(event.target.files?.[0]?.name ?? "")
              }
            />
            <Button
              type="button"
              variant="outline"
              disabled={isUploadPending}
              onClick={() => fileInputRef.current?.click()}
            >
              Escolher arquivo
            </Button>
            <span className="text-sm text-muted-foreground">
              {selectedName === "" ? "Nenhum arquivo selecionado" : selectedName}
            </span>
            <Button
              type="submit"
              disabled={isUploadPending || selectedName === ""}
            >
              {isUploadPending ? "Enviando..." : "Enviar arquivo"}
            </Button>
          </div>
        </form>

        {uploadError ? <ErrorBox>{uploadError}</ErrorBox> : null}
      </div>
    </DataCard>
  );
}
