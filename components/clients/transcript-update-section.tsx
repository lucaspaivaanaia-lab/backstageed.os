"use client";

import { useRef, useState, useTransition } from "react";
import { toast } from "sonner";
import {
  analyzeTranscriptAgainstFile,
  analyzeTranscriptFileAgainstFile,
  updateClientFileContent,
  type ClientFileRow,
} from "@/lib/actions/client-files";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { ErrorBox } from "@/components/ui/error-box";
import { DataCard } from "@/components/ui/data-card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { SectionTitle } from "@/components/layout/page-shell";

const FILE_UPDATED_TOAST = "Arquivo base atualizado.";

type Analysis = {
  summary: string;
  changes: string[];
  updatedContent: string;
};

type TranscriptUpdateSectionProps = {
  files: ClientFileRow[];
};

/**
 * "Atualizar arquivo via transcrição de reunião" (P2 pivot 2026-08-04,
 * item 1). Two-step, AI-proposes/human-confirms flow, same pattern as
 * every other AI feature in this codebase: paste a transcript, pick which
 * existing base file it should update, get an AI summary + change list +
 * a proposed merged file text (editable before saving), then explicitly
 * confirm. The pasted transcript is NEVER persisted anywhere — it lives
 * only in this component's local state, gone the moment the PM/Admin
 * confirms, cancels, or navigates away (analyzeTranscriptAgainstFile's own
 * doc comment states the same guarantee server-side: no table ever stores
 * it). Hidden entirely when there are no files yet — there is nothing to
 * update.
 *
 * A second, visually secondary entry path (quick task 260805-iea) lets the
 * PM/Admin upload a transcript file (PDF/TXT/MD/DOCX) instead of pasting
 * text — the analysis fires on selection, no second click. Same guarantee
 * applies: the uploaded file is never persisted anywhere, only its
 * extracted text travels to the AI, and only until confirm/discard.
 */
