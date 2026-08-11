"use server";

import { createClient } from "@/lib/supabase/server";
import {
  extractDocumentText,
  UnreadableFileError,
  type ClientFileType,
} from "@/lib/extract/extract-text";

// Server Actions run on the Node runtime by default (no `export const
// runtime` override is valid in a "use server" file — that directive only
// applies to Route Handlers). extractDocumentText depends on Node APIs
// (unpdf/mammoth), never Edge, which this default already satisfies.

/**
 * Quick task 260811-imw (item 9, o ultimo, do plano de acao de 2026-08-05):
 * base de conhecimento comum a TODOS os clientes — deliberadamente
 * SEPARADA de lib/actions/client-files.ts. Mesmos MAX_FILE_BYTES/
 * ALLOWED_EXTENSIONS definidos LOCALMENTE aqui (mesmos valores de
 * client-files.ts, nao importados de lib/client-files/limit.ts — esse
 * modulo so exporta a constante/mensagem de teto por cliente, nao o teto
 * de bytes nem o conjunto de extensoes). Sem equivalente a FILE_LIMIT: essa
 * tabela e global, sem orcamento de prompt por cliente no escopo deste
 * plano.
 */
const MAX_FILE_BYTES = 5 * 1024 * 1024; // 5MB
const ALLOWED_EXTENSIONS = new Set(["pdf", "txt", "md", "docx"]);

const FILE_SELECT_ERROR = "Selecione um arquivo para enviar.";
const FILE_FORMAT_ERROR =
  "Formato não suportado. Envie um arquivo PDF, TXT, MD ou DOCX.";
const FILE_TOO_LARGE_ERROR = "Arquivo muito grande. O limite é 5MB.";
const FILE_UNREADABLE_ERROR = "Não foi possível ler o conteúdo deste arquivo.";
const NOT_AUTHORIZED_ERROR =
  "Sem permissão para gerenciar a base de conhecimento comum.";

export type SharedKnowledgeFileRow = {
  id: string;
  filename: string;
  file_type: string;
  created_at: string;
};

export type UploadSharedKnowledgeFileResult =
  | { success: true }
  | { error: string };
export type DeleteSharedKnowledgeFileResult =
  | { success: true }
  | { error: string };

/**
 * Every export in this file starts with the same app-layer admin-only
 * check as `generateChecklistFromFiles`/`createTemplate`
 * (lib/actions/checklist-templates.ts) — deliberate defense in depth even
 * though the underlying `shared_knowledge_files_select_all_authenticated`
 * RLS policy is open to any authenticated role: the only consumer today is
 * the Admin-only `/admin/shared-knowledge` screen (T-imw-05).
 */
async function requireAdmin(): Promise<
  | { ok: true; supabase: Awaited<ReturnType<typeof createClient>> }
  | { ok: false; error: string }
> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Não autenticado." };

  const { data: profile } = await supabase
    .from("profiles")
    .select("role, status")
    .eq("id", user.id)
    .single();

  const isAuthorized =
    profile?.status === "approved" && profile.role === "admin";
  if (!isAuthorized) {
    return { ok: false, error: NOT_AUTHORIZED_ERROR };
  }

  return { ok: true, supabase };
}

function extensionOf(filename: string): string {
  const idx = filename.lastIndexOf(".");
  return idx === -1 ? "" : filename.slice(idx + 1).toLowerCase();
}

/**
 * Read-only listing of every shared-knowledge file, ordered oldest-first —
 * admin-only at the app layer (see `requireAdmin`'s note above), returns
 * `[]` for any unauthorized caller rather than an error, matching a
 * read-only listing's usual shape.
 */
export async function listSharedKnowledgeFiles(): Promise<
  SharedKnowledgeFileRow[]
> {
  const auth = await requireAdmin();
  if (!auth.ok) return [];

  const { data } = await auth.supabase
    .from("shared_knowledge_files")
    .select("id, filename, file_type, created_at")
    .order("created_at", { ascending: true });

  return data ?? [];
}

/**
 * Uploads a shared-knowledge file (PDF/TXT/MD/DOCX): admin-only, validates
 * extension + size BEFORE any read/extraction, extracts plain text (any
 * extraction failure blocks the insert, never persisting empty/garbage
 * content — mirrors `uploadClientFile`'s T-hnm-03 posture), then inserts
 * via the RLS-scoped `supabase` client returned by `requireAdmin()`.
 */
export async function uploadSharedKnowledgeFile(
  formData: FormData
): Promise<UploadSharedKnowledgeFileResult> {
  const auth = await requireAdmin();
  if (!auth.ok) return { error: auth.error };

  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) {
    return { error: FILE_SELECT_ERROR };
  }

  const extension = extensionOf(file.name);
  if (!ALLOWED_EXTENSIONS.has(extension)) {
    return { error: FILE_FORMAT_ERROR };
  }

  if (file.size > MAX_FILE_BYTES) {
    return { error: FILE_TOO_LARGE_ERROR };
  }

  const fileType = extension as ClientFileType;
  const buffer = Buffer.from(await file.arrayBuffer());

  let content: string;
  try {
    content = await extractDocumentText(buffer, fileType);
  } catch (err) {
    if (err instanceof UnreadableFileError) {
      return { error: FILE_UNREADABLE_ERROR };
    }
    // Qualquer outro erro de parsing (PDF corrompido, DOCX invalido, etc.)
    // tambem bloqueia o insert com a mesma mensagem amigavel — nunca
    // persiste um shared_knowledge_files com content vazio/lixo.
    return { error: FILE_UNREADABLE_ERROR };
  }

  const { error: insertError } = await auth.supabase
    .from("shared_knowledge_files")
    .insert({
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
 * Deletes a shared-knowledge file by id — admin-only at the app layer;
 * `shared_knowledge_files_admin_write` is the RLS-layer defense in depth
 * (T-imw-01).
 */
export async function deleteSharedKnowledgeFile(
  fileId: string
): Promise<DeleteSharedKnowledgeFileResult> {
  const auth = await requireAdmin();
  if (!auth.ok) return { error: auth.error };

  const { error } = await auth.supabase
    .from("shared_knowledge_files")
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
