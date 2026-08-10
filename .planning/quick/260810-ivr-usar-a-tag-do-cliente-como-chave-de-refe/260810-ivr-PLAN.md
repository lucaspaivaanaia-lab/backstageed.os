---
phase: quick/260810-ivr
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - lib/chat/assemble-prompt.ts
  - lib/chat/assemble-prompt.test.ts
  - lib/ai/extraction-prompt.ts
  - lib/ai/extraction-prompt.test.ts
  - lib/ai/structured-extraction.ts
  - app/api/chat/route.ts
  - lib/actions/checklist-templates.ts
  - lib/actions/client-files.ts
  - lib/actions/clients.ts
  - app/pm/board/actions.ts
autonomous: true
requirements: [QUICK-260810-ivr]

must_haves:
  truths:
    - "The chat system prompt (lib/chat/assemble-prompt.ts) identifies the active client primarily by its `tag` (public.clients.tag, migration 0025), rendered as a labeled reference code alongside — not instead of — the client's name"
    - "Every one-shot AI extraction prompt (checklist generation, checklist draft-on-upload, briefing autofill, transcript analysis, card-vs-checklist validation) identifies the client the same way — tag as a labeled reference code, via the shared lib/ai/extraction-prompt.ts module"
    - "Both prompt types contain an explicit instruction telling the model to use the reference code — not the name — as the real identification key, and to never confuse the client with other companies/people mentioned by name inside the client's own reference files"
    - "All 4 call-sites of runStructuredExtraction (checklist-templates.ts, client-files.ts, clients.ts, app/pm/board/actions.ts) re-read `tag` from public.clients via the SAME RLS-scoped query already used for `name` — never a caller-supplied or hardcoded value"
    - "Existing leakage-guard tests in assemble-prompt.test.ts and extraction-prompt.test.ts still pass (same assertions, fixtures extended with tag), plus new test cases proving the tag renders as the identifier and remains the identifier even when a client's own file mentions another client's name in full"
  artifacts:
    - path: "lib/chat/assemble-prompt.ts"
      provides: "Briefing type carries tag; briefingBlock renders it as the labeled reference code; main instruction preamble tells the model to use it as the real identification key"
      contains: "código de referência"
    - path: "lib/ai/extraction-prompt.ts"
      provides: "buildExtractionPrompt accepts clientTag and renders + instructs on it the same way as assemble-prompt.ts"
      contains: "clientTag: string"
    - path: "lib/ai/structured-extraction.ts"
      provides: "StructuredExtractionParams carries clientTag, forwarded to buildExtractionPrompt"
      contains: "clientTag: string"
    - path: "app/api/chat/route.ts"
      provides: "clients select includes tag, forwarded unchanged to assembleSystemPrompt(client, files)"
      contains: "id, name, tag, objective"
    - path: "lib/actions/checklist-templates.ts"
      provides: "proposeChecklistFromFiles/generateChecklistFromFiles/generateChecklistDraftFromFiles all re-read and forward tag"
      contains: "clientTag: client.tag"
    - path: "lib/actions/client-files.ts"
      provides: "resolveTranscriptTarget re-reads tag; runTranscriptAnalysis forwards it"
      contains: "clientTag: client.tag"
    - path: "lib/actions/clients.ts"
      provides: "autofillBriefingFromFiles re-reads and forwards tag"
      contains: "clientTag: client.tag"
    - path: "app/pm/board/actions.ts"
      provides: "validateCardAgainstChecklist re-reads and forwards tag"
      contains: "clientTag: client.tag"
  key_links:
    - from: "app/api/chat/route.ts"
      to: "lib/chat/assemble-prompt.ts (assembleSystemPrompt)"
      via: "client object from the RLS-scoped clients select, now including tag"
      pattern: "id, name, tag"
    - from: "lib/actions/checklist-templates.ts | lib/actions/client-files.ts | lib/actions/clients.ts | app/pm/board/actions.ts"
      to: "lib/ai/structured-extraction.ts (runStructuredExtraction)"
      via: "clientTag: client.tag passed alongside clientName: client.name"
      pattern: "clientTag: client\\.tag"
    - from: "lib/ai/structured-extraction.ts"
      to: "lib/ai/extraction-prompt.ts (buildExtractionPrompt)"
      via: "params.clientTag forwarded as the new second positional argument"
      pattern: "params\\.clientTag"
