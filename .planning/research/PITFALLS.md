# Pitfalls Research

**Domain:** Adding 7 features to a live, single-tenant-per-request, RLS-multi-tenant Next.js + Supabase app in production (BackstageEd.OS v1.1)
**Researched:** 2026-08-16
**Confidence:** HIGH (grounded in direct inspection of this codebase's migrations, Server Actions, and its own documented incidents — not generic advice)

**Codebase facts this research is grounded in** (verified by reading the repo, not assumed):
- `lib/anthropic/client.ts` exports a single `AI_MODEL` constant with exactly 2 call sites: `app/api/chat/route.ts` (streaming chat) and `lib/ai/structured-extraction.ts` (the shared forced-tool-use engine reused by checklist generation, briefing auto-fill, and card-vs-checklist validation — Feature b touches all of these transitively).
- `supabase/migrations/0031_editor_role_rls_and_due_date.sql` is the Editor RLS migration referenced in the milestone context. It documents, in its own header, a real gap found during planning: `enforce_card_assignee_membership()` had to be extended or the Editor role would be entirely unreachable through the UI — proof this RLS branch is subtle and has already needed a second pass.
- `lib/supabase/admin.ts` (`createAdminClient()`, service-role key) is used today in exactly 2 files: `app/pm/clients/[id]/access/actions.ts` (`createClientLogin`/`deactivateClientAccess` — the site of the real, verification-caught IDOR) and `app/pm/editors/actions.ts`. Both now route through `lib/security/client-access-authz.ts`, a dependency-free pure-predicate module built specifically so authorization logic can be unit-tested without a live DB. This is the established remediation pattern for any new service-role Server Action.
- No `vercel.json` exists and no cron/queue/webhook dependency is in `package.json` — Feature d is genuinely the first scheduled trigger in this codebase.
- No PDF library (`pdf-lib`, `puppeteer`, `@react-pdf/renderer`, etc.) is in `package.json` — Feature f starts from zero.
- Google Drive integration today is `lib/attachments/drive-url.ts` — URL *pattern validation only* (`isLikelyDriveLink`, `driveLinkType`), never an authenticated fetch of file bytes. Feature f is the first place this codebase will actually retrieve Drive file content, not just link to it.
- `.planning/quick/260805-iea-*` (the meeting-transcript → `client_files` update flow that Feature e extends) shipped with real verification: a pre-existing stale-`useState`-initializer bug was found and fixed, and the reviewer explicitly queried `client_files` post-merge to confirm exactly 1 row existed with the merged content and no separate transcript row was left behind. Feature e must uphold that same "verify by querying the actual table" bar for every new meeting, not just the first one.
- Every card insert observed in `app/pm/board/actions.ts` sets `created_by: user.id` from an authenticated session — there is no existing "system-authored" card pattern. Feature d's auto-created cards break this assumption structurally, not just conceptually.

---

## Critical Pitfalls

### Pitfall 1: Admin comments become a second, uncontrolled read-surface into PM performance data

**What goes wrong:**
The "Admin comments on a PM" feature (999.6) is built as a plain table with an obvious-looking RLS policy — e.g. `for all using (is_admin() or pm_id = auth.uid())` — without deciding explicitly whether a PM can see comments *other PMs* wrote about *them*, whether a PM can see comments about *other* PMs, and whether the comment history is visible to the commented-on PM at all (a "manager's private notes" feature and a "shared feedback thread" feature have very different RLS shapes, and the milestone context explicitly flags this as unresolved). Building the table before answering this produces either an accidental leak (every PM can browse every other PM's private review notes) or an accidental block (Admin can't actually show the PM the feedback, defeating the point of the feature).

**Why it happens:**
This codebase's established pattern for "who can see this row" is `is_admin() or client_id in (select pm_assigned_clients())` — a *client*-scoped predicate. Admin-comments-on-PM is scoped by *pm_id*, a shape this codebase has never modeled before (comments about a *user*, not about a *client*). Copy-pasting the familiar client-scoping shape onto a user-scoping problem is the most likely mistake, and it's an easy one because it "just works" for the Admin's own view during manual testing (Admin can always see everything, so a broken PM-side branch goes unnoticed until a PM logs in).

**How to avoid:**
Write down the exact visibility rule as a sentence before writing SQL (e.g. "target PM can read comments about themselves; PM cannot read comments about other PMs; PM cannot write comments; only Admin writes"). Add an RLS pgTAP test for the specific case of PM-B trying to read a comment about PM-A, mirroring the existing test style in `supabase/tests/00XX_rls_*_test.sql` (this repo already has 17 such test files — follow the naming and assertion convention, don't invent a new one). Treat "can PM see it at all" as a product decision to confirm with Juliano before writing the policy, not an implementation detail to default silently.

**Warning signs:**
The RLS policy for the new comments table has only one non-admin branch (`pm_id = auth.uid()`) with no test asserting a *different* PM's `auth.uid()` is rejected. The Server Action creating a comment doesn't verify the caller is Admin independently of RLS (recall Pitfall 3 below — this exact class of gap already happened once in this codebase).

**Phase to address:**
Admin PM/PO panel (999.6)

---

### Pitfall 2: Model selection silently breaks the forced-tool-use contract for non-chat call sites

**What goes wrong:**
`lib/ai/structured-extraction.ts` depends on `tool_choice: { type: "tool", name }` — forced tool-use — being honored so the SDK guarantees a single `tool_use` block matching `inputSchema`. Not all Claude models support forced tool-use identically, and per-area model selection (999.1) will, by construction, let a PM/Admin pick a model for the *checklist-generation* or *briefing-auto-fill* "area" — both of which route through this exact shared engine. If the configurable-model UI is built generically (one dropdown, same model list, for every "area" including chat and every structured-extraction consumer), someone will eventually pick a model for a structured-extraction area that doesn't support forced tool-use the same way, and `runStructuredExtraction` will start failing in a way that looks like a backend bug, not a user configuration choice.

**Why it happens:**
The natural implementation is "add a `model` column, read it instead of the `AI_MODEL` constant" — a one-line-feeling change that ignores that the constant is consumed by two structurally different call shapes (streaming free-form chat vs. forced-tool-use structured extraction) with different model-capability requirements.

**How to avoid:**
Scope the configurable areas to an explicit allowlist per generation-point (e.g. chat, checklist generation, briefing auto-fill, card-vs-checklist validation, topic generation, transcript merge) rather than one global model setting, and validate the allowed model list per area against tool-use support before exposing it in the picker — don't just offer every model string the Anthropic account has access to. Add an integration-level smoke test that calls `runStructuredExtraction` with each selectable model at least once (even a cheap Haiku-class model) before shipping the picker, not just with the current default.

**Warning signs:**
The new model-selection table/UI offers the exact same dropdown options everywhere `AI_MODEL` used to be read, with no distinction between the chat call site and the structured-extraction call site. `runStructuredExtraction` starts throwing "no tool_use block in response" (its own documented failure log line) for specific model choices only.

**Phase to address:**
Model selection (999.1) — cross-check against topic pipeline (999.4) and meeting integration (999.7), since both are new structured-extraction consumers that will inherit this same allowlist.

---

### Pitfall 3: A new Editor-facing query reopens the exact "Server Action trusts RLS alone" gap already found once

**What goes wrong:**
The Editor Kanban (999.3) needs new read queries (and possibly new Server Actions, e.g. for reordering by `due_date` or filtering) built on top of the `media_assignee_id`-scoped RLS branches added in `0031_editor_role_rls_and_due_date.sql`. If any *existing* PM/Admin Server Action is reused or lightly adapted for the Editor's queue (e.g. a shared "get card details" or "list cards" helper originally written assuming only PM/Admin could reach it) without adding its own explicit role check, it becomes reachable by an Editor purely because the underlying `cards`/`card_checklist_items`/`card_attachments` RLS SELECT policies were widened to include `media_assignee_id = auth.uid()`. This is not hypothetical — it is *documented as having already happened* in this exact codebase: three PM/Admin Server Actions relied only on RLS and were accidentally authorized for the Editor role when the RLS branch was widened, caught only in verification.

**Why it happens:**
RLS widening and Server Action authorization are decoupled in this codebase by design (Server Actions are supposed to add their own role check on top of RLS, per the `client-access-authz.ts` precedent) — but that discipline is easy to skip for *read* paths specifically, because a leaked read feels lower-stakes than a leaked write, and the existing incident was about reachability of *write* actions, which can make a "read-only Kanban view" feel exempt from the same review.

**How to avoid:**
Before writing any new Editor-facing query or Server Action, grep every existing Server Action in `app/pm/**/actions.ts` and `app/admin/**/actions.ts` that touches `cards`, `card_checklist_items`, or `card_attachments` for a caller-role check independent of RLS (the same audit that found the original 3-action gap). Any helper the Editor Kanban reuses must either (a) already have its own role/ownership check, or (b) get one added as part of this phase — do not assume "it's scoped by RLS" is sufficient, that premise is the one that already failed once. Write a query specifically for the Editor's own use (mirroring `card_checklist_items_update_scoped`'s explicit `media_assignee_id` predicate) rather than reusing a PM/Admin query verbatim.

**Warning signs:**
A new Editor page imports a Server Action from `app/pm/board/actions.ts` or `app/admin/**` without modification. `grep -L` across cards-touching Server Actions for any explicit `role ===` / `is_admin()` / `pm_assigned_clients()` check turns up files with none.

**Phase to address:**
Editor Kanban (999.3) — this is the single highest-severity pitfall in this milestone because the failure mode (authorization bypass) has already occurred once in this exact area of the codebase.

---

### Pitfall 4: The automatic topic-generation cron becomes the first place AI writes without a human confirming

**What goes wrong:**
Every existing AI-touching flow in this codebase (`analyzeTranscriptAgainstFile`, checklist generation, briefing auto-fill) follows "AI proposes a draft → human reviews → human explicitly confirms → then and only then does the write happen" (see `260805-iea`'s own verification: `updateClientFileContent` is a *separate* Server Action from the analysis call, only invoked after the PM clicks "Confirmar atualização"). The topic pipeline (999.4) has two distinct triggers — "generate ~10 topics on client creation" and "weekly trigger proposes new topics" — and the milestone context explicitly separates "propose a topic" (fine to automate) from "approving a topic generates a real post/card" (the confirm step). If the weekly cron is implemented as generate-then-immediately-insert-card (skipping a review UI because "it's just a cron job, there's no user in the loop to click confirm"), it becomes the first exception to this invariant in the entire codebase — a card appears in someone's board that no human ever approved, with `created_by` pointing at a system actor that doesn't exist as a real user.

**Why it happens:**
Cron jobs have no interactive session, which makes "wait for a click" feel architecturally awkward, so the path of least resistance is to have the cron do everything end-to-end. But the actual product requirement, as stated in PROJECT.md, is: cron proposes topics, and *a human approving a topic* is what generates the post — the confirm step still exists, it just needs a UI surface for it (e.g. a "proposed topics" list a PM/Admin approves from), not a bypass.

**How to avoid:**
Model "proposed topic" as its own row/state (not a card) written by the cron, and make "approve a topic → create the card" a separate, explicitly human-triggered Server Action — structurally identical to the transcript-analysis / confirm-update split that already exists. This also solves the `created_by` problem: the card's `created_by` becomes the approving PM/Admin's `auth.uid()`, not a synthetic system user, keeping every card's provenance consistent with the rest of the schema. Reserve the service-role client only for the write the cron itself needs (inserting proposed-topic rows, which have no per-user owner) — never let the cron's job runner insert directly into `cards`.

**Warning signs:**
The topic-pipeline design has the weekly job calling something that inserts into `public.cards` directly. There's no "pending topics" table/state distinct from `cards`. The approve action doesn't require an authenticated PM/Admin session.

**Phase to address:**
Automatic topic-generation pipeline (999.4)

---

### Pitfall 5: The cron job itself uses the service-role client and becomes an unscoped write surface with no caller to authorize

**What goes wrong:**
Because there is no existing cron/webhook infrastructure in this codebase, the topic-pipeline's weekly trigger (999.4) will almost certainly be a Vercel Cron hitting a Route Handler — which has no Supabase Auth session at all, unlike every Server Action written so far. The natural (and only obviously-working) way to write anything from that Route Handler is `createAdminClient()` — the service-role client this codebase has already shipped one real IDOR through (`createClientLogin`/`deactivateClientAccess`, closed in plan `05-05`). A Route Handler with no session has no `pm_assigned_clients()`/`is_admin()` RPC result to check against, so the "authorize before using the admin client" pattern established in `lib/security/client-access-authz.ts` doesn't transfer directly — there is no caller identity to authorize.

**Why it happens:**
Every prior use of `createAdminClient()` in this codebase assumed an authenticated human caller whose scope needed verifying. A cron trigger has no caller to scope at all, so the risk shifts from "IDOR against another user's data" to "endpoint is reachable by anyone who discovers the URL, with full service-role privileges, no auth check needed" — a different but equally serious failure mode this codebase has no existing precedent for defending against.

**How to avoid:**
Protect the Route Handler itself, not just its internal calls: verify Vercel's Cron secret header (`CRON_SECRET` / `Authorization: Bearer` pattern) before running any logic, and reject any request that doesn't match. Keep the admin-client usage inside that handler narrowly scoped to exactly the tables the cron needs to touch (proposed-topics, not `cards` — see Pitfall 4) — don't reuse a broad admin client that could also touch `profiles`/`auth.admin`. Treat this Route Handler with the same scrutiny the milestone context already flags for any new service-role Server Action.

**Warning signs:**
The Route Handler has no secret/signature check and would execute if hit with a plain `curl`. The handler is written to also handle manual/on-demand triggering from an authenticated UI action, conflating "cron-triggered, no session" and "human-triggered, has session" code paths without separating their authorization models.

**Phase to address:**
Automatic topic-generation pipeline (999.4)

---

### Pitfall 6: Repeated "extract only what's new" transcript merges drift into duplication or silent loss across multiple meetings

**What goes wrong:**
The existing transcript flow (`analyzeTranscriptAgainstFile` → `updateClientFileContent`) was verified for a *single* transcript against a *single* base file. Meeting integration (999.7) explicitly requires this to run repeatedly, extracting "only what's new/relevant" per meeting — but the LLM has no ground truth for "new" beyond whatever the current merged `client_files` content looks like at call time. Two failure directions are both plausible: (1) the model re-includes information already merged from a prior meeting because it wasn't confident it was a true duplicate ("mentioned again in a follow-up sense" vs "literally the same fact"), inflating the briefing over time; or (2) the model treats something genuinely new as redundant paraphrasing of existing content and drops it, and because there's no separate transcript-per-meeting record kept (the existing verification explicitly confirmed "exactly 1 row, no separate transcript row"), that information is unrecoverable — there's no raw log to re-derive it from later.

**Why it happens:**
The single-file, no-history design (`client_files` holds only the current merged state, deliberately, per the RAG architecture's "no vector store, inject full content" constraint) is correct for isolating context per client, but it means every repeated merge is a diff against a *lossy compression* of everything that came before, not against the actual meeting history. The model is being asked to deduplicate against its own prior summarization, which compounds errors across meetings — a class of bug that won't show up in the first meeting's verification (which is exactly what `260805-iea` tested) and only appears on the second or third meeting for a given client, well past initial ship.

**How to avoid:**
Do not delete or discard the raw transcript after merging — persist it (even minimally, e.g. a `meeting_transcripts` table with `client_id`, `raw_text`, `meeting_date`, `merged_at`) so a human can audit what was extracted vs. dropped after the fact, and so a future re-run/correction has ground truth to work from. Keep the PM-in-the-loop review step from the existing flow (draft diff shown before "Confirmar atualização") — do not silently auto-merge, especially not for a repeated/automated meeting-calendar trigger, since this is explicitly the flow most likely to run unattended. Have the confirm-review UI show *both* what's being added and, if feasible, flag lines it considered near-duplicates so a PM can catch a bad "not new" call before confirming.

**Warning signs:**
The design for 999.7 has no separate storage for raw transcript text — only the merged `client_files.content` — meaning there's no way to answer "what did meeting 3 actually say?" after the fact. The confirm step is removed or made optional "since it's calendar-triggered now."

**Phase to address:**
Meeting/calendar → briefing integration (999.7)

---

### Pitfall 7: Server-side PDF generation on Vercel silently times out or OOMs on real client image sets, and Drive-link images fail unpredictably

**What goes wrong:**
PDF export (999.8) needs to fetch real client images referenced only as Google Drive share links (per the milestone context and confirmed by this codebase's actual `card_attachments` schema, which stores URLs, not bytes) and embed them in a server-rendered PDF, on Vercel's serverless runtime (execution-time and memory limits, no persistent filesystem, cold-start-sensitive). Two independent failure modes compound: (1) a "share" link (`drive.google.com/file/d/.../view`) is not a fetchable image URL — it returns an HTML viewer page, not image bytes, unless converted to a direct-download form or fetched via the actual Drive API with proper auth, which this codebase has never done (today's Drive integration is purely URL-pattern validation, `lib/attachments/drive-url.ts`, never a real fetch); and (2) even once fetching works, a client with many approved cards each carrying a full-resolution image can push total fetch+render time or memory past Vercel's function limits, especially since Drive itself may throttle unauthenticated/anonymous requests to shared files.

**Why it happens:**
It's easy to prototype PDF export against 1-2 cards with small test images and conclude it works, without ever exercising the actual scale (a client's full "Aprovação do cliente" column) or the actual link format Drive hands out by default (a viewer URL, not a raw file URL) — the gap between "works in a demo" and "works for Juliano's real clients" is exactly the kind of thing that showed up as debt in this codebase before (soft-delete-without-restore-UI, shared-knowledge-base-still-empty).

**How to avoid:**
Resolve each Drive share link to actual downloadable bytes explicitly (either the Drive API's `files.get?alt=media` with a service account/OAuth token, or a documented direct-download URL transform — verify which this codebase's Drive links actually support, since "anyone with the link" sharing has different fetch behavior than an authenticated API call) and treat a failed/timed-out image fetch as a per-card degradation (render the PDF with a placeholder + a visible "imagem indisponível" note) rather than failing the whole export. Set an explicit, tested upper bound on cards-per-export and image size/resolution, and prefer generating the PDF via a streaming/incremental approach (or offloading to a queued background step if Vercel's function limits are exceeded) over one synchronous request-response cycle for a large client.

**Warning signs:**
Manual testing of PDF export only ever uses 1-2 seeded cards with tiny placeholder images. The Drive URL used in tests is a `drive.google.com/uc?id=...&export=download` form rather than the `/file/d/.../view` form PMs actually paste in practice (per `driveLinkType`'s own test cases, both forms exist in this codebase already). No timeout/error handling exists around the image-fetch step — a slow or blocked Drive response hangs the whole export.

**Phase to address:**
Automatic PDF export (999.8)

---

## Technical Debt Patterns

Shortcuts that seem reasonable but create long-term problems.

| Shortcut | Immediate Benefit | Long-term Cost | When Acceptable |
|----------|-------------------|----------------|-----------------|
| Reusing an existing PM/Admin Server Action for the Editor Kanban instead of writing a scoped one | Less code, faster ship | Repeats the exact class of authorization bug already found once in this codebase (Pitfall 3) | Never — this codebase has explicit precedent for why it's unsafe |
| Skipping the "pending topic" review step for the cron-generated topics ("it's automated, no one's waiting to click") | Simpler pipeline, fewer states | Breaks the "AI proposes, human confirms" invariant everywhere else in this app; first unreviewed AI write in production | Never for the card-creation step; acceptable only for the topic *proposal* itself, which is inherently draft-state |
| Using `createAdminClient()` inside the cron Route Handler without a shared-secret check, "just for now, to ship fast" | One less thing to configure before demo | Publicly reachable service-role write endpoint on a production app with real client data | Never, even temporarily — Vercel Cron's `CRON_SECRET` support is a documented, low-effort addition |
| One global AI-model dropdown reused for every "area" instead of a per-area allowlist | One UI component, one settings row | Silent breakage of forced-tool-use call sites when an incompatible model is picked (Pitfall 2) | Acceptable only if every offered model is pre-verified against every consuming call shape, which is effectively the same work as an allowlist |
| Discarding raw meeting transcripts after merging into `client_files` (matching today's single-transcript flow) | Matches existing "no history, injected full content" RAG design; less storage | No audit trail if a repeated merge drops or duplicates real client information (Pitfall 6) — unrecoverable | Never for 999.7's repeated/automated case; the current one-shot manual flow (260805-iea) tolerated this because a PM reviewed it live, once |
| Synchronous, single-request PDF generation with no per-image error handling | Simplest possible implementation | Whole export fails if one Drive image is slow/blocked/unauthenticated (Pitfall 7) | Acceptable for an internal "preview" button with small clients only, not the general-purpose export |

## Integration Gotchas

Common mistakes when connecting to external services.

| Integration | Common Mistake | Correct Approach |
|-------------|----------------|-------------------|
| Google Drive (image fetch for PDF export, 999.8) | Treating a `drive.google.com/file/d/.../view` share link as a directly fetchable image URL | Convert to the Drive API's `files.get?alt=media` call (with proper auth) or a verified direct-download transform; test against both link shapes `driveLinkType` already recognizes in this codebase |
| Anthropic API (per-area model selection, 999.1) | Assuming every model string works identically with `tool_choice: { type: "tool" }` forced tool-use | Maintain an explicit per-area allowlist, verified against `runStructuredExtraction`'s forced-tool-use requirement, not a blanket model list |
| Vercel Cron (topic pipeline, 999.4) | Treating the cron-triggered Route Handler like a normal authenticated Server Action, or leaving it unauthenticated entirely | Verify the `CRON_SECRET`/authorization header Vercel sends before executing; never assume "no one knows the URL" is sufficient protection |
| Gemini (meeting transcription, 999.7) | Assuming Gemini's transcript output format/structure is stable across meetings and skipping validation before feeding it into `runStructuredExtraction`'s prompt assembly | Validate/normalize the transcript text the same way `analyzeTranscriptFileAgainstFile` already validates uploaded file text before extraction |
| Supabase service-role client (`lib/supabase/admin.ts`), any new consumer | Adding a new `createAdminClient()` call site without an accompanying pure, unit-testable authorization predicate (per `lib/security/client-access-authz.ts`'s established remediation pattern) | Any new service-role write gets its own authz module/tests before merge, mirroring the CR-01/CR-02 fix already shipped in this codebase |

## Performance Traps

Patterns that work at small scale but fail as usage grows.

| Trap | Symptoms | Prevention | When It Breaks |
|------|----------|------------|----------------|
| Injecting full `client_files` content plus a growing merged briefing into every structured-extraction prompt (topic pipeline, meeting integration) | Slower AI calls, higher token cost, eventually context-window pressure per client | Cap/monitor briefing length; the RAG architecture already assumes "~3 files, low volume" — repeated meeting merges without pruning breaks that assumption over months | Once a client accumulates many meetings' worth of merged content without any trimming — likely well before 1M-user scale, this is a per-client content-size problem, not a traffic problem |
| Synchronous PDF generation blocking a single Vercel serverless invocation for a client with many approved cards/images | Request timeouts, 504s on export for "big" clients specifically | Stream/paginate rendering, or move to a background job pattern once card counts grow, per Pitfall 7 | Scales with cards-per-client in "Aprovação do cliente" at once, not overall user count — could break with a single active client at moderate volume |
| Weekly topic-generation cron making one Claude call per active client sequentially | Cron duration grows linearly with client count, risking Vercel Cron's own execution limits | Batch/parallelize with a concurrency cap, or fan out to per-client invocations | Becomes noticeable well before "10K users" — this app's own stated scale is "poucos PMs, até ~10 clientes," so even modest growth past that could hit cron duration limits if implemented naively |

## Security Mistakes

Domain-specific security issues beyond general web security.

| Mistake | Risk | Prevention |
|---------|------|------------|
| New Server Action (any of the 6 features) relies solely on RLS for authorization, no independent role/ownership check | Repeats the exact incident already documented in this codebase (Editor RLS widening silently authorized 3 unrelated Server Actions) | Every new Server Action that writes or reads sensitive data gets an explicit caller-role check, mirroring `assertCallerManagesClient`'s pattern, even when RLS "should" already cover it |
| New service-role (`createAdminClient()`) call site added without a pure, testable authorization predicate | Repeats the real IDOR already found and fixed in `createClientLogin`/`deactivateClientAccess` | Follow the `lib/security/client-access-authz.ts` precedent: extract authorization logic into a dependency-free module, unit-test it, call it before any admin-client I/O |
| Admin-comments table (999.6) scoped by a copy-pasted client-scoping RLS shape instead of a deliberately-designed user-scoping shape | Cross-PM data leak of private management feedback, or Admin unable to actually deliver feedback (feature doesn't work) | Explicit, written-down visibility rule + dedicated pgTAP test before merge (Pitfall 1) |
| Cron Route Handler (999.4) reachable without any secret/signature check | Anyone who discovers the URL can trigger service-role writes on demand, on a production app with real client data | Verify Vercel's cron secret/authorization header before executing any logic (Pitfall 5) |
| PDF export Server Action fetches Drive URLs without validating they belong to the requesting caller's authorized clients | An Admin/PM could potentially request a PDF referencing another client's Drive links if the export action doesn't re-derive card ownership server-side | Re-verify every card/attachment referenced in the export belongs to a client the caller is authorized for, the same RLS-plus-explicit-check discipline as every other feature here |

## UX Pitfalls

Common user experience mistakes in this domain.

| Pitfall | User Impact | Better Approach |
|---------|-------------|-------------------|
| Model picker (999.1) exposes raw model IDs/pricing tiers with no guidance | PM/Admin picks a model that breaks structured extraction (Pitfall 2) or silently costs much more per generation | Curate the picker to the pre-verified allowlist per area, with a plain-language note on cost/quality tradeoff |
| Weekly topic proposals appear with no way to distinguish "new" from "already reviewed and dismissed last week" | PM re-reviews the same rejected topics repeatedly, or approves a duplicate | Track proposed-topic state explicitly (proposed/approved/dismissed) so dismissed topics don't resurface |
| Meeting-transcript merge (999.7) runs automatically with no visible diff/confirm step once calendar-triggered | PM has no chance to catch the model treating real new information as duplicate (Pitfall 6), briefing quality silently degrades over time | Keep a lightweight confirm/notification step even for the automated trigger, consistent with the existing manual flow |
| PDF export fails entirely (blank error) when one image is slow/unreachable | PM can't get a usable PDF for an otherwise-ready client just because one Drive link is flaky | Degrade gracefully per-image with a visible placeholder rather than failing the whole document (Pitfall 7) |

## "Looks Done But Isn't" Checklist

Things that appear complete but are missing critical pieces.

- [ ] **Admin comments (999.6):** Often missing a PM-side view/read test entirely — verify by logging in as a *non-target* PM and confirming the comment is NOT visible, not just testing the Admin's own (unrestricted) view.
- [ ] **Model selection (999.1):** Often missing verification against the structured-extraction call sites — verify by actually running `runStructuredExtraction` (checklist gen, briefing auto-fill) with a non-default model selected, not just the chat streaming path.
- [ ] **Editor Kanban (999.3):** Often missing a fresh audit of reused Server Actions — verify every action the new Kanban calls has its own role check independent of RLS, not just that the page renders correctly for an Editor account.
- [ ] **Topic pipeline (999.4):** Often missing the distinction between "proposed" and "created" — verify a card only appears on a board after an explicit human approval action, never directly from the cron's own write path.
- [ ] **Meeting integration (999.7):** Often missing raw-transcript retention — verify a `meeting_transcripts`-style audit record (or equivalent) exists so a human can check what a specific meeting actually said after the merge.
- [ ] **PDF export (999.8):** Often missing real-scale and real-link-format testing — verify with a client that has multiple cards and Drive links pasted in the actual `/file/d/.../view` share format PMs use, not synthetic direct-download URLs.
- [ ] **`shared_knowledge_files` RLS confirmation (999.9):** Often "confirmed" by reading the policy SQL only — verify by actually attempting a non-Admin INSERT/UPDATE/DELETE against a live session and confirming it's rejected, the same live-verification bar this codebase already applies elsewhere (per Phase 2/Phase 5's live-verified precedent in PROJECT.md).

## Recovery Strategies

When pitfalls occur despite prevention, how to recover.

| Pitfall | Recovery Cost | Recovery Steps |
|---------|---------------|-----------------|
| Admin-comments cross-PM leak found post-ship | LOW | Tighten RLS policy immediately (single migration), audit `pg` logs/access history if available for who read what, notify affected PM per Juliano's judgment |
| Model-selection breaks a structured-extraction area | LOW | Revert the area's model to the known-good default (`AI_MODEL`'s current fallback), keep the picker but mark the broken model unavailable for that area until re-verified |
| Editor Kanban reused a Server Action reachable beyond intended scope | MEDIUM | Same remediation shape as the original incident: add the missing role check, migrate/patch RLS if the underlying policy also needs narrowing, audit for any writes that already happened out-of-scope |
| Cron auto-created cards without human approval (invariant broken) | MEDIUM | Soft-delete/flag the auto-created cards for review (per this codebase's existing soft-delete precedent for clients), require retroactive human confirmation before they're treated as real, backfill a proper "proposed topic" state going forward |
| Transcript merge dropped or duplicated real client information | MEDIUM–HIGH depending on data loss | If raw transcripts were retained (per Pitfall 6's prevention), re-run the merge from source; if not retained, this may be unrecoverable — escalate to Juliano/PM to manually re-confirm the client's briefing from memory/notes |
| PDF export times out or produces broken output for a real client | LOW | Fall back to manual export (existing pre-v1.1 process) for that client while the size/timeout limits are fixed; add the failing client's card count/image profile as a new test case |

## Pitfall-to-Phase Mapping

How roadmap phases should address these pitfalls.

| Pitfall | Prevention Phase | Verification |
|---------|-------------------|---------------|
| Admin-comments cross-PM visibility ambiguity (Pitfall 1) | Admin PM/PO panel (999.6) | pgTAP test asserting PM-B cannot read a comment scoped to PM-A; explicit written visibility rule reviewed before RLS is written |
| Model selection breaks forced-tool-use call sites (Pitfall 2) | Model selection (999.1) | Smoke test `runStructuredExtraction` against every selectable model per area before shipping the picker |
| Editor Kanban reuses an under-checked Server Action (Pitfall 3) | Editor Kanban (999.3) | Manual audit of every cards/checklist/attachment Server Action the Editor page touches, confirming an explicit role check exists independent of RLS |
| Cron auto-creates cards without human confirm (Pitfall 4) | Topic pipeline (999.4) | Verify no code path lets the cron write directly to `public.cards`; verify `created_by` on every auto-generated card is a real approving user, never a system actor |
| Cron Route Handler unauthenticated / unscoped service-role use (Pitfall 5) | Topic pipeline (999.4) | Attempt an unauthenticated `curl` against the cron endpoint in staging and confirm it's rejected |
| Repeated transcript merge causes duplication/loss (Pitfall 6) | Meeting integration (999.7) | Query `client_files`/transcript-audit table after 2+ simulated meetings for the same client and manually confirm no duplicated facts and nothing plausible went missing |
| PDF export fails at real scale / real Drive link formats (Pitfall 7) | PDF export (999.8) | Generate a PDF for a client with multiple real `/file/d/.../view`-style Drive links and several cards, not synthetic test data |
| `shared_knowledge_files` write RLS unverified in practice | RLS confirm (999.9) | Live attempt of a non-Admin write against a real session, not just a policy-SQL read-through |

## Sources

- Direct inspection of this codebase: `lib/anthropic/client.ts`, `lib/ai/structured-extraction.ts`, `supabase/migrations/0031_editor_role_rls_and_due_date.sql`, `lib/supabase/admin.ts`, `lib/security/client-access-authz.ts`, `app/pm/clients/[id]/access/actions.ts`, `app/pm/board/actions.ts`, `lib/attachments/drive-url.ts`, `package.json`, `.planning/quick/260805-iea-adicionar-upload-de-arquivo-como-alterna/260805-iea-SUMMARY.md`
- `.planning/PROJECT.md` — Key Decisions table (documents the real IDOR incident in `createClientLogin`/`deactivateClientAccess`, and the real Editor-role authorization gap found during 0031's own planning)
- This milestone's own stated context (orchestrator-provided) — treated as a primary source since it directly names the two prior real incidents this research builds on

---
*Pitfalls research for: BackstageEd.OS v1.1 (subsequent milestone, adding features to a live production system)*
*Researched: 2026-08-16*
