/**
 * Pure, I/O-free prompt assembly for one-shot structured-extraction calls
 * (P0 pivot 2026-08-04: AI checklist generation, briefing auto-fill, card
 * validation). Distinct from lib/chat/assemble-prompt.ts, which assembles a
 * multi-turn conversational SYSTEM prompt — this module assembles a single
 * task-specific USER message for a forced tool-use call that always
 * returns structured JSON, never free text.
 *
 * Mirrors assemble-prompt.ts's client-isolation shape (only the given
 * client's files ever appear in the output) and its files-block-only-when-
 * non-empty rule, so the same review conventions apply to every AI feature
 * in this codebase.
 *
 * Quick task 260810-ivr: changed the client-identification key from
 * `clientName` alone to `clientTag` (public.clients.tag, migration 0025),
 * mirroring the same change in lib/chat/assemble-prompt.ts — closes a real
 * production leakage bug where a client's own uploaded file mentioned an
 * ambiguous/common name and `clientName` alone was not enough to keep the
 * model anchored on the right client.
 */

export type ExtractionFile = { filename: string; content: string };

export function buildExtractionPrompt(
  clientName: string,
  clientTag: string,
  files: ExtractionFile[],
  instruction: string
): string {
  const filesBlock = files.length
    ? files
        .map((f) => `Arquivo: ${f.filename}\n${f.content}`)
        .join("\n\n")
    : "(nenhum arquivo de referência disponível para este cliente)";

  return (
    `Cliente (código de referência: ${clientTag}): ${clientName}\n\n` +
    `O cliente que você atende é identificado exclusivamente pelo código de ` +
    `referência indicado acima (não pelo nome). Se os arquivos de referência ` +
    `mencionarem outras empresas ou pessoas por nome, NÃO as confunda com o ` +
    `cliente — considere apenas o conteúdo relativo ao cliente identificado ` +
    `por esse código.\n\n` +
    `Arquivos de referência do cliente:\n${filesBlock}\n\n` +
    `---\n\n${instruction}`
  );
}