---

<objective>
Make the AI prompt-assembly layer identify the active client by `public.clients.tag` (a short, unique, unambiguous code — migration 0025, quick task 260810-g3f, already merged) instead of relying on `name` alone. This closes a real production bug: the AI mixed content from two clients because one client's own reference file mentioned more than one company/person by name, and the prompt's only identification signal (`name`) was ambiguous inside that file's own content.

This is item 3 of the 2026-08-05 Juliano P0/P1 action plan. The tag column, its uniqueness constraint, and its UI already exist and are populated for all 5 real clients — this plan only wires that existing column into the two prompt-assembly modules (chat's multi-turn system prompt, and the shared one-shot structured-extraction prompt) and every one of their call-sites.

Purpose: give the model a developer-controlled, unambiguous string to anchor client identification on, closing the specific failure mode where a common/ambiguous name embedded in a client's own uploaded file confused which client was the actual target.
Output: `assembleSystemPrompt` and `buildExtractionPrompt` both render and instruct on `tag` as the primary identifier; `runStructuredExtraction` and all 4 of its callers forward a freshly RLS-re-read `tag`; both modules' test suites gain leakage-guard coverage for the new field.
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
@$HOME/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/STATE.md
@CLAUDE.md
@lib/chat/assemble-prompt.ts
@lib/chat/assemble-prompt.test.ts
@lib/ai/extraction-prompt.ts
@lib/ai/extraction-prompt.test.ts
@lib/ai/structured-extraction.ts
@app/api/chat/route.ts
@lib/actions/checklist-templates.ts
@lib/actions/client-files.ts
@lib/actions/clients.ts
@app/pm/board/actions.ts

<baseline>
- `public.clients.tag` already exists, is `NOT NULL`, and is enforced unique case-insensitively (`clients_tag_key` on `lower(tag)`) — migration `0025_clients_tag.sql`, quick task 260810-g3f, merged 2026-08-10. This plan adds **zero** migrations, **zero** RLS changes, **zero** UI changes.
- Every `clients` query touched by this plan already selects `id, name` (or `id, name, ...`) and is RLS-scoped via `createClient()` (never `createAdminClient()`) — `tag` is simply added to the same `.select(...)` string; the RLS boundary (`clients_select_scoped`) is unchanged and already covers this column like every other one on the table.
- `buildExtractionPrompt`'s signature changes from `(clientName, files, instruction)` to `(clientName, clientTag, files, instruction)` — the two identity parameters are grouped together at the front, positional (no options-object refactor, keeping the diff minimal and matching this module's existing style).
- `StructuredExtractionParams` gains `clientTag: string` as a required sibling of the existing `clientName: string`. TypeScript will flag every caller that doesn't supply it — this is the intended forcing function to catch all 4 call-sites; do not add a default/optional fallback.
- `npm test` (`node --test lib/chat/*.test.ts lib/ai/*.test.ts ...`) already covers both test files touched by Task 1 — no `package.json` change needed.
</baseline>

<interfaces>
<!-- Exact current source of the 4 runStructuredExtraction call-sites Task 3 touches. Read once here — do not re-read these files during execution. -->

**`lib/actions/checklist-templates.ts` — 3 spots:**

`proposeChecklistFromFiles` signature and its `runStructuredExtraction` call (current):
```typescript
async function proposeChecklistFromFiles(client: {
  id: string;
  name: string;
}): Promise<GenerateChecklistResult> {
  ...
  const result = await runStructuredExtraction({
    clientName: client.name,
    files,
    instruction: "...",
    toolName: "propose_checklist",
    toolDescription: "...",
    inputSchema: { ... },
  });
```

`generateChecklistFromFiles` (Admin manual regenerate) — its client re-read and call to `proposeChecklistFromFiles`:
```typescript
  const { data: client } = await supabase
    .from("clients")
    .select("id, name")
    .eq("id", clientId)
    .single();
  if (!client) {
    return { error: "Cliente não encontrado." };
  }

  return proposeChecklistFromFiles({ id: client.id, name: client.name });
```

