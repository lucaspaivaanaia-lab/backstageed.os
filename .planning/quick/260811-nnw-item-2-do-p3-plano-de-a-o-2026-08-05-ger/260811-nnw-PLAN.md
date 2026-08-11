---
phase: quick/260811-nnw
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - lib/cards/package-proposal.ts
  - lib/cards/package-proposal.test.ts
  - lib/validation/cards.ts
  - app/pm/board/actions.ts
  - app/pm/board/board-panel.tsx
autonomous: false
requirements: [QUICK-260811-nnw]

must_haves:
  truths:
    - "A PM selecting card type 'Pacote' inside the EXISTING 'Criar card' Dialog (not a new/separate Dialog or button) sees an option to paste a planning document and generate pieces from it via AI"
    - "Pasting text and clicking 'Gerar peças' shows a reviewable list of AI-proposed pieces (title + description each) WITHOUT anything yet written to the database -- no intermediate table, the proposal lives only in React state until confirmation (D-4)"
    - "The PM can remove any proposed piece from the list before confirming; the remaining list is what actually gets created"
    - "Confirming creates exactly one Pacote card (createCard) followed by one createPiece call per remaining proposed piece, called sequentially (never Promise.all), each piece carrying its AI-authored description (not empty/null)"
    - "If AI generation fails, the existing runStructuredExtraction error message renders verbatim (never paraphrased) and no card is created at all"
    - "If piece creation partially fails after the Pacote was already created, the failure is shown explicitly (never silent) naming which pieces failed, and the Pacote plus any successfully-created pieces remain (no rollback of the whole package)"
    - "Creating a Pacote WITHOUT using the AI generator still works exactly as before this plan (zero-piece pacote via the normal 'Criar card' submit, PM adds pieces manually afterwards via the existing 'Adicionar peça' flow) -- zero regression to the pre-existing path"
    - "tsc --noEmit, eslint, npm test, and npm run build are all clean"
  artifacts:
    - path: "lib/cards/package-proposal.ts"
      provides: "planningDocToExtractionFile (pure, wraps pasted text as a synthetic ExtractionFile) + PLANNING_DOC_MAX_LENGTH constant, mirroring lib/cards/chat-import.ts's I/O-free, unit-testable convention"
      contains: "planningDocToExtractionFile"
      min_lines: 20
    - path: "lib/cards/package-proposal.test.ts"
      provides: "unit tests for planningDocToExtractionFile (trim, empty input, internal formatting preserved)"
      contains: "planningDocToExtractionFile"
    - path: "lib/validation/cards.ts"
      provides: "createPieceSchema gains optional description; new proposePackagePiecesSchema (input) and packagePiecesProposalSchema (AI output re-validation)"
      contains: "packagePiecesProposalSchema"
    - path: "app/pm/board/actions.ts"
      provides: "new proposePackagePieces Server Action (AI-propose-only, zero DB write, mirrors proposeChecklistFromFiles's shape); createPiece's insert now persists parsed.data.description instead of a hardcoded null"
      contains: "proposePackagePieces"
    - path: "app/pm/board/board-panel.tsx"
      provides: "CreateCardDialog gains a 'Gerar peças com IA' textarea+button (visible only when isPackageType), a review list with per-piece remove, and a confirm handler that calls createCard then loops createPiece sequentially"
      contains: "Gerar peças"
  key_links:
    - from: "app/pm/board/board-panel.tsx (handleGeneratePieces)"
      to: "app/pm/board/actions.ts (proposePackagePieces)"
      via: "direct Server Action call inside startTransition, result stored in proposedPieces state"
      pattern: "proposePackagePieces\\("
    - from: "app/pm/board/actions.ts (proposePackagePieces)"
      to: "lib/cards/package-proposal.ts (planningDocToExtractionFile)"
      via: "pasted text wrapped as the FIRST file in the files array passed to runStructuredExtraction, ahead of client_files"
      pattern: "planningDocToExtractionFile\\("
    - from: "app/pm/board/board-panel.tsx (handleConfirmPackageWithPieces)"
      to: "app/pm/board/actions.ts (createCard, then createPiece per remaining proposed piece)"
      via: "sequential for-loop, one awaited createPiece call per piece, never Promise.all"
      pattern: "for \\(const piece of proposedPieces\\)"
    - from: "lib/validation/cards.ts (createPieceSchema.description)"
      to: "app/pm/board/actions.ts (createPiece insert)"
      via: "parsed.data.description flows into the insert payload instead of the old hardcoded null"
      pattern: "parsed\\.data\\.description"
---

<objective>
Item 2 of the 2026-08-05 Juliano action plan's P3 ("geração de conteúdo em lote", discussed and locked in `260811-lp5-CONTEXT.md`, detailed in `260811-nnw-CONTEXT.md`): let a PM paste a planning document (free text, no file upload) into the EXISTING "Criar card" flow when card type "Pacote" is selected, have the AI propose N pieces (title + description each) from it, review/prune that list in an editable preview, and only on explicit confirmation create the real Pacote + pieces in the database. No new mechanism, no new Dialog, no intermediate database table — this reuses the "Pacote" card type from Phase 3 wave 9 exactly as the locked decision requires.

Purpose: today a PM producing a week/month of content for a client has to manually create the Pacote, then manually create and title+describe every single piece one at a time. This collapses that into "paste the plan, review the AI's proposal, confirm" — the same "IA propõe, humano confirma" pattern already used everywhere else in this codebase (checklist generation, briefing autofill), applied to batch content creation for the first time.

