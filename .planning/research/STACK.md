# Stack Research

**Domain:** v1.1 feature additions to an existing Next.js 16 + Supabase + Anthropic SDK app (BackstageEd.OS)
**Researched:** 2026-08-16
**Confidence:** HIGH for PDF generation, Vercel Cron, and model selection (verified against installed package types, official docs, and current npm registry). MEDIUM/LOW for the Gemini meeting-transcript integration surface (no direct API exists for the actual tool the team uses — see below, this is the one area with real ambiguity).

This document covers ONLY new additions needed for the 6 v1.1 features. It assumes everything already validated in v1.0 (Next.js 16 App Router + Server Actions, Supabase Postgres/Auth/RLS, `@anthropic-ai/sdk` server-only singleton in `lib/anthropic/client.ts`, Vercel hosting, dnd-kit Kanban, the `runStructuredExtraction` "AI proposes, human confirms" engine in `lib/ai/structured-extraction.ts`) stays as-is.

## Recommended Stack

### Core Technologies

| Technology | Version | Purpose | Why Recommended |
|------------|---------|---------|-----------------|
| `@react-pdf/renderer` | `^4.6.1` | Generate the per-client "Aprovação do cliente" PDF (feature 6) | Pure-JS layout engine (no headless browser), runs in a plain Node.js serverless function, `renderToBuffer()` returns an in-memory `Buffer` you can stream straight out of a Route Handler response — no `/tmp` writes needed on Vercel's ephemeral filesystem. Template = a React component (JSX), which fits "revisable/editable template" far better than a low-level PDF API, and keeps the whole stack in TypeScript/React, matching everything else in this codebase. |
| Vercel Cron Jobs (`vercel.json` → `crons`) | Platform feature, no package | Weekly topic-proposal trigger (feature 4) | Not an npm dependency — a native Vercel platform feature. The project is already 100% Vercel; this is the zero-new-infra way to get a recurring HTTP GET to a Route Handler on a schedule. |
| `recharts` | `^3.10.1` (installed via `shadcn add chart`, which the project already uses for its other primitives) | Workload/progress charts in the Admin PM/PO panel (feature 1) | shadcn's official `chart` component wraps Recharts and matches the Radix/CVA/Tailwind design system already in `components/ui/`. Avoids introducing a second, competing design system (see "What NOT to Use"). |

### Supporting Libraries

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `zod` (already installed, `^4.4.3`) | existing | Validate the AI-model dropdown value against a curated allow-list before it's persisted or passed to `anthropic.messages.create` | Model selection (feature 2) — reuse, no new package |
| existing `components/ui/select.tsx` (shadcn/Radix `Select`) | existing | Model-selection dropdown UI, per-area | Model selection (feature 2) — reuse, no new package |
| `@react-pdf/renderer`'s `Font.register` | bundled with the core package | Embed a brand font in the PDF by fetching it from a URL at render time | Only if the default Helvetica/Times/Courier set isn't acceptable for the client-facing PDF |

### Development Tools

| Tool | Purpose | Notes |
|------|---------|-------|
| `vercel dev` / Vercel Preview Deployments | Test the Cron-invoked Route Handler and the PDF Route Handler in an environment that matches production's Node.js serverless runtime | Local `next dev` alone won't exercise Vercel's cron trigger — trigger the endpoint manually (`curl` with the `CRON_SECRET` bearer header) during development instead |

## Installation

```bash
# Core — PDF generation
npm install @react-pdf/renderer

# Core — admin panel charts (or run `npx shadcn add chart`, which installs recharts as its dependency automatically and generates the wrapper component under components/ui/chart.tsx)
npm install recharts

# No installation needed for:
# - Vercel Cron (config-only, see vercel.json below)
# - Model selection (Postgres column + existing zod/select.tsx/@anthropic-ai/sdk)
# - Gemini meeting-notes integration in v1.1 scope (paste-based, see below — reuses existing AI extraction engine)
```

## Feature-by-Feature Findings

### (a) PDF generation on Vercel's serverless Node.js runtime

**Recommendation: `@react-pdf/renderer@4.6.1`.**

