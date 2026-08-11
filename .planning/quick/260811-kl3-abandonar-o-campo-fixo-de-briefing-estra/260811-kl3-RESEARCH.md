# Quick Task 260811-kl3: Briefing livre por IA - Research

**Researched:** 2026-08-11
**Domain:** Schema migration + shared AI-extraction engine + React Hook Form UI (single Next.js/Supabase codebase, no external library research needed)
**Confidence:** HIGH — every finding below is grounded in this repo's own code and an exact same-shape precedent migration, not external docs.

## Summary

This is a small, well-precedented refactor entirely internal to this codebase. All four touched files (`lib/validation/clients.ts`, `lib/actions/clients.ts`, `components/clients/client-detail-form.tsx`, `lib/chat/assemble-prompt.ts`) plus four read-sites (`app/pm/clients/page.tsx`, `app/pm/clients/[id]/page.tsx`, `app/admin/clients/page.tsx`, `app/admin/clients/[id]/page.tsx`, `app/api/chat/route.ts`) currently select/reference the four fixed columns explicitly by name — there is no dynamic/reflective access, so every call-site is a straightforward grep-and-replace, not a design problem.

The DB side has an exact precedent: migration `0012_drop_tropicalia_project_id.sql` already drops a column from `public.clients` with a one-line comment confirming no RLS policy change is needed (`clients_update_scoped`/`clients_select_scoped` are row-level, not column-level, so they automatically cover any new column). The shared AI-extraction engine (`runStructuredExtraction`/`buildExtractionPrompt`) needs **zero internal changes** — it already accepts an arbitrary `inputSchema`; a single-string-property JSON Schema is a valid input today, so `autofillBriefingFromFiles` becomes a smaller version of its current call, not a new code path. `assemble-prompt.ts`'s `briefingBlock` collapses from a 4-line labelled list to a single conditional block with a "Briefing estratégico:" label. The UI swap replaces the 3-`Textarea`-plus-`useFieldArray`-badges block with one `Textarea` bound to a single string field — the "Salvo"/`isDirty`/`justSavedBriefing` pattern is untouched, since it does not care how many fields the form has.

**Primary recommendation:** Single new migration (`0027_clients_briefing_text.sql`) that drops the 4 old columns and adds one new `text` column (no RLS change, no backfill — confirmed by CONTEXT.md). Update `briefingSchema` to one `z.string()` field. Keep `autofillBriefingFromFiles` calling `runStructuredExtraction` unchanged in shape, just with a 1-property `inputSchema` and a rewritten `instruction` string. Update all 5 read-site column lists and the 2 "is briefing empty" checks. Update `assemble-prompt.test.ts` fixtures (breaking change to `Briefing` type, tests will not compile without this).

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Briefing storage (single markdown text) | Database (Supabase Postgres) | — | Same tier as today's 4 columns — no architecture change, only column shape |
| Briefing edit form | Frontend Server (Next.js Server Component page + Client Component form) | — | Unchanged: page fetches, `ClientDetailForm` (Client Component) renders/submits |
| Briefing validation | API/Backend (Server Action `updateBriefing`) | — | zod-parsed before any privileged write, same as today |
| AI proposal generation | API/Backend (`runStructuredExtraction`, calls Claude API) | — | Unchanged tier; only the tool's `inputSchema` shape changes |
| Prompt injection of briefing into chat | API/Backend (`assemble-prompt.ts`, invoked server-side in the chat Route Handler) | — | Unchanged tier; only the rendering of one field vs four |

## User Constraints (from CONTEXT.md)