Output: a new pure module `lib/cards/package-proposal.ts` (the "pasted text as a synthetic file" pattern, mirroring `validateCardAgainstChecklist`'s existing `cardContentFile` precedent) with its own unit test; two new Zod schemas in `lib/validation/cards.ts` (`proposePackagePiecesSchema` for the input, `packagePiecesProposalSchema` to re-validate the AI's output before it is ever used); `createPieceSchema` gaining an optional `description` field (Pitfall 1 — today `createPiece` hardcodes `description: null`, which would silently throw away every AI-proposed description); a new `proposePackagePieces` Server Action in `app/pm/board/actions.ts` that calls the shared `runStructuredExtraction` engine and returns the proposal WITHOUT writing anything to the database (mirrors `proposeChecklistFromFiles`'s exact shape, NOT `generateChecklistDraftFromFiles`'s draft-row shape — D-4 is explicit that no intermediate table exists); and a new section inside `CreateCardDialog` (`app/pm/board/board-panel.tsx`) visible only when `isPackageType` is true — a textarea + "Gerar peças" button, an editable review list with per-piece remove, and a "Confirmar e criar pacote" action that calls `createCard` once and then `createPiece` once per remaining piece, sequentially, never in parallel.

**Deliberate scope boundaries, Claude's Discretion per `260811-nnw-CONTEXT.md`, documented here rather than left implicit:**
1. **Piece count ceiling is instruction-only, not a hard Zod `.max()`.** `packagePiecesProposalSchema` mirrors `checklistTemplateSchema`'s own precedent (`lib/validation/checklist.ts`) exactly — no upper bound in Zod, only `.min(1)`. The AI is told "no máximo 10 peças" in the prompt instruction, but if it proposes more, the PM's own review/remove step absorbs the excess instead of the entire generation failing outright with a confusing error (`260811-nnw-RESEARCH.md` Assumption A2).
2. **Pasted-text input length IS capped in Zod** (`PLANNING_DOC_MAX_LENGTH = 20000`, defined once in `lib/cards/package-proposal.ts`, imported by the schema). This is the first paste-text flow in the codebase to cap INPUT length (`260811-nnw-RESEARCH.md` Pitfall 2, `[ASSUMED]` exact number, no repo precedent) — chosen generously (multiple weeks of planned content) purely to bound AI cost/latency, not because 20000 chars is unsafe.
3. **The review preview supports REMOVAL, not per-field text editing.** `260811-nnw-CONTEXT.md`'s own locked decision text is explicit: "o PM revisa, pode remover alguma da lista" — remove is the only editable action the decision specifies. Implementing inline title/description text-editing on top of that would be scope the user never asked for, not a simplification of what they did ask for.
4. **The AI-generation section lives INSIDE the existing "Escrever" tab's form, conditioned on `isPackageType`** — never inside the "Colar do chat" tab (Pitfall 4: that tab already hardcodes `cardType: "single"` and ignores the type selector entirely; mixing this feature into it would require unrelated rework of an existing, working path).
5. **No new metadata on the Pacote itself** (e.g. no "origem: gerado em lote" flag). `260811-nnw-CONTEXT.md`'s own Claude's Discretion note concludes the plain `createCard` path already suffices — a Pacote created via this flow is indistinguishable from one created manually, which is correct: nothing downstream (rollup badge, checklist gate, drag-and-drop) needs to know how a Pacote was populated.
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
@$HOME/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/STATE.md
@CLAUDE.md
@.planning/quick/260811-nnw-item-2-do-p3-plano-de-a-o-2026-08-05-ger/260811-nnw-CONTEXT.md
@.planning/quick/260811-nnw-item-2-do-p3-plano-de-a-o-2026-08-05-ger/260811-nnw-RESEARCH.md
@lib/validation/cards.ts
@app/pm/board/actions.ts
@app/pm/board/board-panel.tsx
@lib/ai/structured-extraction.ts
@lib/ai/extraction-prompt.ts
@lib/actions/checklist-templates.ts
@lib/cards/chat-import.ts

<baseline>
- No database migration in this plan — `createPiece`'s new `description` field writes to `public.cards.description`, a column that already exists (migration `0017_cards_description_assignee.sql`) and is already nullable. Zero schema change, zero RLS change.
- The exact "pasted text as a synthetic file" pattern is already in production: `validateCardAgainstChecklist` (`app/pm/board/actions.ts`, current lines 648-651) builds `cardContentFile = { filename: "...", content: "..." }` and passes `files: [cardContentFile, ...(clientFiles ?? [])]` to `runStructuredExtraction`. This plan's `planningDocToExtractionFile` reproduces that shape for a PM-pasted planning document instead of a card's own text.
- The exact "propose without writing" pattern is already in production: `proposeChecklistFromFiles` (`lib/actions/checklist-templates.ts`, current lines 224-301) calls `runStructuredExtraction`, re-validates the tool output with a Zod schema, and returns `{ success: true, proposal }` — NO database write. This plan's `proposePackagePieces` mirrors that shape exactly, never `generateChecklistDraftFromFiles`'s draft-row-write shape.
- `createPieceSchema`/`createPiece` today hardcode `description: null` on every piece insert (`app/pm/board/actions.ts`, current line 840). This is Pitfall 1 from research — the single genuinely-new piece of backend work this plan does, an additive/optional field change that breaks no existing call site (`PackageRow.handleAddPiece` only ever sends `{ parentCardId, title }`).
- `CreateCardDialog`'s `isPackageType` boolean (current line 270) already exists and already gates the Descrição/Responsável/Designer-Mídia sections (D-02, plan 03-06). This plan's new AI-generation section uses the SAME boolean, no new derivation needed.
- `runStructuredExtraction`'s error (`EXTRACTION_FAILED_ERROR`) is already centralized and every existing caller repeats it verbatim (`if (!result.ok) return { error: result.error };`) — this plan's `proposePackagePieces` does the same, no new error string for that failure mode.
</baseline>

<interfaces>
<!-- Exact target content and current-code excerpts. Use these directly -- no need to re-derive from the codebase. -->

**New file — `lib/cards/package-proposal.ts`, create exactly this:**
```typescript
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
```

