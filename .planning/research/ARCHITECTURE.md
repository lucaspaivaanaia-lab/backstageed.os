# Architecture Research: v1.1 Feature Integration

**Domain:** Integration of 6 new features into an existing, shipped Next.js (App Router) + Supabase (Postgres/Auth/RLS) app on Vercel
**Researched:** 2026-08-16
**Confidence:** HIGH (grounded directly in the current codebase, not general ecosystem patterns)

## Standard Architecture (as it exists today)

### System Overview

```
┌──────────────────────────────────────────────────────────────────────┐
│  Client Components (app/**/*-panel.tsx)                              │
│  react-hook-form + zodResolver, useTransition, sonner toasts         │
├──────────────────────────────────────────────────────────────────────┤
│  Server Actions ("use server", one file per route segment)           │
│  app/pm/board/actions.ts · app/editor/actions.ts ·                   │
│  lib/actions/{clients,client-files,checklist-templates,              │
│  shared-knowledge,card-overrides,auth}.ts                            │
│    1. zod schema.safeParse(input)          <- input validation       │
│    2. supabase.auth.getUser()              <- authentication         │
│    3. re-read caller's own profiles row -> app-layer authz predicate │
│       (lib/security/*-authz.ts, pure functions)                      │
│    4. RLS-scoped createClient() re-read of the target row            │
│       ("never trust an id argument alone")                           │
│    5. hard-coded column payload -> .update()/.insert()               │
│                                              (createAdminClient() ONLY│
│                                               for privileged reads/   │
│                                               writes RLS can't do,    │
│                                               e.g. cross-user roster) │
├──────────────────────────────────────────────────────────────────────┤
│  ONE Route Handler: app/api/chat/route.ts (streaming, Node runtime)  │
├──────────────────────────────────────────────────────────────────────┤
│  lib/ai/structured-extraction.ts  <-- the ONE call site pattern for  │
│  every "AI reads client_files, proposes structured output, human     │
│  confirms" feature (checklist generation, briefing autofill,         │
│  transcript-to-briefing update, card-vs-checklist validation)        │
│    -> lib/anthropic/client.ts: getAnthropicClient() + AI_MODEL       │
│       (single hardcoded module constant, no per-call override today)│
├──────────────────────────────────────────────────────────────────────┤
│  Supabase Postgres: RLS on every table, is_admin()/                  │
│  pm_assigned_clients() SECURITY DEFINER helpers (0004), flat         │
│  denormalized client_id on every row (no recursive policies)         │
└──────────────────────────────────────────────────────────────────────┘
```

### Component Responsibilities (existing, load-bearing for v1.1)

| Component | Responsibility | File |
|-----------|-----------------|------|
| `lib/anthropic/client.ts` | Server-only Anthropic client singleton + single `AI_MODEL` constant | `lib/anthropic/client.ts` |
| `lib/ai/structured-extraction.ts` | Shared "tool-forced" one-shot AI call, used by every propose-then-confirm feature | `lib/ai/structured-extraction.ts` |
| `lib/chat/assemble-prompt.ts` | Pure system-prompt assembly (briefing + client_files + shared_knowledge_files), client-isolation-critical | `lib/chat/assemble-prompt.ts` |
| `lib/actions/clients.ts` | Client CRUD, PM roster reads, briefing autofill orchestration | `lib/actions/clients.ts` |
| `lib/actions/client-files.ts` | Upload/extract client files; **already contains the transcript-analysis pattern** (`analyzeTranscriptAgainstFile`, `analyzeTranscriptFileAgainstFile`, `updateClientFileContent`) | `lib/actions/client-files.ts` |
| `app/pm/board/actions.ts` | `createCard`, `advanceStage`, `moveCard`, checklist/attachment writes — the canonical card-write contract | `app/pm/board/actions.ts` |
| `app/editor/page.tsx` + `editor-queue-panel.tsx` + `app/editor/actions.ts` | Editor's own cross-client queue (already built, v1.0) | `app/editor/*` |
| `lib/cards/workload.ts` + `lib/cards/oversight-filters.ts` + `lib/cards/staleness.ts` | Pure, tested aggregation helpers powering `/admin`'s oversight table | `lib/cards/*.ts` |
| `app/admin/page.tsx` + `oversight-panel.tsx` | Admin cross-client oversight dashboard (Phase 6) | `app/admin/*` |
| `lib/security/*-authz.ts` | Pure authorization predicates (`isBoardWriteAuthorized`, `isEditorCardWriteAuthorized`, etc.), each paired with a `assert*Caller` re-read helper local to its action file | `lib/security/*` |