- It is a from-scratch layout engine (own flexbox implementation via Yoga), not a browser wrapper — it does not spawn a subprocess or need a Chromium binary, which is the #1 way PDF generation breaks on Vercel serverless functions (subprocess spawning is not supported in that runtime, and the Chromium binary alone is ~300 MB, close to/over historical function bundle limits).
- `renderToBuffer(<Document>...</Document>)` returns a Node `Buffer` — return it directly from a Route Handler (`app/api/clients/[id]/export-pdf/route.ts` or similar) with `Content-Type: application/pdf`. No filesystem write, so Vercel's read-only/ephemeral `/tmp` is a non-issue.
- Requires the **Node.js runtime**, not Edge (confirmed: tested against Node 18/20/21; Edge is not a supported target). Next.js Route Handlers default to the Node.js runtime unless you explicitly opt into `export const runtime = "edge"` — so as long as nobody adds that line to this route, it works with zero extra config.
- `<Image src="...">` accepts a plain remote URL string and fetches it at render time — but **only PNG and JPEG** are supported (not WebP/GIF, not SVG without the separate `@react-pdf/renderer` SVG primitives). Since this project's card images are attached as pasted Google Drive links (`lib/attachments/drive-url.ts` — currently just a URL-shape validator, no live Drive API fetch exists), plan for a normalization step: a raw `drive.google.com/file/d/<ID>/view` share link is **not** a directly-fetchable image byte stream and will fail inside `<Image>`. This needs either (1) restricting the PDF export to attachments already stored as direct image URLs, or (2) resolving the Drive share link to a fetchable byte stream server-side before handing it to `<Image>`. This is a real integration gap between the existing "paste a Drive link" pattern and PDF embedding — flag it for the phase that implements feature 6, it is not solved by picking a PDF library.
- Run PDF generation on-demand from a Server Action/Route Handler triggered by the PM/Admin clicking "export," not on a hot path — generate, return, and let the browser download it. No caching layer is needed at this project's scale (≤10 clients).

**Alternative considered:** `pdf-lib@1.17.1` — a lower-level library for creating/modifying PDFs by drawing text/shapes at absolute coordinates, or filling an existing PDF template's form fields. It has no layout engine (no flexbox/flow), so a multi-card, variable-length "one PDF per client with N cards" document would require hand-rolled pagination and positioning logic. Use `pdf-lib` instead of `@react-pdf/renderer` only if the team designs the PDF as a fixed-field template in a PDF editor (e.g., a one-page cover letter with fillable fields) rather than a repeating list layout — that is not this feature's shape.

### What NOT to use for PDF generation

| Avoid | Why | Use Instead |
|-------|-----|--------------|
| Puppeteer / Playwright + `@sparticuz/chromium` (headless-Chrome HTML→PDF) | Needs a ~50–300 MB Chromium binary layer, subprocess spawning that serverless functions don't support natively (requires special serverless-Chromium builds), and meaningfully higher cold-start latency — all to solve a problem (pixel-perfect arbitrary HTML/CSS rendering) this feature doesn't have. The PDF content here is a simple, known, repeating structure (date/title/text/image per card). | `@react-pdf/renderer` |
| A third-party "PDF API" SaaS (e.g. a hosted HTML-to-PDF service) | Adds an external dependency, a new vendor/API key, and recurring cost for a need fully solvable in-process | `@react-pdf/renderer` |

### (b) Weekly scheduled job on Vercel

**Recommendation: Vercel Cron Jobs, configured in `vercel.json`, invoking a Route Handler. No external scheduler needed.**

```json
{
  "crons": [
    {
      "path": "/api/cron/weekly-topics",
      "schedule": "0 9 * * 1"
    }
  ]
}
```