**New file — `lib/cards/package-proposal.test.ts`, create exactly this:**
```typescript
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  planningDocToExtractionFile,
  PLANNING_DOC_FILENAME,
} from "./package-proposal.ts";

test("planningDocToExtractionFile: wraps trimmed text under the fixed filename", () => {
  const result = planningDocToExtractionFile(
    "  Semana 1: tema X\nSemana 2: tema Y  "
  );
  assert.equal(result.filename, PLANNING_DOC_FILENAME);
  assert.equal(result.content, "Semana 1: tema X\nSemana 2: tema Y");
});

test("planningDocToExtractionFile: empty/whitespace-only text becomes an empty content string, never crashes", () => {
  const result = planningDocToExtractionFile("   \n\t  ");
  assert.equal(result.content, "");
});

test("planningDocToExtractionFile: preserves internal blank lines and formatting, only trims the outer edges", () => {
  const input = "\n\nTítulo\n\nParágrafo 1\n\nParágrafo 2\n\n";
  const result = planningDocToExtractionFile(input);
  assert.equal(result.content, "Título\n\nParágrafo 1\n\nParágrafo 2");
});
```

**`lib/validation/cards.ts` — new import at the top of the file (after `import { z } from "zod";`):**
```typescript
import { PLANNING_DOC_MAX_LENGTH } from "@/lib/cards/package-proposal";
```

**`lib/validation/cards.ts` — `createPieceSchema` (current lines 161-179), replace the doc comment AND add the `description` field:**
```typescript
/**
 * createPiece's input (KAN-01 package half, D-01/D-02, plan 03-06,
 * T-03-31). Deliberately has NO `clientId` field -- a piece's client is
 * always copied server-side from its re-read parent package row inside
 * `createPiece`, never taken from the browser (03-RESEARCH.md Security
 * Domain, the Information Disclosure row). A piece created manually
 * (PackageRow's "Adicionar peça") is still title-only, its description set
 * afterwards through the piece's own card detail Dialog via
 * `updateCardDetails` -- `description` below is OPTIONAL specifically so
 * that call site needs zero changes. Item 2 of the 2026-08-05 action plan's
 * P3 (260811-nnw-CONTEXT.md, Pitfall 1): batch-generated pieces
 * (proposePackagePieces) DO send it, so the AI-authored content survives
 * creation instead of being silently discarded.
 */
export const createPieceSchema = z.object({
  parentCardId: z.string().uuid(),
  title: z
    .string()
    .trim()
    .min(1, { message: "Título obrigatório." })
    .max(200),
  // Mirrors createCardSchema's own `.max(5000)` description limit exactly.
  description: z.string().trim().max(5000).optional(),
});
export type CreatePieceInput = z.infer<typeof createPieceSchema>;
```
(The `export type CreatePieceInput = z.infer<typeof createPieceSchema>;` line already exists immediately after the schema today -- keep it in the same place, just re-shown above for clarity.)

**`lib/validation/cards.ts` — new schemas, appended to the END of the file, after the existing `removePieceSchema`/`RemovePieceInput` block:**
```typescript
/**
 * proposePackagePieces' input (KAN-01 package half, item 2 of the
 * 2026-08-05 action plan's P3, 260811-nnw-CONTEXT.md D-2/D-6). `text` is the
 * PM-pasted planning document, treated as a synthetic "arquivo" by
 * `planningDocToExtractionFile` (lib/cards/package-proposal.ts) -- the exact
 * pattern `validateCardAgainstChecklist`'s `cardContentFile` already uses.
 * `.max()` mirrors PLANNING_DOC_MAX_LENGTH exactly (imported from the same
 * module, never a second copy of the number) -- Pitfall 2,
 * 260811-nnw-RESEARCH.md: no other paste-text flow in this codebase caps
 * INPUT length, this is the first one to.
 */
export const proposePackagePiecesSchema = z.object({
  clientId: z.string().uuid({ message: "Cliente inválido." }),
  text: z
    .string()
    .trim()
    .min(1, { message: "Cole o texto do documento de planejamento." })
    .max(PLANNING_DOC_MAX_LENGTH, {
      message: "Documento muito longo. Cole um trecho menor.",
    }),
});
export type ProposePackagePiecesInput = z.infer<
  typeof proposePackagePiecesSchema
>;

/**
 * Shape of the AI's proposal after `proposePackagePieces` (app/pm/board/
 * actions.ts) re-validates its `runStructuredExtraction` output -- never
 * trusted as pre-shaped for a database write (Security Domain V5), same
 * discipline `checklistTemplateSchema` already applies to checklist
 * generation. Deliberately NO `.max()` on the array -- mirrors
 * `checklistTemplateSchema.items`'s own precedent (lib/validation/
 * checklist.ts, no Zod upper bound, the item-count ceiling is requested
 * only in the AI instruction text); a PM reviewing a slightly-over-10
 * proposal can simply remove the extras rather than the whole generation
 * failing outright (260811-nnw-RESEARCH.md Assumption A2).
 */
export const packagePiecesProposalSchema = z.object({
  pieces: z
    .array(
      z.object({
        title: z.string().trim().min(1).max(200),
        description: z.string().trim().max(5000),
      })
    )
    .min(1, { message: "A IA não propôs nenhuma peça." }),
});
export type PackagePiecesProposal = z.infer<typeof packagePiecesProposalSchema>;
export type PackagePieceProposal = PackagePiecesProposal["pieces"][number];
```

**`app/pm/board/actions.ts` — new error constants, added alongside the existing `const ..._ERROR` declarations near the top of the file (after the existing `PIECE_DELETE_ERROR` line, current line 50):**
```typescript
const PACKAGE_PROPOSAL_CLIENT_NOT_FOUND_ERROR = "Cliente não encontrado.";
const PACKAGE_PROPOSAL_INVALID_RESULT_ERROR =
  "A IA retornou um resultado inesperado. Tente novamente ou crie as peças manualmente.";
```

**`app/pm/board/actions.ts` — extend the existing import from `@/lib/validation/cards` (current lines 11-30) with:**
```typescript
  proposePackagePiecesSchema,
  packagePiecesProposalSchema,
  type ProposePackagePiecesInput,
  type PackagePieceProposal,
```
(add these four alongside the existing `createPieceSchema`/`removePieceSchema`/etc. entries in that same import statement -- no new `import` statement needed for this one)

**`app/pm/board/actions.ts` — new import for the pure module, added near the top with the other `lib/` imports (after the existing `import { runStructuredExtraction } from "@/lib/ai/structured-extraction";` line):**
```typescript
import { planningDocToExtractionFile } from "@/lib/cards/package-proposal";
```

