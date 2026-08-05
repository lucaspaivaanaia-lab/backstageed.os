"use server";

import { createClient } from "@/lib/supabase/server";
import {
  extractDocumentText,
  UnreadableFileError,
  type ClientFileType,
} from "@/lib/extract/extract-text";
import { FILE_LIMIT_MESSAGE, atFileLimit } from "@/lib/client-files/limit";
import { runStructuredExtraction } from "@/lib/ai/structured-extraction";

// Server Actions run on the Node runtime by default (no `export const
// runtime` override is valid in a "use server" file — that directive only
// applies to Route Handlers). extractDocumentText depends on Node APIs
// (unpdf/mammoth), never Edge, which this default already satisfies.

const MAX_FILE_BYTES = 5 * 1024 * 1024; // 5MB
const ALLOWED_EXTENSIONS = new Set(["pdf", "txt", "md", "docx"]);

export type ClientFileRow = {
  id: string;
  filename: string;
  file_type: string;
  created_at: string;
};

export type UploadClientFileResult = { success: true } | { error: string };
export type DeleteClientFileResult = { success: true } | { error: string };

/**
 * Read-only RLS-scoped listing of a client's files (id/filename/file_type/
 * created_at), ordered oldest-first. `clientId` is only ever used as the
 * filter — the RLS `client_files_select_scoped` policy is the actual
 * authorization boundary (T-hnm-01/T-hnm-04).
 */
export async function listClientFiles(
  clientId: string
): Promise<ClientFileRow[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("client_files")
    .select("id, filename, file_type, created_at")
    .eq("client_id", clientId)
    .order("created_at", { ascending: true });

  return data ?? [];
}

function extensionOf(filename: string): string {
  const idx = filename.lastIndexOf(".");
  return idx === -1 ? "" : filename.slice(idx + 1).toLowerCase();
}

/**
 * Uploads a client file (PDF/TXT/MD/DOCX): validates extension + size
 * BEFORE any read/extraction, enforces the shared FILE_LIMIT, extracts
 * plain text (T-hnm-03 — any parse failure or below-MIN_CHARS result
 * blocks the insert, never persisting empty/garbage content), then inserts
 * into `client_files` via the RLS-scoped client.
 *
 * `clientId` is ONLY ever used as the row's `client_id` value + the RLS
 * `client_files_insert_scoped` policy validates the caller is actually
 * authorized for it (is_admin() OR pm_assigned_clients()) — the insert is
 * rejected at the database layer if not, regardless of what the caller
 * claims (T-hnm-01). Never trust `clientId` beyond this — no other field of
 * the row is ever derived from unauthenticated input beyond the file bytes
 * themselves.
 */
export async function uploadClientFile(
  clientId: string,
  formData: FormData
): Promise<UploadClientFileResult> {
  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) {
    return { error: "Selecione um arquivo para enviar." };
  }

  const extension = extensionOf(file.name);
  if (!ALLOWED_EXTENSIONS.has(extension)) {
    return {
      error: "Formato não suportado. Envie um arquivo PDF, TXT, MD ou DOCX.",
    };
  }

  if (file.size > MAX_FILE_BYTES) {
    return { error: "Arquivo muito grande. O limite é 5MB." };
  }

  const supabase = await createClient();

  const { count } = await supabase
    .from("client_files")
    .select("id", { count: "exact", head: true })
    .eq("client_id", clientId);

  if (atFileLimit(count ?? 0)) {
    return { error: FILE_LIMIT_MESSAGE };
  }

  const fileType = extension as ClientFileType;
  const buffer = Buffer.from(await file.arrayBuffer());

  let content: string;
  try {
    content = await extractDocumentText(buffer, fileType);
  } catch (err) {
    if (err instanceof UnreadableFileError) {
      return { error: "Não foi possível ler o conteúdo deste arquivo." };
    }
    // Qualquer outro erro de parsing (PDF corrompido, DOCX invalido, etc.)
    // tambem bloqueia o insert com a mesma mensagem amigavel — nunca
    // persiste um client_files com content vazio/lixo (T-hnm-03).
    return { error: "Não foi possível ler o conteúdo deste arquivo." };
  }

  const { error: insertError } = await supabase.from("client_files").insert({
    client_id: clientId,
    filename: file.name,
    file_type: fileType,
    content,
  });

  if (insertError) {
    return {
      error:
        "Não foi possível salvar o arquivo. Verifique sua conexão e tente novamente.",
    };
  }

  return { success: true };
}

/**
 * Deletes a client file by id via the RLS-scoped client —
 * `client_files_delete_scoped` is the actual authorization boundary
 * (T-hnm-01/T-hnm-04).
 */
export async function deleteClientFile(
  fileId: string
): Promise<DeleteClientFileResult> {
  const supabase = await createClient();
  const { error } = await supabase
    .from("client_files")
    .delete()
    .eq("id", fileId);

  if (error) {
    return {
      error:
        "Não foi possível remover o arquivo. Verifique sua conexão e tente novamente.",
    };
  }

  return { success: true };
}

const TRANSCRIPT_ANALYZE_ERROR =
  "Não foi possível analisar a transcrição agora. Tente novamente.";
