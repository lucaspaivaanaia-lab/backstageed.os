/**
 * Pure, I/O-free system-prompt assembly for the chat Route Handler
 * (app/api/chat/route.ts, 02-04). Intentionally free of any Supabase/
 * Anthropic/Tropicalia client import so this module can be imported by its
 * sibling `assemble-prompt.test.ts` via a relative path and exercised with
 * Node's built-in test runner — no live API keys, no network call
 * (02-RESEARCH.md Pattern 2, D-07).
 *
 * D-07: the client's structured briefing is ALWAYS included, in both
 * normal mode (alongside Tropicalia retrieval) and degraded mode (as the
 * only client-specific context) — one code path, not two. Retrieval
 * context is appended only when `retrievedChunks` is non-empty; an empty
 * array is a no-op, never a separate branch.
 *
 * T-2-01 (mitigate): this function takes a single client's briefing +
 * chunks by value and renders only that client's fields — a second
 * client's data can never appear in the output, pinned by
 * `assemble-prompt.test.ts`'s leakage-guard assertions.
 *
 * T-2-02 (accept, prompt injection): the system instructions are placed
 * AFTER the briefing/retrieval content, a low-cost habit that makes
 * injected text in retrieved chunks less able to override them.
 */

type Briefing = {
  name: string;
  objective: string | null;
  tone_of_voice: string | null;
  target_audience: string | null;
  content_pillars: string[];
};

export function assembleSystemPrompt(
  client: Briefing,
  retrievedChunks: { document: string }[]
): string {
  const briefingBlock = [
    `Cliente: ${client.name}`,
    client.objective ? `Objetivo: ${client.objective}` : null,
    client.tone_of_voice ? `Tom de voz: ${client.tone_of_voice}` : null,
    client.target_audience ? `Público-alvo: ${client.target_audience}` : null,
    client.content_pillars.length
      ? `Pilares de conteúdo: ${client.content_pillars.join(", ")}`
      : null,
  ]
    .filter(Boolean)
    .join("\n");

  // D-07: briefing is ALWAYS present; retrieval context is appended only
  // when non-empty — no branching code path, just an empty-array no-op.
  const retrievalBlock = retrievedChunks.length
    ? `\n\nContexto adicional recuperado:\n${retrievedChunks
        .map((c) => `- ${c.document}`)
        .join("\n")}`
    : "";

  return (
    `Você é um assistente de produção de conteúdo para redes sociais, ` +
    `trabalhando exclusivamente no contexto do cliente abaixo. Nunca mencione ` +
    `ou compare com outros clientes. Responda em português do Brasil, de forma ` +
    `clara e alinhada ao tom de voz do cliente. Não inclua marcadores de citação ` +
    `ou referências a fontes na resposta.\n\n${briefingBlock}${retrievalBlock}`
  );
}