export function TranscriptUpdateSection({
  files,
}: TranscriptUpdateSectionProps) {
  // `manualFileId` only holds a value once the PM explicitly picks a file
  // from the dropdown THIS session. Until then, `selectedFileId` below
  // falls back to `files[0]?.id` — a plain derived value, recomputed every
  // render, not a useState default. useState's initial argument only runs
  // on the component's FIRST mount; since this component still executes
  // its hooks even on a render where `files` is empty (the early return
  // below happens after them), initializing directly from `files[0]?.id`
  // would get permanently stuck at "" the first time a client had zero
  // files, silently no-oping every "Analisar transcrição" click even
  // after the PM uploads their first file in the same session (real bug,
  // found live during 260805-iea's verification — same class of stale-
  // default bug as chat-panel.tsx's activeClientId, fixed the same way).
  const [manualFileId, setManualFileId] = useState<string | null>(null);
  const [transcript, setTranscript] = useState("");
  const [analysis, setAnalysis] = useState<Analysis | null>(null);
  const [draftContent, setDraftContent] = useState("");
  const [isAnalyzing, startAnalyzeTransition] = useTransition();
  const [analyzeError, setAnalyzeError] = useState<string | null>(null);
  const [isApplying, startApplyTransition] = useTransition();
  const [applyError, setApplyError] = useState<string | null>(null);
  const transcriptFileInputRef = useRef<HTMLInputElement>(null);
  const [analyzingSource, setAnalyzingSource] = useState<
    "text" | "file" | null
  >(null);

  if (files.length === 0) return null;

  const selectedFileId =
    manualFileId && files.some((f) => f.id === manualFileId)
      ? manualFileId
      : (files[0]?.id ?? "");

  function handleAnalyze() {
    setAnalyzeError(null);
    const trimmedTranscript = transcript.trim();
    if (!selectedFileId || trimmedTranscript.length === 0) return;

    setAnalyzingSource("text");
    startAnalyzeTransition(async () => {
      const result = await analyzeTranscriptAgainstFile(
        selectedFileId,
        trimmedTranscript
      );
      if ("error" in result) {
        setAnalyzeError(result.error);
        setAnalyzingSource(null);
        return;
      }
      setAnalysis({
        summary: result.summary,
        changes: result.changes,
        updatedContent: result.updatedContent,
      });
      setDraftContent(result.updatedContent);
      setAnalyzingSource(null);
    });
  }

  function handleTranscriptFileSelected(
    event: React.ChangeEvent<HTMLInputElement>
  ) {
    const picked = event.target.files?.[0] ?? null;
    event.target.value = "";
    setAnalyzeError(null);
    if (!picked || !selectedFileId) return;

    setAnalyzingSource("file");
    startAnalyzeTransition(async () => {
      const fd = new FormData();
      fd.append("file", picked);
      const result = await analyzeTranscriptFileAgainstFile(
        selectedFileId,
        fd
      );
      if ("error" in result) {
        setAnalyzeError(result.error);
        setAnalyzingSource(null);
        return;
      }
      setAnalysis({
        summary: result.summary,
        changes: result.changes,
        updatedContent: result.updatedContent,
      });
      setDraftContent(result.updatedContent);
      setAnalyzingSource(null);
    });
  }

  function handleConfirm() {
    setApplyError(null);
    startApplyTransition(async () => {
      const result = await updateClientFileContent(
        selectedFileId,
        draftContent
      );
      if ("error" in result) {
        setApplyError(result.error);
        return;
      }
      toast.success(FILE_UPDATED_TOAST);
      // Discards the transcript and the analysis — nothing left in memory
      // once the update is confirmed.
      handleDiscard();
    });
  }

  function handleDiscard() {
    setTranscript("");
    setAnalysis(null);
    setDraftContent("");
    setAnalyzeError(null);
    setApplyError(null);
    setAnalyzingSource(null);
    if (transcriptFileInputRef.current) transcriptFileInputRef.current.value = "";
  }

  return (
    <DataCard
      title="Atualizar arquivo via transcrição de reunião"
      description="Cole a transcrição de uma reunião — a IA resume o que foi discutido, compara com o arquivo base e propõe uma versão atualizada. A transcrição em si nunca é salva. Também é possível enviar um arquivo com a transcrição (PDF/TXT/MD/DOCX)."
    >
      <div className="flex flex-col gap-4">
        <div className="flex flex-col gap-2">
          <SectionTitle>Arquivo base a atualizar</SectionTitle>
          <Select
            value={selectedFileId}
            onValueChange={(next) => {
              setManualFileId(next);
              handleDiscard();
            }}
            disabled={isAnalyzing || isApplying}
          >
            <SelectTrigger className="w-full max-w-sm">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {files.map((file) => (
                <SelectItem key={file.id} value={file.id}>
                  {file.filename}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {!analysis ? (
          <div className="flex flex-col gap-2">
            <Textarea
              value={transcript}
              onChange={(event) => setTranscript(event.target.value)}
              rows={8}
              placeholder="Cole aqui a transcrição da reunião..."
              disabled={isAnalyzing}
            />
            {analyzeError ? <ErrorBox>{analyzeError}</ErrorBox> : null}
            <Button
              type="button"
              onClick={handleAnalyze}
              disabled={isAnalyzing || transcript.trim().length === 0}
              className="w-fit"
            >
              {isAnalyzing && analyzingSource === "text"
                ? "Analisando..."
                : "Analisar transcrição"}
            </Button>
            <span className="text-xs text-muted-foreground">ou</span>
            <input
              ref={transcriptFileInputRef}
              type="file"
              accept=".pdf,.txt,.md,.docx"
              className="hidden"
              disabled={isAnalyzing}
              onChange={handleTranscriptFileSelected}
            />
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="w-fit"
              disabled={isAnalyzing}
              onClick={() => transcriptFileInputRef.current?.click()}
            >
              {isAnalyzing && analyzingSource === "file"
                ? "Analisando arquivo..."
                : "Enviar arquivo de transcrição"}
            </Button>
            <span className="text-xs text-muted-foreground">
              PDF, TXT, MD ou DOCX, até 5MB. O arquivo não é salvo — só o
              texto extraído dele é usado na análise.
            </span>
          </div>
        ) : (
          <div className="flex flex-col gap-4">
            <div className="flex flex-col gap-2">
              <SectionTitle>Resumo da reunião</SectionTitle>
              <p className="text-body">{analysis.summary}</p>
            </div>

            {analysis.changes.length > 0 ? (
              <div className="flex flex-col gap-2">
                <SectionTitle>Novidades e contradições</SectionTitle>
                <ul className="flex flex-col gap-1">
                  {analysis.changes.map((change, i) => (
                    <li key={i} className="text-body">
                      • {change}
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}

            <div className="flex flex-col gap-2">
              <SectionTitle>Arquivo base atualizado (revise antes de confirmar)</SectionTitle>
              <Textarea
                value={draftContent}
                onChange={(event) => setDraftContent(event.target.value)}
                rows={12}
                disabled={isApplying}
              />
            </div>

            {applyError ? <ErrorBox>{applyError}</ErrorBox> : null}

            <div className="flex items-center gap-2">
              <Button
                type="button"
                onClick={handleConfirm}
                disabled={isApplying || draftContent.trim().length === 0}
              >
                {isApplying ? "Salvando..." : "Confirmar atualização"}
              </Button>
              <Button
                type="button"
                variant="outline"
                onClick={handleDiscard}
                disabled={isApplying}
              >
                Descartar
              </Button>
            </div>
          </div>
        )}
      </div>
    </DataCard>
  );
}
