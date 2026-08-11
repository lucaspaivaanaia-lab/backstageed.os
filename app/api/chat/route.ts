import { createClient } from "@/lib/supabase/server";
import { getAnthropicClient, AI_MODEL } from "@/lib/anthropic/client";
import { assembleSystemPrompt } from "@/lib/chat/assemble-prompt";
import { sendMessageSchema } from "@/lib/validation/chat";

// @anthropic-ai/sdk needs the Node runtime, not Edge (02-RESEARCH.md Pattern 2).
export const runtime = "nodejs";

/**
 * Streaming chat send flow (CTX-01, CTX-02, CTX-05). resolve -> fetch
 * client_files -> assemble -> stream -> persist, all in this single Route
 * Handler — the ONLY chat-send flow in this phase (02-RESEARCH.md
 * Pattern 2).
 *
 * T-hnm-01 (mitigate): `clientId` is only ever used as the RLS-scoped
 * `.eq("id", clientId).single()` filter below. The request body NEVER
 * carries file content directly — client_files are always re-fetched
 * server-side via the SAME RLS-scoped client, never trusted from the
 * caller. An empty/errored lookup 403s; it never falls back to a
 * shared/default client's files.
 */
export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return new Response("Dados inválidos.", { status: 400 });
  }
  const parsed = sendMessageSchema.safeParse(body);
  if (!parsed.success) {
    return new Response("Dados inválidos.", { status: 400 });
  }
  const { clientId, content } = parsed.data;

  // RLS-scoped — NEVER createAdminClient() here (T-2-01).
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return new Response("Não autenticado.", { status: 401 });
  }

  // This single query IS the authorization + project-id resolution
  // (02-RESEARCH.md Pattern 1): if the caller isn't assigned to this
  // client, RLS makes the row invisible and `client` comes back null.
  const { data: client, error: clientError } = await supabase
    .from("clients")
    .select(
      "id, name, tag, objective, tone_of_voice, target_audience, content_pillars"
    )
    .eq("id", clientId)
    .single();

  if (clientError || !client) {
    return new Response("Cliente não encontrado ou sem permissão.", {
      status: 403,
    });
  }

  // D-06/D-07: degraded mode is the SAME code path as normal mode — just an
  // empty files list, never a separate branch, never a fallback to a
  // shared/default client's files. client_files is fetched via the SAME
  // RLS-scoped `supabase` client used for `client` above — never
  // `createAdminClient()` — so isolation is enforced by
  // `client_files_select_scoped` (T-hnm-01/T-hnm-04), not by this route's
  // own filter.
  const { data: clientFiles } = await supabase
    .from("client_files")
    .select("filename, content")
    .eq("client_id", clientId);

  const files = (clientFiles ?? []).map((f) => ({
    filename: f.filename,
    content: f.content,
  }));

  const { data: history } = await supabase
    .from("messages")
    .select("role, content")
    .eq("client_id", clientId)
    .order("created_at", { ascending: true });

  // Persist the user's turn BEFORE generating, so it survives a mid-stream
  // drop or a Claude call failure. Fail the request if this insert fails —
  // proceeding would generate a reply with no matching question in history.
  const { error: userInsertError } = await supabase
    .from("messages")
    .insert({ client_id: clientId, role: "user", content });
  if (userInsertError) {
    return new Response("Não foi possível salvar sua mensagem.", {
      status: 500,
    });
  }

  const system = assembleSystemPrompt(client, files);
  const anthropic = getAnthropicClient();
  const stream = anthropic.messages.stream({
    model: AI_MODEL,
    max_tokens: 1024,
    system,
    messages: [
      ...(history ?? []).map((turn) => ({
        role: turn.role as "user" | "assistant",
        content: turn.content,
      })),
      { role: "user" as const, content },
    ],
  });

  const encoder = new TextEncoder();
  const readable = new ReadableStream({
    async start(controller) {
      // CTX-05 has no degraded-mode equivalent — an Anthropic streaming
      // failure is never swallowed; it always propagates to the client.
      try {
        for await (const event of stream) {
          if (
            event.type === "content_block_delta" &&
            event.delta.type === "text_delta"
          ) {
            controller.enqueue(encoder.encode(event.delta.text));
          }
        }
        const finalMessage = await stream.finalMessage();
        const textBlock = finalMessage.content.find((b) => b.type === "text");
        const { error: assistantInsertError } = await supabase
          .from("messages")
          .insert({
            client_id: clientId,
            role: "assistant",
            content: textBlock?.type === "text" ? textBlock.text : "",
          });
        if (assistantInsertError) {
          console.error("chat: assistant turn insert failed", assistantInsertError);
        }
        controller.close();
      } catch (err) {
        console.error("chat: stream failed", err);
        controller.error(err);
      }
    },
  });

  return new Response(readable, {
    headers: { "Content-Type": "text/plain; charset=utf-8" },
  });
}
