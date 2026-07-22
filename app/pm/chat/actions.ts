"use server";

import { createClient } from "@/lib/supabase/server";
import { saveKnowledgeSchema } from "@/lib/validation/chat";
import { buildKnowledgeMarkdown } from "@/lib/chat/build-knowledge-markdown";
import { FILE_LIMIT_MESSAGE, atFileLimit } from "@/lib/client-files/limit";

const GENERIC_ERROR = "Não foi possível salvar o conhecimento. Tente novamente.";
const INVALID_ERROR = "Dados inválidos.";
const CLIENT_NOT_FOUND_ERROR = "Cliente não encontrado ou sem permissão.";
const NO_MESSAGES_ERROR = "Nenhuma mensagem selecionada foi encontrada.";

export type SaveKnowledgeResult = { success: true } | { error: string };

/**
 * Manual curation Server Action (CTX-03/CTX-04, D-04/D-05). Only message
 * ids cross the browser->server boundary — content and client ownership are
 * ALWAYS re-resolved here via an RLS-scoped read before anything is
 * packaged or inserted (T-2-01: never trust message content passed from
 * the client).
 *
 * Quick task 260722-hnm: the curated markdown is now inserted directly as
 * a new `client_files` row (client_id, filename, file_type: "markdown",
 * content) via the RLS-scoped client — no external upload. Applies the
 * SAME shared FILE_LIMIT as the direct upload flow
 * (lib/actions/client-files.ts), since both write into `client_files`.
 * Exactly one new file per call — every save produces a brand-new,
 * self-contained document (no append/update).
 */
export async function saveKnowledge(
  clientId: string,
  messageIds: string[]
): Promise<SaveKnowledgeResult> {
  const parsed = saveKnowledgeSchema.safeParse({ clientId, messageIds });
  if (!parsed.success) {
    return { error: INVALID_ERROR };
  }

  const supabase = await createClient();

  // Re-resolve the client via RLS — never trust anything about ownership
  // from the browser (T-2-01).
  const { data: client } = await supabase
    .from("clients")
    .select("id, name")
    .eq("id", parsed.data.clientId)
    .single();

  if (!client) {
    return { error: CLIENT_NOT_FOUND_ERROR };
  }

  // Re-fetch the checked rows via RLS — content is ALWAYS re-read
  // server-side, never accepted from the caller (Anti-Pattern).
  const { data: messages } = await supabase
    .from("messages")
    .select("id, role, content, created_at")
    .eq("client_id", parsed.data.clientId)
    .in("id", parsed.data.messageIds)
    .order("created_at", { ascending: true });

  if (!messages || messages.length === 0) {
    return { error: NO_MESSAGES_ERROR };
  }

  const { count } = await supabase
    .from("client_files")
    .select("id", { count: "exact", head: true })
    .eq("client_id", parsed.data.clientId);

  if (atFileLimit(count ?? 0)) {
    return { error: FILE_LIMIT_MESSAGE };
  }

  try {
    const markdown = buildKnowledgeMarkdown(
      client.name,
      messages as {
        id: string;
        role: "user" | "assistant";
        content: string;
        created_at: string;
      }[]
    );
    const filename = `conversa-${new Date()
      .toISOString()
      .replace(/[:.]/g, "-")}.md`;

    const { error: insertError } = await supabase.from("client_files").insert({
      client_id: parsed.data.clientId,
      filename,
      file_type: "markdown",
      content: markdown,
    });

    if (insertError) {
      return { error: GENERIC_ERROR };
    }
  } catch (err) {
    console.error("saveKnowledge: insert failed", err);
    return { error: GENERIC_ERROR };
  }

  return { success: true };
}

export type ChatMessageRow = {
  id: string;
  role: "user" | "assistant";
  content: string;
  created_at: string;
};

/**
 * RLS-scoped read of a client's persisted message history — used by the
 * panel to refetch history (including row ids, needed for curation
 * checkboxes) on client switch. Never throws across the Server Action
 * boundary; returns an empty array on any read failure.
 */
export async function listMessagesForClient(
  clientId: string
): Promise<ChatMessageRow[]> {
  const supabase = await createClient();

  const { data } = await supabase
    .from("messages")
    .select("id, role, content, created_at")
    .eq("client_id", clientId)
    .order("created_at", { ascending: true });

  return (data ?? []) as ChatMessageRow[];
}