**`app/pm/board/actions.ts` — `createPiece`'s `.insert({...})` payload (current lines 829-843), change ONE field:**
```typescript
  const { data: card, error: insertError } = await supabase
    .from("cards")
    .insert({
      // client_id copied from the RE-READ PARENT ROW, never from any
      // browser-supplied value (T-03-31).
      client_id: parent.client_id,
      parent_card_id: parent.id,
      card_type: "piece",
      stage: "briefing",
      title: parsed.data.title,
      created_by: user.id,
      // Item 2, 260811-nnw (Pitfall 1): was hardcoded null -- now persists
      // an AI-proposed (or manually typed, once the detail Dialog gains a
      // create-time field, out of this plan's scope) description instead of
      // silently discarding it. Same trim-then-null-if-empty rule createCard
      // already applies to its own description field.
      description:
        parsed.data.description && parsed.data.description.length > 0
          ? parsed.data.description
          : null,
      assignee_id: null,
      media_assignee_id: null,
    })
    .select("id")
    .single();
```

**`app/pm/board/actions.ts` — new `proposePackagePieces` Server Action, appended to the END of the file, after the existing `removePiece` function:**
```typescript
export type ProposePackagePiecesResult =
  | { success: true; pieces: PackagePieceProposal[] }
  | { error: string };

/**
 * AI proposal step of "IA propõe, humano confirma" for batch package-piece
 * generation (item 2 of the 2026-08-05 action plan's P3,
 * 260811-nnw-CONTEXT.md D-2/D-3/D-4). Mirrors `proposeChecklistFromFiles`'s
 * (lib/actions/checklist-templates.ts) NO-intermediate-write shape exactly,
 * per D-4 -- returns the proposal, writes NOTHING to the database. The
 * PM-pasted text is wrapped as a synthetic "arquivo"
 * (`planningDocToExtractionFile`, lib/cards/package-proposal.ts) and placed
 * FIRST in `files`, ahead of the client's own `client_files` -- the planning
 * document is the PRIMARY source of the proposed pieces here,
 * `client_files`/`sharedFiles` are supporting context for tone/brand only,
 * the reverse of `validateCardAgainstChecklist`'s own ordering where the
 * card's text is the thing BEING checked against the client's files.
 *
 * Callable by any PM assigned to the client (NOT admin-only) -- the
 * RLS-scoped client re-read below is the real boundary, same authorization
 * shape as `generateChecklistDraftFromFiles`.
 */
export async function proposePackagePieces(
  input: ProposePackagePiecesInput
): Promise<ProposePackagePiecesResult> {
  const parsed = proposePackagePiecesSchema.safeParse(input);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Dados inválidos." };
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: NOT_AUTHENTICATED_ERROR };

  // Re-read the client through RLS -- never trust that clientId is valid on
  // its own; clients_select_scoped is the real boundary (admin-or-assigned-PM).
  const { data: client } = await supabase
    .from("clients")
    .select("id, name, tag")
    .eq("id", parsed.data.clientId)
    .single();
  if (!client) {
    return { error: PACKAGE_PROPOSAL_CLIENT_NOT_FOUND_ERROR };
  }

  const { data: clientFiles } = await supabase
    .from("client_files")
    .select("filename, content")
    .eq("client_id", client.id);

  // Quick task 260811-imw pattern: unfiltered select -- shared_knowledge_files
  // has no client_id column; shared_knowledge_files_select_all_authenticated
  // is the real boundary here, via the SAME RLS-scoped supabase client above.
  const { data: sharedKnowledgeFiles } = await supabase
    .from("shared_knowledge_files")
    .select("filename, content");
  const sharedFiles = sharedKnowledgeFiles ?? [];

  const planningDocFile = planningDocToExtractionFile(parsed.data.text);

  const result = await runStructuredExtraction({
    clientName: client.name,
    clientTag: client.tag,
    files: [planningDocFile, ...(clientFiles ?? [])],
    sharedFiles,
    instruction:
      "Leia o documento de planejamento acima (arquivo " +
      `'${planningDocFile.filename}') e proponha peças de conteúdo ` +
      "(posts) a partir dele -- cada peça com um título curto e uma " +
      "descrição (o texto completo do post, pronto para revisão interna). " +
      "Proponha no máximo 10 peças. Use os demais arquivos de referência " +
      "do cliente (manual de marca, briefing, regras de conteúdo, etc.) " +
      "apenas como contexto de tom e estilo -- a fonte das peças em si é " +
      "sempre o documento de planejamento, nunca os arquivos de referência.",
    toolName: "propose_package_pieces",
    toolDescription:
      "Registra a proposta de peças de conteúdo extraídas do documento de planejamento.",
    inputSchema: {
      type: "object",
      properties: {
        pieces: {
          type: "array",
          items: {
            type: "object",
            properties: {
              title: { type: "string", description: "Título curto da peça." },
              description: {
                type: "string",
                description: "Texto completo proposto para o post.",
              },
            },
            required: ["title", "description"],
          },
          description: "Peças propostas a partir do documento (no máximo 10).",
        },
      },
      required: ["pieces"],
    },
  });

  if (!result.ok) {
    return { error: result.error };
  }

  const raw = result.data as { pieces?: unknown };
  const parsedProposal = packagePiecesProposalSchema.safeParse({
    pieces: raw.pieces,
  });
  if (!parsedProposal.success) {
    console.error(
      "[proposePackagePieces] AI output failed packagePiecesProposalSchema validation",
      parsedProposal.error
    );
    return { error: PACKAGE_PROPOSAL_INVALID_RESULT_ERROR };
  }

  return { success: true, pieces: parsedProposal.data.pieces };
}
```

**`app/pm/board/board-panel.tsx` — extend the existing import from `./actions` (current lines 33-45) with `proposePackagePieces`:**
```typescript
import {
  createCard,
  advanceStage,
  toggleChecklistItem,
  moveCard,
  updateCardDetails,
  addAttachment,
  removeAttachment,
  createPiece,
  removePiece,
  validateCardAgainstChecklist,
  proposePackagePieces,
  type ChecklistValidationItemResult,
} from "./actions";
```

