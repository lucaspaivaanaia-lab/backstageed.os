# Feature Research

**Domain:** Internal agency ops tool — social-media content production platform (v1.1: PM operations & content automation)
**Researched:** 2026-08-16
**Confidence:** MEDIUM-HIGH (codebase grounding HIGH; external ecosystem patterns MEDIUM — WebSearch-verified, small-scale-internal-tool context reduces transferability of SaaS-scale patterns)

## Scope Note

This is **not** a general SaaS feature landscape. BackstageEd.OS v1.1 serves one agency, poucos PMs, ~10 clientes. Every recommendation below is filtered through that lens: comparable tools (Wrike, AgencyAnalytics, Loomly, Granola, LaunchDarkly-style model routers) are studied for **the underlying interaction pattern**, not for their enterprise feature depth. Building enterprise-grade versions of any of these 6 features would be over-engineering for this scale — the realistic MVP is called out explicitly per feature.

Six features are researched, each as its own mini-landscape, because they belong to genuinely different domains (PM dashboards, LLM ops, content-ops queues, generative pipelines, meeting-notes sync, reporting/PDF). A single flat table would obscure feature-specific dependencies.

---

## 1. Admin PM/PO Control Panel (workload + comments)

**Comparable tools:** Wrike (workload view + Gantt), Runn (People Planner), Adobe Workfront (management dashboard: burn %, capacity), Productive.io / Teamwork (agency-specific resource dashboards).

### How it typically works
Workload-management tools separate two concerns that are easy to conflate: (1) **status dashboards** (what's the state of each piece of work — this already exists in BackstageEd.OS as the Admin oversight dashboard with staleness badges) and (2) **workload/capacity dashboards** (how much load is each *person* carrying, and is it balanced). The comparable-tool pattern for #2 is: a table or bar-chart view, one row/bar per person, segmented by stage or status, sortable by total load, with drill-down into the person's items. Runn and Workfront add time-based forecasting (weeks ahead) — explicitly overkill for ~10 clients/few PMs. None of the researched tools bundle a "manager comments on this person's performance" feature into the workload view itself; that capability is closer to a lightweight 1:1/performance-notes pattern (seen in HR/PM tools as a simple timestamped note thread attached to a person, not a structured review system).

### Table Stakes vs Differentiator vs Anti-Feature

| Feature | Category | Complexity | Notes |
|---------|----------|------------|-------|
| Clients-per-PM breakdown (which PM owns which clients) | Table stakes | LOW | `pm_clients` table already has this join — this is a query + list rendering, not new data modeling. |
| Workload count by stage per PM (chip/bar visualization) | Table stakes | LOW | **Already built.** `lib/cards/workload.ts` (`computeWorkload`) already produces exactly this shape (`WorkloadRow[]`, count by stage, sorted by total desc) and is already rendered in the existing Admin oversight dashboard (`app/admin/oversight-panel.tsx`). v1.1 work here is presentation (a dedicated per-PM panel/route), not new computation. |
| "Progress" chart (visual, not just numbers) | Differentiator | LOW-MEDIUM | Comparable tools use stacked bar or donut per person. Given `computeWorkload` already returns `byStage` counts, this is a charting-library task (or even CSS-only stacked bars — no need for a charting dependency at this scale) rather than a new data problem. |
| Admin comment thread on a specific PM's management | Differentiator | LOW-MEDIUM | No direct precedent in the researched agency tools as a *workload-panel* feature — closer to a lightweight internal notes/audit-log pattern. New table (e.g. `pm_management_notes`: `pm_id`, `author_id`, `body`, `created_at`), Admin-only write via RLS, same multi-tenant RLS convention already used everywhere else in this codebase (`is_admin()` check). No client-visibility concern (Admin/internal-only), so this is one of the simpler net-new tables in the whole milestone. |
| Time-based capacity forecasting (weeks-ahead planning, like Runn) | Anti-feature | — | Built for agencies with dozens+ of staff and hourly billing. At "poucos PMs, ~10 clientes" this is pure overhead — a real-time stage-count view already tells Juliano who's overloaded *today*, which is the actual problem (replacing Laura's manual spreadsheet). Alternative: if a real forecasting need emerges, revisit only once card volume actually grows. |
| Utilization %/billable-hours tracking | Anti-feature | — | Requires time-tracking data this system doesn't capture and isn't a stated requirement. Alternative: card-count-by-stage is a sufficient workload proxy at this scale. |
| Per-PM historical trend charts (workload over time) | Anti-feature (for v1.1) | — | `computeWorkload` is deliberately a render-time computation, never stored (documented in `workload.ts`) — a trend chart would require a new time-series table, which is a real new complexity axis not currently justified. Defer until an actual need for "was PM X always this loaded" surfaces. |