- `schedule` uses standard 5-field POSIX cron syntax, evaluated in UTC. `0 9 * * 1` = every Monday at 09:00 UTC.
- Vercel invokes the path with an HTTP `GET` and, if a `CRON_SECRET` environment variable is set, automatically sends `Authorization: Bearer <CRON_SECRET>` — the Route Handler must check that header itself; there is no session/user attached to a cron-triggered request. **This is a new pattern for this codebase**: every existing Route Handler/Server Action assumes an authenticated PM/Admin/Client/Editor session via Supabase Auth + RLS. The cron endpoint needs its own, separate auth check (verify the bearer secret) before doing anything — RLS alone won't protect it since the request carries no user session, so the handler will need to use a service-role Supabase client scoped explicitly to the cron's own logic, not a per-request user client.
- Plan-tier limits: Hobby has historically capped cron *frequency* at once-per-day-per-job (a weekly schedule is less frequent than daily, so it's within that limit regardless of tier) and Vercel raised the *job-count* cap to 100 jobs per project on every plan. This project needs exactly one cron job (the weekly topic proposal), so it comfortably fits Hobby or Pro either way — no plan upgrade is a hard requirement for this feature specifically.
- The other trigger in feature 4 — auto-generating ~10 topics **on client creation** — is not a cron concern at all; it's a synchronous (or fire-and-forget) call inside the existing "create client" Server Action, reusing the same structured-extraction pattern already used for briefing autofill.

### What NOT to use for scheduling

| Avoid | Why | Use Instead |
|-------|-----|--------------|
| External scheduler (GitHub Actions cron, cron-job.org, Upstash QStash, Inngest, a dedicated worker/queue service) | Adds a new account, secret, and moving part to manage and monitor for a single once-a-week, non-time-critical job. This pipeline's failure mode is "topics weren't proposed this Monday" — not high-stakes enough to justify retry/backoff/queueing infrastructure. Vercel Cron's built-in retry (single retry on failure) is sufficient. | Vercel Cron |
| A long-running background worker / dedicated queue system | Vercel functions are request/response, but the weekly job here is a single bounded unit of work (generate topics for N clients, write rows to Postgres) well within a serverless function's execution window — no need for a persistent worker process | Vercel Cron invoking a Route Handler that does the work synchronously |

### (c) Gemini meeting-transcript integration — clarifying the actual surface

This is the one area where "what the team asked for" and "what's technically available" need to be reconciled, and I want to be explicit about the ambiguity rather than assume it away.

**There is no "Gemini API" that produces or exposes meeting transcripts.** The Anthropic-style "Gemini API" (Google AI Studio / Vertex AI's generative model endpoint) is unrelated to meeting transcription — it's a plain LLM API, not a transcription service. What the team actually uses is **"Take notes with Gemini" inside Google Meet**, a Google Workspace feature that:
- Produces a **Google Doc** (not raw structured transcript data) containing discussion points, decisions, and suggested next steps.
- Auto-attaches that doc to the Calendar event and saves it to Google Drive.
- Has **no built-in export/API button in the consumer UI** — per current Google documentation and third-party comparisons, the standard way to get that content elsewhere today is copy-paste out of the Doc.

There IS a real, separate Google API that can pull structured transcript text programmatically: the **Google Meet REST API v2** (`conferenceRecords.transcripts`, `conferenceRecords.transcripts.entries`). This is genuine, current (Google for Developers docs), and would technically satisfy "pull automatically." But it requires infrastructure this codebase does not have at all today:
- A Google Cloud project with the Meet API enabled and an OAuth consent screen (or a service account with domain-wide delegation) verified against the Workspace domain.
- Meet-specific OAuth scopes, granted per-organizer or via admin-level delegation.
- Confirmation that the team's Workspace edition actually supports the notetaker/transcript feature (plan-dependent) and that transcription is turned on per-meeting.
- This project currently has **zero live Google API calls** anywhere — `lib/attachments/drive-url.ts` only validates that a pasted URL *looks like* a `drive.google.com`/`docs.google.com` link; it never calls the Drive API. Adding real OAuth + a Google Cloud project would be the first Google API integration in the codebase, a nontrivial new piece of infrastructure and secret-management surface, not a "swap a library" change — and it directly resembles the "captura automática de transcrições de reunião via Google Calendar/Meet" item PROJECT.md's Out of Scope section still lists as a deferred future integration.

**Recommendation for v1.1: paste-based ingestion, zero new libraries.**

Given (1) the consumer-facing Gemini notetaker has no simple export API anyway, (2) the real Meet API path requires new Google Cloud/OAuth infrastructure this codebase doesn't have, and (3) the requirement's actual hard part — "extract only what's new/relevant, never the full transcript" — is a text-processing problem, not a transport problem:

- Add a "cole as notas da reunião" (paste meeting notes) textarea to the client page. The PM copies the Gemini-generated notes from the Google Doc (exactly how the team already interacts with that doc) and pastes the text in.
- Feed `[current briefing] + [pasted notes]` through the **existing** `runStructuredExtraction` engine (`lib/ai/structured-extraction.ts`) with a new tool schema/instruction whose job is specifically "return only what's new or changed relative to the existing briefing" — not a summary of the whole meeting. This reuses the exact same forced-tool-use, Zod-revalidated, "AI proposes, human confirms" pattern already used for checklist generation, briefing autofill, and card validation. The PM reviews and confirms before it's appended to `briefing`, matching the codebase's existing convention that nothing an LLM generates is auto-persisted.
- This satisfies the requirement's actual behavior (delta-only extraction) with **zero new packages, zero new OAuth flow, zero new Google Cloud project** — the extraction logic doesn't care whether the source text arrived via paste or a future real API pull.

**Flag for later (explicitly out of v1.1 scope):** if the team later wants this fully automatic (no PM paste step), the real upgrade path is the Google Meet REST API (`googleapis@174.0.1` npm package, or raw REST calls) plus a proper OAuth/service-account setup — a distinct, larger piece of work that should be its own phase, not bundled into this milestone's PDF/cron/model-selection work.

### (d) Model-selection abstraction

**Recommendation: no new library. A Postgres column + a dropdown is correct, not an under-engineered shortcut.**

- The project's own constraint is explicit: response generation is *always* via the Claude API (`@anthropic-ai/sdk`). "Per-area model selection" means choosing which **Claude model** runs at each generation point, not switching providers. There is exactly one provider in play, so a multi-provider abstraction layer (Vercel AI SDK, LangChain, etc.) would add indirection with no corresponding capability gained right now — classic premature abstraction for a requirement that doesn't exist yet.
- Today, `lib/anthropic/client.ts` exports one hardcoded constant, `AI_MODEL`, imported by exactly two call sites (`app/api/chat/route.ts` for chat streaming, `lib/ai/structured-extraction.ts` — the single shared engine behind checklist generation, briefing autofill, and card validation). The correct v1.1 change is: stop importing the top-level constant directly at each call site; instead resolve a `model: string` value per generation point (e.g., from a new small config table or column keyed by "area" — `chat`, `checklist_validation`, `briefing_autofill`, etc. — optionally with a per-client override) and pass it explicitly into `anthropic.messages.create({ model, ... })`. `AI_MODEL` can remain as the system-wide fallback default.
- Validate the selected value against a small curated allow-list (a Zod `z.enum([...])`, not free text) before it's ever persisted or sent to the API — never trust a client-submitted model string outright, consistent with this codebase's existing "never trust client input" convention (Server Actions re-validate everything server-side, per `lib/attachments/drive-url.ts`'s own documented pattern).
- UI: the existing shadcn/Radix `Select` component (`components/ui/select.tsx`) already used elsewhere in the app — a simple dropdown per area, no new UI package.

**Current model IDs available (verified directly from the installed `@anthropic-ai/sdk@0.112.4` type definitions — `Model` union in `node_modules/@anthropic-ai/sdk/resources/messages/messages.d.ts`, HIGH confidence, ground truth from the SDK actually in this project's `node_modules`):**

`claude-sonnet-5`, `claude-opus-4-8`, `claude-opus-4-7`, `claude-opus-4-6`, `claude-opus-4-5`, `claude-opus-4-1`, `claude-sonnet-4-6`, `claude-sonnet-4-5` (current `AI_MODEL` default), `claude-haiku-4-5`, plus `claude-fable-5` and `claude-mythos-5` (newer, higher tiers above Opus — WebSearch-only confirmation of their positioning/pricing, MEDIUM/LOW confidence; verify current pricing and availability in the Anthropic Console before exposing these two in a client-facing dropdown).

Suggested starting allow-list for the dropdown, mapped to plausible per-area needs: `claude-haiku-4-5` (fast/cheap — a reasonable default for high-volume, low-stakes calls like checklist/card validation), `claude-sonnet-4-5` or `claude-sonnet-5` (current balanced default, e.g. chat), `claude-opus-4-8` (highest-quality tier, e.g. briefing autofill or topic generation where output quality matters more than latency/cost). This is a starting recommendation for the roadmap to refine with the user, not a final decision — Anthropic's own docs/console pricing page should be the tie-breaker on the final three-to-five-model list actually exposed.

### Other two features — no new stack additions

- **Editor's own Kanban/queue (feature 3):** a new query filtered by `media_assignee_id` and ordered by `due_date`, reusing the existing dnd-kit-based board components. No new library.
- **Admin PM/PO panel comments (feature 1, "space to comment"):** a new small Postgres table (e.g. `pm_management_notes`) with RLS scoping writes to Admin, reads to Admin + the PM being commented on — same pattern as every other table in this codebase. No new library beyond `recharts` for the visualization half of this feature (see Core Technologies above).

## Alternatives Considered

| Recommended | Alternative | When to Use Alternative |
|-------------|-------------|--------------------------|
| `@react-pdf/renderer` for PDF generation | `pdf-lib` | Only if the PDF becomes a fixed-field fillable template rather than a repeating list of cards — `pdf-lib` has no layout/flow engine |
| `@react-pdf/renderer` for PDF generation | Puppeteer/Playwright + `@sparticuz/chromium` | Only if the export later needs pixel-perfect arbitrary HTML/CSS (e.g. reusing a web page's exact CSS) — not needed for a structured date/title/text/image layout |
| Vercel Cron | Upstash QStash / Inngest / GitHub Actions cron | Only if the job needs sub-minute precision, complex retry/backoff, or fan-out to many parallel jobs — a single weekly trigger doesn't need this |
| Paste-based Gemini-notes ingestion (reusing `runStructuredExtraction`) | Google Meet REST API (`googleapis`) with full OAuth | Only once the team wants zero-touch automatic capture (no PM paste step) — a distinct, larger infrastructure investment, not a v1.1-sized change |
| Postgres column + Zod allow-list + existing `Select` for model choice | Vercel AI SDK / LangChain provider abstraction | Only if the project's constraint changes and it needs to call a *second* model provider (e.g. Gemini or OpenAI) for actual generation, not just Anthropic models |
| `recharts` (via shadcn `chart`) | `@tremor/react` (v`3.18.7`) | Only if the team wants Tremor's own opinionated dashboard component set — but that means running two parallel design systems (Tremor's + the existing Radix/shadcn one), which this project doesn't have a reason to do |

## What NOT to Use

| Avoid | Why | Use Instead |
|-------|-----|--------------|
| Puppeteer/Playwright + headless Chromium for PDF export | Heavy binary, subprocess-spawning problems on Vercel serverless, unnecessary for structured content | `@react-pdf/renderer` |
| An external cron/queue SaaS for the weekly job | One more account/secret/vendor for a single low-stakes weekly trigger the platform already provides natively | Vercel Cron (`vercel.json`) |
| A real-time Google Meet/Calendar OAuth integration for v1.1 | Nontrivial new infrastructure (first Google API OAuth flow in the codebase), plan-dependent (Workspace edition), and explicitly listed as a deferred future integration in PROJECT.md's Out of Scope | Paste-based ingestion through the existing `runStructuredExtraction` engine |
| A multi-provider AI SDK abstraction (Vercel AI SDK, LangChain) for "model selection" | Only one provider (Anthropic) is in play per the project's own constraint — abstraction with no corresponding requirement is premature | A Postgres-backed model-name column, Zod-validated, passed straight into the existing `@anthropic-ai/sdk` call sites |
| Tremor or another second component/dashboard library for admin charts | Would run parallel to the existing Radix/shadcn/CVA design system already used throughout the app | `recharts` via `shadcn add chart` |

## Stack Patterns by Variant

**If the PDF export needs to embed images from pasted Google Drive links (feature 6, "image" per card):**
- Do not assume `<Image src={driveLink}>` in `@react-pdf/renderer` works — a `drive.google.com/file/d/<id>/view` share URL is an HTML viewer page, not a raw image byte stream, and only PNG/JPEG are supported anyway. Resolve/normalize the URL server-side to something directly fetchable before rendering, and treat non-PNG/JPEG attachments as a known limitation for this export (flag for the phase's own research, not solved by library choice alone).

**If the weekly cron job needs to write to Postgres on behalf of "the system" (no user session):**
- Use a Supabase service-role client scoped narrowly to this job's own Server Action/Route Handler — do not reuse the per-request user-session Supabase client pattern used elsewhere, since a cron-invoked request has no authenticated user and RLS policies keyed to `auth.uid()` won't apply the way they do for PM/Admin/Client/Editor requests.

**If the team later wants zero-touch (no paste step) meeting-transcript capture:**
- That's the Google Meet REST API path (`googleapis` package, OAuth/service-account setup, Workspace edition dependent) — treat it as a separate, later phase, not a v1.1 dependency.

## Version Compatibility

| Package A | Compatible With | Notes |
|-----------|------------------|-------|
| `@react-pdf/renderer@4.6.1` | Node.js 18/20/21, Next.js 16 Route Handlers (Node.js runtime, the default) | Do not set `export const runtime = "edge"` on the export route — `@react-pdf/renderer` is not Edge-compatible |
| `recharts@3.10.1` | React 19.2.4 (already installed) | Current major version supports React 18/19; matches this project's React version |
| `@anthropic-ai/sdk@0.112.4` (already installed) | `Model` type already includes `claude-sonnet-5`, `claude-opus-4-8`, `claude-haiku-4-5`, etc. | No SDK upgrade needed to support per-area model selection — the current installed version already types every model worth exposing in the dropdown |
| Vercel Cron | Any Next.js Route Handler on Vercel, independent of npm package versions | Purely a platform/`vercel.json` feature, not a dependency-version concern |

## Sources

- `node_modules/@anthropic-ai/sdk/resources/messages/messages.d.ts` (installed `@anthropic-ai/sdk@0.112.4`) — ground-truth `Model` type union, HIGH confidence
- `lib/anthropic/client.ts`, `lib/ai/structured-extraction.ts`, `lib/attachments/drive-url.ts`, `app/api/chat/route.ts` (this codebase) — confirmed existing AI-call architecture and confirmed the Drive integration is currently link-validation-only, not a live API
- npm registry (`npm view <pkg> version`) — `@react-pdf/renderer@4.6.1`, `pdf-lib@1.17.1`, `recharts@3.10.1`, `googleapis@174.0.1`, checked 2026-08-16
- https://react-pdf.org/compatibility — Node.js version support, `__dirname`/ESM caveat
- WebSearch: "Vercel serverless PDF generation library 2026 Next.js best practice" — Puppeteer/subprocess constraints, function bundle limits, MEDIUM confidence (cross-checked against react-pdf's own docs)
- WebSearch: "Vercel Cron Jobs weekly schedule vercel.json 2026 Hobby Pro limits" — cron syntax, plan limits, `vercel.com/changelog/cron-jobs-now-support-100-per-project-on-every-plan`, MEDIUM confidence
- https://developers.google.com/workspace/meet/api/reference/rest/v2 and `conferenceRecords.transcripts` / `.entries` reference pages — Google Meet REST API v2 transcript resources, HIGH confidence (official docs), but real-world applicability to this project is unverified against the team's actual Workspace edition/admin settings
- WebSearch: "Gemini Google Meet meeting notes API export transcript integration" (tldv.io, noota.io, and others) — confirms consumer-facing Gemini notetaker produces a Google Doc with no native export API, MEDIUM confidence (third-party sources, not Google-official, but consistent across multiple independent sources)
- WebSearch: "react-pdf renderer Image component remote URL src fetch example" — confirms remote URL support and PNG/JPEG-only limitation, MEDIUM confidence

---
*Stack research for: BackstageEd.OS v1.1 (PM Operations & Content Automation)*
*Researched: 2026-08-16*
