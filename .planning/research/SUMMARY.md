# Project Research Summary

**Project:** BackstageEd.OS — v1.1 "PM Operations & Content Automation" milestone
**Domain:** Internal agency ops / content-production platform (subsequent milestone on a live, shipped Next.js + Supabase app)
**Researched:** 2026-08-16
**Confidence:** HIGH

## Executive Summary

This is not a greenfield build — it's 6 additive features (Admin PM/PO panel, per-area AI model selection, Editor's own Kanban, automatic topic-generation, meeting→briefing integration, PDF export) layered onto a working Next.js (App Router) + Supabase (Postgres/Auth/RLS) + `@anthropic-ai/sdk` app already in production for ~10 clients. All four research passes converge on the same conclusion: **the codebase already has load-bearing patterns for almost everything requested** — a shared "AI proposes, human confirms" extraction engine (`lib/ai/structured-extraction.ts`), a workload aggregator (`lib/cards/workload.ts`), an Editor RLS branch and queue UI that's already ~90% built, and a "re-read through RLS, never trust an id" Server Action discipline. The correct approach for v1.1 is disciplined reuse and small, targeted additions — not new architecture. Two features (Editor Kanban, Admin panel) are largely closeout/extension work; two features (AI model selection, PDF export) are small-to-medium net-new pieces with one real integration gap each; two features (topic-generation, meeting integration) introduce this codebase's first scheduled/cron infrastructure and its first repeated-automated-write risk, respectively.

The key risk across the milestone is **not** picking the wrong library — stack choices are well-supported and low-ambiguity (`@react-pdf/renderer` for PDF, Vercel Cron for scheduling, a Postgres settings table for model selection, paste-based ingestion for meeting notes). The key risk is **process/authorization regression**: this exact codebase has already shipped one real IDOR (`createClientLogin`/`deactivateClientAccess`, service-role client with no independent authz check) and one real RLS-widening-silently-authorizes-unrelated-actions incident (Editor role, migration `0031`). Both failure classes recur structurally in this milestone — the topic-generation cron is a brand-new unauthenticated-by-default entry point requiring `createAdminClient()`, and the Editor Kanban's remaining work sits exactly on top of the RLS branch that already caused a leak once. The second major risk is silently breaking the codebase's one non-negotiable invariant — "AI proposes, human confirms" — anywhere automation (cron, calendar triggers) removes the interactive click that currently gates every AI write.

Recommended mitigation: build AI model selection first (foundational, lowest risk, unblocks the other two AI features from a clean start), sequence the near-zero-risk closeout features (Admin panel, Editor Kanban) early for momentum, then tackle the two genuinely novel-infrastructure features (topic-generation cron, PDF export with Drive image fetch) with their own dedicated research/verification passes, and treat meeting integration as **paste-based only** for v1.1 (stack research resolved an ambiguity architecture research flagged — no OAuth/Google Meet API needed this milestone).

## Key Findings

### Recommended Stack

The stack requires exactly two new npm packages — everything else is either a Vercel platform feature (Cron) or a Postgres table + existing UI primitives. All four researched additions are chosen specifically to avoid new categories of infrastructure this codebase doesn't already run (no headless browser, no external scheduler/queue SaaS, no multi-provider AI abstraction, no new OAuth flow).

**Core technologies:**
- `@react-pdf/renderer` (`^4.6.1`): per-client "Aprovação do cliente" PDF export — pure-JS layout engine (no Chromium subprocess), returns a `Buffer` directly from a Route Handler, fits the codebase's React/TSX authoring convention. Node.js runtime required (not Edge — the default for Route Handlers, so no config change needed as long as no one adds `export const runtime = "edge"`).
- Vercel Cron Jobs (`vercel.json`, no package): weekly topic-proposal trigger — zero new infra on an already-100%-Vercel project; needs its own `CRON_SECRET` bearer-token check since cron requests carry no user session.
- `recharts` (`^3.10.1`, via `shadcn add chart`): workload/progress visualization in the Admin panel — matches the existing Radix/shadcn/CVA design system rather than introducing a second component library (e.g. Tremor).
- Existing `zod`, `components/ui/select.tsx`, `@anthropic-ai/sdk` (already typed with every current Claude model, including `claude-sonnet-5`, `claude-opus-4-8`, `claude-haiku-4-5`): reused as-is for model selection — no new package.

