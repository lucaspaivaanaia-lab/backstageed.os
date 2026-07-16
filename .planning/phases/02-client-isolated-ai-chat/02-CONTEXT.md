# Phase 2: Client-Isolated AI Chat - Context

**Gathered:** 2026-07-16
**Status:** Ready for planning

<domain>
## Phase Boundary

PM can have a working AI conversation about a specific client, structurally incapable of leaking another client's context (retrieval scoped to that client's Tropicalia project), and can manually curate specific pieces of that conversation into permanent client knowledge. This phase does NOT include the Kanban/content-card features (Phase 3) or client-facing approval (Phase 4) — it is purely the chat + curation slice (CTX-01 through CTX-05).

</domain>

<decisions>
## Implementation Decisions

### Chat placement & UI structure
- **D-01:** Chat lives on a dedicated screen (e.g. `/pm/chat`), not as a tab on the client's own detail page. It has a client switcher (dropdown/sidebar) to change which client's context is active — a new nav pattern for this app, not reusing the `app/pm/clients/[id]/*` route-group convention.
- **D-02:** Conversation history is persisted per client in Supabase (not ephemeral/client-side-only) — needs a messages table with RLS scoping so a PM only sees history for clients they're assigned to (mirrors `pm_assigned_clients()` pattern already used for `clients`).
- **D-03 (scope-reduced for deadline):** Single ongoing history per client for this phase — NOT multiple separate threads/conversations per client. Originally discussed as "multiple threads per client" (ChatGPT-style conversation list), but reversed during final review given the 2026-07-18 deadline (2 days out at discussion time): multiple threads implies a threads table, thread-list UI, and naming/switching — bigger scope than a v1 demo needs, and it doesn't block anything else, so it's deferred (see `<deferred>`).

### Curation UX (CTX-03, CTX-04)
- **D-04:** PM selects what to save via a checkbox per message (PM's question + AI's answer), not text-highlighting or a separate editable-note step. Coarse-grained: whole messages, not partial text ranges.
- **D-05:** Once messages are checked, the `.md` file is generated and uploaded to Tropicalia immediately — no preview/edit step before confirming. If the generated content needs fixing, the PM's only lever is re-selecting the checkboxes and saving again (not editing the draft in place).

### Degraded mode (missing Tropicalia key / unprovisioned client)
- **D-06:** `TROPICALIA_API_KEY` is confirmed still empty in `.env.local` as of 2026-07-16 (same placeholder from Phase 1's D-11), and some clients may have `tropicalia_project_id = null` (RAG setup still pending, per Phase 1's D-08). For these cases, chat does NOT block — it degrades to Claude-only (no retrieval step), following the same "silent skip" pattern as D-11 rather than disabling the input.
- **D-07:** The client's structured briefing (objetivo, tom de voz, público-alvo, pilares — from Phase 1's `clients` table) is ALWAYS included in Claude's context, in both normal mode (alongside Tropicalia retrieval) and degraded mode (as the only client-specific context available). One prompt-assembly code path, not two — briefing injection doesn't branch on whether retrieval succeeded.

