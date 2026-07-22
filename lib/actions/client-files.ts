"use server";

import { createClient } from "@/lib/supabase/server";
import {
  extractDocumentText,
  UnreadableFileError,
  type ClientFileType,
} from "@/lib/extract/extract-text";
import { FILE_LIMIT_MESSAGE, atFileLimit } from "@/lib/client-files/limit";

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