const TRANSCRIPT_FILE_NOT_FOUND_ERROR = "Arquivo base não encontrado.";
const TRANSCRIPT_UPDATE_ERROR =
  "Não foi possível atualizar o arquivo. Tente novamente.";

export type AnalyzeTranscriptResult =
  | {
      success: true;
      summary: string;
      changes: string[];
      updatedContent: string;
    }
  | { error: string };

/**
 * P2 pivot 2026-08-04, item 1 (meeting-transcript base-file update flow):
 * "insert transcript → AI summarizes/confirms what was discussed → diffs
 * against the existing base file → identifies new/contradicting info →
 * updates the base file → discards the transcript." This function is the
 * FIRST half only — analysis. It never writes anything; the transcript
 * text passed in is never persisted anywhere (not to this table, not to
 * any other) — it lives only in the browser's component state until the
 * PM/Admin explicitly confirms (updateClientFileContent, below) or
 * navigates away, at which point it is gone for good, matching "descarta
 * a transcrição" literally.
 *
 * Reuses the SAME shared engine (lib/ai/structured-extraction.ts) every
 * other AI feature in this codebase uses.
 */
export async function analyzeTranscriptAgainstFile(
  fileId: string,
  transcript: string
): Promise<AnalyzeTranscriptResult> {
  const supabase = await createClient();

  // Re-read the file through RLS — never trust that fileId belongs to a
  // client the caller can reach; client_files_select_scoped is the real
  // boundary.
  const { data: file } = await supabase
    .from("client_files")
    .select("id, filename, content, client_id")
    .eq("id", fileId)
    .single();
  if (!file) return { error: TRANSCRIPT_FILE_NOT_FOUND_ERROR };

  const { data: client } = await supabase
    .from("clients")
    .select("id, name")
    .eq("id", file.client_id)
    .single();
  if (!client) return { error: TRANSCRIPT_FILE_NOT_FOUND_ERROR };

  const result = await runStructuredExtraction({
    clientName: client.name,
    files: [
      { filename: file.filename, content: file.content },
      {
        filename: "Transcrição da reunião (não será salva)",
        content: transcript,
      },
    ],
    instruction:
      `Você tem acima o arquivo base atual do cliente ("${file.filename}") ` +
      "e a transcrição de uma reunião recente. Sua tarefa em três partes:\n" +
      "1. Resuma em poucas frases o que foi discutido na reunião (para o " +
      "PM confirmar que você entendeu certo).\n" +
      "2. Compare a transcrição com o arquivo base e liste, em bullets " +
      "curtos, cada novidade ou contradição encontrada (algo que muda, " +
      "adiciona ou contradiz o que já estava no arquivo base).\n" +
      "3. Produza o TEXTO COMPLETO atualizado do arquivo base, incorporando " +
      "as novidades da reunião e resolvendo contradições a favor da " +
      "informação mais recente (a transcrição), preservando tudo do " +
      "arquivo original que continua válido. Não invente informação que " +
      "não esteja em nenhuma das duas fontes.",
    toolName: "report_transcript_update",
    toolDescription:
      "Registra o resumo da reunião, a lista de novidades/contradições, e o texto completo atualizado do arquivo base.",
    inputSchema: {
      type: "object",
      properties: {
        summary: {
          type: "string",
          description: "Resumo curto do que foi discutido na reunião.",
        },
        changes: {
          type: "array",
          items: { type: "string" },
          description: "Lista de novidades/contradições identificadas.",
        },
        updatedContent: {
          type: "string",
          description: "Texto completo atualizado do arquivo base.",
        },
      },
      required: ["summary", "changes", "updatedContent"],
    },
  });

  if (!result.ok) {
    return { error: result.error };
  }

  const raw = result.data as {
    summary?: unknown;
    changes?: unknown;
    updatedContent?: unknown;
  };
  if (
    typeof raw.summary !== "string" ||
    !Array.isArray(raw.changes) ||
    typeof raw.updatedContent !== "string" ||
    raw.updatedContent.trim().length === 0
  ) {
    console.error(
      "[analyzeTranscriptAgainstFile] AI returned an unexpected shape",
      raw
    );
    return { error: TRANSCRIPT_ANALYZE_ERROR };
  }

  return {
    success: true,
    summary: raw.summary,
    changes: raw.changes.filter((c): c is string => typeof c === "string"),
    updatedContent: raw.updatedContent,
  };
}

export type UpdateClientFileContentResult = { success: true } | { error: string };

/**
 * Second half of the transcript-update flow: persists the PM/Admin-
 * confirmed merged content over the EXISTING file row (same id, same
 * filename — this is an update, never a new client_files row, and the
 * transcript that produced `newContent` was never itself written
 * anywhere).
 */
export async function updateClientFileContent(
  fileId: string,
  newContent: string
): Promise<UpdateClientFileContentResult> {
  const trimmed = newContent.trim();
  if (trimmed.length === 0) {
    return { error: TRANSCRIPT_UPDATE_ERROR };
  }

  const supabase = await createClient();
  const { error } = await supabase
    .from("client_files")
    .update({ content: trimmed })
    .eq("id", fileId);

  if (error) {
    return { error: TRANSCRIPT_UPDATE_ERROR };
  }

  return { success: true };
}