### v1.0 Dependencies
- **Directly reuses** `lib/cards/workload.ts`'s `computeWorkload()` — no new aggregation logic needed for the count-by-stage view, only new UI shell.
- **Directly reuses** `pm_clients` table for the clients-per-PM breakdown.
- **Follows the RLS/`is_admin()` convention** established across every table in this codebase for the new comments table.
- **Distinct from** the existing Admin oversight dashboard (`app/admin/oversight-panel.tsx`, `app/admin/page.tsx`) — that surface is card/status-centric ("what's the state of every card, any client, any PM") and is explicitly documented as "a read-only triage surface... deliberately does not duplicate" other admin screens' purpose. The new panel is person-centric ("how loaded is this PM, and what does Admin think about their management"). Keep them as two separate routes/components; do not fold the comment feature into the existing oversight panel.

---

## 2. Per-Area AI Model Selection

**Comparable tools:** LaunchDarkly AI Configs (per-feature model config with provider/model/temperature), boost.ai (Settings → System → LLM Configuration, provider+model per LLM type), Microsoft Foundry Model Router, generic multi-provider chat platforms (OpenRouter-style).

### How it typically works
The universal pattern across every researched tool: model choice is stored as **configuration, not code** — a small number of named "slots" (one per feature/task type: e.g. "chat," "extraction," "summarization"), each mapped to a provider+model+parameters (temperature, max_tokens), editable from an admin settings screen, with a sane default and fallback if a slot is unset. None of the researched tools expose full per-request model choice to end users in an internal-tool context — model selection is an **admin-only, feature-level** setting, not a per-message toggle for PMs. Multi-provider routing (OpenAI/Anthropic/Google in one config) is common in larger platforms but is explicit overkill here — this codebase is Claude-API-only by constraint (`ANTHROPIC_API_KEY`, `@anthropic-ai/sdk`), so "per-area model selection" here means "per-area *Claude model* selection" (e.g. Sonnet vs a cheaper/faster Claude tier per generation point), not multi-vendor routing.

### Table Stakes vs Differentiator vs Anti-Feature

| Feature | Category | Complexity | Notes |
|---------|----------|------------|-------|
| One Claude model configurable per "generation point" (chat, structured extraction, briefing extraction, checklist validation, future topic-gen) | Table stakes | LOW-MEDIUM | This codebase already has the *single* central seam this needs: `AI_MODEL` (`lib/anthropic/client.ts`), currently one constant used by every call site (`app/api/chat/route.ts`, `lib/ai/structured-extraction.ts`). The work is: (1) a small `ai_model_settings` table keyed by generation-point identifier → model string, admin-writable via RLS; (2) each call site resolves its own model from that table (with the current `AI_MODEL` env fallback as default) instead of importing the shared constant directly. This is a genuinely small, well-bounded change *because* the codebase already centralized model resolution instead of hardcoding it per call site — the comment in `client.ts` even flags this ("No model change, no user-facing selector — that's a future decision") as the intended next step. |
| Admin settings UI to view/edit the mapping | Table stakes | LOW | Simple form: one row per generation point, a `<Select>` of allowed Claude model strings, save button. Same UI pattern already used elsewhere (`checklist-templates` admin screens). |
| Per-generation-point fallback to a safe default if unset/misconfigured | Table stakes | LOW | Prevents a bad config from breaking chat/extraction entirely — mirrors the existing `process.env.ANTHROPIC_CHAT_MODEL ?? "claude-sonnet-4-5"` fallback pattern, just scoped per row instead of globally. |
| Per-request model override (PM picks model per message in chat) | Anti-feature | — | Not requested, not needed at this scale, and works against the existing "controlled, predictable AI behavior per client" design philosophy (single centralized model constant, single system-prompt assembly path). Alternative: admin sets the model for the "chat" generation point; PMs never see a model picker. |
| Multi-vendor routing (OpenAI/Gemini/Claude compared per request) | Anti-feature | — | Contradicts the existing hard constraint that "a geração de resposta é sempre feita pela Claude API" (PROJECT.md constraint). This feature is scoped to *which Claude model*, not *which vendor*. Building vendor-abstraction now for a single-vendor requirement is pure speculative complexity. |
| Cost/usage dashboard per model | Anti-feature (for v1.1) | — | Nice in principle, no stated requirement, and Anthropic's own console already provides usage data. Defer unless cost actually becomes a visible problem. |