`generateChecklistDraftFromFiles` (automatic on-upload draft) — same shape, different function:
```typescript
  const { data: client } = await supabase
    .from("clients")
    .select("id, name")
    .eq("id", clientId)
    .single();
  if (!client) {
    return { error: "Cliente não encontrado." };
  }

  const proposalResult = await proposeChecklistFromFiles({
    id: client.id,
    name: client.name,
  });
```

**`lib/actions/client-files.ts` — 2 spots (shared by both transcript-analysis entry points):**

`resolveTranscriptTarget`'s clients re-read and return type:
```typescript
async function resolveTranscriptTarget(fileId: string): Promise<{
  file: { id: string; filename: string; content: string; client_id: string };
  client: { id: string; name: string };
} | null> {
  ...
  const { data: client } = await supabase
    .from("clients")
    .select("id, name")
    .eq("id", file.client_id)
    .single();
  if (!client) return null;

  return { file, client };
}
```

`runTranscriptAnalysis`'s signature and `runStructuredExtraction` call:
```typescript
async function runTranscriptAnalysis(
  file: { filename: string; content: string },
  client: { name: string },
  transcript: string
): Promise<AnalyzeTranscriptResult> {
  const result = await runStructuredExtraction({
    clientName: client.name,
    files: [ ... ],
    instruction: "...",
    toolName: "report_transcript_update",
    toolDescription: "...",
    inputSchema: { ... },
  });
```

**`lib/actions/clients.ts` — `autofillBriefingFromFiles`, 1 spot:**
```typescript
  const { data: client } = await supabase
    .from("clients")
    .select("id, name")
    .eq("id", clientId)
    .single();
  if (!client) {
    return { error: "Cliente não encontrado ou sem permissão." };
  }
  ...
  const result = await runStructuredExtraction({
    clientName: client.name,
    files,
    instruction: "...",
    toolName: "propose_briefing",
    toolDescription: "...",
    inputSchema: { ... },
  });
```

**`app/pm/board/actions.ts` — `validateCardAgainstChecklist`, 1 spot:**
```typescript
  const { data: client } = await supabase
    .from("clients")
    .select("id, name")
    .eq("id", card.client_id)
    .single();
  if (!client) return { error: CARD_NOT_FOUND_ERROR };
  ...
  const result = await runStructuredExtraction({
    clientName: client.name,
    files: [cardContentFile, ...(clientFiles ?? [])],
    instruction: "...",
    toolName: "report_validation",
    toolDescription: "...",
    inputSchema: { ... },
  });
```
</interfaces>
</context>

<tasks>