**`app/pm/board/board-panel.tsx` — extend the existing import from `@/lib/validation/cards` (current lines 46-51) with `PackagePieceProposal`:**
```typescript
import {
  createCardSchema,
  attachDriveLinkSchema,
  type CreateCardInput,
  type AttachDriveLinkInput,
  type PackagePieceProposal,
} from "@/lib/validation/cards";
```

**`app/pm/board/board-panel.tsx` — new import, added alongside the other `lib/cards/*` imports (after the existing `import { packageRollupLabel } from "@/lib/cards/package-rollup";` line):**
```typescript
import { PLANNING_DOC_MAX_LENGTH } from "@/lib/cards/package-proposal";
```

**`app/pm/board/board-panel.tsx` — `CreateCardDialog`'s state block (current lines 238-244), add two new `useState`s right after the existing `pastedText` line:**
```typescript
  const [open, setOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<"escrever" | "colar">("escrever");
  const [isPending, startTransition] = useTransition();
  const [serverError, setServerError] = useState<string | null>(null);
  const [assigneeValue, setAssigneeValue] = useState(NONE_VALUE);
  const [mediaAssigneeValue, setMediaAssigneeValue] = useState(NONE_VALUE);
  const [pastedText, setPastedText] = useState("");
  // Item 2, 260811-nnw: the AI-proposed pieces live ONLY in this component's
  // state until the PM confirms (D-4, no intermediate table). Reset on every
  // dialog open, same as pastedText.
  const [planningDocText, setPlanningDocText] = useState("");
  const [proposedPieces, setProposedPieces] = useState<PackagePieceProposal[]>([]);
```

**`app/pm/board/board-panel.tsx` — `handleOpenChange` (current lines 272-282), add two reset lines:**
```typescript
  function handleOpenChange(next: boolean) {
    setOpen(next);
    if (next) {
      setServerError(null);
      form.reset(defaultValues);
      setAssigneeValue(NONE_VALUE);
      setMediaAssigneeValue(NONE_VALUE);
      setActiveTab("escrever");
      setPastedText("");
      setPlanningDocText("");
      setProposedPieces([]);
    }
  }
```

**`app/pm/board/board-panel.tsx` — two new handler functions, inserted right after the existing `handlePasteImport` function closes (current line 346), before the `return (` line:**
```typescript
  function handleRemoveProposedPiece(index: number) {
    setProposedPieces((prev) => prev.filter((_, i) => i !== index));
  }

  function handleGeneratePieces() {
    if (!clientId) return;
    setServerError(null);
    startTransition(async () => {
      const result = await proposePackagePieces({
        clientId,
        text: planningDocText,
      });
      if ("error" in result) {
        setServerError(result.error);
        return;
      }
      setProposedPieces(result.pieces);
    });
  }

  // Item 2, 260811-nnw (D-3): confirming creates the Pacote first, then
  // walks the (possibly pruned) proposedPieces list SEQUENTIALLY -- one
  // awaited createPiece call at a time, never Promise.all (RESEARCH.md
  // "Don't Hand-Roll" table, same rule 260805-dkr's multi-upload already
  // established). A piece-creation failure is never silent: the Pacote and
  // any already-created pieces remain (no rollback), and the failed
  // titles are named in the error so the PM can add them manually.
  function handleConfirmPackageWithPieces() {
    if (!clientId) return;
    const title = form.getValues("title").trim();
    if (title.length === 0) {
      setServerError("Título obrigatório.");
      return;
    }
    setServerError(null);
    startTransition(async () => {
      const packageResult = await createCard({
        clientId,
        title,
        cardType: "package",
        channel: form.getValues("channel"),
        stage: targetStage,
      });
      if ("error" in packageResult) {
        setServerError(packageResult.error);
        return;
      }

      const failures: string[] = [];
      for (const piece of proposedPieces) {
        const pieceResult = await createPiece({
          parentCardId: packageResult.cardId,
          title: piece.title,
          description: piece.description,
        });
        if ("error" in pieceResult) failures.push(piece.title);
      }

      if (failures.length > 0) {
        setServerError(
          `Pacote criado, mas estas peças não puderam ser criadas: ${failures.join(", ")}. Adicione-as manualmente pelo pacote.`
        );
        return;
      }

      toast.success(CARD_CREATED_TOAST);
      setOpen(false);
    });
  }
```

**`app/pm/board/board-panel.tsx` — new JSX block, inserted right after the existing Título `FormField` closes (current lines 429-441) and BEFORE the existing `{!isPackageType ? (... Descrição ...) : null}` block (current line 442):**
```tsx
                {isPackageType ? (
                  <div className="flex flex-col gap-2 rounded-md border p-3">
                    <Label>
                      Gerar peças com IA a partir de um documento de planejamento
                    </Label>
                    <Textarea
                      value={planningDocText}
                      onChange={(event) => setPlanningDocText(event.target.value)}
                      rows={6}
                      maxLength={PLANNING_DOC_MAX_LENGTH}
                      placeholder="Cole aqui o texto do documento de planejamento (ex: pauta semanal, calendário de conteúdo)..."
                      disabled={isPending}
                    />
                    <Button
                      type="button"
                      variant="outline"
                      onClick={handleGeneratePieces}
                      disabled={isPending || planningDocText.trim().length === 0}
                      className="w-fit"
                    >
                      {isPending ? "Gerando..." : "Gerar peças"}
                    </Button>
                    {proposedPieces.length > 0 ? (
                      <div className="flex flex-col gap-2">
                        <span className="text-body font-medium">
                          {proposedPieces.length} peça
                          {proposedPieces.length === 1 ? "" : "s"} proposta
                          {proposedPieces.length === 1 ? "" : "s"} — revise e
                          remova o que não quiser antes de confirmar
                        </span>
                        {proposedPieces.map((piece, index) => (
                          <div
                            key={`${piece.title}-${index}`}
                            className="flex items-start justify-between gap-2 rounded-md border p-2"
                          >
                            <div className="flex min-w-0 flex-col gap-0.5">
                              <span className="text-body font-medium">
                                {piece.title}
                              </span>
                              <span className="text-meta text-muted-foreground whitespace-pre-wrap">
                                {piece.description}
                              </span>
                            </div>
                            <Button
                              type="button"
                              variant="ghost"
                              size="icon"
                              className="size-8 shrink-0"
                              aria-label="Remover peça proposta"
                              onClick={() => handleRemoveProposedPiece(index)}
                              disabled={isPending}
                            >
                              <XIcon className="size-4" />
                            </Button>
                          </div>
                        ))}
                      </div>
                    ) : null}
                  </div>
                ) : null}
```