### Locked Decisions
- Formato de armazenamento: um único campo de texto livre (Markdown), não JSON com chaves dinâmicas. A IA escreve o briefing como um documento com suas próprias seções (`## Objetivo`, `## Tom de voz`, etc.) dentro do texto, sem schema fixo no banco.
- Migração dos clientes existentes: todos os clientes atuais são dados de teste — **nenhuma lógica de backfill/conversão é necessária**. A migração pode dropar `objective`/`tone_of_voice`/`target_audience`/`content_pillars` e adicionar a nova coluna sem preservar conteúdo antigo. **As linhas de `clients` em si NÃO são apagadas** — só o conteúdo do briefing antigo é descartado; o novo campo fica vazio até alguém preencher de novo.
- Edição: um `Textarea` grande (Markdown) — mesmo padrão simples de "Salvar briefing" já existente, editando o documento inteiro como texto único.

### Claude's Discretion
- Nome exato da nova coluna/campo (ex: `briefing_text`, `strategic_briefing`).
- Se o botão "Autofill" continua existindo como está (IA propõe, PM revisa) ou muda de forma — deve seguir o mesmo padrão "IA propõe, humano confirma".
- Tratamento de `content_pillars` na transição — vira só mais uma seção do texto livre, a critério do planner.

### Deferred Ideas (OUT OF SCOPE)
- Nenhuma ideia explicitamente adiada foi registrada em CONTEXT.md para esta quick task.

## Findings

### 1. Migration format — dropping 4 columns + adding 1 free-text column

**Exact precedent exists:** `supabase/migrations/0012_drop_tropicalia_project_id.sql` [VERIFIED: read from repo] drops a column from `public.clients` with this reasoning comment:

```sql
-- Remove por completo a coluna tropicalia_project_id de public.clients --
-- ... A migration original 0006_clients_full_record.sql que introduziu a coluna
-- NAO e editada (historico preservado).

alter table public.clients drop column tropicalia_project_id;
```

The original 4-column migration (`0006_clients_full_record.sql`) is likewise never edited retroactively — new migrations only add/drop.

**RLS confirmation:** `0007_clients_rls_fix.sql` defines `clients_update_scoped` as a row-level policy (`using (is_admin() OR id in pm_assigned_clients()) with check (same)`) — it has no column list, so it automatically covers whatever columns exist on the row, including a brand-new one. This is confirmed again by comments in `0025_clients_tag.sql` ("the existing clients_select_scoped/clients_update_scoped policies already cover reads/writes of this new column like every other column on this table. No new policy needed.") [VERIFIED: read from repo]. **No new RLS policy is needed for the new briefing column.**

**Recommended migration** (`supabase/migrations/0027_clients_briefing_text.sql`, next sequence number after `0026_shared_knowledge_files.sql`):

```sql
-- Quick task 260811-kl3: abandon the 4 fixed strategic-briefing columns in
-- favor of a single free-text Markdown field, with the AI proposing its
-- own document structure instead of fixed JSON keys.
--
-- No backfill: every current client row is confirmed test/fake data (user
-- decision, 2026-08-11, CONTEXT.md) -- old objective/tone_of_voice/
-- target_audience/content_pillars content is intentionally discarded, not
-- migrated into the new column. Client ROWS themselves are untouched --
-- only these 4 columns are dropped and replaced.
--
-- RLS is already enabled on public.clients (0002_clients_stub.sql). Neither
-- DROP COLUMN nor ADD COLUMN disables RLS or requires a new policy --
-- clients_select_scoped/clients_update_scoped (0004/0007) are row-level,
-- with no column list, so they automatically cover the new column exactly
-- like every other column on this table (same precedent noted in
-- 0025_clients_tag.sql). The original 0006_clients_full_record.sql migration
-- that introduced these 4 columns is NOT edited (history preserved), same
-- precedent as 0012_drop_tropicalia_project_id.sql.

alter table public.clients
  drop column objective,
  drop column tone_of_voice,
  drop column target_audience,
  drop column content_pillars,
  add column briefing text;
```

Naming: recommend `briefing` (short, matches `clients.tag`-style brevity already used in this table) or `briefing_text` if the planner prefers an unambiguous suffix consistent with `tone_of_voice`/`target_audience`'s snake_case descriptiveness. Either is fine — no existing convention strongly favors one over the other in this table.