**Critical version/runtime notes:** `@react-pdf/renderer` only supports PNG/JPEG images fetched from a direct byte-stream URL — a pasted Google Drive share link (`drive.google.com/file/d/<id>/view`) is an HTML viewer page, not a fetchable image, and needs a resolution step before it can be embedded. This is flagged consistently across all four research files as the single highest-uncertainty technical gap in the milestone.

### Expected Features

Six features, each scoped tightly to "poucos PMs, ~10 clientes" — enterprise-agency patterns (capacity forecasting, multi-template branding, trend-scraped topics, live Calendar/Meet OAuth capture) are explicitly identified as anti-features/over-engineering at this scale across every researched comparable tool category.

**Must have (table stakes) — the v1.1 MVP:**
- Admin panel: clients-per-PM breakdown + workload-by-stage view (reusing `computeWorkload` verbatim) + a lightweight comment thread per PM (new table, Admin-only)
- Per-area AI model selection: one settings table mapping generation-point → Claude model string, with the existing `AI_MODEL` constant as fallback; wired into chat and every `runStructuredExtraction` call site
- Editor Kanban: verify/complete checklist-toggle wiring + due-date urgency badge — this feature is ~90% already shipped in v1.0
- Topic-generation pipeline: ~10 proposals on client creation (synchronous) + weekly re-proposal (Vercel Cron), approve/reject review UI, approved topic → real card via the existing `createCard` path — never a direct cron-to-`cards` write
- Meeting→briefing integration: PM pastes Gemini-generated meeting notes into a textarea; extraction of only new/changed content into `briefing` via the existing `runStructuredExtraction` engine, human-confirmed before merge
- PDF export: one PDF per client, on-demand (button), pulling `aprovacao_cliente`-stage cards (date/title/text/image-or-link), one fixed revisable template (a React component, not a WYSIWYG builder)

**Should have (differentiators, cheap if trivial):** basic bar/donut chart for workload (vs. a stacked-count table), visual urgency cue for overdue Editor cards, multi-meeting briefing change-history/traceability log.