### Response delivery & transparency
- **D-08:** Responses stream token-by-token (not wait-for-full-response) — needs a streaming setup end-to-end from the Claude API call through to the UI (e.g. SSE or the Vercel AI SDK's streaming primitives).
- **D-09:** The PM does NOT see which retrieved Tropicalia snippets informed an answer — just the final streamed answer, no citations/sources UI. Simpler chat UI; verifying grounding is not a UI-visible feature for v1.

### Claude's Discretion
- **File shape for Tropicalia uploads** (new `.md` file per curation action vs. appending to one running knowledge file per client) — user explicitly deferred this to research: "skip questions about tropicalia for now." Flag this for the researcher/planner to resolve based on what Tropicalia's upload endpoint actually supports (single-file replace vs. additive).
- Exact chat screen layout (message bubbles, client-switcher placement — sidebar vs. top dropdown).
- Exact wording of the degraded-mode notice shown to the PM when retrieval is unavailable.
- Exact schema shape for the messages table (e.g. one row per turn vs. one row per message).
- Streaming implementation choice (raw SSE vs. Vercel AI SDK vs. another library) — D-08 only locks that streaming happens, not how.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Project-level context
- `.planning/PROJECT.md` — Core value (RAG isolation is structural, not filtered), constraints (Tropicalia 1 project per client, `generate_answer: false`, Claude API always generates the actual response, storage split between Supabase/structured data and Drive/heavy media — not directly relevant here but confirms Supabase is the source of truth for messages)
- `.planning/REQUIREMENTS.md` §Client-Isolated AI Context (CTX) — CTX-01 through CTX-05, the full requirement set this phase implements
- `.planning/ROADMAP.md` §Phase 2 — goal and the 5 success criteria (PM chat scoped to one client; switching client switches entire KB; Claude-generated responses with server-side tone control; manual selective curation; curated `.md` uploaded and later retrievable)

### Prior-phase context
- `.planning/phases/01-client-records-isolated-rag-setup/01-CONTEXT.md` — D-08/D-09/D-11: the "RAG pendente" pattern (silent skip when API key absent, retry-button when key present but call fails) that D-06 above extends into chat's degraded mode. Also confirms `tropicalia_project_id` can be null on a client record.
- `.planning/phases/05-access-roles/05-CONTEXT.md` — role model (PM/Client/Admin) and RLS-first design this phase's messages-table RLS must follow.

### Existing code this phase builds on
- `lib/tropicalia/client.ts` — only `createTropicaliaProject()` exists today (project creation). No search/retrieval endpoint or upload endpoint wrapper exists yet — both are new for this phase. Follow this file's established conventions: server-only, `TROPICALIA_API_KEY` null-check before any call, `AbortSignal.timeout()` defensive default, never import from a Client Component.
- `lib/supabase/{client,server,middleware,admin}.ts` — the four canonical Supabase client factories from 05-01; reuse for any new server actions/routes.
- `supabase/migrations/0004_rls_policies.sql` — `is_admin()`, `pm_assigned_clients()` helpers; a new messages/threads table's RLS policies should reuse these, not inline cross-table subqueries (established Pitfall-1 rule, reinforced by this session's GRANT-gap findings in Phase 5 — remember to add explicit `GRANT`s on any new table alongside its RLS policies, since local `supabase start` does not always mirror hosted-platform default privileges).
- No Anthropic/Claude SDK is installed yet (`package.json` has no `@anthropic-ai/*` or `ai`/`vercel/ai` dependency) — this phase is the first to need one.

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- Four Supabase client factories (`lib/supabase/*.ts`) — use directly for any new chat routes/actions.
- shadcn components already installed (button, input, label, form, card, table, badge, select, dialog, alert-dialog, sonner, separator, skeleton) — likely sufficient for the chat screen, client switcher (select/dropdown), and message list, though a chat-specific message-bubble component doesn't exist yet.
- `lib/tropicalia/client.ts`'s conventions (server-only fetch wrapper, key null-check, timeout) — extend this file with the new retrieval/search and upload functions rather than creating a parallel Tropicalia client.

### Established Patterns
- Server Actions co-located with each route (`app/(auth)/signup/actions.ts` pattern) — follow for the new chat route's send-message/save-knowledge actions.
- Every migration that creates a table touching RLS must enable RLS in the same migration, AND (per this session's Phase 5 GRANT-gap discovery) should include an explicit `GRANT` for `authenticated` in the same migration too — hosted Supabase auto-grants at provisioning, but local `supabase start` does not, so omitting the GRANT breaks local `pgTAP`/dev parity even though hosted works.
- RLS helper functions (`is_admin()`, `pm_assigned_clients()`) are the only sanctioned way to do cross-table checks in policies.

### Integration Points
- New chat route likely lives at `app/pm/*` (PM-only feature per REQUIREMENTS.md — Admin/Client don't chat) — needs a new top-level route, not nested under `clients/[id]`, per D-01.
- `middleware.ts`'s existing role-redirect table doesn't need modification — the new route just needs to fall under the PM role root.

</code_context>

<specifics>
## Specific Ideas

- `TROPICALIA_API_KEY` is confirmed still empty in `.env.local` as of this discussion (2026-07-16) — the degraded-mode path (D-06/D-07) is not a hypothetical edge case, it's the CURRENT state for every client until Juliano supplies the key. Plan/research should treat this as the primary path to get right, not an afterthought.
- Deadline is 2026-07-18 — 2 days from this discussion. D-03's scope reduction (single history, not multi-thread) was made explicitly to protect that date.

</specifics>

<deferred>
## Deferred Ideas

- **Multiple threads per client** (conversation list, thread naming/switching, ChatGPT-style) — deferred to a later window (user referenced 16-30 ago / mid-to-late August). Doesn't block Phase 3/4/6; can be added on top of the single-history model without structural rework if the messages table is designed with a nullable/simple thread grouping in mind (researcher/planner discretion).
- **File-shape for Tropicalia uploads** (new file per save vs. append to one running file) — user deferred this explicitly to research rather than deciding now; see Claude's Discretion above.

### Reviewed Todos (not folded)
None — no pending todos matched this phase (`todo.match-phase` returned 0 matches).

</deferred>

---

*Phase: 2-Client-Isolated AI Chat*
*Context gathered: 2026-07-16*