**Grants:** `0008_clients_grants.sql` already does `grant select, insert, update on public.clients to authenticated` at the table level (no per-column grants exist anywhere in this schema) — no new grant migration needed.

### 2. Shared extraction engine — free text vs. forced single-field JSON Schema

**Recommendation: keep the existing tool-forced pattern, with a 1-property `inputSchema`. Do not add a free-text (no-tool-forcing) code path.**

`runStructuredExtraction` (`lib/ai/structured-extraction.ts`) [VERIFIED: read from repo] takes `inputSchema: Record<string, unknown>` as a plain parameter — it is not coupled to any particular field count or shape. A JSON Schema with exactly one string property is a completely normal, valid `input_schema` for Claude's tool-use API; nothing about the SDK or the tool-forcing mechanism requires more than one field. Concretely:

```ts
inputSchema: {
  type: "object",
  properties: {
    briefing: {
      type: "string",
      description: "Briefing estratégico completo, em Markdown, com suas próprias seções.",
    },
  },
  required: ["briefing"],
},
```

This is strictly less risky than adding a second, free-text (non-tool-forced) call path to the shared engine, for three concrete reasons found in this codebase:

1. **The engine's doc comment is an explicit invariant**: "there is exactly ONE place that calls the Anthropic API in tool-forced mode, never a second copy per feature." Introducing a free-text branch inside `runStructuredExtraction` (or a second function) breaks that invariant for no functional gain — a 1-property schema achieves the identical outcome (a plain string) through the exact same guaranteed-shape mechanism already relied on by `checklist-templates.ts` and `board/actions.ts`.
2. **Guaranteed shape, no parsing risk**: forced tool-use guarantees `toolUse.input` matches the schema — for a single string field this means `result.data` is reliably `{ briefing: "..." }`, with no markdown-fence-stripping or `JSON.parse` best-effort logic needed. A free-text completion would require inventing new parsing/validation code this codebase does not currently have anywhere.
3. **Downstream validation unchanged**: `autofillBriefingFromFiles` already re-validates `result.data` against a zod schema before returning it to the caller ("the caller still re-validates the result with its own Zod schema... matching Security Domain V5 input validation" — engine's own doc comment). A single-field zod schema (`z.object({ briefing: z.string() })` or similar) is a direct, minimal edit of `briefingSchema`, not new machinery.

**Prompt instruction rewrite** (replaces the current 4-field instruction in `lib/actions/clients.ts`'s `autofillBriefingFromFiles`): instruct the model to write ONE Markdown document proposing its own section headings (e.g. `## Objetivo`, `## Tom de voz`, `## Público-alvo`, `## Pilares de conteúdo`, or whatever structure fits the client's actual files) rather than fill 4 named fields. `buildExtractionPrompt` itself needs **no changes** — it is agnostic to what `instruction` says or what `inputSchema` looks like.

### 3. UI — `client-detail-form.tsx` textarea swap

Locate in `components/clients/client-detail-form.tsx`:
- Lines 166–179: `useForm<BriefingInput>` + `useFieldArray({ name: "contentPillars" })` — the `useFieldArray` call and its `fields/append/remove/replace` destructure become **entirely unnecessary** once there's one string field; delete them.
- Lines 359–462: the three `FormField` blocks (`objective`, `toneOfVoice`, `targetAudience`) each rendering a `Textarea`, plus the separate "Pilares de conteúdo" `Input`+`Button`+`Badge` chip UI (lines 413–462) — **replace this entire block** with a single `FormField` bound to the new string field (e.g. `briefing`), rendering one large `Textarea` (add `rows`/`className="min-h-[...]"` or similar sizing — none of the current 3 textareas set an explicit height, so match that unstyled default unless a larger min-height is wanted given the doc will now be much longer).
- Lines 197–204 (`handleBriefingAutofilled`): currently calls `form.setValue` three times plus `replace(...)` for pillars. Becomes a single `form.setValue("briefing", briefing.briefing, { shouldDirty: true })` (or whatever the new zod field name is).
- Lines 244–279 (`onSubmitBriefing`): currently builds a `FormData` with `objective`/`toneOfVoice`/`targetAudience` conditionally appended plus a loop over `contentPillars`. Becomes one `formData.append("briefing", values.briefing)` (still conditionally, if the field can be empty/optional — check `briefingSchema`'s new nullability).
- **"Salvo"/`isDirty`/`justSavedBriefing` pattern (lines 468–478): completely untouched.** This pattern reads off `form.formState.isDirty` and a `justSavedBriefing` boolean set after a successful `updateBriefing` call — it has no dependency on field count or shape, only on the `useForm` instance existing and `form.reset(values)` being called post-save (already the case, line 267). No changes needed here beyond what naturally follows from `values` having a different shape.
- **Type prop `ClientDetailFormProps.client`** (lines 63–72): the 4 separate fields (`objective`, `toneOfVoice`, `targetAudience`, `contentPillars`) collapse to one (e.g. `briefing: string | null`) — this is a breaking prop-shape change that ripples to both page.tsx call-sites (see Finding 5).
- `pillarInput` state (line 159) becomes dead code and should be removed along with `addPillar()` (lines 183–188).
- Unused imports after the swap: `useFieldArray` (react-hook-form), `XIcon`/`PlusIcon` may still be used elsewhere in this file (PM picker dialog uses `PlusIcon`, `XIcon` is used for both pillar badges AND PM badges — check before removing; `XIcon` stays because the PM-removal badge at line 500 also uses it, `PlusIcon` stays for the "Adicionar PM" button at line 522). `Badge` import stays (still used for PM badges).

### 4. `assemble-prompt.ts`'s `briefingBlock` rendering

Current code (lines 54–80) [VERIFIED: read from repo]:

```ts
type Briefing = {
  name: string;
  tag: string;
  objective: string | null;
  tone_of_voice: string | null;
  target_audience: string | null;
  content_pillars: string[];
};
```

with `briefingBlock` built as a filtered array of labelled lines (`Cliente (código de referência: X): Y`, `Objetivo: ...`, `Tom de voz: ...`, etc.) joined with `\n`.

**Recommendation:** simplify to:

```ts
type Briefing = {
  name: string;
  tag: string;
  briefing: string | null;
};

const briefingBlock = [
  `Cliente (código de referência: ${client.tag}): ${client.name}`,
  client.briefing ? `Briefing estratégico:\n${client.briefing}` : null,
]
  .filter(Boolean)
  .join("\n\n");
```

Keep the `Cliente (código de referência: ...)` line exactly as-is — it is the T-2-01/T-hnm-01 client-isolation anchor (identification key), completely orthogonal to the briefing content shape, and every leakage-guard test in `assemble-prompt.test.ts` depends on it appearing. Only the labelled-fields-list portion collapses to one `Briefing estratégico:` block with the raw Markdown text injected as-is (the user's framing in the task brief — "só injetar o texto como está, com um rótulo simples" — is exactly right and matches how `filesBlock`/`sharedKnowledgeBlock` already inject raw file content with a simple label, so this is consistent with the file's own existing conventions, not a new pattern).

`D-07`'s "briefing is ALWAYS present, files appended only when non-empty" invariant (doc comment, lines 14–18) is preserved: the `Cliente (...)` line always renders regardless of whether `client.briefing` is null; only the "Briefing estratégico:" sub-block is conditional, matching the null-briefing test at lines 63–78 of `assemble-prompt.test.ts` ("null briefing fields are omitted cleanly, not rendered as 'null'").

**`lib/ai/extraction-prompt.ts` is unaffected** — it never receives or renders briefing fields at all (only `clientName`/`clientTag`/`files`/`sharedFiles`/`instruction`); no changes needed there.

### 5. Known pitfalls in this project for this exact kind of change

**Pitfall A — `useFieldArray` removal is safe here, but only because there's no other array field left.** `content_pillars` is the only array-shaped field in `briefingSchema`; once it's gone, the entire `useFieldArray` import and destructure become dead. Forgetting to delete `const { fields, append, remove, replace } = useFieldArray(...)` after removing its only consumer will not break the build (TS won't error on unused destructured `const`s reliably depending on lint config) but will leave dead code — check `eslint` config for `no-unused-vars` to confirm this gets caught, otherwise flag for manual removal in a plan verification step.

**Pitfall B — Server Action return-shape change is a breaking change with 2 call-sites, not 1.** `autofillBriefingFromFiles`'s return type `AutofillBriefingResult` (currently `{ success: true; briefing: BriefingInput }`) is consumed in **two** places: `client-detail-form.tsx`'s own `handleBriefingAutofilled` (the `?autofillBriefing=1` redirect-flow effect, lines 215–235) AND `client-files-section.tsx`'s `onBriefingAutofilled` callback prop (triggered right after a successful file upload, line 139–141) [VERIFIED: grep + read from repo]. Both must be updated in lockstep — `client-files-section.tsx` imports `type { BriefingInput }` from `lib/validation/clients` purely to type its own prop signature (`onBriefingAutofilled?: (briefing: BriefingInput) => void`); it does not read individual fields off it, so its edit is a one-line type update, not a logic change, but it's easy to miss since it lives in a different component file from the form itself.

**Pitfall C — 4 read-sites select the old columns by literal name in Supabase `.select()` strings, not via a shared type.** `app/pm/clients/page.tsx`, `app/pm/clients/[id]/page.tsx`, `app/admin/clients/page.tsx`, `app/admin/clients/[id]/page.tsx`, and `app/api/chat/route.ts` (5 files total) [VERIFIED: grep across repo] each have their own literal `.select("id, name, tag, objective, tone_of_voice, target_audience, content_pillars")`-shaped string (some include `tag`, `pm_clients(pm_id)`, etc. — not identical strings). There is no shared "clients select columns" constant in this codebase — each call-site's select string must be edited independently, and a stale one anywhere returns `undefined` on read for a dropped column even though the migration succeeded (a silent runtime bug, not a build error, since the code doesn't reference `.objective` as a typed field beyond what's inline). **Explicit action for the planner:** grep for `objective, tone_of_voice, target_audience, content_pillars` (and the singular `objective`/`tone_of_voice`/etc. accessors) across the whole repo as a verification step, not just the 5 files listed here as a starting point, since this research's file list may not be exhaustive of every future read-site.

**Pitfall D — the two "is briefing empty" list-page checks must be rewritten, not just the fetch.** `app/admin/clients/page.tsx` (lines 102–106) and `app/pm/clients/page.tsx` (lines 91–95) both compute an "empty briefing" flag as `!client.objective && !client.tone_of_voice && !client.target_audience && (client.content_pillars ?? []).length === 0` — presumably rendered as a "briefing incomplete" badge in the client list table. This collapses to a single `!client.briefing` (or `!client.briefing?.trim()`) check — a planner missing this will leave dead/broken variable references that fail to compile (good — this one is a hard build error, not silent, since `ClientRow` type also declares the 4 old fields at lines 24–28/25–28 and will need updating too).

**Pitfall E — `assemble-prompt.test.ts` fixtures hard-code the old `Briefing` shape and will fail to compile, not just fail assertions.** `CLIENT_A`/`CLIENT_B`/the inline `Cliente C` object at lines 5–21 and 63–78 of `lib/chat/assemble-prompt.test.ts` all construct object literals with `objective`/`tone_of_voice`/`target_audience`/`content_pillars` keys matching the current `Briefing` type. Once `Briefing` changes shape, TypeScript will reject these literals — this is a **required** file to update as part of this quick task (not optional test debt), and several assertions (`assert.match(prompt, /Crescer no LinkedIn/)` etc.) need rewriting to match new single-field fixture content and the new "Briefing estratégico:" label wording.

## Package Legitimacy Audit

Not applicable — this quick task installs no new external packages (no new npm dependency, no new Supabase extension). All work is internal schema + application code.

## Phase Requirements

Not applicable — this is a quick task (not a phased milestone), so no formal `REQ-ID` list from `REQUIREMENTS.md` applies. The task boundary and acceptance criteria come entirely from CONTEXT.md's `<decisions>` section, reproduced verbatim above under "User Constraints."

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | New column name `briefing` (or `briefing_text`) — exact name left to planner's discretion per CONTEXT.md | Finding 1 | Low — purely cosmetic, easy to rename before merge, CONTEXT.md explicitly delegates this choice |
| A2 | The 5 read-site files enumerated in Pitfall C are exhaustive of every place selecting the 4 old columns | Finding 5, Pitfall C | Medium — a missed 6th call-site would silently return `undefined` for a dropped column at runtime (no build error) rather than crash loudly; mitigated by the explicit re-grep instruction given to the planner |
| A3 | A single-property JSON Schema is valid input for Anthropic's forced tool-use `input_schema` (no minimum-property-count requirement) | Finding 2 | Low — this is standard JSON Schema behavior (a schema with one required property is valid), not an Anthropic-specific claim, and the existing `updateClientTag`-adjacent single-field patterns in this codebase's zod schemas (e.g. `clientTagUpdateSchema = z.object({ tag: tagSchema })`) already establish single-field object schemas work fine throughout this codebase's own validation layer |

**If this table is empty:** N/A — see entries above. None of these assumptions concern compliance, retention, or security — all are implementation-shape choices explicitly delegated to the planner by CONTEXT.md or low-risk standard-behavior claims.

## Sources

### Primary (HIGH confidence — all direct repo reads/greps this session)
- `supabase/migrations/0012_drop_tropicalia_project_id.sql` — exact column-drop precedent on `public.clients`
- `supabase/migrations/0006_clients_full_record.sql` — original 4-column migration (confirmed never edited retroactively)
- `supabase/migrations/0007_clients_rls_fix.sql` — `clients_update_scoped` row-level policy definition
- `supabase/migrations/0025_clients_tag.sql` — explicit "no new policy needed" precedent comment for a new column
- `supabase/migrations/0008_clients_grants.sql` — table-level (not column-level) grants
- `lib/validation/clients.ts`, `lib/actions/clients.ts`, `components/clients/client-detail-form.tsx`, `components/clients/client-files-section.tsx`, `lib/chat/assemble-prompt.ts`, `lib/chat/assemble-prompt.test.ts`, `lib/ai/structured-extraction.ts`, `lib/ai/extraction-prompt.ts` — all read in full this session
- `app/pm/clients/page.tsx`, `app/pm/clients/[id]/page.tsx`, `app/admin/clients/page.tsx`, `app/admin/clients/[id]/page.tsx`, `app/api/chat/route.ts` — grepped/read for the 4-column references
- `lib/actions/checklist-templates.ts`, `app/pm/board/actions.ts` — read to confirm `runStructuredExtraction`'s forced-tool-use pattern is used identically by all 3 other call-sites (checklist generation, card validation)
- `.planning/quick/260811-kl3-abandonar-o-campo-fixo-de-briefing-estra/260811-kl3-CONTEXT.md` — user decisions (locked)

## Metadata

**Confidence breakdown:**
- Migration format: HIGH — exact same-table, same-shape precedent exists in this repo's own migration history
- Shared extraction engine adaptation: HIGH — engine's `inputSchema` parameter is already generic; single-field schemas are provably valid JSON Schema and already used elsewhere in this codebase's zod layer
- UI swap: HIGH — every touched line/prop was read directly this session
- Call-site enumeration: MEDIUM — grep-based, high confidence but not exhaustively guaranteed (flagged in Pitfall C/A2)

**Research date:** 2026-08-11
**Valid until:** No expiry concern — entirely internal-codebase research, not tied to any external library version drift. Re-verify only if other quick tasks touch `public.clients` or the extraction engine before this task executes.
