/**
 * Pure, I/O-free system-prompt assembly for the chat Route Handler
 * (app/api/chat/route.ts, 02-04). Intentionally free of any Supabase/
 * Anthropic client import so this module can be imported by its sibling
 * `assemble-prompt.test.ts` via a relative path and exercised with Node's
 * built-in test runner — no live API keys, no network call
 * (02-RESEARCH.md Pattern 2, D-07).
 *
 * Quick task 260722-hnm: retrieval no longer comes from an external RAG
 * service — `files` is the full content of the active client's
 * `public.client_files` rows (filename + extracted text), injected in full,
 * no embeddings/vetor.
 *
 * D-07: the client's structured briefing is ALWAYS included, in both
 * normal mode (alongside file content) and degraded mode (as the only
 * client-specific context) — one code path, not two. The files block is
 * appended only when `files` is non-empty; an empty array is a no-op,
 * never a separate branch.
 *
 * T-2-01 (mitigate): this function takes a single client's briefing + files
 * by value and renders only that client's fields — a second client's data
 * can never appear in the output, pinned by `assemble-prompt.test.ts`'s
 * leakage-guard assertions. `tag` (public.clients.tag, migration 0025) is
 * what makes identification unambiguous now — see the quick-task note below.
 *
 * T-2-02 (accept, prompt injection): the system instructions are placed
 * AFTER the briefing/files content, a low-cost habit that makes injected
 * text in a client's own uploaded files less able to override them.
 *
 * Quick task 260810-ivr: changed the client-identification key from `name`
 * alone to `tag` (public.clients.tag, migration 0025), closing a real
 * production leakage bug where a client's own uploaded file mentioned an
 * ambiguous/common name, and `name` — the prompt's only identification
 * signal at the time — was not enough to keep the model anchored on the
 * right client.
 */

type Briefing = {
  name: string;
  tag: string;
  objective: string | null;
  tone_of_voice: string | null;
  target_audience: string | null;
  content_pillars: string[];
};

export type ClientFileContext = { filename: string; content: string };

export function assembleSystemPrompt(
  client: Briefing,
  files: ClientFileContext[]
): string {
  const briefingBlock = [
    `Cliente (código de referência: ${client.tag}): ${client.name}`,
    client.objective ? `Objetivo: ${client.objective}` : null,
    client.tone_of_voice ? `Tom de voz: ${client.tone_of_voice}` : null,
    client.target_audience ? `Público-alvo: ${client.target_audience}` : null,
    client.content_pillars.length
      ? `Pilares de conteúdo: ${client.content_pillars.join(", ")}`
      : null,
  ]
    .filter(Boolean)
    .join("\n");

  // D-07: briefing is ALWAYS present; the files block is appended only
  // when non-empty — no branching code path, just an empty-array no-op.
  const filesBlock = files.length
    ? `\n\nArquivos de referência do cliente:\n${files
        .map((f) => `Arquivo: ${f.filename}\n${f.content}`)
        .join("\n\n")}`
    : "";

  return (
    `Você é um assistente de produção de conteúdo para redes sociais, ` +
    `trabalhando exclusivamente no contexto do cliente abaixo. Nunca mencione ` +
    `ou compare com outros clientes. Responda em português do Brasil, de forma ` +
    `clara e alinhada ao tom de voz do cliente. Não inclua marcadores de citação ` +
    `ou referências a fontes na resposta. O cliente que você atende é identificado ` +
    `exclusivamente pelo código de referência indicado abaixo (não pelo nome). Se os ` +
    `arquivos de referência mencionarem outras empresas ou pessoas por nome, NÃO as ` +
    `confunda com o cliente — considere apenas o conteúdo relativo ao cliente ` +
    `identificado por esse código.\n\n${briefingBlock}${filesBlock}`
  );
}
