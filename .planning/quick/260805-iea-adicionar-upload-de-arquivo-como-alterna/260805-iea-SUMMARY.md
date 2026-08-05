---
phase: quick-260805-iea
plan: 01
subsystem: ui
tags: [client-files, transcript-analysis, ai, server-actions, upload]

# Dependency graph
requires:
  - phase: quick-260722-hnm
    provides: "lib/extract/extract-text.ts (extractDocumentText/UnreadableFileError/ClientFileType), lib/actions/client-files.ts's MAX_FILE_BYTES/ALLOWED_EXTENSIONS/extensionOf and the uploadClientFile validation pattern this plan mirrors"
  - phase: quick-260805-P2-pivot
    provides: "analyzeTranscriptAgainstFile / updateClientFileContent / TranscriptUpdateSection — the pasted-text meeting-transcript update flow this plan adds a second entry path to"
provides:
  - "analyzeTranscriptFileAgainstFile — new Server Action accepting a transcript file (PDF/TXT/MD/DOCX) via FormData, reusing the same AI analysis as the pasted-text path"
  - "Private helpers resolveTranscriptTarget/runTranscriptAnalysis extracted from analyzeTranscriptAgainstFile, now shared by both entry paths"
  - "Second, visually secondary entry control in TranscriptUpdateSection (hidden-input + Button pattern) that fires analysis on file selection"
affects: [client-files, transcript-update-section]

# Tech tracking
tech-stack:
  added: []
  patterns: ["Private (non-exported) helper functions in a \"use server\" file to share logic between two exported Server Actions without violating the async-export-only constraint", "Authorize (RLS) before doing expensive parsing work, to avoid burning CPU on an unreachable fileId"]

key-files:
  created: []
  modified:
    - lib/actions/client-files.ts
    - components/clients/transcript-update-section.tsx

key-decisions:
  - "resolveTranscriptTarget/runTranscriptAnalysis kept as private (non-exported) functions, per the file's \"use server\" constraint that every export must be an async Server Action"
  - "analyzeTranscriptAgainstFile's own doc comment and function signature were left in their ORIGINAL file position (only its body was replaced with calls to the two new helpers), with the new private helpers placed AFTER it and relying on function-declaration hoisting — this kept the plan's diff-based regression gates (updateClientFileContent / analyzeTranscriptAgainstFile signature must show 0 diff lines) satisfied, since git's diff algorithm matches unmoved, byte-identical lines as unchanged context rather than delete+add"
  - "Authorization (resolveTranscriptTarget) runs before file text extraction in analyzeTranscriptFileAgainstFile, per plan T-iea-02: parsing a PDF/DOCX up to 5MB is the most expensive step, so an unauthorized/invalid fileId is rejected before any bytes are parsed"

requirements-completed: []

# Metrics
duration: ~25min (Tasks 1-2 only; Task 3 human-verify checkpoint still pending)
completed: 2026-08-05
---

# Quick Task 260805-iea: Add file-upload as alternative to the transcript textarea Summary

**Server-side: analyzeTranscriptFileAgainstFile (new) + analyzeTranscriptAgainstFile (refactored, behavior-identical) sharing private resolveTranscriptTarget/runTranscriptAnalysis helpers. Client-side: a secondary hidden-input + Button upload control next to the existing textarea, firing analysis on file selection, converging on the same review/confirm flow.**

## Performance

- **Duration:** ~25 min (Task 1 + Task 2 code work only)
- **Tasks:** 2/2 automated tasks complete; Task 3 (blocking checkpoint:human-verify) NOT executed — per explicit dispatch instructions, this agent stops here and returns control without attempting browser verification
- **Files modified:** 2

## Accomplishments
- `lib/actions/client-files.ts`: extracted 4 file-validation error messages to shared module constants (`FILE_SELECT_ERROR`/`FILE_FORMAT_ERROR`/`FILE_TOO_LARGE_ERROR`/`FILE_UNREADABLE_ERROR`), byte-identical to the literals previously inline in `uploadClientFile`
- Extracted `resolveTranscriptTarget` (RLS resolve of file+client) and `runTranscriptAnalysis` (the `runStructuredExtraction` call + response validation) as private helpers, shared by both `analyzeTranscriptAgainstFile` (pasted text) and the new `analyzeTranscriptFileAgainstFile` (uploaded file)
- New exported Server Action `analyzeTranscriptFileAgainstFile(fileId, formData)`: validates file presence/extension/size, authorizes via `resolveTranscriptTarget` BEFORE extracting text (T-iea-02: avoid burning CPU parsing an unreachable fileId), extracts text via the existing `extractDocumentText`, then reuses `runTranscriptAnalysis` — zero new writes (`.insert(`/`.update(`/`.upsert(` counts frozen at 1/1/0, exactly the pre-existing baseline)
- `components/clients/transcript-update-section.tsx`: added a secondary "ou" + hidden `<input type="file">` + "Enviar arquivo de transcrição" `Button` (same hidden-input + visible-Button pattern already used in `client-files-section.tsx`) below the unchanged "Analisar transcrição" button; selecting a file fires the analysis immediately (no second click), reusing the existing `isAnalyzing`/`startAnalyzeTransition` state with a new `analyzingSource` flag to distinguish the "Analisando..." (text) vs "Analisando arquivo..." (file) labels
- Both entry paths share the single existing `<ErrorBox>` for `analyzeError` and converge on the same `analysis`/`draftContent` review + "Confirmar atualização"/"Descartar" flow — `updateClientFileContent` untouched (0 lines in diff)

## Task Commits

Each task was committed atomically:

1. **Task 1: Extrair a análise para um helper compartilhado e adicionar a Server Action que aceita arquivo** - `1dfdb6e` (feat)
2. **Task 2: Adicionar o controle de upload de transcrição ao lado do textarea existente** - `f404579` (feat)

