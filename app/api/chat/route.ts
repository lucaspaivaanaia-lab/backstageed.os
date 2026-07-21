import { createClient } from "@/lib/supabase/server";
import { getAnthropicClient } from "@/lib/anthropic/client";
import { searchTropicaliaProject } from "@/lib/tropicalia/client";
import { assembleSystemPrompt } from "@/lib/chat/assemble-prompt";
import { sendMessageSchema } from "@/lib/validation/chat";

// @anthropic-ai/sdk needs the Node runtime, not Edge (02-RESEARCH.md Pattern 2).
export const runtime = "nodejs";

/**
 * Streaming chat send flow (CTX-01, CTX-02, CTX-05). resolve -> retrieve ->
 * assemble -> stream -> persist, all in this single Route Handler — the
 * ONLY chat-send flow in this phase (02-RESEARCH.md Pattern 2).
 *
 * T-2-01 (mitigate): `tropicalia_project_id` is derived ONLY from an
 * RLS-scoped `.eq("id", clientId).single()` read below. The request body
 * NEVER carries a project id — accepting one from client input would make
 * the isolation boundary tamperable (02-RESEARCH.md Anti-Patterns). An
 * empty/errored lookup 403s; it never falls back to a shared/default
 * project.
 */
export async function POST(request: Request) {
  const body = await request.json();
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
      "id, name, tropicalia_project_id, objective, tone_of_voice, target_audience, content_pillars"
    )
    .eq("id", clientId)
    .single();

  if (clientError || !client) {
    return new Response("Cliente não encontrado ou sem permissão.", {
      status: 403,
    });
  }

  // D-06/D-07: degraded mode is the SAME code path as normal mode — just an
  // empty chunk list, never a separate branch, never a fallback to a
  // shared/default project (Anti-Pattern). A transient Tropicalia failure
  // degrades this turn only; it never crashes the chat (Pitfall #6).
  let chunks: { document: string }[] = [];
  if (client.tropicalia_project_id && process.env.TROPICALIA_API_KEY) {
    try {
      const retrieved = await searchTropicaliaProject(
        client.tropicalia_project_id,
        content
      );
      chunks = retrieved.map((chunk) => ({
        document: typeof chunk.document === "string" ? chunk.document : "",
      }));
    } catch {
      chunks = [];
    }
  }

  const { data: history } = await supabase
    .from("messages")
    .select("role, content")
    .eq("client_id", clientId)
    .order("created_at", { ascending: true });

  // Persist the user's turn BEFORE generating, so it survives a mid-stream
  // drop or a Claude call failure.
  await supabase
    .from("messages")
    .insert({ client_id: clientId, role: "user", content });

  const system = assembleSystemPrompt(client, chunks);
  const anthropic = getAnthropicClient();
  const stream = anthropic.messages.stream({
    model: process.env.ANTHROPIC_CHAT_MODEL ?? "claude-sonnet-4-5",
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
      // CTX-05 has no degraded-mode equivalent — an Anthropic failure is NOT
      // swallowed the way a Tropicalia failure is above; it propagates.
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
      await supabase.from("messages").insert({
        client_id: clientId,
        role: "assistant",
        content: textBlock?.type === "text" ? textBlock.text : "",
      });
      controller.close();
    },
  });

  return new Response(readable, {
    headers: { "Content-Type": "text/plain; charset=utf-8" },
  });
}