### v1.0 Dependencies
- **Directly extends** `lib/anthropic/client.ts`'s `AI_MODEL` export — this is the single existing seam, and the file's own comments already anticipate this exact feature ("no model change, no user-facing selector — that's a future decision").
- **Must touch every current call site** of `AI_MODEL`: `app/api/chat/route.ts` (chat streaming) and `lib/ai/structured-extraction.ts` (shared extraction engine used by checklist generation, briefing auto-fill, card-vs-checklist validation, package-piece proposal). Because `runStructuredExtraction` is the *single* shared engine for all "AI reads client_files and proposes structured data" features, adding an optional `generationPoint` parameter there (defaulting to a resolved model) is the natural extension point — avoids duplicating model-resolution logic across every feature that calls it.
- **New feature (topic-generation pipeline, #4 below) should be built to read its model from this config from day one** rather than hardcoding a model, since it will ship in the same milestone.

---

## 3. Editor's Own Kanban/Queue

**Status: substantially already built.** This is the most important finding for this feature — treat the "remaining work" framing below as authoritative over a from-scratch feature read.

**Comparable tools:** Asana "My Tasks" (personal queue, sortable by due date, cross-project), ClickUp "Home"/"My Work," Trello "Personal" board filtered by assigned-to-me.

### How it typically works
The near-universal pattern for a single-assignee personal queue (as opposed to a swimlane Kanban) is a **flat, sortable list scoped to "assigned to me," cross-project/cross-client, defaulting to due-date ascending**, with lightweight per-item detail (checklist, attachments) expandable inline rather than requiring navigation away. True Kanban columns (stage-based swimlanes) are the wrong pattern for a personal queue — Asana/ClickUp/etc. all use flat sortable lists for "my work" views specifically because a single person's queue benefits from one linear priority order (due date), not stage grouping, which is what the multi-person team Kanban is for.

### Table Stakes vs Differentiator vs Anti-Feature

| Feature | Category | Complexity | Notes |
|---------|----------|------------|-------|
| All cards where caller is `media_assignee_id`, cross-client | Table stakes | **DONE** | Already implemented: `app/editor/page.tsx` queries `cards` scoped entirely by RLS's `media_assignee_id = auth.uid()` branch (migration `0031_editor_role_rls_and_due_date.sql`), joins client names, checklist items, attachments. |
| Ordered by due date, nulls last | Table stakes | **DONE** | `app/editor/page.tsx` already orders by `due_date ascending, nullsFirst: false`. `due_date` column and index (`idx_cards_due_date`) already exist. |
| Editor's restricted write scope (description only, never stage/checklist structure) | Table stakes | **DONE** | `app/editor/actions.ts`'s `updateCardDescriptionAsEditor` already enforces a hardcoded `{description, updated_at}` payload via `buildEditorCardUpdatePayload`, with a documented app-layer authorization boundary (`assertEditorCaller`) as primary defense, RLS as secondary. |
| Checklist item completion toggle by Editor | Table stakes | **PARTIALLY DONE** | RLS already splits `card_checklist_items` write policy so Editor can `UPDATE` (toggle) but not `INSERT`/`DELETE` (migration `0031`). Confirm the queue UI (`editor-queue-panel.tsx`) actually surfaces a toggle control wired to the existing `toggleChecklistItem` Server Action — if it currently only *displays* checklist state read-only, wiring the toggle is the remaining gap, not new RLS/schema work. |
| Visual urgency cue for overdue/near-due cards | Differentiator | LOW | Cheap addition (date comparison + badge color) given `due_date` already flows through; mirrors the existing staleness-badge pattern (`lib/cards/staleness.ts`) already used on the Admin oversight dashboard — reuse that visual language rather than inventing a new one. |
| True swimlane Kanban (stage columns) for the Editor | Anti-feature | — | Wrong pattern for a single-assignee queue (see "How it typically works" above) — Editor cards can span every stage from `producao` onward, but the Editor's own mental model is "what do I need to finish, in what order," not "which stage is each thing in." The existing flat due-date-sorted list is the *correct* pattern already, not a placeholder for a future Kanban — do not "upgrade" this to swimlanes. |
| Drag-and-drop reordering by Editor | Anti-feature | — | `due_date` is PM/Admin-set (per migration `0031`'s own comment: "editable ONLY via PM/Admin's existing `updateCardDetailsSchema`... never by the Editor"); allowing Editor drag-reorder would either be cosmetic-only (confusing, doesn't persist) or would require giving Editor write access to `due_date`, which contradicts the deliberate scope lock already documented in the migration. |

### v1.0 Dependencies
- **Already built on top of:** `cards.due_date` + index (migration `0031`), the Editor RLS branch on `cards`/`card_checklist_items`/`clients`/`card_attachments` (migration `0031`), and `updateCardDescriptionAsEditor` (`app/editor/actions.ts`).
- **Remaining v1.1 work is narrow**: verify/complete checklist-toggle wiring in the UI, add due-date urgency styling (reuse `lib/cards/staleness.ts` pattern), and any UX polish — not new data modeling or RLS.
- **Recommendation for the roadmap:** scope this phase small. Treat it as "close the gap on an already 90%-built feature," not a full feature build — sizing it like features 4-6 below would overestimate effort.

---

## 4. Automatic Topic-Generation Pipeline

**Comparable tools:** Loomly (AI topic suggestions from trends/RSS/custom triggers), Buffer AI Assistant, generic "AI drafts, editor approves/schedules/rejects" content-ops workflows.

### How it typically works
The dominant pattern across every researched content-ops tool is a strict three-step loop: **(1) AI proposes a batch of candidate topics** (on a trigger — client onboarding, a recurring cadence, or a manual "give me more ideas" action) **(2) a human reviews each candidate individually** (approve / edit / reject — never a bulk auto-accept) **(3) only approved candidates become real, schedulable content objects**. Every source explicitly frames the human step as non-optional: "a person still owns the goal... AI removes the blank-page problem... not the judgment calls." This maps exactly onto this codebase's own established, already-shipped convention — "AI proposes, human confirms" — which is not just a stated project principle but an existing, working code pattern (see Dependencies below).

### Table Stakes vs Differentiator vs Anti-Feature

| Feature | Category | Complexity | Notes |
|---------|----------|------------|-------|
| Auto-generate ~10 topic proposals on client creation | Table stakes | MEDIUM | New generation point built on the existing `runStructuredExtraction` engine (forced tool-use, Zod-revalidated) — same shape as the existing package-piece-proposal flow (`lib/cards/package-proposal.ts` + `validateCardAgainstChecklist`'s pattern), just triggered by client creation instead of a pasted planning doc, and reading `client_files`/briefing as its source material instead of pasted text. |
| Configurable posts/week volume per client | Table stakes | LOW | One new column on `clients` (e.g. `posts_per_week int`), admin-editable — same convention as every other single-column addition in this codebase's migration history (`clients_tag`, `clients_briefing_text`, etc.). Drives topic-batch sizing for the weekly re-proposal trigger. |
| Weekly re-proposal trigger (new batch of topic candidates) | Table stakes | MEDIUM-HIGH | The one genuinely new infrastructure piece: this codebase currently has **no scheduled/cron job** — every existing AI generation is triggered synchronously by a user action (chat message, "generate checklist" click, "validate card" click). A weekly trigger needs either a Vercel Cron Job (Next.js supports this natively, low complexity to add) calling a Route Handler that iterates active clients, or an external scheduler hitting an authenticated endpoint. This is the single highest-complexity net-new piece across all 6 features — flag for phase-specific research on Vercel Cron + long-running/rate-limit concerns if all ~10 clients regenerate topics in one run. |
| Approve/reject UI per proposed topic | Table stakes | LOW-MEDIUM | Mirrors the existing package-piece-proposal review UI pattern (propose N items → review each → confirm). New table needed: `topic_proposals` (client_id, title/summary, status: pending/approved/rejected, proposed_at, batch/trigger source). |
| Approved topic → real card | Table stakes | LOW | Reuses the **existing** card-creation path exactly as the milestone context specifies — an approved `topic_proposals` row becomes a `cards` row via the same `createCard`-equivalent flow already used elsewhere (stage=`briefing`, `client_id`, `title`), so it enters the existing checklist-gated pipeline unchanged. No new card lifecycle logic. |
| Auto-publish or auto-advance a topic past `briefing` without human approval | Anti-feature | — | Directly contradicts both the stated non-negotiable "AI proposes, human confirms" pattern and the existing checklist-gate architecture (`lib/cards/checklist-gate.ts`) that already prevents any card from silently skipping review stages. |
| Trend/RSS-driven topic sourcing (like Loomly) | Anti-feature (for v1.1) | — | Loomly-style trend scraping requires external data sources this system has no access to and no stated need for — this platform's topic source is the client's own briefing/context (`client_files`), which is the whole point of the isolated-RAG design. Sourcing topics from generic internet trends would also risk the exact cross-client-context bleed this system was built to prevent if not carefully isolated. |
| Fully automatic weekly card creation (skip the proposal/approval step entirely) | Anti-feature | — | Same reasoning as above — would silently create `briefing`-stage cards without any human judgment call, breaking the pattern that every other AI-touching feature in this codebase (checklist generation, briefing extraction, package-piece proposal) already follows. |

### v1.0 Dependencies
- **Reuses `lib/ai/structured-extraction.ts`'s `runStructuredExtraction`** — the single existing "AI proposes structured data, Zod re-validates" engine. This is the most direct precedent in the whole codebase for this feature; do not build a parallel extraction path.
- **Directly mirrors the existing package-piece-proposal pattern** (`lib/cards/package-proposal.ts`, `proposePackagePiecesSchema`) — propose N candidates → human reviews individually → approved ones become real `cards` rows. Treat this as the reference implementation to adapt, not a from-scratch design.
- **Depends on the existing `createCard` path and checklist system** (explicitly flagged in the milestone context) — an approved topic must enter the pipeline exactly the same way a manually-created card does, including checklist-template assignment per client and the `briefing` starting stage, so it's gated by the same `card_checklist_items`/`checklist-gate.ts` logic every other card already goes through.
- **Depends on client briefing/`client_files`** as the topic-generation source material — same RLS-scoped, per-client-isolated context injection already used by chat and other extraction features (no new isolation mechanism needed, reuse the existing one).
- **New infrastructure dependency**: needs a scheduling mechanism (Vercel Cron or equivalent) that does not currently exist anywhere in this codebase — flag explicitly for the roadmap as the one piece of this feature that isn't "extend an existing pattern."
- **Should read its model choice from feature #2's per-area model config** (built in the same milestone) rather than hardcoding a model for this new generation point.

---

## 5. Meeting/Calendar → Briefing Integration (Gemini transcripts)

**Comparable tools:** Granola (meeting notes → CRM field sync), Otter.ai / Fireflies / Fathom (transcript → CRM auto-update), general "AI condenses transcript → maps to fields → updates record" pipelines.

### How it typically works
The consistent pattern across every researched transcript-to-record tool is a five-step pipeline: **transcript arrives → AI condenses/summarizes → AI extracts only the fields/facts relevant to the target record → maps extracted facts to the record's schema → record is updated** (either automatically for high-confidence low-risk fields, or via human review for anything ambiguous — several tools explicitly flag-for-human-review when extraction confidence or entity-matching is uncertain). The "extract only new/relevant info, never the full transcript" requirement stated in the milestone context matches this pattern exactly, and matches the existing brief-extraction philosophy in this codebase (`0027_clients_briefing_text.sql` — a single free-text `briefing` field populated by AI extraction from source documents, not a raw dump).

### Table Stakes vs Differentiator vs Anti-Feature

| Feature | Category | Complexity | Notes |
|---------|----------|------------|-------|
| Ingest a Gemini meeting transcript per client (manual paste or Gemini-provided link/webhook) | Table stakes | MEDIUM | Milestone explicitly scopes OUT automatic capture via Google Calendar/Meet ("Captura automática de transcrições de reunião via Google Calendar/Meet — mapeado como integração futura, não faz parte do processo central v1" — PROJECT.md Out of Scope). So the realistic v1.1 shape is: PM pastes/uploads a Gemini transcript for a specific client meeting, triggering extraction — not a live calendar integration. This matters: it removes the highest-complexity part (OAuth to Google Calendar/Meet, webhook infrastructure) from this milestone's actual scope. |
| Extract only new/relevant info per meeting (not full transcript dump) into the client's `briefing` field | Table stakes | MEDIUM | Reuses `runStructuredExtraction`/`lib/ai/structured-extraction.ts` again — same engine, new generation point, with an instruction telling the model to diff against the *existing* `briefing` content and propose only additive/new information, not a wholesale rewrite. This is a prompt-engineering + review-flow problem more than a new architecture problem, given the extraction engine already exists. |
| Human review before the extracted delta is merged into `briefing` | Table stakes | LOW-MEDIUM | Consistent with the "AI proposes, human confirms" pattern and directly consistent with how `briefing` extraction already works today (PM-triggered extraction from `client_files`, not silently auto-written). Show the proposed addition as a diff/preview, PM confirms merge. |
| Full transcript stored anywhere, surfaced to the client-facing area | Anti-feature | — | Explicitly against the stated requirement ("nunca o transcript completo") and against the whole RAG-isolation design philosophy of this codebase — raw meeting transcripts are exactly the kind of unstructured, unreviewed content the manual-curation model (`client_files`/knowledge curation) was built to keep out. Alternative: store the transcript as a transient input to the extraction step only (or not at all beyond the extraction call), never as a persisted client-visible artifact. |
| Automatic live capture from Google Calendar/Meet | Anti-feature (for v1.1) | — | Explicitly out of scope per PROJECT.md — flag any temptation to build this now as scope creep; it requires OAuth/webhook infrastructure this milestone doesn't need. |
| Multi-meeting timeline/history view of what changed in briefing over time | Differentiator | LOW-MEDIUM | Cheap to add if each extraction event is logged (source meeting → what was added), and gives Juliano/PM traceability ("why does the briefing say X" → "from the March 3 meeting"). Not essential for MVP but low-cost given the extraction pipeline already needs to know what changed. |

### v1.0 Dependencies
- **Reuses `runStructuredExtraction`** exactly as features #2 and #4 do — one more generation point on the same shared engine, not a new AI-calling architecture.
- **Directly extends the existing `briefing` field/extraction model** (migration `0027`, the "single free-text field extracted by AI" decision already made and shipped) — this feature is best framed as "one more source feeding the same briefing-extraction pipeline that already exists for `client_files`," not a new content-storage concept.
- **Must respect the same per-client RLS isolation** already governing `client_files`/`briefing` — a meeting transcript for Client A must never be able to influence Client B's briefing, same non-negotiable isolation constraint stated in PROJECT.md.
- **Should read its model choice from feature #2's config** for the same reason as #4.

---

## 6. Automatic PDF Export (per-client approval-stage report)

**Comparable tools:** AgencyAnalytics, Whatagraph, Reportei (cross-channel agency reporting, auto-PDF), Stencil (data → branded PDF template, API-driven).

### How it typically works
The consistent pattern for "structured data → branded, revisable PDF" tools is: a **template** (visual/branded layout, editable independent of the data) bound to a **data query** (here: all cards for client X currently in `aprovacao_cliente` stage), rendered on-demand (button click) or on a schedule, with the template treated as a first-class, versionable artifact separate from the generation logic — exactly matching the milestone's explicit requirement for "via template revisável." This is described by every source as directly replacing a manual reporting workflow (the exact framing given for this feature: "replace a currently-manual doc/PDF workflow the team already does by hand") — the realistic MVP in every comparable tool is a single fixed template with the data bound in, not a drag-and-drop template builder.

### Table Stakes vs Differentiator vs Anti-Feature

| Feature | Category | Complexity | Notes |
|---------|----------|------------|-------|
| One PDF per client, pulling all cards currently in `aprovacao_cliente` stage | Table stakes | LOW-MEDIUM | Pure data-fetch problem — `cards` already has `stage`, `client_id`, `title`; the query is a straightforward RLS-scoped `select where stage = 'aprovacao_cliente' and client_id = X`, identical shape to queries already used elsewhere (e.g. the client-facing approval board). |
| Includes date, title, text, image per card | Table stakes | LOW-MEDIUM | Date and title/text already live on `cards`/its description field. "Image" needs resolving: this system stores media as Google Drive *links* (`card_attachments`), not uploaded binary files — a PDF can embed an image only if it can fetch actual image bytes. Two realistic approaches: (a) fetch the Drive-linked image server-side at export time (requires Drive API read access to the linked file, which may or may not already be authorized depending on link sharing settings) or (b) the PDF shows a thumbnail/link-out rather than an embedded image if the file isn't fetchable. **This is the one open technical question in this feature — flag for phase-specific research**: confirm whether the existing Google Drive link-attachment mechanism supports server-side image fetch, or whether the PDF must fall back to "linked, not embedded" for images. |
| PDF generation library/service choice | Table stakes | LOW-MEDIUM | Next.js/Vercel-compatible options (verify at implementation time, not asserted here as fact): `@react-pdf/renderer` (React-component-based PDF, fits this codebase's existing React/TSX authoring pattern well) or a headless-Chromium HTML-to-PDF approach (heavier, less Vercel-serverless-friendly due to binary size/cold-start). Given the codebase's consistent preference for lightweight, dependency-minimal solutions (no vector DB for RAG, no external services where avoidable), a React-component PDF renderer is the better fit than a headless-browser approach — but this should be verified against current library docs (Context7/official docs) at implementation time rather than assumed. |
| "Revisable template" — the layout is editable without a code change | Table stakes | MEDIUM | The requirement says "revisable," which most naturally maps to: the template is expressed as one clearly-isolated component/file (not scattered across the codebase) that a developer can revise easily — not necessarily a non-technical drag-and-drop builder. At this scale (internal tool, no client-facing template customization requested), "revisable by whoever touches the code next" is the right bar, not a full WYSIWYG template editor. |
| On-demand generation (button click by PM/Admin) | Table stakes | LOW | Directly replaces the manual workflow — no scheduling/cron needed for this feature (contrast with #4's weekly trigger), matching "one PDF per client... via a revisable template" as a pull, not push, action. |
| Multiple template variants / per-client branding customization | Differentiator (defer) | MEDIUM-HIGH | Every researched tool (AgencyAnalytics etc.) treats multi-template/branding as a paid-tier differentiator for external-facing agency products serving *their own* clients at scale. This tool has one internal template revised centrally — no stated need for per-client visual customization. Defer entirely unless a real client asks for agency branding differences. |
| Scheduled/automatic recurring PDF generation & delivery | Anti-feature (for v1.1) | — | Not requested — milestone explicitly frames this as replacing a manual PDF workflow the team already does "by hand," implying an on-demand trigger is sufficient. Adding scheduling now duplicates the complexity #4 already needs to solve once (Vercel Cron) without a stated requirement to justify it here. |
| Email delivery of the generated PDF | Anti-feature | — | Explicitly out of scope for the whole v1.1 milestone — PROJECT.md's existing Out of Scope list already excludes email notifications entirely ("Notificações por email — v1 é só in-app"), and nothing in the PDF-export requirement changes that. |

### v1.0 Dependencies
- **Reuses the existing `aprovacao_cliente`-stage card query pattern** — same RLS-scoped `cards` query shape already used by the client-facing approval board.
- **Reuses `card_attachments`** (Google Drive links, migration `0018`) for the image requirement — but flag the open question above (server-side fetchability of Drive-linked images) as needing verification before this is estimated with confidence.
- **No dependency on feature #2 (model selection)** — this is a non-AI feature (pure data → template rendering), the only one of the six that doesn't touch `runStructuredExtraction`/Claude at all.
- **No dependency on #4's scheduling infrastructure** — deliberately on-demand, not scheduled, so it should not be built to depend on the Vercel Cron work introduced for #4.

---

## Feature Dependencies

```
[#2 Per-area AI model selection]
    └──shared by──> [#4 Topic-generation pipeline]   (reads model from #2's config)
    └──shared by──> [#5 Meeting→briefing integration] (reads model from #2's config)
    (both #4 and #5 also work correctly without #2 landing first — #2 just
     adds a config layer on top of the existing single AI_MODEL constant;
     sequencing #2 before #4/#5 avoids a later retrofit, but is not a hard
     technical blocker)

[Existing: lib/ai/structured-extraction.ts (runStructuredExtraction)]
    └──required by──> [#4 Topic-generation pipeline]
    └──required by──> [#5 Meeting→briefing integration]
    (both are new generation points on the SAME existing engine — no new
     AI-calling architecture needed for either)

[Existing: createCard path + checklist system]
    └──required by──> [#4 Topic-generation pipeline]  (approved topic -> real card, enters checklist gate exactly like a manual card)

[Existing: lib/cards/workload.ts (computeWorkload)]
    └──required by──> [#1 Admin PM/PO control panel]  (workload breakdown reuses this directly, no new aggregation)

[Existing: cards.due_date + Editor RLS branch (migration 0031)]
    └──required by──> [#3 Editor's own queue]  (already built on top of this — #3 is largely DONE, not new)

[#1 Admin PM/PO control panel] ──must stay separate from──> [Existing Admin oversight dashboard]
    (different purpose: workload/person-centric vs status/card-centric — do not merge into one screen)

[#4 Topic-generation pipeline] ──needs──> [New: Vercel Cron or equivalent scheduling]
    (the ONLY feature in this milestone requiring net-new scheduled-job infrastructure)

[#6 PDF export] ──independent of──> [#2, #4, #5]
    (no AI dependency, no scheduling dependency — can be built/shipped in any order relative to the other 5)
```

### Dependency Notes

- **#4 and #5 both depend on the existing `runStructuredExtraction` engine, not on each other** — they can be built in parallel/either order.
- **#1 is nearly all reuse** (`computeWorkload`, `pm_clients`) plus one small net-new table (management comments) — lowest-risk, most reuse-heavy feature in the milestone.
- **#3 is mostly already shipped** — sequence it as a small verification/polish task, not a full build, to avoid over-allocating roadmap time to it.
- **#4 is the highest-complexity feature** because it is the only one requiring genuinely new infrastructure (a scheduler) rather than extending an existing pattern — flag for deeper phase-specific research (Vercel Cron behavior, rate limits if generating for ~10 clients in one run, idempotency if a run fails partway).
- **#6's open question (image embedding from Google Drive links) should be resolved early** in that phase, since it affects whether the "image" requirement is fully met or degrades to link-out — this is a feasibility check, not a design decision, and should happen before committing to a PDF library.
- **#2 conflicts with nothing** — it's purely additive configuration on an existing single-constant seam; the only "conflict" is temporal (should land before #4/#5 to avoid retrofitting them to read from config instead of the hardcoded constant, but doesn't block either from starting).

---

## MVP Definition

### Launch With (v1.1)

- [ ] **#1**: clients-per-PM list + workload-by-stage view (reusing `computeWorkload`) + simple comment thread per PM — no charts required for MVP, a stacked-count table is sufficient; add a basic bar/donut visualization only if trivial with existing UI components.
- [ ] **#2**: one config table mapping generation-point → Claude model string, with the existing `AI_MODEL` constant as the default/fallback for any unset row; wire it into `runStructuredExtraction` and the chat route.
- [ ] **#3**: verify/complete checklist-toggle wiring in the existing Editor queue UI; add due-date urgency badge reusing the staleness-badge visual pattern. Treat as a small closeout task.
- [ ] **#4**: topic-proposal generation reusing `runStructuredExtraction`, approve/reject review UI, approved → real card via existing `createCard` path. Weekly trigger via Vercel Cron. Posts/week as a plain client column.
- [ ] **#5**: manual transcript paste/upload per client (not live Calendar/Meet capture — explicitly out of scope), extraction of new-only content into `briefing`, human-confirm-before-merge step.
- [ ] **#6**: on-demand PDF per client, one fixed revisable template, pulling `aprovacao_cliente`-stage cards (date/title/text/image-or-link).

### Add After Validation (v1.x)

- [ ] Multi-meeting briefing change history/timeline (#5) — once the core extraction flow proves reliable, add traceability.
- [ ] Visual chart upgrade for workload panel (#1) — once the table/count view is validated as sufficient or insufficient.
- [ ] Per-client PDF branding/template variants (#6) — only if a real client requests it.

### Future Consideration (v2+)

- [ ] Live Google Calendar/Meet capture (#5) — already explicitly deferred in PROJECT.md, requires OAuth/webhook infra.
- [ ] Multi-vendor AI routing (#2) — contradicts current single-vendor (Claude-only) constraint; revisit only if that constraint itself changes.
- [ ] Time-based capacity forecasting (#1) — only relevant at meaningfully larger PM/client counts than "poucos PMs, ~10 clientes."
- [ ] Scheduled/emailed PDF delivery (#6) — blocked by the existing project-wide "no email notifications" decision.

## Feature Prioritization Matrix

| Feature | User Value | Implementation Cost | Priority |
|---------|------------|----------------------|----------|
| #3 Editor queue (closeout) | MEDIUM | LOW (mostly done) | P1 |
| #1 Admin PM/PO panel | HIGH | LOW-MEDIUM (mostly reuse) | P1 |
| #2 Per-area AI model selection | MEDIUM | LOW-MEDIUM | P1 |
| #6 PDF export | HIGH (direct manual-workflow replacement) | MEDIUM | P1 |
| #5 Meeting→briefing integration | MEDIUM-HIGH | MEDIUM | P1-P2 |
| #4 Topic-generation pipeline | HIGH | MEDIUM-HIGH (new scheduling infra) | P2 |

**Priority key:**
- P1: Must have for this milestone — either high value at low/reused-cost, or a direct replacement of a known painful manual process.
- P2: Should have, but carries the milestone's one genuinely new infrastructure dependency (scheduling) — sequence after the config work in #2 lands, and after confirming Vercel Cron's fit.

## Sources

- Codebase (HIGH confidence — direct inspection, 2026-08-16): `lib/cards/workload.ts`, `app/admin/oversight-panel.tsx`, `app/editor/page.tsx`, `app/editor/actions.ts`, `app/editor/editor-queue-panel.tsx`, `lib/anthropic/client.ts`, `lib/ai/structured-extraction.ts`, `lib/cards/package-proposal.ts`, migrations `0015`, `0018`, `0027`, `0029`, `0031`, `0032`, and `.planning/PROJECT.md`.
- [Wrike agency project management guide](https://www.wrike.com/project-management-guide/faq/what-are-project-management-tools/) — MEDIUM confidence, workload-dashboard pattern
- [Teamwork — Agency Management Software](https://www.teamwork.com/blog/agency-management-software/) — MEDIUM confidence
- [Adobe Workfront agency project management](https://business.adobe.com/qa_ar/products/workfront/agency-project-management.html) — MEDIUM confidence, burn %/capacity dashboard pattern
- [Sight AI — AI Powered Content Calendar Tools](https://www.trysight.ai/blog/ai-powered-content-calendar-tools) — MEDIUM confidence, topic-approval workflow pattern
- [Buda AI — AI Content Calendar Guide](https://buda.im/blog/ai-content-calendar-step-by-step) — MEDIUM confidence, "human owns judgment calls" framing
- [Granola — Meeting notes to CRM automation](https://www.granola.ai/blog/meeting-notes-to-crm-automation) — MEDIUM confidence, transcript→field extraction pipeline
- [Layer3labs — AI Meeting Notes to CRM](https://www.layer3labs.io/guides/ai-meeting-notes-to-crm) — MEDIUM confidence, extract-only-relevant-fields pattern
- [Low Code Agency — AI meeting transcriptions to CRM updates](https://www.lowcode.agency/blog/how-to-use-ai-to-turn-meeting-transcriptions-into-crm-updates) — MEDIUM confidence
- [Optimum Web — Automatic PDF Report Generator 2026](https://www.optimum-web.com/blog/automatic-pdf-report-generator-2026/) — MEDIUM confidence, template-bound-to-data-query pattern
- [SocialRails — Client Social Media Reporting Templates](https://socialrails.com/blog/client-social-media-reporting-templates) — LOW-MEDIUM confidence (marketing content, but consistent with other sources)
- [boost.ai — LLM configuration](https://boost.elevio.help/en/articles/868-llm-configuration) — MEDIUM confidence, per-feature provider/model config pattern
- [LaunchDarkly — Create and manage AI model configurations](https://launchdarkly.com/docs/home/agentcontrol/create-model-config) — MEDIUM-HIGH confidence (official docs), per-feature model-config pattern with fallback
- [LIA Blog — LLM Governance: Managing 24 AI Models from a Single Dashboard](https://lia.jeyswork.com/en/blog/llm-config-governance) — MEDIUM confidence, per-task-type model tuning pattern

---
*Feature research for: BackstageEd.OS v1.1 (PM Operations & Content Automation)*
*Researched: 2026-08-16*
