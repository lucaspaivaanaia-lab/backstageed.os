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
 */

export type ExtractionFile = { filename: string; content: string };

export function buildExtractionPrompt(
  clientName: string,
  files: ExtractionFile[],
  instruction: string
): string {
  const filesBlock = files.length
    ? files
        .map((f) => `Arquivo: ${f.filename}\n${f.content}`)
        .join("\n\n")
    : "(nenhum arquivo de referência disponível para este cliente)";

  return (
    `Cliente: ${clientName}\n\n` +
    `Arquivos de referência do cliente:\n${filesBlock}\n\n` +
    `---\n\n${instruction}`
  );
}