## Recommended Integration per Feature

### Feature 1 — Admin PM/PO control panel (workload + comments)

**Reuse, don't fork, `/admin`'s existing oversight module.** The workload table and person/client filters already exist (`lib/cards/workload.ts`, `lib/cards/oversight-filters.ts`, `app/admin/page.tsx`/`oversight-panel.tsx`, Phase 6). This request is an **extension of that same page**, not a separate concern — same data source (`cards`/`profiles`/`pm_clients`), same audience (Admin only), same route family.

**New (genuinely):**
- `supabase/migrations/00XX_pm_admin_notes.sql` — new table `pm_admin_notes` (`id`, `admin_id`, `pm_id`, `body`, `created_at`). RLS: `admin_id = auth.uid() and is_admin()` for insert; select scoped to `is_admin()` (Admin needs to see their own notes across PMs — a single Admin operation today, per PROJECT.md's "poucos PMs" scale, so no PM-visibility branch is needed unless later requested). Follow the exact GRANT-in-same-migration discipline every prior migration in this repo uses (hosted Supabase does not auto-grant on `supabase db push` the way local `supabase start` does not either — grants must be explicit, in the same file as the `CREATE TABLE`).
- `lib/actions/pm-notes.ts` (new file, "use server") — `addPmNote`/`listPmNotes`, mirroring `lib/actions/clients.ts`'s "RLS-scoped createClient(), app-layer admin check before privileged read" shape. No need for `createAdminClient()` here since notes are Admin-authored and Admin-read only — RLS alone suffices, unlike the PM-roster reads elsewhere in this codebase that need to bypass a PM's own restricted `profiles` visibility.
- A "Comentários" panel/dialog in `app/admin/oversight-panel.tsx` (extend, don't replace), attached to a row's person, using the same `Dialog` primitives `editor-queue-panel.tsx` already imports.

**Modified:**
- `app/admin/oversight-panel.tsx` — add a comment affordance per PM row in the existing workload table.
- `app/admin/page.tsx` — add the `pm_admin_notes` fetch as a fourth, filter-independent `Promise.all` branch, mirroring how the workload query (06-02) was deliberately kept independent of the page's own client/PM filters.

**Verdict:** This is the lowest-risk feature in the milestone — almost entirely additive to a page that already has the exact query shape (`cards` × `profiles` × `pm_clients`, asymmetric PM/Editor attribution) this feature needs. No new route, no new RLS pattern, no new authz helper needed (existing `is_admin()` fully covers it).

### Feature 2 — Per-area AI model selection

**This is the feature most likely to be under-scoped if treated as "just add a dropdown."** Today `AI_MODEL` is a single module-level constant (`lib/anthropic/client.ts`), read at three call sites: `app/api/chat/route.ts` (chat), `lib/ai/structured-extraction.ts` (every propose-then-confirm feature: checklist gen, briefing autofill, transcript analysis, card validation, and — after this milestone — topic generation). "Per area" means at minimum: chat vs. structured-extraction, and arguably per structured-extraction *use* (checklist vs. briefing vs. topics vs. transcript) if the areas are meant to be independently tunable.

**New:**
- `supabase/migrations/00XX_ai_model_settings.sql` — a small settings table, not per-area columns on unrelated tables (columns-per-area would force a migration every time an "area" is added; a JSON blob loses type/enum safety at the DB layer). Recommended shape:
  ```sql
  create table public.ai_model_settings (
    area text primary key,  -- e.g. 'chat', 'checklist_generation', 'briefing_autofill', 'topic_generation', 'transcript_analysis'
    model text not null,
    updated_at timestamptz not null default now(),
    updated_by uuid references public.profiles(id)
  );
  ```
  RLS: select open to `authenticated` (every server call needs to read it), write restricted to `is_admin()` — same shape as `shared_knowledge_files`'s existing admin-write policy (0026), which is the closest precedent in this codebase.
- `lib/ai/model-settings.ts` (new, server-only) — `getModelForArea(area: AiArea): Promise<string>`, reading `ai_model_settings` with a fallback to the existing `AI_MODEL` constant if no row exists for that area (so this ships without requiring a data migration/seed for every area on day one). `AiArea` should be a literal union type, not a free string, so a typo can't silently no-op to the fallback.
- A small Admin settings UI (`app/admin/ai-settings/page.tsx` + `actions.ts`) — Admin-only, mirrors `app/admin/checklist-templates`'s existing form-and-list pattern.

**Modified (the actual threading work):**
- `lib/anthropic/client.ts` — `getAnthropicClient()` stays a singleton (no change; the model, not the client, varies per call), but `AI_MODEL` as a bare constant needs to become "the fallback default," with each call site resolving its own model via `getModelForArea(...)`.
- `app/api/chat/route.ts` — replace `model: AI_MODEL` with `model: await getModelForArea("chat")`.
- `lib/ai/structured-extraction.ts` — `StructuredExtractionParams` gains an `area: AiArea` field (or the model is resolved by each caller and passed in directly as `model: string`, which is simpler and keeps `structured-extraction.ts` free of a new DB read of its own — **prefer this**: resolve the model in the calling action, e.g. `lib/actions/checklist-templates.ts`, `lib/actions/clients.ts`, the new topic-generation action, so `structured-extraction.ts` remains a pure "given a model + prompt, call Anthropic" engine, and the settings lookup lives in one layer, not two).

**Critical boundary (explicit per your framing):** the model choice must **never** be read from client input. Every call site above resolves the model server-side from `ai_model_settings` (an Admin-only-writable table), exactly the same trust boundary already used for `AI_MODEL`/`ANTHROPIC_API_KEY` today — this is additive to that boundary, not a weakening of it. No Server Action in this feature should accept a `model` parameter from `FormData`/JSON input; the picker in the Admin UI writes to `ai_model_settings`, and every AI call site reads from there itself.

**Verdict:** New table + new pure lookup module + N small call-site edits (3 known today, one more added by Feature 4/topic-generation). No new authz pattern needed. This should be built **early**, right after Feature 1, because Features 4 and 5 both call `structured-extraction.ts` and should be wired to read their model from `ai_model_settings` from the start rather than needing a second pass.

### Feature 3 — Editor's own Kanban/queue

**Already shipped in v1.0** (`app/editor/page.tsx`, `editor-queue-panel.tsx`, `app/editor/actions.ts`, RLS via migration 0031's `media_assignee_id` branch on `cards_select_scoped`/`cards_update_scoped`). It renders a single `due_date`-ordered list, cross-client by design (no `?client=` param — `media_assignee_id` has no client boundary), with inline checklist toggling (`toggleChecklistItem`, imported from `app/pm/board/actions.ts`) and a description-only write (`updateCardDescriptionAsEditor`, its own narrowly-scoped action).

PROJECT.md still lists "Editor tem uma área própria (Kanban/fila)... ordenados por due_date" as **Active**, not Validated — but the file evidence shows the requirement's literal text is already met by existing code. Two readings:
1. The requirement is effectively **done** and just needs re-validation/closure in this milestone (cheapest path — a `/gsd:transition`-style requirement-status correction, not new engineering).
2. "Kanban" in the milestone's intent means grouped-by-stage columns (visually distinct from a flat list), which the current `EditorQueuePanel` does not do — it's a flat table/list, not column-per-stage.

**Recommendation:** Confirm with the user which reading is intended before scoping a plan. If (2), the work is presentational only:
- **Modified:** `app/editor/editor-queue-panel.tsx` — regroup the existing `queueCards` array by `stage` client-side (pure JS `.filter()`/`.reduce()`, no new query) into stage columns, reusing `STAGE_ORDER`/`STAGE_LABELS` from `lib/cards/stages.ts` exactly as `app/pm/board/board-panel.tsx` already does for the PM board.
- **No new route, no new query, no RLS change** — `app/editor/page.tsx`'s loader already fetches everything needed; this is a rendering-layer change only.

**Verdict:** Cheapest feature in the milestone, likely zero backend work. Do not build a second query/RLS path — the existing `media_assignee_id`-scoped query in `app/editor/page.tsx` is already exactly what a stage-grouped view would consume.

### Feature 4 — Automatic topic-generation pipeline

**This is the most architecturally novel feature** — it needs a scheduled entry point that does not exist anywhere in this codebase (no `app/api/cron/*`, no `vercel.json`, no background-job infra at all today).

**New:**
- `supabase/migrations/00XX_clients_posts_per_week.sql` — add `posts_per_week integer not null default X` to `clients` (mirrors how `tag`/`briefing` were added as plain `ALTER TABLE ADD COLUMN`s in 0025/0027, no RLS change needed since `clients_select_scoped`/`clients_update_scoped` already cover any new column).
- `supabase/migrations/00XX_topic_proposals.sql` — a new table, **not a new card stage**. A proposed topic is explicitly *not yet* a card (no client, PM, or checklist context has touched it) — folding it into `cards` would mean adding a 6th pipeline stage that behaves nothing like the other five (no checklist gate, no assignee, visible only to PM/Admin, and its only legal transition is "become a real card" or "be discarded," not "advance"). A separate table keeps `cards`' fixed 5-stage model uncontaminated and keeps `createCard`'s contract (Feature 4's approval step) as the single, unchanged path from proposal to card. Suggested shape:
  ```sql
  create table public.topic_proposals (
    id uuid primary key default gen_random_uuid(),
    client_id uuid not null references public.clients(id) on delete cascade,
    title text not null,
    description text,
    status text not null default 'pending' check (status in ('pending','approved','dismissed')),
    created_at timestamptz not null default now(),
    resolved_at timestamptz,
    resolved_by uuid references public.profiles(id)
  );
  ```
  RLS: same `is_admin() or client_id in (select pm_assigned_clients())` shape as `cards`/`client_files` — this table needs zero new helper functions, it slots directly into the existing multi-tenancy mechanism.
- `app/api/cron/generate-topics/route.ts` (new Route Handler, the **second** ever in this codebase after `app/api/chat/route.ts`) — invoked by Vercel Cron. Runs one query per active (non-archived) client, calls `lib/ai/structured-extraction.ts` (same engine as briefing autofill/checklist generation) with an instruction to propose N topics given the client's `briefing` + `client_files`, and inserts `topic_proposals` rows. **Must use `createAdminClient()`** here — a cron invocation has no authenticated user session, so there is no RLS-scoped caller to act as; this is one of the few legitimate service-role use cases in this codebase, and per the CLAUDE.md-documented v1.0 lesson (the `createClientLogin`/`deactivateClientAccess` IDOR), it needs **its own explicit authorization**, not "no auth because it's a cron." Concretely: verify a shared secret/header (Vercel Cron sends a configurable `Authorization: Bearer <CRON_SECRET>` if configured — must be checked explicitly in the handler) before doing any privileged write, exactly the same "app-layer check is the real boundary, not RLS" discipline this codebase already applies everywhere a service-role client is used.
- `vercel.json` — new, with a `crons` entry pointing at the route above (e.g. weekly). This file does not exist yet.
- `lib/actions/topic-proposals.ts` (new, "use server") — `approveTopicProposal(proposalId)`: re-reads the proposal through **RLS-scoped** `createClient()` (never admin client — a human, authenticated PM/Admin caller is doing this, same pattern as every other board action), then calls the **existing, unmodified** `createCard` from `app/pm/board/actions.ts` with `cardType: "single"`, `stage: "briefing"`, `title`/`description` sourced from the proposal, `channel` defaulted or prompted — then marks the proposal `status = 'approved'`. **This is the explicit dependency called out in the milestone context**: the approval step must call `createCard`'s existing contract (`CreateCardInput` from `lib/validation/cards.ts`), not a second, parallel insert into `cards`. `dismissTopicProposal(proposalId)` mirrors it for the reject path, no `createCard` call.
- A UI surface for pending proposals — likely a new panel on `app/pm/clients/[id]` (the client detail page, where `posts_per_week` config would also live) or a small dedicated `app/pm/topics/page.tsx`. Given the "AI proposes, human confirms" precedent (checklist generation's UI in the client detail page), co-locating it on the existing client detail page is more consistent with established UX than a new top-level route.
- "~10 temas iniciais on client creation": the same `structured-extraction.ts` call, triggered synchronously inside (or right after) `createClientRecord` (`lib/actions/clients.ts`) rather than waiting for the first weekly cron tick — this is a **direct, synchronous call** (like `autofillBriefingFromFiles`), not a cron invocation, since it happens in response to a real user action with a real session, so no `createAdminClient()`/cron-secret complexity applies to this half of the feature.

**Modified:**
- `lib/validation/clients.ts` — extend `clientCreateSchema` (or a separate update schema) with `postsPerWeek` if it's set at creation time, or leave creation alone and only expose it on the client detail edit form (simpler, avoids widening the creation form).

**Verdict:** This feature has the most new surface area (2 tables, 1 route handler, 1 cron config file, 2+ action files) but the actual state-machine-changing part (turning a proposal into a card) is a thin wrapper around `createCard`, unchanged. Do not attempt to make `topic_proposals` a `cards` variant — that would require reworking `cards_package_has_no_stage`-style constraints and the checklist-snapshot machinery for no benefit.

### Feature 5 — Meeting/calendar → briefing integration (via Gemini)

**Extends existing infrastructure almost entirely.** `lib/actions/client-files.ts` already has the exact flow this feature needs: `analyzeTranscriptAgainstFile` (pasted text) and `analyzeTranscriptFileAgainstFile` (uploaded file), both funneling through private `resolveTranscriptTarget`/`runTranscriptAnalysis` helpers into `runStructuredExtraction`, landing in a review/confirm UI (`components/clients/transcript-update-section.tsx`) before `updateClientFileContent` ever writes. The milestone's "new" part is **only the transcript's origin**: today a human pastes or uploads it; this feature wants it fetched automatically from a meeting (Gemini-generated transcript, presumably from Google Calendar/Meet metadata).

**New:**
- A transcript-fetch adapter, e.g. `lib/integrations/gemini-transcript.ts` — fetches a meeting transcript from wherever Gemini/Calendar exposes it (this needs its own dedicated research pass: PROJECT.md's Out of Scope list explicitly excludes "Captura automática de transcrições de reunião via Google Calendar/Meet" as a *future* integration, which is in tension with this milestone's stated goal — **flag this discrepancy to the user before scoping a plan**; either PROJECT.md's Out of Scope is stale, or "via Gemini" here means something narrower, e.g. a manual paste of a Gemini-generated transcript rather than live Calendar polling. This ambiguity should block detailed feature planning until resolved.)
- If a scheduled/webhook trigger is confirmed in scope, it needs the same `app/api/cron/*` (or a webhook route) + `CRON_SECRET`/webhook-signature authorization pattern established for Feature 4 — do not build a second, differently-shaped scheduled-entry-point convention.

**Reused, not rebuilt:**
- `resolveTranscriptTarget`/`runTranscriptAnalysis` (private helpers in `lib/actions/client-files.ts`) — a new automatic entry point should call these same helpers (making them exported, or adding a third public Server Action alongside the existing two, following the exact precedent quick task 260805-iea set when it added the file-upload path alongside the paste-text path).
- `updateClientFileContent` and the "extract only what's new/relevant" prompt behavior — already the shared confirm-write step; only "extracts just what's new/relevant per reunião" phrasing needs verifying against the current prompt in `runTranscriptAnalysis`'s instruction text (likely a prompt-wording adjustment, not new plumbing).
- The review/confirm UI pattern (`transcript-update-section.tsx`) — if this feature is meant to still require human confirmation (consistent with the "AI proposes, human confirms" precedent used everywhere else in this codebase), the automatic-fetch path should land the fetched transcript into the same review UI rather than auto-committing `updateClientFileContent` with no human step, which would be the first fully-automatic write-to-`client_files` path in the codebase and a meaningful behavioral precedent change worth flagging explicitly to the user.

**Verdict:** Almost entirely a "add a new transcript source" change to a flow that already exists end-to-end. The genuinely new part (Gemini/Calendar transcript retrieval + its trigger) needs its own scoped research once the Out-of-Scope conflict above is resolved.

### Feature 6 — Automatic PDF export

**New route/action, but bounded by serverless constraints not yet exercised anywhere in this codebase.**

**New:**
- `app/api/export/[clientId]/pdf/route.ts` (or a Server Action returning a `Blob`/base64 payload — a Route Handler is preferable here since PDF generation is a binary response, which Server Actions handle awkwardly compared to a Route Handler's native `Response` with `Content-Type: application/pdf`).
- A PDF-rendering dependency: **none of `puppeteer`, `@react-pdf/renderer`, `pdf-lib`, `jspdf`, or similar is in `package.json` today** — this is a new dependency decision, not a reuse. Given the Vercel serverless constraints (no persistent disk, bundle-size limits, and — critically — Puppeteer/headless-Chrome-based renderers are large and slow-cold-starting on serverless, a well-documented pain point on Vercel specifically), prefer a pure-JS, no-browser PDF library (`@react-pdf/renderer` fits this codebase's existing React-heavy stack best, or `pdf-lib` for more manual layout control) over a Puppeteer/Chromium-based approach. This should get its own short, targeted research pass at plan time (specifically: current `@react-pdf/renderer` compatibility with Next.js 16 App Router Route Handlers on Vercel's Node runtime, and Vercel's function execution time/memory limits for the expected card-count-per-client).
- **Image handling is a real complication worth flagging now, not at implementation time**: this codebase's "media" is Google Drive **links** stored in `card_attachments` (`lib/attachments/drive-url.ts` only validates hostname shape — there is no `googleapis` dependency and no server-side Drive fetch anywhere in the codebase). Embedding an image inside a generated PDF requires either (a) the Drive links being publicly viewable (fetchable via a plain HTTP GET at render time, which depends entirely on each PM's Drive sharing settings, not something this app controls today) or (b) a real Google Drive API integration (OAuth, `googleapis` package) to fetch the file server-side — a materially larger scope than "add a PDF library." Confirm with the user whether the exported PDF needs actual embedded images or can link out to Drive, before scoping this feature's plan.
- `lib/pdf/build-client-approval-pdf.ts` (pure-ish rendering module, given a client + array of "aprovação do cliente"-stage cards) — should read cards the same way `app/admin/page.tsx`'s existing query already narrows to a stage (`cards.stage = 'aprovacao_cliente'`), reusing `isActiveStage`/the existing card-query shape rather than inventing a new filter convention.

**Reused:**
- The RLS-scoped `createClient()` read of `cards` filtered to `client_id` + `stage = 'aprovacao_cliente'` — identical shape to the existing oversight/workload queries, just narrower.
- No new authz pattern needed: a PM/Admin exporting their own client's cards is exactly what `cards_select_scoped` already permits; no `createAdminClient()` needed for the read side (the route handler runs in an authenticated session, triggered by a PM/Admin clicking "Exportar PDF" — this is *not* a cron-style unauthenticated entry point like Feature 4's topic generator).

**Verdict:** The Postgres/RLS/data-flow part of this feature is trivial (a query this codebase already knows how to write). The real complexity is entirely in (1) picking and integrating a serverless-compatible PDF library — new to this stack — and (2) resolving whether images need to be embedded, which may require a genuinely new Google Drive API integration this project has explicitly avoided building so far.

## Suggested Build Order

```
1. Feature 2 (AI model selection)     -- foundational: Features 4 and 5 both
   |                                     call structured-extraction.ts; wire
   |                                     the ai_model_settings lookup in
   |                                     BEFORE those features add their own
   |                                     new call sites, so nothing needs a
   |                                     second pass.
   v
2. Feature 1 (Admin PM panel)         -- independent, additive to existing
                                          /admin oversight code; no
                                          dependency on anything else in
                                          this list, safe to build any time,
                                          sequenced early because it's
                                          lowest-risk and fastest to ship.
   |
   v
3. Feature 3 (Editor Kanban)          -- independent, near-zero backend
                                          work; sequence early for the same
                                          reason as Feature 1 (quick win,
                                          builds momentum, de-risks nothing
                                          else but blocks nothing either).
   |
   v
4. Feature 4 (Topic-generation)       -- depends on Feature 2 (model
   |                                     selection) being wired in;
   |                                     depends on understanding
   |                                     createCard's existing contract
   |                                     (lib/validation/cards.ts's
   |                                     CreateCardInput) BEFORE writing
   |                                     the approval action, per the
   |                                     milestone's own stated
   |                                     dependency; introduces this
   |                                     codebase's FIRST scheduled/cron
   |                                     entry point and its
   |                                     authorization pattern
   |                                     (CRON_SECRET-style check) --
   |                                     that pattern should be
   |                                     established here, cleanly, since
   |                                     Feature 5 may need to reuse it.
   v
5. Feature 5 (Meeting -> briefing)    -- depends on Feature 4 IF a
                                          scheduled/webhook trigger is
                                          confirmed in scope (reuses
                                          Feature 4's cron-auth pattern);
                                          otherwise independent of every
                                          other feature. BLOCKED on a
                                          product clarification (Out of
                                          Scope conflict, see Feature 5
                                          section above) before it can be
                                          planned in detail -- resolve
                                          that first, even if build
                                          sequencing waits.
   |
   v
6. Feature 6 (PDF export)             -- fully independent of 1-5;
                                          sequenced last because it is the
                                          only feature requiring a NEW
                                          third-party dependency decision
                                          (PDF rendering library) and a
                                          possible new Google Drive API
                                          integration -- both benefit from
                                          being decided with the rest of
                                          the milestone's scope already
                                          settled, and neither blocks nor
                                          is blocked by anything else here.
```

**Cross-cutting dependency note:** Features 4, 5, and (partially) 6 are the only features touching genuinely new infrastructure this codebase has never had before (scheduled entry points, a second Route Handler pattern, a new external dependency). Features 1, 2, and 3 are pure extensions of proven, already-tested modules (`lib/cards/workload.ts`, `lib/anthropic/client.ts`, `app/editor/*`) and carry materially lower risk — this is reflected in the ordering above (low-risk/foundational first, novel-infrastructure features later, once the team has re-familiarized itself with the codebase's conventions on this milestone).

## Architectural Patterns to Follow

### Pattern 1: "AI proposes, human confirms" (propose-then-approve)

**What:** Every AI-generated artifact in this codebase (briefing autofill, checklist generation, transcript-driven file updates) is written to the database only after an explicit human confirmation click — never auto-committed.
**When to use:** Feature 4 (topic proposals -> `createCard`) and Feature 5 (transcript -> briefing update) both fit this pattern exactly; it should be the default assumption for both unless the user explicitly asks for full automation.
**Example (existing code, `lib/actions/checklist-templates.ts`):**
```ts
// AI proposes, returns the proposal WITHOUT writing:
export async function generateChecklistFromFiles(clientId: string) {
  // ...authz + client re-read...
  return proposeChecklistFromFiles({ id: client.id, name: client.name, tag: client.tag });
}
// A SEPARATE action (not shown here) persists it only after the human clicks confirm.
```

### Pattern 2: Re-read through RLS, never trust an id argument

**What:** Every Server Action re-fetches its target row via the RLS-scoped `createClient()` before acting on it, even though the id already came from a UI the caller supposedly has access to.
**When to use:** Every new action in this milestone (`approveTopicProposal`, `addPmNote`, the PDF export route) must do this — it is the load-bearing security pattern across this entire codebase, not optional boilerplate.

### Pattern 3: `createAdminClient()` requires its own explicit app-layer authorization

**What:** Per CLAUDE.md's documented v1.0 lesson (the real IDOR in `createClientLogin`/`deactivateClientAccess`), any Server Action or Route Handler using the service-role client must carry its own authorization check in application code — RLS is bypassed entirely by that client, so it provides zero protection there.
**When to use:** Feature 4's cron route handler (`app/api/cron/generate-topics/route.ts`) is the clearest new instance of this in the milestone — it has no user session at all, so its "authorization" is a shared-secret header check, and that check must happen before any privileged write, not after.

### Pattern 4: Pure, `node:test`-covered helper modules alongside their call sites

**What:** Aggregation/computation logic (`lib/cards/workload.ts`, `lib/cards/staleness.ts`, `lib/cards/stages.ts`) is written as I/O-free pure functions with a co-located `.test.ts`, imported by the thin Server Component/Action that does the actual I/O.
**When to use:** Feature 1's any new aggregation, Feature 4's proposal-to-card mapping logic, and Feature 6's PDF content-shaping logic should all follow this split — easy to unit test without a live Supabase/Anthropic call.

## Anti-Patterns to Avoid (specific to this milestone)

### Anti-Pattern 1: Giving `topic_proposals` its own path to `cards`

**What people might do:** Write a second insert into `cards` inside the topic-approval action, "just to save a function call."
**Why it's wrong:** `createCard` carries real invariants (D-15 checklist-snapshot-on-create with compensating delete, `cards_assignee_membership_trg`, the `cards_package_has_no_stage` constraint) that a second insert path would have to reimplement or silently skip.
**Do this instead:** `approveTopicProposal` calls the existing exported `createCard` from `app/pm/board/actions.ts` directly.

### Anti-Pattern 2: A second, differently-shaped "model selection" mechanism per area

**What people might do:** Add a `chat_model` column on `clients` and a separate `checklist_model` env var, growing an ad-hoc mechanism per feature as each one is built.
**Why it's wrong:** Exactly the duplication `lib/anthropic/client.ts`'s doc comment already calls out as a past mistake it fixed ("previously the same fallback was duplicated in both files").
**Do this instead:** One `ai_model_settings` table, one `getModelForArea()` lookup, used by every call site.

### Anti-Pattern 3: Trusting Vercel Cron's request as pre-authorized

**What people might do:** Skip an explicit authorization check in `app/api/cron/generate-topics/route.ts` because "only Vercel calls this URL."
**Why it's wrong:** Any Route Handler URL is publicly reachable unless explicitly protected; Vercel Cron authorization is a header convention the handler must verify itself, not an network-level guarantee.
**Do this instead:** Check the `Authorization` header against `CRON_SECRET` (or equivalent) as the first line of the handler, mirroring this codebase's existing "app-layer check is the real boundary" discipline.

## Integration Points Summary

| New/Modified | File | Feature |
|---|---|---|
| New table | `supabase/migrations/00XX_pm_admin_notes.sql` | 1 |
| New action file | `lib/actions/pm-notes.ts` | 1 |
| Modified | `app/admin/page.tsx`, `app/admin/oversight-panel.tsx` | 1 |
| New table | `supabase/migrations/00XX_ai_model_settings.sql` | 2 |
| New module | `lib/ai/model-settings.ts` | 2 |
| New route | `app/admin/ai-settings/page.tsx` + `actions.ts` | 2 |
| Modified | `app/api/chat/route.ts`, call sites in `lib/actions/*.ts` that invoke `runStructuredExtraction` | 2 |
| Modified | `app/editor/editor-queue-panel.tsx` (grouping only, pending scope confirmation) | 3 |
| New table | `supabase/migrations/00XX_topic_proposals.sql`, `00XX_clients_posts_per_week.sql` | 4 |
| New route | `app/api/cron/generate-topics/route.ts` | 4 |
| New config | `vercel.json` (crons) | 4 |
| New action file | `lib/actions/topic-proposals.ts` (calls existing `createCard` from `app/pm/board/actions.ts`) | 4 |
| Modified (synchronous, non-cron) | `lib/actions/clients.ts`'s `createClientRecord` (initial ~10 topics) | 4 |
| New adapter (needs its own research) | `lib/integrations/gemini-transcript.ts` | 5 |
| Reused | `lib/actions/client-files.ts`'s `resolveTranscriptTarget`/`runTranscriptAnalysis`, `components/clients/transcript-update-section.tsx` | 5 |
| New route | `app/api/export/[clientId]/pdf/route.ts` | 6 |
| New dependency (undecided, needs its own research) | PDF rendering library (`@react-pdf/renderer` or `pdf-lib`, TBD) | 6 |
| New module | `lib/pdf/build-client-approval-pdf.ts` | 6 |
| Open question (Google Drive API scope) | possible new `googleapis` integration for image embedding | 6 |

## Sources

- Direct codebase inspection (HIGH confidence, no external sources needed for this integration-focused research):
  - `.planning/PROJECT.md`
  - `.planning/milestones/v1.0-phases/06-admin-oversight-dashboard/06-01-SUMMARY.md`, `06-02-SUMMARY.md`
  - `lib/anthropic/client.ts`, `lib/ai/structured-extraction.ts`, `lib/chat/assemble-prompt.ts`
  - `app/api/chat/route.ts`, `app/pm/board/actions.ts`, `app/editor/page.tsx`, `app/editor/actions.ts`, `app/editor/editor-queue-panel.tsx`
  - `lib/actions/clients.ts`, `lib/actions/client-files.ts`, `lib/actions/checklist-templates.ts`
  - `lib/cards/workload.ts`, `lib/cards/oversight-filters.ts`, `lib/cards/staleness.ts`, `lib/cards/package-proposal.ts`
  - `lib/validation/cards.ts`, `lib/validation/clients.ts`
  - `supabase/migrations/0001, 0004, 0006, 0015, 0025, 0026, 0027, 0031, 0032`
  - `.planning/quick/260805-iea-adicionar-upload-de-arquivo-como-alterna/260805-iea-SUMMARY.md`
  - `package.json` (confirms no PDF library, no `googleapis` dependency present today)
  - `app/admin/layout.tsx`, `components/layout/app-sidebar.tsx`

---
*Architecture research for: BackstageEd.OS v1.1 milestone feature integration*
*Researched: 2026-08-16*