<task type="auto" tdd="true">
  <name>Task 1: Redefine the prompt contracts — tag as the client identifier, both modules</name>
  <files>lib/chat/assemble-prompt.ts, lib/chat/assemble-prompt.test.ts, lib/ai/extraction-prompt.ts, lib/ai/extraction-prompt.test.ts</files>
  <behavior>
    - `assembleSystemPrompt`: given a `Briefing` with `tag: "CLIENTE-A"`, the returned prompt matches `/código de referência: CLIENTE-A/` and still matches the existing `/Cliente A/` (name unchanged, additive not replacing).
    - `assembleSystemPrompt`: the returned prompt contains the anti-confusion instruction sentence (assert on a stable substring, e.g. `/NÃO as confunda com o cliente/`).
    - `assembleSystemPrompt`: existing leakage-guard negative assertions (never contains another client's name/fields) still pass with `tag` added to both fixtures.
    - `assembleSystemPrompt`: NEW — when Client A's own file content mentions Client B's name in full (e.g. "A reunião também citou o Cliente B e sua estratégia de skincare."), the prompt still renders Client A's tag as the labeled identifier and still contains the anti-confusion instruction — proving the prompt's structure anchors identification on the tag even when file content itself contains another client's literal name (expected/unavoidable file content, not a leak of Client A's own briefing data).
    - `buildExtractionPrompt`: given `clientTag: "CLIENTE-A"`, the returned prompt matches `/código de referência: CLIENTE-A/` and still matches the existing `/Cliente A/`.
    - `buildExtractionPrompt`: the returned prompt contains the same anti-confusion instruction sentence, positioned before the files block (mirrors the existing "Cliente: X" line's position — before content, not replacing the trusted task `instruction` param, which stays last).
    - `buildExtractionPrompt`: existing leakage-guard, empty-files-placeholder, and multi-file tests still pass with `clientTag` added as a new positional argument to every call.
    - `buildExtractionPrompt`: NEW — same "file mentions another client's name in full" scenario as assemble-prompt.ts, proving the tag remains the labeled identifier regardless.
  </behavior>
  <action>
    **`lib/chat/assemble-prompt.ts`:** Add `tag: string;` to the `Briefing` type, directly after `name: string;`. Change the `briefingBlock` array's first entry from `` `Cliente: ${client.name}` `` to `` `Cliente (código de referência: ${client.tag}): ${client.name}` ``. Extend the main preamble string (inside the final `return (...)`) by appending, after the existing "Não inclua marcadores de citação ou referências a fontes na resposta." sentence and before the trailing `\n\n${briefingBlock}${filesBlock}`, this instruction — keep it inside the same trusted preamble that already precedes `briefingBlock`/`filesBlock`; do not move it after the content, do not shorten it: "O cliente que você atende é identificado exclusivamente pelo código de referência indicado abaixo (não pelo nome). Se os arquivos de referência mencionarem outras empresas ou pessoas por nome, NÃO as confunda com o cliente — considere apenas o conteúdo relativo ao cliente identificado por esse código." Update the module's top doc comment: add one short paragraph noting quick task 260810-ivr changed the client-identification key from `name` to `tag` (`public.clients.tag`, migration 0025) to close the real production leakage bug caused by an ambiguous name mentioned inside a client's own file, and touch the existing `T-2-01` line to mention that `tag` is what makes identification unambiguous now.

    **`lib/chat/assemble-prompt.test.ts`:** Add `tag: "CLIENTE-A"` to the `CLIENT_A` fixture and `tag: "CLIENTE-B"` to `CLIENT_B` (also add `tag: "CLIENTE-C"` to the inline fixture in the null-fields test). Add the two NEW tests described in `<behavior>` above — do not remove or weaken any existing test, only add fixtures and new tests.

    **`lib/ai/extraction-prompt.ts`:** Change `buildExtractionPrompt`'s signature from `(clientName: string, files: ExtractionFile[], instruction: string)` to `(clientName: string, clientTag: string, files: ExtractionFile[], instruction: string)`. Change the first line of the returned template from `` `Cliente: ${clientName}\n\n` `` to `` `Cliente (código de referência: ${clientTag}): ${clientName}\n\n` `` followed immediately by the SAME anti-confusion instruction sentence used in assemble-prompt.ts (adapt only trailing punctuation/spacing to fit as its own paragraph), placed BEFORE `` `Arquivos de referência do cliente:\n${filesBlock}` `` and well before the trusted `` `---\n\n${instruction}` `` tail — the task-specific `instruction` param must remain the LAST thing in the returned string, unchanged in position, since that ordering (task instruction after all content) is this module's own prompt-injection-resistance pattern and must not be weakened. Update the module's top doc comment the same way as assemble-prompt.ts's (short paragraph noting the `tag`-based identification change, quick task 260810-ivr).

    **`lib/ai/extraction-prompt.test.ts`:** Add a `clientTag` argument (e.g. `"CLIENTE-A"` / `"CLIENTE-B"`) to every existing `buildExtractionPrompt(...)` call, matching each call's existing `clientName`. Add the two NEW tests described in `<behavior>` above — do not remove or weaken any existing test.
  </action>
  <verify>
    <automated>cd /Users/lucaspaiva/projects/backstageed.OS && npx tsc --noEmit 2>&1 | tail -40</automated>
    <automated>cd /Users/lucaspaiva/projects/backstageed.OS && npx eslint lib/chat/assemble-prompt.ts lib/chat/assemble-prompt.test.ts lib/ai/extraction-prompt.ts lib/ai/extraction-prompt.test.ts 2>&1 | tail -40</automated>
    <automated>cd /Users/lucaspaiva/projects/backstageed.OS && node --test lib/chat/assemble-prompt.test.ts lib/ai/extraction-prompt.test.ts 2>&1 | tail -60</automated>
  </verify>
  <done>`tsc --noEmit` and `eslint` are clean on all 4 files. `node --test` reports 0 failures across both test files, including the existing leakage-guard tests (fixtures now carrying `tag`) and the 4 new tests (2 per module: tag renders as identifier; tag remains the identifier when file content mentions another client's name in full). `Briefing` has `tag: string`; `buildExtractionPrompt`'s signature is `(clientName, clientTag, files, instruction)`.</done>
</task>

<task type="auto">
  <name>Task 2: Wire tag through the structured-extraction engine and the chat route</name>
  <files>lib/ai/structured-extraction.ts, app/api/chat/route.ts</files>
  <action>
    **`lib/ai/structured-extraction.ts`:** Add `clientTag: string;` to `StructuredExtractionParams`, directly after `clientName: string;`. In `runStructuredExtraction`'s body, change the `buildExtractionPrompt(...)` call from `buildExtractionPrompt(params.clientName, params.files, params.instruction)` to `buildExtractionPrompt(params.clientName, params.clientTag, params.files, params.instruction)`, matching Task 1's new signature exactly.

    **`app/api/chat/route.ts`:** Change the `clients` `.select(...)` string from `"id, name, objective, tone_of_voice, target_audience, content_pillars"` to `"id, name, tag, objective, tone_of_voice, target_audience, content_pillars"`. No other line in this file changes — the `client` object returned by that query is passed directly to `assembleSystemPrompt(client, files)` on the existing line, and now satisfies Task 1's extended `Briefing` type (which requires `tag`) without any further edit.
  </action>
  <verify>
    <automated>cd /Users/lucaspaiva/projects/backstageed.OS && npx tsc --noEmit 2>&1 | tail -40</automated>
    <automated>cd /Users/lucaspaiva/projects/backstageed.OS && npx eslint lib/ai/structured-extraction.ts app/api/chat/route.ts 2>&1 | tail -40</automated>
    <automated>cd /Users/lucaspaiva/projects/backstageed.OS && grep -n "clientTag: string" lib/ai/structured-extraction.ts &amp;&amp; grep -n "params.clientTag" lib/ai/structured-extraction.ts &amp;&amp; grep -n '"id, name, tag, objective' app/api/chat/route.ts</automated>
  </verify>
  <done>`tsc --noEmit` and `eslint` are clean on both files (this also proves every existing caller of `runStructuredExtraction` now fails to typecheck until Task 3 updates them — expected, sequential dependency within this same plan). `StructuredExtractionParams` requires `clientTag`; `buildExtractionPrompt` is called with 4 positional arguments in the new order. The chat route's `clients` select includes `tag`.</done>
</task>

<task type="auto">
  <name>Task 3: Forward tag from all 4 runStructuredExtraction call-sites</name>
  <files>lib/actions/checklist-templates.ts, lib/actions/client-files.ts, lib/actions/clients.ts, app/pm/board/actions.ts</files>
  <action>
    **`lib/actions/checklist-templates.ts`:** Change `proposeChecklistFromFiles`'s parameter type from `client: { id: string; name: string }` to `client: { id: string; name: string; tag: string }`, and add `clientTag: client.tag,` to its `runStructuredExtraction({...})` call, directly after `clientName: client.name,`. In `generateChecklistFromFiles`, change `.select("id, name")` to `.select("id, name, tag")` and the `proposeChecklistFromFiles({ id: client.id, name: client.name })` call to `proposeChecklistFromFiles({ id: client.id, name: client.name, tag: client.tag })`. In `generateChecklistDraftFromFiles`, make the identical change: `.select("id, name")` → `.select("id, name, tag")`, and add `tag: client.tag,` to its `proposeChecklistFromFiles({...})` call.

    **`lib/actions/client-files.ts`:** In `resolveTranscriptTarget`, change the clients `.select("id, name")` to `.select("id, name, tag")` and widen its return type's `client` field from `{ id: string; name: string }` to `{ id: string; name: string; tag: string }`. Change `runTranscriptAnalysis`'s `client` parameter type from `{ name: string }` to `{ name: string; tag: string }`, and add `clientTag: client.tag,` to its `runStructuredExtraction({...})` call, directly after `clientName: client.name,`.

    **`lib/actions/clients.ts`:** In `autofillBriefingFromFiles`, change `.select("id, name")` to `.select("id, name, tag")`, and add `clientTag: client.tag,` to the `runStructuredExtraction({...})` call, directly after `clientName: client.name,`.

    **`app/pm/board/actions.ts`:** In `validateCardAgainstChecklist`, change the `clients` `.select("id, name")` to `.select("id, name, tag")`, and add `clientTag: client.tag,` to the `runStructuredExtraction({...})` call, directly after `clientName: client.name,`.

    None of these 4 files gain a new authorization check or RLS-boundary change — every `tag` re-read rides the SAME `.select(...)` call (and therefore the SAME `clients_select_scoped` RLS policy) that already reads `name` in that exact spot, per D-01 of this plan's threat model.
  </action>
  <verify>
    <automated>cd /Users/lucaspaiva/projects/backstageed.OS && npx tsc --noEmit 2>&1 | tail -40</automated>
    <automated>cd /Users/lucaspaiva/projects/backstageed.OS && npx eslint lib/actions/checklist-templates.ts lib/actions/client-files.ts lib/actions/clients.ts app/pm/board/actions.ts 2>&1 | tail -40</automated>
    <automated>cd /Users/lucaspaiva/projects/backstageed.OS && grep -c "clientTag: client.tag" lib/actions/checklist-templates.ts lib/actions/client-files.ts lib/actions/clients.ts app/pm/board/actions.ts</automated>
    <automated>cd /Users/lucaspaiva/projects/backstageed.OS && grep -c "tag: client.tag" lib/actions/checklist-templates.ts</automated>
    <automated>cd /Users/lucaspaiva/projects/backstageed.OS && npm run build 2>&1 | tail -60</automated>
    <automated>cd /Users/lucaspaiva/projects/backstageed.OS && npm test 2>&1 | tail -80</automated>
  </verify>
  <done>`tsc --noEmit`, `eslint`, and `npm run build` are all clean project-wide — the intentional Task-2 typecheck break is fully resolved by these 4 files. Each of the 4 files shows exactly one `clientTag: client.tag` occurrence (`grep -c "clientTag: client.tag"` returns 1 for checklist-templates.ts, 1 for client-files.ts, 1 for clients.ts, 1 for board/actions.ts). checklist-templates.ts additionally shows 2 occurrences of `tag: client.tag` (`grep -c "tag: client.tag" lib/actions/checklist-templates.ts` returns 2) — the two `proposeChecklistFromFiles({...})` calls in `generateChecklistFromFiles` and `generateChecklistDraftFromFiles`, which use the literal `tag`, not `clientTag`, because `proposeChecklistFromFiles`'s own parameter type is `{ id: string; name: string; tag: string }`. `npm test` passes with 0 failures, including Task 1's extended `assemble-prompt.test.ts`/`extraction-prompt.test.ts` leakage-guard suites.</done>
</task>

</tasks>

<threat_model>
## Trust Boundaries

| Boundary | Description |
|----------|-------------|
| `public.clients.tag`/`name` → prompt text (both modules) | Both fields are always server-derived from an RLS-scoped `clients` read at request time — never supplied by the browser, never taken from `client_files` content |
| client's own uploaded file content → model context | Untrusted-by-nature (a client can upload anything, including text that names other companies/people) — the model must not treat any string found there as authoritative client identification |
| `runStructuredExtraction` callers → `StructuredExtractionParams.clientTag` | 4 call-sites, each independently re-reading `tag` via its own RLS-scoped query — no shared/cached client object is passed between requests |

## STRIDE Threat Register

| Threat ID | Category | Component | Disposition | Mitigation Plan |
|-----------|----------|-----------|-------------|-----------------|
| T-ivr-01 | Spoofing | Prompt identification signal | mitigate | `tag` (and `name`) are read ONLY from the RLS-scoped `clients` row at request time, in all 5 touched call paths (chat route + 4 extraction call-sites) — never from `client_files` content, request body, or any other caller-influenced source, so a client's own uploaded file cannot spoof a different identification code |
| T-ivr-02 | Information Disclosure | Cross-client content leakage via ambiguous name (the actual production bug this plan closes) | mitigate | Both prompt-assembly modules now render `tag` as a labeled, explicit reference code and instruct the model to anchor identification on it, not on `name` — directly targets the root cause (a common/ambiguous name appearing inside a client's own file); leakage-guard tests extended in Task 1 assert the tag renders correctly and the instruction is present even when a file names another client in full |
| T-ivr-03 | Tampering | `buildExtractionPrompt`'s instruction ordering (prompt-injection resistance) | mitigate | This plan preserves the module's existing pattern: the trusted, task-specific `instruction` parameter remains the LAST content in the assembled prompt, after all client/file data — the new identification sentence is inserted alongside the existing "Cliente: X" line (already positioned before content, unchanged position), never displacing or moving the trusted instruction earlier |
| T-ivr-04 | Tampering | `assemble-prompt.ts`'s preamble-before-content ordering | accept | Unchanged from before this plan — the added identification sentence is appended within the SAME trusted preamble block that already precedes `briefingBlock`/`filesBlock` in the existing code; no reordering of instructions relative to content is introduced by this plan |
| T-ivr-05 | Elevation of Privilege | 4 call-sites' `tag` re-read | accept | Each of the 4 call-sites adds `tag` to a `.select(...)` string that ALREADY selects `name` from the same RLS-scoped `clients` query at that exact point in the code — no new query, no new authorization boundary, no privilege change; `clients_select_scoped` already governs this column like every other one |
| T-ivr-SC | Tampering | npm/pip/cargo installs | n/a | No package installs in this plan — zero dependency or `package.json` changes |
</threat_model>

<verification>
1. `npx tsc --noEmit` and `npx eslint` clean across all 10 touched files.
2. `npm run build` succeeds (proves no type/build regression from the `StructuredExtractionParams.clientTag` forcing-function change propagating through all 4 callers).
3. `npm test` passes with 0 failures, including the extended leakage-guard suites in `assemble-prompt.test.ts` and `extraction-prompt.test.ts`.
4. `grep -c "clientTag: client.tag"` across the 4 Task-3 files shows 1 occurrence in each of the 4 files; a separate `grep -c "tag: client.tag" lib/actions/checklist-templates.ts` shows 2 occurrences — the two `proposeChecklistFromFiles({...})` calls in `generateChecklistFromFiles` and `generateChecklistDraftFromFiles`, which use the literal `tag`, not `clientTag`, because `proposeChecklistFromFiles`'s own parameter type is `{ id: string; name: string; tag: string }`.
5. `grep -n "código de referência"` in `lib/chat/assemble-prompt.ts` and `lib/ai/extraction-prompt.ts` both match.
</verification>

<success_criteria>
- `assembleSystemPrompt` renders the client's `tag` as a labeled reference code and instructs the model to use it — not `name` — as the real identification key.
- `buildExtractionPrompt` does the same, with the trusted task `instruction` parameter still positioned last, after all content.
- `StructuredExtractionParams` requires `clientTag`; `runStructuredExtraction` forwards it to `buildExtractionPrompt` unchanged.
- All 4 `runStructuredExtraction` callers (checklist generation, checklist draft-on-upload, briefing autofill, transcript analysis, card validation) re-read `tag` from the same RLS-scoped `clients` query already reading `name`, and forward it.
- The chat route's `clients` select includes `tag`.
- Zero migrations, zero RLS changes, zero UI changes — confirmed by `files_modified` matching exactly the 10 files in this plan's frontmatter.
- `tsc`/`eslint`/`build`/`test` all green.
</success_criteria>

<output>
Create `.planning/quick/260810-ivr-usar-a-tag-do-cliente-como-chave-de-refe/260810-ivr-SUMMARY.md` when done
</output>
</content>