**`app/pm/board/board-panel.tsx` — the existing `serverError`/submit-`Button` block at the end of the "Escrever" tab's form (current lines 511-514), replace with a conditional submit:**
```tsx
                {serverError ? <ErrorBox>{serverError}</ErrorBox> : null}
                {isPackageType && proposedPieces.length > 0 ? (
                  <Button
                    type="button"
                    onClick={handleConfirmPackageWithPieces}
                    disabled={isPending}
                    className="w-fit"
                  >
                    {isPending
                      ? "Criando..."
                      : `Confirmar e criar pacote com ${proposedPieces.length} peça${proposedPieces.length === 1 ? "" : "s"}`}
                  </Button>
                ) : (
                  <Button type="submit" disabled={isPending} className="w-fit">
                    {isPending ? "Criando..." : "Criar card"}
                  </Button>
                )}
```
(This is the ONLY change to the submit area — when `proposedPieces` is empty, the original `type="submit"` button and `onSubmit` form flow are completely unchanged, so creating a Pacote without ever touching the AI generator behaves exactly as it did before this plan.)
</interfaces>
</context>

<tasks>

<task type="auto">
  <name>Task 1: Contracts — synthetic-file module, its test, and the two new Zod schemas</name>
  <files>lib/cards/package-proposal.ts, lib/cards/package-proposal.test.ts, lib/validation/cards.ts</files>
  <action>
    Create `lib/cards/package-proposal.ts` and `lib/cards/package-proposal.test.ts` with EXACTLY the content given under those two headings in `<interfaces>` above.

    In `lib/validation/cards.ts`: add the new `import { PLANNING_DOC_MAX_LENGTH } from "@/lib/cards/package-proposal";` line exactly as given. Replace `createPieceSchema`'s doc comment and add the `description` field exactly as given under "`createPieceSchema`" in `<interfaces>` — every other field/behavior in that schema is unchanged, `parentCardId`/`title` stay identical. Append the two new schemas (`proposePackagePiecesSchema`, `packagePiecesProposalSchema`) plus their inferred types EXACTLY as given, at the end of the file, after the existing `removePieceSchema`/`RemovePieceInput` block.
  </action>
  <verify>
    <automated>cd /Users/lucaspaiva/projects/backstageed.OS &amp;&amp; node --test lib/cards/package-proposal.test.ts 2>&amp;1 | tail -30</automated>
    <automated>cd /Users/lucaspaiva/projects/backstageed.OS &amp;&amp; npx tsc --noEmit 2>&amp;1 | tail -40</automated>
    <automated>cd /Users/lucaspaiva/projects/backstageed.OS &amp;&amp; npx eslint lib/cards/package-proposal.ts lib/cards/package-proposal.test.ts lib/validation/cards.ts 2>&amp;1 | tail -40</automated>
    <automated>cd /Users/lucaspaiva/projects/backstageed.OS &amp;&amp; grep -c "packagePiecesProposalSchema\|proposePackagePiecesSchema" lib/validation/cards.ts</automated>
  </verify>
  <done>The 3 new unit tests in `package-proposal.test.ts` all pass. `tsc --noEmit` shows errors ONLY in `app/pm/board/actions.ts`/`app/pm/board/board-panel.tsx` (expected at this point — fixed in Tasks 2/3), never in the 3 files this task touches. `eslint` is clean on all 3 files. `createPieceSchema.description` is optional; `proposePackagePiecesSchema`/`packagePiecesProposalSchema` both exist and export their inferred types.</done>
</task>

<task type="auto">
  <name>Task 2: Server Action — proposePackagePieces (propose-only, zero DB write) + createPiece persists description</name>
  <files>app/pm/board/actions.ts</files>
  <action>
    Depends on Task 1's schemas existing. Add the two new error constants exactly as given under "new error constants" in `<interfaces>`. Extend the existing `@/lib/validation/cards` import with the four new named imports exactly as given. Add the new `import { planningDocToExtractionFile } from "@/lib/cards/package-proposal";` line exactly as given.

    In `createPiece`'s `.insert({...})` payload, change the `description` field exactly as given under "`createPiece`'s `.insert({...})` payload" in `<interfaces>` — every other field in that insert (`client_id`, `parent_card_id`, `card_type`, `stage`, `title`, `created_by`, `assignee_id`, `media_assignee_id`) stays byte-identical.

    Append the new `proposePackagePieces` Server Action to the end of the file, after the existing `removePiece` function, EXACTLY as given under "new `proposePackagePieces` Server Action" in `<interfaces>` — same `runStructuredExtraction` call shape every other caller in this file already uses (`validateCardAgainstChecklist`), same RLS-then-safeParse discipline.
  </action>
  <verify>
    <automated>cd /Users/lucaspaiva/projects/backstageed.OS &amp;&amp; npx tsc --noEmit 2>&amp;1 | tail -40</automated>
    <automated>cd /Users/lucaspaiva/projects/backstageed.OS &amp;&amp; npx eslint app/pm/board/actions.ts 2>&amp;1 | tail -40</automated>
    <automated>cd /Users/lucaspaiva/projects/backstageed.OS &amp;&amp; grep -n "export async function proposePackagePieces" app/pm/board/actions.ts</automated>
    <automated>cd /Users/lucaspaiva/projects/backstageed.OS &amp;&amp; grep -n "description:" app/pm/board/actions.ts | grep -c "parsed.data.description"</automated>
    <automated>cd /Users/lucaspaiva/projects/backstageed.OS &amp;&amp; grep -c "files: \[planningDocFile" app/pm/board/actions.ts</automated>
  </verify>
  <done>`tsc --noEmit` shows errors ONLY in `board-panel.tsx` (fixed in Task 3) — `actions.ts` is individually clean once Task 3 lands. `eslint` clean on `actions.ts`. `proposePackagePieces` is exported, writes nothing to the database on its own (grep confirms no `.insert(`/`.update(`/`.delete(` call inside its body), and returns `{ error: result.error }` verbatim on `runStructuredExtraction` failure. `createPiece`'s insert now uses `parsed.data.description` instead of a hardcoded `null`, with the same trim-then-null-if-empty rule `createCard` already applies.</done>
