/**
 * Pure "first line becomes the title" rule for content pasted or generated
 * from the Chat (quick task 260805-fuu). Intentionally free of any
 * React/Supabase/Next import or I/O so this module can be imported by its
 * sibling `chat-import.test.ts` via a relative path and exercised with
 * Node's built-in test runner -- no live DB, no Docker (mirrors
 * lib/cards/stages.ts's convention).
 *
 * This is the SINGLE definition of the rule, consumed by TWO call sites:
 * the board's "Colar do chat" tab (app/pm/board/board-panel.tsx) and the
 * chat's "Enviar pro Kanban" button (app/pm/chat/chat-panel.tsx). Both must
 * import `cardFieldsFromChatText` from here rather than reimplementing it.
 *
 * The title/description limits below mirror `createCardSchema`'s
 * `.max(200)`/`.max(5000)` (lib/validation/cards.ts) exactly. The `slice`s
 * here exist so the input never overflows those `.max()`s and turns into a
 * generic validation error in the PM's face -- the schema is still the real
 * server-side boundary, this is UX convenience only.
 */

export const IMPORTED_TITLE_FALLBACK = "Conteúdo importado do chat";

export const CHAT_IMPORT_TITLE_MAX = 200;
export const CHAT_IMPORT_DESCRIPTION_MAX = 5000;

export type ChatImportFields = {
  title: string;
  description: string;
};

/**
 * Reproduces the ORIGINAL `ImportFromChatDialog` logic verbatim: trim the
 * whole text first, take its first line (trimmed again), fall back to
 * `IMPORTED_TITLE_FALLBACK` when that first line is empty, then slice both
 * fields to their respective limits.
 */
export function cardFieldsFromChatText(text: string): ChatImportFields {
  const trimmed = text.trim();
  const firstLine = trimmed.split("\n")[0]?.trim() ?? "";
  const title =
    firstLine.length > 0
      ? firstLine.slice(0, CHAT_IMPORT_TITLE_MAX)
      : IMPORTED_TITLE_FALLBACK;
  const description = trimmed.slice(0, CHAT_IMPORT_DESCRIPTION_MAX);
  return { title, description };
}