**Defer (v2+):** time-based capacity forecasting, utilization/billable-hours tracking, per-PM historical workload trends, multi-vendor AI routing, live Google Calendar/Meet OAuth capture (explicitly excluded in PROJECT.md's Out of Scope), per-request model picker for PMs, scheduled/emailed PDF delivery (project-wide "no email notifications" decision still applies), multi-template/branding PDF variants, cost/usage-per-model dashboard (Anthropic Console already covers this).

### Architecture Approach

Every new feature should extend one of four already-proven patterns rather than introduce a new one: (1) Server Actions that `zod`-validate input, authenticate, re-read the caller's own row for an app-layer authz predicate, then re-read the *target* row through RLS before writing a hardcoded column payload; (2) `lib/ai/structured-extraction.ts` as the single shared "AI proposes, human confirms" engine for every new AI-touching feature (topic generation, meeting-note extraction both become new generation points on this same engine, not new AI-calling architecture); (3) `createAdminClient()` (service-role) used only where no user session exists (the cron route), always paired with its own explicit authorization check since RLS provides zero protection there; (4) pure, unit-tested aggregation/computation helpers (`lib/cards/workload.ts`-style) co-located with their thin I/O call site.

**Major components (new/extended):**
1. `ai_model_settings` table + `lib/ai/model-settings.ts` (`getModelForArea`) — new lookup layer sitting in front of every `AI_MODEL` call site; must ship first since Features 4 and 5 both add new call sites to `structured-extraction.ts`
2. `pm_admin_notes` table + `lib/actions/pm-notes.ts` — small, Admin-only-write extension bolted onto the *existing* `/admin` oversight page (not a new dashboard)
3. `topic_proposals` table (deliberately **not** a new `cards` stage) + `app/api/cron/generate-topics/route.ts` (this codebase's second-ever Route Handler and first-ever scheduled entry point) + `lib/actions/topic-proposals.ts` calling the existing, unmodified `createCard`
4. `lib/pdf/build-client-approval-pdf.ts` + `app/api/export/[clientId]/pdf/route.ts` — new rendering module and Route Handler, reusing the existing `aprovacao_cliente`-stage query shape

### Critical Pitfalls

1. **Cron auto-creates cards without human confirmation** — the weekly topic job must write only to a new `topic_proposals` table; a human-triggered `approveTopicProposal` action (real session, real `auth.uid()` as `created_by`) is the only path into `createCard`. Never let the cron insert directly into `cards`.
2. **Cron Route Handler used as an unscoped, unauthenticated service-role write surface** — this is a structurally new failure mode (no caller identity to authorize at all, unlike every prior `createAdminClient()` use). Verify Vercel's `CRON_SECRET`/`Authorization: Bearer` header as the first line of the handler before any privileged write; scope the admin client narrowly to `topic_proposals` only.
3. **Editor Kanban work reopens the exact "Server Action trusts RLS alone" gap already found once** in this codebase's Editor RLS migration (`0031`) — any reused PM/Admin Server Action for the Editor queue needs its own independent role check; audit every action the queue touches rather than assuming RLS scoping is sufficient.
4. **Model selection silently breaks the forced-tool-use contract** — not every Claude model supports `tool_choice: { type: "tool" }` identically; a generic one-dropdown-fits-all-areas picker risks silently breaking checklist generation/briefing autofill for a bad model choice. Use a per-generation-point allowlist, smoke-tested against `runStructuredExtraction` before shipping the picker.
5. **PDF export fails unpredictably on real Drive links and real client scale** — a `drive.google.com/file/d/.../view` share URL is not a fetchable image byte stream; untested against real multi-card/multi-image clients, this becomes timeouts or broken exports. Resolve link format explicitly, degrade per-image (placeholder) rather than failing the whole document, and test with real-format links, not synthetic direct-download URLs.

## Implications for Roadmap

Based on combined research, suggested phase structure (6 phases, matching the 6 target features, sequenced by risk/dependency rather than feature-list order):

### Phase 1: Per-Area AI Model Selection
**Rationale:** Foundational and lowest-conceptual-risk — it's a single well-understood seam (`AI_MODEL` constant → per-area lookup) that both the topic-generation and meeting-integration features will call into. Building it first means those two features get their model resolution wired in from day one instead of a later retrofit.
**Delivers:** `ai_model_settings` table, `lib/ai/model-settings.ts`, Admin settings UI, `AI_MODEL` call sites (chat route + `structured-extraction.ts` callers) migrated to per-area resolution with safe fallback.
**Addresses:** Table-stakes feature #2 from FEATURES.md (configurable Claude model per generation point, admin-only, no per-request PM picker).
**Avoids:** Pitfall 2 (forced-tool-use breakage) — ship with a per-area allowlist and a smoke test against `runStructuredExtraction`, not a single global model list.

### Phase 2: Admin PM/PO Control Panel
**Rationale:** Almost entirely reuse (`computeWorkload`, `pm_clients`) plus one small, low-risk net-new table — the fastest, lowest-risk win in the milestone; sequenced early for momentum without blocking or depending on anything else.
**Delivers:** Per-PM workload view extending the existing `/admin` oversight page, `pm_admin_notes` table + comment UI.
**Uses:** `recharts` (via `shadcn add chart`) if a visual chart is added beyond the count table; existing `lib/cards/workload.ts`.
**Implements:** Extension of the existing Admin oversight module (architecture explicitly warns: keep this a separate person-centric surface, do not merge into the card-centric oversight dashboard).
**Avoids:** Pitfall 1 (admin comments as an uncontrolled cross-PM read surface) — write down the exact visibility rule (target PM can read comments about themselves; cannot read comments about other PMs; cannot write) and add a pgTAP test for PM-B reading a comment about PM-A before merging RLS.

### Phase 3: Editor's Own Kanban/Queue (closeout)
**Rationale:** ~90% already shipped in v1.0 (`app/editor/page.tsx`, due-date ordering, restricted write scope, checklist RLS split all exist). This is verification/completion work, not a build — sequence early as a quick, low-risk win, but do not size it like the other phases.
**Delivers:** Confirmed/wired checklist-toggle control in the UI, due-date urgency badge (reusing the existing staleness-badge pattern), and — pending a product clarification on "Kanban" (flat list vs. stage-grouped columns) — possibly a client-side regrouping of the existing query into stage columns.
**Addresses:** Table-stakes feature #3 (cross-client, due-date-ordered personal queue).
**Avoids:** Pitfall 3 (reusing an under-checked PM/Admin Server Action for a new Editor-facing call) — audit every action the Editor queue touches for an independent role check before wiring anything new to it, mirroring the audit that caught the original 3-action gap in migration `0031`.

### Phase 4: Automatic Topic-Generation Pipeline
**Rationale:** The single highest-complexity feature — the only one requiring genuinely new infrastructure (this codebase's first scheduled/cron entry point) rather than extending an existing pattern. Sequenced after Phases 1-3 so the cron-auth pattern is established cleanly, on a codebase the team has re-familiarized itself with, and so Phase 5 can reuse the same cron-auth convention if it ends up needing one.
**Delivers:** `topic_proposals` table (explicitly not a new `cards` stage), `clients.posts_per_week` column, `app/api/cron/generate-topics/route.ts`, `vercel.json` cron config, `lib/actions/topic-proposals.ts` (approve → existing `createCard`; reject → dismiss), synchronous ~10-topic generation on client creation, approve/reject review UI.
**Addresses:** Table-stakes feature #4 in full (proposal generation, configurable volume, weekly trigger, approve/reject, approved-topic-becomes-real-card).
**Avoids:** Pitfall 4 (cron becomes the first unreviewed AI write in the codebase — model as its own state, never a direct `cards` insert) and Pitfall 5 (cron Route Handler as an unscoped, unauthenticated service-role write surface — `CRON_SECRET` check as the first line of the handler).

### Phase 5: Meeting/Calendar → Briefing Integration
**Rationale:** Nearly all reuse of the existing transcript-analysis flow (`lib/actions/client-files.ts`'s `analyzeTranscriptAgainstFile`/`analyzeTranscriptFileAgainstFile`, `updateClientFileContent`, the confirm-review UI). Architecture research flagged an apparent conflict with PROJECT.md's Out of Scope list (live Calendar/Meet capture explicitly deferred) — **stack research resolves this**: the realistic, zero-new-infrastructure v1.1 shape is a "paste the Gemini-generated notes" textarea, not a live Google Meet API/OAuth integration, which fully satisfies the requirement's actual hard part (extract-only-what's-new) without opening the Out-of-Scope conflict at all.
**Delivers:** A "cole as notas da reunião" textarea on the client page, a new generation point on `runStructuredExtraction` instructed to return only new/changed content vs. the existing `briefing`, human-confirm-before-merge step (reusing `transcript-update-section.tsx`'s pattern).
**Addresses:** Table-stakes feature #5 (delta-only extraction into `briefing`, human-reviewed, no full transcript surfaced to clients).
**Avoids:** Pitfall 6 (repeated "extract only what's new" merges drift into duplication or silent loss across multiple meetings, since `client_files` only ever holds the current merged state, with no history) — persist the raw pasted notes (even minimally, e.g. a `meeting_transcripts`-style table keyed by client/date) so a human can audit what was extracted vs. dropped after the fact, and keep the confirm-review step mandatory, never optional, even though this trigger is more manual-adjacent than Phase 4's cron.

### Phase 6: Automatic PDF Export
**Rationale:** Fully independent of Phases 1-5 (no AI dependency, no scheduling dependency) — sequenced last so its one new third-party dependency decision (PDF library) and its Google Drive image-fetch open question can be resolved with the rest of the milestone's scope already settled, without blocking anything else.
**Delivers:** `app/api/export/[clientId]/pdf/route.ts`, `lib/pdf/build-client-approval-pdf.ts`, `@react-pdf/renderer` integration, an explicit resolution of the Drive-share-link → fetchable-image-bytes gap (either restrict export to already-fetchable image URLs, or add a normalization/fetch step).
**Uses:** `@react-pdf/renderer` (`^4.6.1`) — chosen specifically to avoid Puppeteer/Chromium's subprocess and bundle-size problems on Vercel serverless.
**Avoids:** Pitfall 7 (server-side PDF generation silently times out or produces broken output at real client scale/real Drive link formats) — test against real `/file/d/.../view`-format links and multi-card clients, not synthetic 1-2-card demos; degrade gracefully per-image (placeholder) rather than failing the whole export.

### Phase Ordering Rationale

- **Foundational-config-first:** Phase 1 (model selection) is purely additive configuration on an existing single-constant seam that Phases 4 and 5 both extend — sequencing it first avoids a later retrofit of those two features' new `structured-extraction.ts` call sites.
- **Risk-ascending:** Phases 2-3 are near-zero-risk extensions of proven, already-tested modules (`workload.ts`, the Editor RLS branch); Phases 4-6 are the three features touching genuinely new infrastructure this codebase has never had before (a scheduled entry point, a second Route Handler class, a new external PDF dependency, and — for Phase 6 specifically — the codebase's first real image-fetch-from-Drive-link problem). Building the low-risk phases first builds momentum and re-familiarizes the team with codebase conventions before the higher-stakes phases.
- **Invariant-protection ordering:** Phases 4 and 5 are sequenced with explicit attention to preserving the "AI proposes, human confirms" invariant that governs every existing AI-touching feature — both phases must model their new automation as a proposal/draft state with a mandatory human confirm step, never a silent auto-write, which is the single cross-cutting theme repeated across the pitfalls, features, and architecture research.
- **Independence exploited:** Phase 6 (PDF export) has zero dependency on Phases 1-5 and vice versa — it is sequenced last purely to keep the milestone's genuinely novel dependency decisions (PDF library, Drive image fetch) isolated and decided last, not because of a technical blocker.

### Research Flags

Phases likely needing deeper research during planning:
- **Phase 4 (Topic-generation pipeline):** Vercel Cron behavior at this project's actual scale (sequential per-client Claude calls against Cron's execution-time limits if all ~10 clients regenerate in one run), idempotency if a run fails partway, and the `CRON_SECRET` authorization pattern being established for the first time in this codebase.
- **Phase 5 (Meeting integration):** Confirm the exact scope reading with the user before detailed planning — "via Gemini" should mean paste-based ingestion of Gemini-generated notes (per stack research), not live Calendar/Meet capture; also verify current prompt wording in `runTranscriptAnalysis` genuinely enforces delta-only extraction across repeated meetings, not just a single one.
- **Phase 6 (PDF export):** The open technical question — whether pasted Google Drive share links can be resolved to fetchable image bytes server-side without a new Google API/OAuth integration — should be resolved early in this phase, before committing to a final PDF-library integration approach, since it's a feasibility check, not a design decision.

Phases with standard patterns (skip research-phase):
- **Phase 1 (Model selection):** Well-documented pattern already anticipated in the codebase's own comments (`lib/anthropic/client.ts`); a settings table + lookup module is standard.
- **Phase 2 (Admin panel):** Nearly all reuse of `computeWorkload`/`pm_clients`; the one new table follows the exact RLS/`is_admin()` convention used everywhere else in this codebase.
- **Phase 3 (Editor Kanban closeout):** Verification/completion work on an already-shipped feature — no new architecture.

## Confidence Assessment

| Area | Confidence | Notes |
|------|------------|-------|
| Stack | HIGH for PDF generation, Vercel Cron, and model IDs (verified against installed `node_modules` types, official docs, current npm registry). MEDIUM/LOW specifically for the Gemini/Google Meet transcript-export surface — no direct export API exists for the actual consumer tool the team uses, so the recommendation (paste-based) is a reasoned workaround, not a confirmed vendor capability. |
| Features | MEDIUM-HIGH — codebase grounding is HIGH (direct inspection of `lib/cards/workload.ts`, `app/editor/*`, `lib/anthropic/client.ts`, etc.); external comparable-tool patterns are WebSearch-verified at MEDIUM confidence, and small-scale-internal-tool context reduces how directly SaaS-scale patterns (Wrike, Runn, LaunchDarkly) transfer. |
| Architecture | HIGH — grounded directly in the current, live codebase (migrations, Server Actions, existing components), not general ecosystem patterns; the integration plan per feature cites specific existing files as the extension point. |
| Pitfalls | HIGH — grounded in this codebase's own documented incidents (the `createClientLogin`/`deactivateClientAccess` IDOR, the Editor-role RLS-widening gap found during migration `0031`'s own planning), not generic security advice. |

**Overall confidence:** HIGH

### Gaps to Address

- **Meeting-integration scope conflict (resolved by synthesis, confirm with user before planning Phase 5):** Architecture research flagged apparent tension between the milestone's stated goal ("integração de reunião → briefing via Gemini") and PROJECT.md's Out of Scope list (which defers live Calendar/Meet capture). Stack research independently arrived at the same resolution architecture asked for: paste-based ingestion of Gemini-generated notes satisfies the requirement with zero new OAuth/Google Cloud infrastructure and doesn't touch the deferred scope item at all. Still worth a one-line confirmation with the user/Juliano before Phase 5 planning, since "via Gemini" could theoretically be read as requiring live capture.
- **PDF image embedding from Drive links:** All four research files independently flag this as the milestone's one open feasibility question — whether a pasted Drive share link can be resolved server-side to fetchable image bytes without adding a new Google API/OAuth integration. Recommend resolving this explicitly and early in Phase 6, potentially with a spike/prototype, before committing to final scope (embedded images vs. link-out fallback).
- **"Kanban" interpretation for the Editor queue (Phase 3):** The existing implementation is a flat, due-date-sorted list; the milestone's use of the word "Kanban" could mean (a) the requirement is already met and just needs re-validation, or (b) stage-grouped columns are expected. Confirm with the user before scoping Phase 3's plan — the work is trivial either way (presentational only if (b)), but the phase's definition-of-done differs.
- **Admin-comment visibility rule (Phase 2):** Not a technical gap so much as an unmade product decision — whether a PM can see comments written about them, and whether comments are Admin-private notes or a shared feedback thread. Should be answered as a one-sentence product decision before RLS is written in Phase 2, per Pitfall 1.

## Sources

### Primary (HIGH confidence)
- Direct codebase inspection (all 4 research files): `lib/anthropic/client.ts`, `lib/ai/structured-extraction.ts`, `lib/cards/workload.ts`, `lib/cards/staleness.ts`, `lib/cards/oversight-filters.ts`, `app/editor/*`, `app/pm/board/actions.ts`, `app/admin/*`, `lib/actions/{clients,client-files,checklist-templates}.ts`, `lib/security/client-access-authz.ts`, `lib/supabase/admin.ts`, `lib/attachments/drive-url.ts`, `supabase/migrations/{0001,0004,0006,0015,0018,0025,0026,0027,0029,0031,0032}`, `package.json`, `.planning/PROJECT.md`
- `node_modules/@anthropic-ai/sdk/resources/messages/messages.d.ts` (installed `@anthropic-ai/sdk@0.112.4`) — ground-truth Claude model list
- npm registry direct checks (`npm view <pkg> version`), 2026-08-16 — `@react-pdf/renderer@4.6.1`, `recharts@3.10.1`, `pdf-lib@1.17.1`, `googleapis@174.0.1`
- https://react-pdf.org/compatibility — Node.js runtime support
- https://developers.google.com/workspace/meet/api/reference/rest/v2 — Google Meet REST API v2 transcript resources (official docs, HIGH confidence on capability; unverified against this team's actual Workspace edition/admin settings)
- LaunchDarkly official docs — AI model config-per-feature pattern with fallback

### Secondary (MEDIUM confidence)
- WebSearch: Vercel serverless PDF generation constraints, Vercel Cron plan limits (`vercel.com/changelog/cron-jobs-now-support-100-per-project-on-every-plan`)
- WebSearch: consumer-facing Gemini/Google Meet notetaker export limitations (tldv.io, noota.io, and other third-party comparisons — consistent across multiple independent sources)
- Comparable-tool research: Wrike, Runn, Adobe Workfront (workload dashboards); boost.ai, LaunchDarkly AI Configs (per-area model config); Granola, Layer3labs, Low Code Agency (transcript→record extraction pipelines); AgencyAnalytics, Whatagraph, Reportei (template-bound-to-data-query PDF reporting)

### Tertiary (LOW confidence)
- Newer Claude model tiers (`claude-fable-5`, `claude-mythos-5`) — WebSearch-only confirmation of positioning/pricing; verify in the Anthropic Console before exposing in a client-facing dropdown.
- Marketing-content sources (e.g. SocialRails blog) used only as directional confirmation of the PDF-reporting pattern, not as primary evidence.

---
*Research completed: 2026-08-16*
*Ready for roadmap: yes*