</task>

<task type="auto">
  <name>Task 3: CreateCardDialog UI — generate, review/remove, confirm-and-create sequentially</name>
  <files>app/pm/board/board-panel.tsx</files>
  <action>
    Depends on Tasks 1-2 (the `proposePackagePieces` action and `PackagePieceProposal` type must exist first). No new UI primitive imports are needed — `Label`, `Textarea`, `Button`, `ErrorBox`, `XIcon` are all already imported in this file.

    Extend the `./actions` import with `proposePackagePieces`, the `@/lib/validation/cards` import with `type PackagePieceProposal`, and add the new `PLANNING_DOC_MAX_LENGTH` import from `@/lib/cards/package-proposal` — all exactly as given under their respective headings in `<interfaces>`.

    In `CreateCardDialog`'s state block, add the two new `useState`s (`planningDocText`, `proposedPieces`) exactly as given. In `handleOpenChange`, add the two reset lines exactly as given. Right after `handlePasteImport` closes (before the `return (` line), add the three new handler functions (`handleRemoveProposedPiece`, `handleGeneratePieces`, `handleConfirmPackageWithPieces`) exactly as given.

    In the JSX: insert the new "Gerar peças com IA" block exactly as given, positioned right after the Título `FormField` closes and BEFORE the existing `{!isPackageType ? (... Descrição ...) : null}` block — so it appears ONLY when `isPackageType` is true, in the same visual region where Descrição/Responsável/Designer-Mídia get hidden for a Pacote. Replace the existing `serverError`/submit-`Button` block at the end of the form with the conditional-submit version given under that heading in `<interfaces>` — when `proposedPieces` is empty (the default, and the case for every Pacote created without using the AI generator), the ORIGINAL `type="submit"` button and `onSubmit` flow are completely unchanged.
  </action>
  <verify>
    <automated>cd /Users/lucaspaiva/projects/backstageed.OS &amp;&amp; npx tsc --noEmit 2>&amp;1 | tail -60</automated>
    <automated>cd /Users/lucaspaiva/projects/backstageed.OS &amp;&amp; npx eslint app/pm/board/board-panel.tsx 2>&amp;1 | tail -60</automated>
    <automated>cd /Users/lucaspaiva/projects/backstageed.OS &amp;&amp; grep -c "Gerar peças\|handleConfirmPackageWithPieces\|handleGeneratePieces\|handleRemoveProposedPiece" app/pm/board/board-panel.tsx</automated>
    <automated>cd /Users/lucaspaiva/projects/backstageed.OS &amp;&amp; npm test 2>&amp;1 | tail -20</automated>
    <automated>cd /Users/lucaspaiva/projects/backstageed.OS &amp;&amp; npm run build 2>&amp;1 | tail -40</automated>
  </verify>
  <done>`tsc --noEmit` and `eslint` are both fully clean (zero errors anywhere in the repo). `npm test` passes with the 3 new `package-proposal.test.ts` cases included. `npm run build` succeeds. Selecting "Pacote" in the "Criar card" Dialog shows a "Gerar peças com IA..." textarea + button; generating shows a reviewable, per-item-removable list; the primary action becomes "Confirmar e criar pacote com N peças" only once the list is non-empty; leaving the AI generator untouched still shows the original "Criar card" button behaving exactly as before this plan (creates an empty Pacote).</done>
</task>

<task type="checkpoint:human-verify" gate="blocking">
  <name>Task 4: Live verification of batch content generation end-to-end</name>
  <what-built>
    Inside the existing "Criar card" Dialog, selecting card type "Pacote" now reveals a "Gerar peças com IA a partir de um documento de planejamento" textarea + "Gerar peças" button. Pasting a planning document and clicking it calls a new `proposePackagePieces` Server Action (zero database write) that reads the client's own `client_files`/`shared_knowledge_files` as supporting context and proposes a list of pieces (title + description each) via the shared `runStructuredExtraction` engine. The proposal renders as a removable list — nothing is created yet. Confirming creates one Pacote (`createCard`) and then walks the remaining pieces sequentially (`createPiece` once per piece, never in parallel), each piece now carrying its AI-authored description instead of an empty one. A partial piece-creation failure is shown explicitly, never silent, and never rolls back the Pacote or the pieces that did succeed. Creating a Pacote without touching the AI generator at all still works exactly as before.
  </what-built>
  <how-to-verify>
    1. Run `npm run dev`. Log in as a PM, open `/pm/board` for a real client that has at least one `client_files` entry uploaded (for realistic tone/brand context in the proposal).
    2. Click "Criar card" (top-level "Escrever" tab). Select Tipo = "Pacote". Confirm Descrição/Responsável/Designer-Mídia are hidden (unchanged, D-02) and the new "Gerar peças com IA..." textarea + "Gerar peças" button appear instead.
    3. Fill Título + Canal, paste a short multi-topic planning document into the new textarea (e.g. 3-4 distinct content ideas for a week), click "Gerar peças". Confirm a list of proposed pieces appears (title + description each), and confirm NOTHING has been created yet — the board/pacotes list has not changed while the dialog is still open.
    4. Remove one proposed piece from the list via its remove button. Confirm the count in "Confirmar e criar pacote com N peças" updates to reflect the removal.
    5. Click "Confirmar e criar pacote com N peças". Confirm the dialog closes, a new Pacote appears in the "Pacotes" region with exactly the pieces that were left after step 4 (not the original count), and opening one of those pieces shows its AI-authored description already filled in (not empty).
    6. Repeat step 2-3 but paste EMPTY/whitespace-only text and confirm "Gerar peças" stays disabled. Then paste real text, click "Gerar peças", and — while it is loading — confirm the button shows "Gerando..." and the dialog does not let you double-submit.
    7. Create a Pacote WITHOUT ever touching the "Gerar peças" section (leave the textarea empty, just fill Título/Canal and click "Criar card" directly). Confirm this still creates an empty Pacote exactly as it did before this plan, and "Adicionar peça" inside it still works exactly as before.
    8. Confirm nothing else regressed: single-card creation ("Post único"), "Colar do chat", stage advancement, the checklist gate, drag-and-drop, and existing package piece deletion (260808-c9s) all still work exactly as before.
    9. Confirm the full automated suite is green: `npx tsc --noEmit`, `npx eslint .`, `npm test`, `npm run build`.
    Clean up any test card(s)/pacote(s) created for this verification afterwards, per this project's established habit.
  </how-to-verify>
  <resume-signal>Type "approved" once generate/review/remove/confirm all work end-to-end, partial-failure and empty-generator paths behave as described, and the full automated suite is green. Otherwise describe what went wrong.</resume-signal>
