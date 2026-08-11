/**
 * Pure helpers for turning an ad-hoc pasted planning document into the
 * synthetic "file" shape `runStructuredExtraction`/`buildExtractionPrompt`
 * already expect (lib/ai/extraction-prompt.ts's `ExtractionFile`). Mirrors
 * the EXACT precedent already in production -- `validateCardAgainstChecklist`
 * (app/pm/board/actions.ts) packages a card's own title+description as a
 * synthetic `cardContentFile` before calling `runStructuredExtraction`; this
 * module does the same for a PM-pasted planning document, item 2 of the
 * 2026-08-05 action plan's P3 (260811-nnw-CONTEXT.md).
 *
 * Intentionally free of any React/Supabase/Next import or I/O so this module
 * can be imported by its sibling `package-proposal.test.ts` via a relative
 * path and exercised with Node's built-in test runner -- no live DB, no
 * Docker (mirrors lib/cards/chat-import.ts's own convention).
 */

import type { ExtractionFile } from "@/lib/ai/extraction-prompt";

// Pitfall 2 (260811-nnw-RESEARCH.md): no other paste-text flow in this
// codebase caps INPUT length -- this is the first one to send arbitrarily
// long ad-hoc text to runStructuredExtraction, so an explicit cap is new
// here. [ASSUMED] exact number -- no repo precedent; chosen generously
// (multiple weeks of planned content) purely to bound AI cost/latency, not
// because a longer paste would be unsafe. Mirrored by
// proposePackagePiecesSchema's `.max()` in lib/validation/cards.ts, which
// imports this constant -- single source of truth here, never duplicated.
export const PLANNING_DOC_MAX_LENGTH = 20000;

export const PLANNING_DOC_FILENAME =
  "Documento de planejamento colado pelo PM";

/**
 * Wraps a pasted planning document as a one-item synthetic ExtractionFile,
 * exactly the shape `validateCardAgainstChecklist`'s `cardContentFile`
 * already uses for a card's own text. Trims only -- the character cap
 * itself lives in the zod schema (proposePackagePiecesSchema), not here, so
 * a caller who bypasses the schema still gets an untruncated file rather
 * than a silently-shortened one that no longer matches what the PM pasted.
 */
export function planningDocToExtractionFile(text: string): ExtractionFile {
  return {
    filename: PLANNING_DOC_FILENAME,
    content: text.trim(),
  };
}