**Plan/pre-dispatch:** `acfef57` (fix: add write-call-count gate to Task 1 verify — pre-existing base commit for this worktree); this SUMMARY committed separately, after both task commits.

3. **Task 3: Verificação humana ao vivo dos DOIS caminhos** - NOT executed (blocking checkpoint:human-verify, requires real Supabase session + real Claude API call + live inspection of `client_files`; out of scope for this agent per dispatch instructions)

## Files Created/Modified
- `lib/actions/client-files.ts` - `analyzeTranscriptFileAgainstFile` (new export), `resolveTranscriptTarget`/`runTranscriptAnalysis` (new private helpers), `analyzeTranscriptAgainstFile` refactored to call the helpers (signature/doc-comment/behavior unchanged), 4 shared error-message constants
- `components/clients/transcript-update-section.tsx` - `handleTranscriptFileSelected` handler, `transcriptFileInputRef` + `analyzingSource` state, hidden-input + secondary Button in the entry-path render, `handleDiscard` clears the file input, `DataCard` description mentions the file-upload alternative, doc comment updated

## Decisions Made
- Kept `analyzeTranscriptAgainstFile`'s doc comment and signature in their original file position rather than moving them below the new helpers — this was necessary to satisfy the plan's literal diff-based regression gates (`updateClientFileContent` / `export async function analyzeTranscriptAgainstFile` must show 0 added/removed lines in the diff). Placing the private helpers AFTER it (relying on function-declaration hoisting, valid in TS/JS) achieved both the required code structure and a minimal, gate-passing diff.
- No deviation from the plan's design: `resolveTranscriptTarget`/`runTranscriptAnalysis` are private (non-exported), the write-count gate (1 insert / 1 update / 0 upsert) is unchanged, the prompt/schema inside `runTranscriptAnalysis` are byte-identical to the original (confirmed via `git diff` showing zero changed lines in the `instruction`/`toolName`/`toolDescription`/`inputSchema` block — only the `console.error` tag changed, as explicitly permitted by the plan).

## Deviations from Plan

None - plan executed exactly as written for Tasks 1 and 2. Both tasks' `<verify><automated>` gates passed in full:
- Task 1: all grep-based structural/message/write-count gates passed (1 `.insert(`, 1 `.update(`, 0 `.upsert(`); `git diff` scope gates (`updateClientFileContent`, `atFileLimit`, exported signature) all showed 0 matching lines; `npx tsc --noEmit`, `npm run lint` (0 errors, 3 pre-existing unrelated warnings), `npm test` (78/78 pass) all green; no file outside `lib/actions/client-files.ts` touched
- Task 2: all grep-based structural gates passed (single `<ErrorBox>` pair, single hidden `type="file"` input, `useTransition`/`startAnalyzeTransition` reused 3x each, placeholder/disabled logic unchanged); `npx tsc --noEmit`, `npm run lint`, `npm run build` all green; overall diff since the pre-dispatch commit (`acfef57`) touches exactly the 2 planned files: `lib/actions/client-files.ts` and `components/clients/transcript-update-section.tsx`

**Environment note (not a plan deviation):** this worktree had no `node_modules` at start (documented as a known quirk in the dispatch instructions) — resolved with `npm ci` before running `npm run build` (tsc/lint/test happened to succeed even before `npm ci`, likely via a shared/cached resolution; `npm run build` failed with a Turbopack workspace-root error until `npm ci` populated `node_modules` locally, after which the build succeeded cleanly).

## Issues Encountered

One self-correction during Task 1: an initial version of the refactor placed the two new private helpers BEFORE `analyzeTranscriptAgainstFile` in the file, which shifted that function's position and caused git's diff algorithm to represent its (byte-identical) doc comment and signature as removed+re-added rather than unchanged — breaking the plan's `git diff` regression gates (`updateClientFileContent` count and `export async function analyzeTranscriptAgainstFile` count both had to be exactly 0). Fixed by moving the private helpers to AFTER `analyzeTranscriptAgainstFile` instead (valid due to function-declaration hoisting), which restored the original function's position and made the gates pass. This was caught and corrected before the Task 1 commit — no bad commit was made.

## Human-Check — PENDING (Task 3, blocking)

Task 3 is a `checkpoint:human-verify` gate marked `gate="blocking"` in the plan. It requires a real Supabase session (PM/Admin login), a real test client with a real base file, a real Claude API call, and live inspection of `client_files` to confirm the uploaded transcript file is never persisted. This cannot be automated and was explicitly excluded from this agent's scope by the dispatch instructions — the full 21-step `<how-to-verify>` roteiro (sections A-E: pasted-text regression check, file-upload path end-to-end, non-persistence proof, error-surface check, and test-data cleanup) is documented in the PLAN.md and awaits the developer's live run.

**Do not consider this quick task closed until Task 3 is approved.**

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

Tasks 1-2 (all code changes) are complete, committed, and pass every automated gate in the plan. Task 3 (live human verification) is the only remaining step — once approved, this quick task can be closed with no further code changes expected.

---
*Phase: quick-260805-iea*
*Completed: 2026-08-05 (Tasks 1-2 only; Task 3 pending)*

## Self-Check: PASSED

- FOUND: lib/actions/client-files.ts
- FOUND: components/clients/transcript-update-section.tsx
- FOUND: .planning/quick/260805-iea-adicionar-upload-de-arquivo-como-alterna/260805-iea-PLAN.md
- FOUND: .planning/quick/260805-iea-adicionar-upload-de-arquivo-como-alterna/260805-iea-SUMMARY.md
- FOUND commit: 1dfdb6e
- FOUND commit: f404579