</task>

</tasks>

<threat_model>
## Trust Boundaries

| Boundary | Description |
|----------|-------------|
| browser (PM) -> `proposePackagePieces` | The pasted planning-document text (up to `PLANNING_DOC_MAX_LENGTH` = 20000 chars) becomes part of the AI prompt sent to the Anthropic API — inherently untrusted free text, the first ad-hoc-length paste flow in this codebase to reach `runStructuredExtraction`. |
| AI `tool_use` output -> `packagePiecesProposalSchema` -> `createPiece` | The AI's proposed pieces are re-validated by Zod before they are ever returned to the client component, and again implicitly by `createPieceSchema` inside `createPiece` itself before any database write — never trusted as pre-shaped for a write (Security Domain V5). |
| browser (PM) -> `createCard`/`createPiece` (existing, unchanged) | `client_id` is re-read via RLS before every write, exactly as before this plan — no new privilege path introduced. |

## STRIDE Threat Register

| Threat ID | Category | Component | Disposition | Mitigation Plan |
|-----------|----------|-----------|-------------|-----------------|
| T-nnw-01 | Tampering | Pasted planning-document text used to build the AI prompt (potential prompt injection) | accept | `buildExtractionPrompt`'s established anti-injection ordering (client-files block, then the trusted `instruction` always LAST — T-ivr-03's convention) is unchanged/preserved; residual risk accepted at the same level every other `runStructuredExtraction` caller already accepts (`validateCardAgainstChecklist`'s own `cardContentFile` has the identical exposure to a card's own text) |
| T-nnw-02 | Tampering | `clientId` supplied by the browser to `proposePackagePieces` | mitigate | Client re-read via RLS-scoped select (`clients_select_scoped`) before any AI call or file read, same boundary `generateChecklistFromFiles`/`validateCardAgainstChecklist` already use |
| T-nnw-03 | Tampering | AI's `tool_use` output used to create real database pieces via `createPiece` | mitigate | `packagePiecesProposalSchema.safeParse` re-validates shape/length before the proposal is ever returned to the client component; the PM's own review/remove step (D-3) is a second, human gate before any write happens at all; `createPieceSchema` re-validates again inside `createPiece` itself |
| T-nnw-04 | Denial of Service | Unbounded pasted-text length inflating AI cost/latency per call | mitigate | `proposePackagePiecesSchema.max(PLANNING_DOC_MAX_LENGTH)` rejects oversized input before the Anthropic call is ever made (Pitfall 2) |
| T-nnw-05 | Tampering | `createPiece`'s new optional `description` field could let a caller write a longer description than before | mitigate | Unchanged 5000-char cap, identical to `createCardSchema`'s own description limit, enforced by the same `createPieceSchema.safeParse` gate every `createPiece` call already goes through |
| T-nnw-SC | Tampering | npm/pip/cargo installs | n/a | Zero new dependency — no `package.json` change in this plan |
</threat_model>

<verification>
1. `npx tsc --noEmit` and `npx eslint .` are clean across all 5 modified/created files.
2. `npm test` passes, including the 3 new `lib/cards/package-proposal.test.ts` cases.
3. `npm run build` succeeds.
4. `proposePackagePieces` writes nothing to the database on its own (confirmed by code review + grep during Task 2's verify step) — only `createCard`/`createPiece`, called from the client component after explicit confirmation, ever write.
5. `createPiece` call sites: `PackageRow.handleAddPiece` (manual, title-only) continues to compile and behave identically with zero edits, since `description` is optional.
6. Task 4's live checkpoint approved by the developer.
</verification>

<success_criteria>
- A PM can generate, review, prune, and confirm a batch of AI-proposed pieces entirely inside the existing "Criar card" Dialog when Tipo = "Pacote" — no new Dialog, no new top-level button.
- The AI proposal never touches the database until explicit confirmation (D-4) — no intermediate table, state lives in React only.
- Confirmation creates exactly one Pacote plus one `createPiece` call per remaining piece, sequential (never parallel), each piece carrying its AI-authored description.
- `createPieceSchema`/`createPiece` gain an optional `description` field, additive only — the existing manual "Adicionar peça" call site requires zero changes.
- Generation failure and partial piece-creation failure are both shown explicitly, never silently swallowed.
- Creating a Pacote without ever touching the AI generator behaves exactly as it did before this plan.
- Full automated suite green: `tsc`, `eslint`, `npm test`, `npm run build`.
- Developer-approved live checkpoint (Task 4).
</success_criteria>

<output>
Create `.planning/quick/260811-nnw-item-2-do-p3-plano-de-a-o-2026-08-05-ger/260811-nnw-SUMMARY.md` when done
</output>
