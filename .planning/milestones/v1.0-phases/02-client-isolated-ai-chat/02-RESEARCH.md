# Phase 2: Client-Isolated AI Chat - Research

**Researched:** 2026-07-21
**Domain:** RAG-backed chat (Tropicalia retrieval + Claude generation), Next.js App Router streaming, multi-tenant isolation
**Confidence:** HIGH (Tropicalia API surface, Anthropic streaming API, Next.js/Vercel streaming primitives — all confirmed via official docs) / MEDIUM (exact model choice, Tropicalia document-processing latency behavior, file-shape resolution — inferred from documented endpoint surface, not exhaustively tested)

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

- **D-01:** Chat lives on a dedicated screen (e.g. `/pm/chat`), not as a tab on the client's own detail page. It has a client switcher (dropdown/sidebar) to change which client's context is active — a new nav pattern for this app, not reusing the `app/pm/clients/[id]/*` route-group convention.
- **D-02:** Conversation history is persisted per client in Supabase (not ephemeral/client-side-only) — needs a messages table with RLS scoping so a PM only sees history for clients they're assigned to (mirrors `pm_assigned_clients()` pattern already used for `clients`).
- **D-03 (scope-reduced for deadline):** Single ongoing history per client for this phase — NOT multiple separate threads/conversations per client.
- **D-04:** PM selects what to save via a checkbox per message (PM's question + AI's answer), not text-highlighting or a separate editable-note step. Coarse-grained: whole messages, not partial text ranges.
- **D-05:** Once messages are checked, the `.md` file is generated and uploaded to Tropicalia immediately — no preview/edit step before confirming. If the generated content needs fixing, the PM's only lever is re-selecting the checkboxes and saving again (not editing the draft in place).
- **D-06:** `TROPICALIA_API_KEY` is confirmed still empty in `.env.local` (same placeholder from Phase 1's D-11), and some clients may have `tropicalia_project_id = null`. For these cases, chat does NOT block — it degrades to Claude-only (no retrieval step), following the same "silent skip" pattern as D-11 rather than disabling the input.
- **D-07:** The client's structured briefing (objetivo, tom de voz, público-alvo, pilares — from Phase 1's `clients` table) is ALWAYS included in Claude's context, in both normal mode (alongside Tropicalia retrieval) and degraded mode (as the only client-specific context available). One prompt-assembly code path, not two — briefing injection doesn't branch on whether retrieval succeeded.
- **D-08:** Responses stream token-by-token (not wait-for-full-response) — needs a streaming setup end-to-end from the Claude API call through to the UI (e.g. SSE or the Vercel AI SDK's streaming primitives).
- **D-09:** The PM does NOT see which retrieved Tropicalia snippets informed an answer — just the final streamed answer, no citations/sources UI. Simpler chat UI; verifying grounding is not a UI-visible feature for v1.

### Claude's Discretion

- **File shape for Tropicalia uploads** (new `.md` file per curation action vs. appending to one running knowledge file per client) — user explicitly deferred this to research. **Resolved below** (see Architecture Patterns, Pattern 3) based on what Tropicalia's actual API surface supports.
- Exact chat screen layout (message bubbles, client-switcher placement — sidebar vs. top dropdown). **Resolved by 02-UI-SPEC.md** (sticky top-of-screen header with client switcher) — not re-litigated here.
- Exact wording of the degraded-mode notice shown to the PM when retrieval is unavailable. **Resolved by 02-UI-SPEC.md** Copywriting Contract.
- Exact schema shape for the messages table (e.g. one row per turn vs. one row per message). **Resolved below** (see Architecture Patterns, Pattern 2 / Recommended Project Structure).
- Streaming implementation choice (raw SSE vs. Vercel AI SDK vs. another library). **Resolved below**: direct `@anthropic-ai/sdk` streaming + a raw `ReadableStream` Route Handler, not the Vercel AI SDK (see Standard Stack, Alternatives Considered, for the reasoning).

### Deferred Ideas (OUT OF SCOPE)

- Multiple threads per client (conversation list, thread naming/switching, ChatGPT-style) — deferred to a later window. Doesn't block Phase 3/4/6; can be added later without structural rework if the messages table avoids baking in a "single conversation" assumption too tightly (see Pattern 2's schema note on a nullable `thread_id`-shaped column left for future use, not built this phase).
- File-shape question for Tropicalia uploads — technically resolved as part of this research rather than truly "deferred," since it's an API-capability question, not a product decision.

</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| CTX-01 | PM can chat with AI about a specific client, with context limited to that client's Tropicalia project | Pattern 1 (Server-Side Client-to-Project Resolution) — `tropicalia_project_id` is resolved server-side via an RLS-scoped read, never trusted from client input. Degraded-mode fallback (briefing-only) covered in Pattern 2. |
| CTX-02 | Switching the active client in the chat switches the entire knowledge base consulted — no context bleeds from one client to another | Pattern 1 + Pattern 4 (stale-response guard) + Common Pitfalls #1/#3/#6 — covers both the server-side isolation boundary and the client-side race-condition risk when switching clients mid-stream. |
| CTX-03 | PM can manually select a piece of a conversation to save as permanent knowledge for the client — nothing is saved automatically | Pattern 3 (Save-to-Knowledge Server Action) — checkbox-driven, explicit user action only, no auto-save path exists anywhere in the design. |
| CTX-04 | Saved knowledge is written as a curated `.md` file and uploaded to the client's Tropicalia project via its upload endpoint | Pattern 3 + Tropicalia Upload Endpoint findings (Standard Stack / Code Examples) — confirms `/v1/projects/{projectId}/upload`, multipart/form-data, and resolves the file-shape discretion item (new file per save). |
| CTX-05 | AI responses are generated via the Claude API using context retrieved from Tropicalia (`generate_answer: false`), with the prompt assembled server-side for tone/system-instruction control | Pattern 1 (search call always sets `generate_answer: false` explicitly — Tropicalia's own default is `true`, Pitfall #2) + Pattern 2 (server-side system-prompt assembly, streamed via `@anthropic-ai/sdk`). |

</phase_requirements>

## Summary

This phase wires together three systems that don't yet talk to each other in this codebase: Tropicalia (retrieval, `generate_answer: false`), the Claude API (generation, not yet installed as a dependency), and a new Supabase-backed chat UI. The critical design constraint is not the chat UI itself (which 02-UI-SPEC.md already locks down) — it's making the client-isolation boundary **structural**: `tropicalia_project_id` must be resolved server-side from an RLS-scoped read of the `clients` table, keyed only by a `clientId` the browser supplies, and never accepted as a raw value from client input. This single design choice (Pattern 1 below) is what makes CTX-02's "no bleed" requirement true by construction rather than by convention.

Tropicalia's documented API surface (confirmed via `docs.tropicalia.dev`, not training knowledge) is a `POST /v1/projects/{projectId}/search` endpoint whose `generate_answer` flag defaults to `true` — this phase MUST explicitly pass `false` on every call, since CTX-05 requires all generation to happen via Claude. Uploads go through `POST /v1/projects/{projectId}/upload` (multipart, one file per call, max 100MB) with no documented "append to existing document" or "update document content" endpoint — this resolves the file-shape discretion item in favor of **one new `.md` file per curation action**, which is also the simplest and most robust choice given the phase's "no preview/edit" (D-05) constraint. Uploaded documents go through an async `uploaded → queued → processing → ready` pipeline before they're searchable — this matters for CTX-04's "retrievable in a later chat" criterion (see Common Pitfalls #5).

For generation, this phase is the first to need an LLM SDK. The recommendation is `@anthropic-ai/sdk` used directly (not the Vercel AI SDK) — this phase needs single-provider text streaming with no tool-calling, and a direct SDK call composes more simply with this codebase's established "hand-rolled server-only fetch wrapper" convention (`lib/tropicalia/client.ts`) than introducing two additional packages (`ai` + `@ai-sdk/anthropic`) for abstractions (multi-provider routing, `useChat`, tool-call UI parts) this phase doesn't use. Streaming is returned to the browser as a plain `ReadableStream` Response from a new Route Handler (`app/api/chat/route.ts`) — Route Handler, not a Server Action, because a streamed HTTP response body is the standard mechanism for token-by-token delivery in App Router, and this is a deliberate, documented deviation from the rest of the codebase's Server-Action-only convention.

Given `TROPICALIA_API_KEY` is confirmed still empty as of this writing, **degraded mode (briefing-only, no retrieval) is the actual, currently-testable path for every client** — not a rare edge case. Plans built from this research should treat "Tropicalia key present + project provisioned" as the aspirational full path and "Tropicalia key absent" as the primary path that must work correctly and be demo-able today.

**Primary recommendation:** Use `@anthropic-ai/sdk` directly for generation, resolve `tropicalia_project_id` exclusively via an RLS-scoped Supabase read keyed by `clientId` (never trust a project ID from the browser), always pass `generate_answer: false` to Tropicalia, and write each curation action as a brand-new `.md` file uploaded via Tropicalia's `/upload` endpoint (no append/update path exists to build against).

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Active-client selection (dropdown state) | Browser / Client | — | Pure UI state — which client the PM is currently looking at. Must NOT be treated as an authorization or isolation boundary; it only decides which `clientId` gets sent with the next request. |
| `clientId` → `tropicalia_project_id` resolution + authorization | API / Backend | Database / Storage | Must happen server-side, via an RLS-scoped Supabase read. This is the actual isolation boundary (CTX-02) — a UI-only filter would not be structural. |
| Tropicalia retrieval (`search`, `generate_answer: false`) | API / Backend | — | Requires `TROPICALIA_API_KEY`, server-only secret; must never be callable from the browser. |
| Claude generation (system prompt assembly + streaming) | API / Backend | — | Requires `ANTHROPIC_API_KEY`, server-only secret; CTX-05 explicitly requires server-side prompt assembly for tone control. |
| Token-by-token response delivery | API / Backend | Browser / Client | Backend produces the `ReadableStream`; browser consumes and renders progressively (D-08). |
| Conversation persistence (messages table) | Database / Storage | API / Backend | Supabase is system-of-record per D-02; written only through the Route Handler/Server Actions, RLS-scoped. |
| Curation checkbox selection | Browser / Client | — | Ephemeral UI state until "Salvar como conhecimento" is clicked (D-04) — nothing persisted until that explicit action. |
| Markdown packaging + Tropicalia upload | API / Backend | Database / Storage (source: `messages` table) | Requires `TROPICALIA_API_KEY`; must read the selected message rows via an RLS-scoped query before building the file (never trust message content passed raw from the browser without re-verifying ownership). |

## Standard Stack

### Core

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `@anthropic-ai/sdk` | `^0.112.4` [VERIFIED: npm registry — confirmed via `npm view`, official Anthropic package, repo `github.com/anthropics/anthropic-sdk-typescript`] | Official TypeScript/Node client for the Claude Messages API, including streaming (`client.messages.stream()`) | This is Anthropic's own first-party SDK — the only sanctioned way to call the Messages API with proper event-stream parsing, accumulation, and error handling. Requires Node.js 20 LTS+ (project runs Node 24 locally — compatible). |

### Supporting

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `zod` | already in `package.json` (`^4.4.3`) | Validate the chat Route Handler's request body (`clientId`, `content`) and the save-knowledge Server Action's input (`clientId`, `messageIds[]`) | Every new Server Action/Route Handler in this codebase validates with zod before any external call — established convention (`lib/validation/*.ts`), extend rather than introduce a new validation library. |

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| `@anthropic-ai/sdk` direct call + hand-composed `ReadableStream` | Vercel AI SDK (`ai` `^7.0.34` + `@ai-sdk/anthropic` `^4.0.18`) [ASSUMED — package names/versions confirmed on npm registry via `npm view`, but the *choice* to use them was not made; presented only as the alternative] | `ai`/`@ai-sdk/anthropic` gives `streamText()` + `toUIMessageStreamResponse()`/`toTextStreamResponse()` (confirmed current method names — `toDataStreamResponse` is deprecated/removed in v7) and the `useChat` client hook. This is the right choice if the team anticipates swapping LLM providers or wants `useChat`'s built-in optimistic-UI/message-list state machine. For this phase, `useChat`'s ephemeral client message model doesn't map cleanly onto D-02's "Supabase is the source of truth, PM only checks off already-persisted rows" requirement (D-04's checkboxes need stable DB row IDs) — using it would mean either fighting the hook's own state or duplicating message state in two places. Two fewer dependencies and one fewer abstraction layer for a single-provider, no-tool-calling v1 chat. |

**Installation:**
```bash
npm install @anthropic-ai/sdk
```

**Version verification:** `npm view @anthropic-ai/sdk version` → `0.112.4`, package created 2023-01-31, actively maintained by `anthropics` org (verified 2026-07-21). `npm view ai version` → `7.0.34`; `npm view @ai-sdk/anthropic version` → `4.0.18` (both confirmed to exist on the registry but NOT recommended for install this phase — see Alternatives Considered).

## Package Legitimacy Audit

| Package | Registry | Age | Downloads (last week) | Source Repo | slopcheck | Disposition |
|---------|----------|-----|-----------------------|-------------|-----------|-------------|
| `@anthropic-ai/sdk` | npm | ~3.5 yrs (created 2023-01-31) | 26.8M/wk | github.com/anthropics/anthropic-sdk-typescript | [OK] | **Approved** — recommended for install |
| `ai` | npm | ~12 yrs (created 2014, current major is v7) | 17.7M/wk | github.com/vercel/ai | [OK] | Not adopted this phase (see Alternatives Considered) — audited only because it was seriously evaluated |
| `@ai-sdk/anthropic` | npm | since 2024-04-12 | 8.9M/wk | github.com/vercel/ai | [OK] | Not adopted this phase — same reasoning |

No `[SUS]` or `[SLOP]` findings. No `postinstall` scripts on any of the three packages (`npm view <pkg> scripts.postinstall` returned empty for all).

**Packages removed due to slopcheck [SLOP] verdict:** none.
**Packages flagged as suspicious [SUS]:** none.

*Note on how this audit was produced:* `slopcheck scan --pkg npm <name> --json` was used (not `slopcheck install`) to avoid side effects — an earlier `slopcheck install @anthropic-ai/sdk` invocation during this research session actually ran `npm install` against the real repo (adding the dependency to `package.json`/`package-lock.json`); that change was reverted (`git checkout -- package.json package-lock.json`) before this document was written, since research must not modify the repo. The planner/executor is the one who should run the real `npm install @anthropic-ai/sdk` as part of implementation.

## Architecture Patterns

### System Architecture Diagram

```
PM Browser (/pm/chat)
   │
   │ 1. select client (dropdown) — pure UI state, clientId only
   │ 2. type message, press Enter/Send
   ▼
POST /api/chat  (Route Handler — NOT a Server Action; needs a streamed Response body)
   │
   │ 3. auth check: supabase.auth.getUser()
   ▼
RLS-scoped read: clients table, .eq('id', clientId).single()
   │   (RLS via pm_assigned_clients() — if PM isn't assigned, row is invisible → 403/empty)
   │   returns: { tropicalia_project_id, objective, tone_of_voice, target_audience, content_pillars }
   │
   ├─ tropicalia_project_id present AND TROPICALIA_API_KEY set? ──yes──▶ POST /v1/projects/{id}/search
   │                                                                     { query, generate_answer: false, ... }
   │                                                                     ◀── retrieval_contents[] (text chunks)
   │
   └─ no (either absent) ──▶ skip retrieval (D-06 degraded mode) — same code path, just an empty chunk list
   │
   ▼
Assemble system prompt server-side (ALWAYS includes briefing; retrieval chunks appended only if present)
   │
   ▼
@anthropic-ai/sdk: client.messages.stream({ model, system, messages: [...history, newUserMsg] })
   │
   ├─ persist user message row to Supabase `messages` (client_id, role='user', content) — before/at stream start
   │
   ▼
for await (event of stream) → encode text_delta chunks → ReadableStream → Response back to browser
   │                                                                         │
   │                                                                         ▼
   │                                                              Browser renders tokens
   │                                                              progressively into the
   │                                                              AI message bubble (D-08)
   ▼
on stream finish (finalMessage() resolves) → persist assistant message row to Supabase `messages`
   (role='assistant', content=full accumulated text)

──────────────────────────────────────────────────────────────────────────────────────

Curation flow (separate, Server Action — no streaming needed):

PM checks message checkboxes → clicks "Salvar como conhecimento"
   │
   ▼
saveKnowledge(clientId, messageIds[])  ["use server"]
   │
   │ re-verify RLS-scoped clients read (same authorization pattern as above)
   │ fetch selected `messages` rows scoped by client_id (RLS) + id IN (messageIds)
   ▼
Build one new .md file (frontmatter + Q/A transcript of only the checked messages)
   │
   ▼
POST /v1/projects/{tropicalia_project_id}/upload  (multipart/form-data, one file)
   │
   ▼
toast success/error → PM sees "Conhecimento salvo" (no preview, no edit step — D-05)
```

### Recommended Project Structure

```
app/
  pm/
    chat/
      page.tsx              # Server Component: client roster + wraps the Client Component chat UI
      chat-panel.tsx         # "use client" — client switcher, message list, composer, checkboxes
      actions.ts             # "use server" — saveKnowledge(), listMessagesForClient()
app/
  api/
    chat/
      route.ts               # POST — the ONLY streaming endpoint in this phase; resolves client→project,
                              # calls Tropicalia + Claude, persists both message rows
lib/
  tropicalia/
    client.ts                # MODIFY — add searchTropicaliaProject() and uploadTropicaliaDocument()
                              # alongside the existing createTropicaliaProject()
  anthropic/
    client.ts                # NEW — server-only Anthropic client factory (mirrors lib/supabase/admin.ts's
                              # "server-only, secret-key null-checked" discipline)
  chat/
    assemble-prompt.ts        # NEW — pure function: (briefing, retrievedChunks) -> system prompt string
                              # (kept pure/testable — see Validation Architecture)
    build-knowledge-markdown.ts # NEW — pure function: (client, selectedMessages) -> markdown string
  validation/
    chat.ts                  # NEW — zod schemas: sendMessageSchema, saveKnowledgeSchema
supabase/
  migrations/
    0010_messages.sql         # NEW — messages table + RLS policies + GRANTs (see Pitfall #4)
```

### Pattern 1: Server-Side Client-to-Project Resolution (the structural isolation boundary)

**What:** The browser only ever sends a `clientId` (a `clients.id` UUID). The server resolves `tropicalia_project_id` by reading the `clients` table through the normal RLS-scoped Supabase client (`lib/supabase/server.ts`'s `createClient()`) — the exact same query simultaneously (a) enforces "can this PM see this client" via the existing `pm_assigned_clients()` RLS policy, and (b) returns the project ID to use. There is no code path where a project ID can be supplied directly by client input, and no fallback to a "default" or "shared" project ID if the lookup comes back empty.

**When to use:** Every point in this phase where retrieval or upload needs a Tropicalia project ID — the chat send flow and the save-knowledge flow both go through this exact same resolution step, never a shortcut.

**Example:**
```typescript
// app/api/chat/route.ts (excerpt)
import { createClient } from "@/lib/supabase/server";

export async function POST(request: Request) {
  const { clientId, content } = await request.json();
  // ... zod validation of { clientId, content } omitted for brevity ...

  const supabase = await createClient(); // RLS-scoped — NEVER createAdminClient() here
  const { data: user } = await supabase.auth.getUser();
  if (!user?.user) return new Response("Unauthorized", { status: 401 });

  // This single query IS the authorization check: if the PM is not assigned to
  // this client, RLS makes the row invisible — `client` comes back null, and we
  // 403 rather than ever attempting to resolve a project ID for an
  // out-of-scope client. Never accept a `tropicaliaProjectId` field from the
  // request body — it is always derived here, server-side, from `clientId`.
  const { data: client, error } = await supabase
    .from("clients")
    .select(
      "id, name, tropicalia_project_id, objective, tone_of_voice, target_audience, content_pillars"
    )
    .eq("id", clientId)
    .single();

  if (error || !client) {
    return new Response("Cliente não encontrado ou sem permissão.", { status: 403 });
  }

  // client.tropicalia_project_id is now the ONLY source of the project ID
  // used for this entire request — retrieval, and later, any save-to-knowledge
  // action for this same client.
}
```

### Pattern 2: Streaming Chat Route Handler (Tropicalia retrieval + Claude generation)

**What:** A single `POST` Route Handler that (1) resolves the client via Pattern 1, (2) optionally retrieves Tropicalia context (skipped in degraded mode — same code path, just an empty array, per D-07's "one code path" rule), (3) assembles a system prompt that ALWAYS includes the briefing, (4) streams the Claude response back as a `ReadableStream`, and (5) persists both turns to Supabase.

**When to use:** The one and only chat-send flow in this phase.

**Example:**
```typescript
// lib/tropicalia/client.ts (MODIFY — add alongside createTropicaliaProject)
// Source: https://docs.tropicalia.dev/api-reference/search.md (confirmed via WebFetch, 2026-07-21)
export type TropicaliaRetrievalChunk = {
  number: number;
  id: string;
  document: string;
  score: number;
  metadata: { document_id: string; file_name: string; document_title: string };
};

export async function searchTropicaliaProject(
  projectId: string,
  query: string
): Promise<TropicaliaRetrievalChunk[]> {
  const apiKey = process.env.TROPICALIA_API_KEY;
  if (!apiKey) throw new Error("TROPICALIA_API_KEY is not set");

  const res = await fetch(
    `${TROPICALIA_BASE_URL}/v1/projects/${projectId}/search`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        query,
        retrieval_strategy: "hybrid",
        // CTX-05 hard requirement: Tropicalia's own default for this field
        // is `true` — it MUST be explicitly false on every call, or
        // Tropicalia will generate its own answer that this app must never
        // surface (generation is Claude's job only). See Pitfall #2.
        generate_answer: false,
        include_sources: true,
        limit: 10,
      }),
      signal: AbortSignal.timeout(10_000), // established convention (Pitfall 7, Phase 1)
    }
  );

  if (!res.ok) throw new Error(`Tropicalia search failed: ${res.status}`);
  const data = await res.json();
  return data.retrieval_contents ?? [];
}
```

```typescript
// lib/anthropic/client.ts (NEW)
// SERVER-ONLY. Never import from a Client Component — ANTHROPIC_API_KEY must
// never reach the browser bundle (same discipline as lib/supabase/admin.ts
// and lib/tropicalia/client.ts).
import Anthropic from "@anthropic-ai/sdk";

let cached: Anthropic | null = null;
export function getAnthropicClient(): Anthropic {
  if (!cached) {
    cached = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  }
  return cached;
}
```

```typescript
// lib/chat/assemble-prompt.ts (NEW — pure function, unit-testable)
type Briefing = {
  name: string;
  objective: string | null;
  tone_of_voice: string | null;
  target_audience: string | null;
  content_pillars: string[];
};

export function assembleSystemPrompt(
  client: Briefing,
  retrievedChunks: { document: string }[]
): string {
  const briefingBlock = [
    `Cliente: ${client.name}`,
    client.objective ? `Objetivo: ${client.objective}` : null,
    client.tone_of_voice ? `Tom de voz: ${client.tone_of_voice}` : null,
    client.target_audience ? `Público-alvo: ${client.target_audience}` : null,
    client.content_pillars.length
      ? `Pilares de conteúdo: ${client.content_pillars.join(", ")}`
      : null,
  ]
    .filter(Boolean)
    .join("\n");

  // D-07: briefing is ALWAYS present; retrieval context is appended only
  // when non-empty — no branching code path, just an empty-array no-op.
  const retrievalBlock = retrievedChunks.length
    ? `\n\nContexto adicional recuperado:\n${retrievedChunks
        .map((c) => `- ${c.document}`)
        .join("\n")}`
    : "";

  return (
    `Você é um assistente de produção de conteúdo para redes sociais, ` +
    `trabalhando exclusivamente no contexto do cliente abaixo. Nunca mencione ` +
    `ou compare com outros clientes. Responda em português do Brasil, de forma ` +
    `clara e alinhada ao tom de voz do cliente. Não inclua marcadores de citação ` +
    `ou referências a fontes na resposta.\n\n${briefingBlock}${retrievalBlock}`
  );
}
```

```typescript
// app/api/chat/route.ts (full flow)
import { createClient } from "@/lib/supabase/server";
import { getAnthropicClient } from "@/lib/anthropic/client";
import { searchTropicaliaProject } from "@/lib/tropicalia/client";
import { assembleSystemPrompt } from "@/lib/chat/assemble-prompt";
import { sendMessageSchema } from "@/lib/validation/chat";

export const runtime = "nodejs"; // @anthropic-ai/sdk needs Node, not Edge

export async function POST(request: Request) {
  const body = await request.json();
  const parsed = sendMessageSchema.safeParse(body);
  if (!parsed.success) return new Response("Dados inválidos.", { status: 400 });
  const { clientId, content } = parsed.data;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return new Response("Não autenticado.", { status: 401 });

  const { data: client } = await supabase
    .from("clients")
    .select(
      "id, name, tropicalia_project_id, objective, tone_of_voice, target_audience, content_pillars"
    )
    .eq("id", clientId)
    .single();
  if (!client) return new Response("Cliente não encontrado ou sem permissão.", { status: 403 });

  // D-06: degraded mode is the SAME code path, just an empty chunk list —
  // never a separate branch, never a fallback to a shared/default project.
  let chunks: { document: string }[] = [];
  if (client.tropicalia_project_id && process.env.TROPICALIA_API_KEY) {
    try {
      chunks = await searchTropicaliaProject(client.tropicalia_project_id, content);
    } catch {
      chunks = []; // transient failure this turn — degrade silently, don't crash the chat
    }
  }

  const { data: history } = await supabase
    .from("messages")
    .select("role, content")
    .eq("client_id", clientId)
    .order("created_at", { ascending: true });

  // Persist the user's turn before generating — so it's never lost even if
  // the Claude call fails or the connection drops mid-stream.
  await supabase.from("messages").insert({ client_id: clientId, role: "user", content });

  const anthropic = getAnthropicClient();
  const system = assembleSystemPrompt(client, chunks);
  const stream = anthropic.messages.stream({
    model: process.env.ANTHROPIC_CHAT_MODEL ?? "claude-sonnet-4-5",
    max_tokens: 1024,
    system,
    messages: [...(history ?? []), { role: "user", content }],
  });

  const encoder = new TextEncoder();
  const readable = new ReadableStream({
    async start(controller) {
      // Source: Anthropic Messages Streaming docs (event flow: message_start →
      // content_block_delta[text_delta] → ... → message_stop) + Next.js
      // official "convert async iterator to stream" pattern
      // (nextjs.org/docs/app/building-your-application/routing/route-handlers#streaming)
      for await (const event of stream) {
        if (event.type === "content_block_delta" && event.delta.type === "text_delta") {
          controller.enqueue(encoder.encode(event.delta.text));
        }
      }
      const finalMessage = await stream.finalMessage();
      const textBlock = finalMessage.content.find((b) => b.type === "text");
      await supabase.from("messages").insert({
        client_id: clientId,
        role: "assistant",
        content: textBlock?.type === "text" ? textBlock.text : "",
      });
      controller.close();
    },
  });

  return new Response(readable, {
    headers: { "Content-Type": "text/plain; charset=utf-8" },
  });
}
```

### Pattern 3: Save-to-Knowledge Server Action (resolves the file-shape discretion item)

**What:** A Server Action, not a Route Handler (no streaming needed here). Re-resolves the client via Pattern 1, fetches only the checked message rows (re-scoped by RLS, never trusting message content passed raw from the browser), builds ONE new markdown file, and uploads it via Tropicalia's `/upload` endpoint.

**File-shape resolution:** Tropicalia's documented API surface (`docs.tropicalia.dev/api-reference/upload/*`) has `upload` (create), `list-documents` (read metadata only, no content), and `delete-document` — **there is no "update document content" or "append" endpoint**. Appending to one running file would require: fetching the existing content (not possible via any documented GET-content endpoint), manually merging, deleting the old document, and re-uploading — fragile, and not supported by anything the API actually exposes. **Recommendation: one new `.md` file per curation action**, consistent with D-05's "no preview/edit, straight upload" model — each save is self-contained and atomic.

**Example:**
```typescript
// app/pm/chat/actions.ts
"use server";
import { createClient } from "@/lib/supabase/server";
import { uploadTropicaliaDocument } from "@/lib/tropicalia/client";
import { buildKnowledgeMarkdown } from "@/lib/chat/build-knowledge-markdown";
import { saveKnowledgeSchema } from "@/lib/validation/chat";

export async function saveKnowledge(clientId: string, messageIds: string[]) {
  const parsed = saveKnowledgeSchema.safeParse({ clientId, messageIds });
  if (!parsed.success) return { error: "Dados inválidos." };

  const supabase = await createClient();
  const { data: client } = await supabase
    .from("clients")
    .select("id, name, tropicalia_project_id")
    .eq("id", clientId)
    .single();
  if (!client) return { error: "Cliente não encontrado ou sem permissão." };
  if (!client.tropicalia_project_id || !process.env.TROPICALIA_API_KEY) {
    return { error: "Não foi possível salvar o conhecimento. Tente novamente." };
  }

  // RLS-scoped: only rows for THIS client are ever visible, regardless of
  // which message IDs are requested.
  const { data: messages } = await supabase
    .from("messages")
    .select("id, role, content, created_at")
    .eq("client_id", clientId)
    .in("id", parsed.data.messageIds)
    .order("created_at", { ascending: true });
  if (!messages?.length) return { error: "Nenhuma mensagem selecionada foi encontrada." };

  const markdown = buildKnowledgeMarkdown(client.name, messages);
  const file = new Blob([markdown], { type: "text/markdown" });

  try {
    await uploadTropicaliaDocument(
      client.tropicalia_project_id,
      file,
      `conversa-${new Date().toISOString().replace(/[:.]/g, "-")}.md`
    );
  } catch {
    return { error: "Não foi possível salvar o conhecimento. Tente novamente." };
  }

  return { success: true };
}
```

```typescript
// lib/tropicalia/client.ts (MODIFY — add uploadTropicaliaDocument)
// Source: https://docs.tropicalia.dev/api-reference/upload/file.md (confirmed via WebFetch, 2026-07-21)
export async function uploadTropicaliaDocument(
  projectId: string,
  file: Blob,
  filename: string
): Promise<{ document_id: string; filename: string }> {
  const apiKey = process.env.TROPICALIA_API_KEY;
  if (!apiKey) throw new Error("TROPICALIA_API_KEY is not set");

  const form = new FormData();
  form.append("file", file, filename);

  const res = await fetch(`${TROPICALIA_BASE_URL}/v1/projects/${projectId}/upload`, {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}` }, // NOTE: no Content-Type — browser/undici sets multipart boundary
    body: form,
    signal: AbortSignal.timeout(30_000), // uploads take longer than a JSON call — generous timeout
  });

  if (!res.ok) throw new Error(`Tropicalia upload failed: ${res.status}`);
  return res.json();
}
```

### Pattern 4: Client-Side Stale-Response Guard (switching clients mid-stream)

**What:** When the PM switches the active client while a response is still streaming for the previous client, the in-flight stream must not be appended to the new client's message list. Guard by capturing the `clientId` at request-start time and comparing it against the currently-active client when the stream resolves/updates; also cancel the in-flight `fetch` via `AbortController` on switch.

**When to use:** The chat panel's client-switching handler.

**Example:**
```typescript
// app/pm/chat/chat-panel.tsx (excerpt — "use client")
const activeClientIdRef = useRef(activeClientId);
useEffect(() => { activeClientIdRef.current = activeClientId; }, [activeClientId]);

async function sendMessage(clientId: string, content: string) {
  const controller = new AbortController();
  currentRequestControllerRef.current?.abort(); // cancel any prior in-flight stream
  currentRequestControllerRef.current = controller;

  const res = await fetch("/api/chat", {
    method: "POST",
    body: JSON.stringify({ clientId, content }),
    signal: controller.signal,
  });
  const reader = res.body!.getReader();
  const decoder = new TextDecoder();
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    // Guard: if the PM switched clients while this stream was in flight,
    // drop the chunk instead of rendering it into the wrong conversation.
    if (activeClientIdRef.current !== clientId) break;
    appendToStreamingBubble(decoder.decode(value));
  }
}

function onSwitchClient(newClientId: string) {
  currentRequestControllerRef.current?.abort();
  setActiveClientId(newClientId);
  // refetch newClientId's persisted history from Supabase — never carry over
  // any in-memory message state from the previous client
}
```

### Anti-Patterns to Avoid

- **Passing `tropicaliaProjectId` from the browser to the API:** even if the browser only ever displays the correct one, accepting it as request input creates a tamperable/buggable isolation boundary. Always re-derive it server-side from `clientId` via the RLS-scoped read (Pattern 1).
- **Falling back to a "default" or "demo" Tropicalia project when `tropicalia_project_id` is null:** this is exactly the shared-context failure mode Phase 1/2 exist to prevent. Degraded mode means "no retrieval," never "retrieval from someone else's project."
- **Omitting `generate_answer: false` and relying on assumed defaults:** Tropicalia's own default is `true` — omitting the field silently produces a Tropicalia-generated `completion` that this app must never use per CTX-05.
- **Using `useChat` from the Vercel AI SDK while also treating Supabase as the source of truth:** creates two competing message-state owners. Pick one (this research recommends Supabase + a manual fetch/stream reader).

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Parsing Anthropic's SSE event stream (`message_start`, `content_block_delta`, `message_stop`, etc.) | A custom `fetch` + manual `text/event-stream` line parser | `@anthropic-ai/sdk`'s `client.messages.stream()` (async-iterable) | The SDK already handles event-type dispatch, partial-JSON accumulation edge cases (relevant if tool use is ever added later), and `finalMessage()` accumulation — hand-parsing SSE is exactly the kind of "looks simple, has edge cases" problem this rule exists for. |
| Multipart/form-data body construction for the Tropicalia upload | Manually building a `multipart/form-data` boundary string | The platform's native `FormData`/`Blob` (Node 18+/undici, already what `fetch` uses under the hood) | Native `FormData` handles boundary generation and encoding correctly; hand-rolling risks subtly malformed uploads that fail only for certain filenames/content. |
| Converting an async iterator into a Web `ReadableStream` for a Route Handler | A custom stream-adapter class | The `iteratorToStream()` helper pattern from Next.js's own official Route Handler streaming docs | This exact pattern (`pull(controller)` + `iterator.next()`) is the officially-documented Web-API-standard approach — no need to invent a different mechanism. |

**Key insight:** every "don't hand-roll" item above is because an official, already-installed-or-installable primitive (the Anthropic SDK, the Fetch API's `FormData`, or Next.js's documented streaming helper) already solves the problem correctly — this phase should compose those, not reimplement any of them.

## Common Pitfalls

### Pitfall 1: Trusting a client-supplied project ID (isolation bypass)
**What goes wrong:** A Route Handler or Server Action accepts `tropicaliaProjectId` directly in the request body instead of re-deriving it from `clientId` via RLS.
**Why it happens:** Feels like a harmless optimization ("the UI already knows it") — but removes the structural guarantee and reintroduces exactly the kind of filter-not-structural boundary CTX-02 exists to prevent.
**How to avoid:** Every server-side entry point takes only `clientId` as input; the project ID is always looked up fresh via the RLS-scoped `clients` read (Pattern 1).
**Warning signs:** Any `fetch`/Server Action call site where a `project_id`-shaped field appears in the request payload sent from a Client Component.

### Pitfall 2: Omitting `generate_answer: false` on the Tropicalia search call
**What goes wrong:** Tropicalia's documented default for `generate_answer` is `true` — a call that forgets to set it explicitly gets back a Tropicalia-generated `completion` alongside the retrieval chunks.
**Why it happens:** Easy to copy a generic "search" example without checking the default value; CTX-05's constraint (`generate_answer: false`) is a project-specific requirement, not something obvious from the endpoint's own defaults.
**How to avoid:** Set `generate_answer: false` explicitly in every Tropicalia search request body, and add a regression test/lint check that this field is always present in `searchTropicaliaProject()`'s constructed body.
**Warning signs:** A response object with a non-null `completion` field showing up anywhere in logs/debugging.

### Pitfall 3: Stale streaming response bleeding across a client switch
**What goes wrong:** PM sends a message about Client A, then switches to Client B before the response finishes streaming; the late-arriving tokens get appended into Client B's (now-active) message list.
**Why it happens:** A `fetch`+`ReadableStream` reader loop has no automatic cancellation tied to UI state changes — it keeps reading until the server closes the stream regardless of what the UI is currently showing.
**How to avoid:** Pattern 4 — capture `clientId` at request time, guard every chunk-append against the currently active client, and `AbortController.abort()` any in-flight request on switch.
**Warning signs:** A response for "Client A" briefly flashing into the message list right after switching to "Client B," then disappearing on next refetch.

### Pitfall 4: Forgetting explicit GRANTs on the new `messages` table
**What goes wrong:** RLS policies are created, but hosted Supabase auto-grants base table privileges at provisioning while local `supabase start` does NOT — so `npx supabase test db` fails locally on a privilege check before RLS is even evaluated, even though the policies themselves are correct.
**Why it happens:** This exact gap was already discovered in Phase 5 (05-06, closed via migrations `0008`/`0009`) — it's a known, recurring class of bug for this specific local-Supabase setup, not a one-off.
**How to avoid:** Every migration that creates a new RLS-enabled table (including this phase's `messages` table) must include an explicit `GRANT SELECT, INSERT ON public.messages TO authenticated;` (or narrower, matching the intended operations) in the SAME migration file — do not assume hosted-parity.
**Warning signs:** `supabase test db` failing with a permission-denied error rather than a `not ok` RLS assertion.

### Pitfall 5: Assuming an uploaded document is immediately searchable
**What goes wrong:** Tropicalia's `list-documents` endpoint exposes a `status` field with values `uploaded → queued → processing → ready → error` (confirmed via `docs.tropicalia.dev`) — a document freshly uploaded via the save-to-knowledge flow is NOT guaranteed to be in `ready` state (and therefore searchable) the instant the upload call returns.
**Why it happens:** The upload endpoint's own response (`{ document_id, filename }`) returns synchronously and looks like confirmation of completion, but indexing/processing happens asynchronously afterward.
**How to avoid:** Don't design any test or demo flow that immediately re-queries the same saved knowledge in the very next chat turn and expects it to show up — CTX-04's "retrievable in a later chat" criterion should be validated with at least a short delay, or by checking `list-documents`' `status` field before asserting retrievability. Not a bug in this phase's own code — a property of the upstream service.
**Warning signs:** A demo where "ask about what you just saved" appears to fail, prompting an incorrect assumption that the save or the search integration is broken.

### Pitfall 6: A transient Tropicalia search failure being treated the same as (or differently from) the "key absent" degraded mode
**What goes wrong:** If the Tropicalia `search` call throws (network blip, 5xx) while the key IS present and the project IS provisioned, the code must still let the chat turn proceed (briefing-only for that turn) rather than crashing the whole request — but this is a different situation from D-06's structural "key absent" degraded mode, and conflating the two in the UI could mislead the PM into thinking RAG is permanently unavailable when it was just one failed call.
**Why it happens:** Both cases produce "no retrieved context this turn," making it tempting to handle them identically end-to-end, including in the UI.
**How to avoid:** Handle both the same way in the PROMPT-ASSEMBLY code path (empty chunk list, one code path per D-07) but do NOT surface the persistent "Busca de contexto indisponível" badge for a one-off transient failure — that badge (per 02-UI-SPEC.md) is reserved for the structural D-06 case. Log transient failures server-side for debugging instead.
**Warning signs:** The degraded-mode badge flickering on/off between turns for a client whose RAG is actually fully provisioned.

## Code Examples

### Recommended `messages` table migration (new — Claude's Discretion, resolved)

```sql
-- supabase/migrations/0010_messages.sql
-- Single ongoing history per client (D-03) — no threads table this phase.
-- thread_id left out entirely rather than stubbed with a fake default, since
-- adding a nullable column later is a trivial additive migration when
-- multi-thread support actually lands (deferred idea, not built now).

create table public.messages (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.clients(id) on delete cascade,
  role text not null check (role in ('user', 'assistant')),
  content text not null,
  created_at timestamptz not null default now()
);

alter table public.messages enable row level security;

create policy "messages_select_scoped"
on public.messages
for select
to authenticated
using (
  (select public.is_admin())
  or client_id in (select public.pm_assigned_clients())
);

create policy "messages_insert_scoped"
on public.messages
for insert
to authenticated
with check (
  (select public.is_admin())
  or client_id in (select public.pm_assigned_clients())
);

-- Pitfall #4 — hard rule restated: GRANT in the SAME migration, don't rely
-- on hosted-platform auto-provisioning matching local `supabase start`.
grant select, insert on public.messages to authenticated;
```

### `.env.local.example` addition

```
# SERVER-ONLY. Never prefix with NEXT_PUBLIC_. Used only by lib/anthropic/client.ts
# to authenticate against the Claude Messages API for chat generation (CTX-05).
# Source: Anthropic Console -> API Keys (https://console.anthropic.com)
ANTHROPIC_API_KEY=

# Optional override for the chat model — defaults to claude-sonnet-4-5 in code
# if unset. Confirm current model catalog/pricing before locking this in.
ANTHROPIC_CHAT_MODEL=
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|---------------|--------|
| `ai` package's `toDataStreamResponse()` for converting `streamText()` output to an HTTP `Response` | `toUIMessageStreamResponse()` / `toTextStreamResponse()` | Vercel AI SDK v5+ (current major is v7 as of this research) | Not directly relevant since this phase doesn't adopt the Vercel AI SDK, but worth flagging in case a future phase revisits that choice — any code sample found via training-data recall using `toDataStreamResponse` or `StreamingTextResponse` is stale and will not work against `ai@7.0.34`. |

**Deprecated/outdated:**
- `StreamingTextResponse` (shown in Next.js's own official Route Handler streaming example, dated content) — this class is from an old Vercel AI SDK major version; not used in this phase's recommended approach (which bypasses the Vercel AI SDK entirely), but flagged in case anyone consults that page directly.

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | `claude-sonnet-4-5` is a reasonable default model choice for this chat feature (balancing quality/cost) | Pattern 2 code example, `.env.local.example` | If the model ID is wrong/deprecated by the time this is implemented, the first API call fails with a model-not-found error — low risk since it's a one-line env-overridable config, but should be confirmed against Anthropic's current model catalog at implementation time, not assumed from this research. |
| A2 | Tropicalia's upload endpoint accepts `.md`/`text/markdown` content, even though the only documented example payload in the fetched docs was a `.pdf` | Pattern 3, CTX-04 | If markdown is silently rejected or mis-processed, the save-to-knowledge flow would need a fallback format (e.g., plain `.txt`) — should be smoke-tested against the real Tropicalia API (once `TROPICALIA_API_KEY` is supplied) before relying on it in production; the docs describe the field as generic `file` binary upload with a 100MB limit, no MIME allowlist was found. |
| A3 | The Vercel AI SDK's `useChat` client model doesn't cleanly compose with this phase's "Supabase-is-source-of-truth, checkbox-per-persisted-row" requirement, therefore direct `@anthropic-ai/sdk` + manual stream reading is the better choice | Standard Stack, Alternatives Considered | This is an architectural judgment call, not a hard fact — if the planner disagrees, the Vercel AI SDK is a fully legitimate, well-supported alternative; documented here as reasoning to revisit, not a locked technical constraint. |
| A4 | The recommended `retrieval_strategy: "hybrid"`, `limit: 10` search parameters are sensible defaults for this use case | Pattern 2 code example | Untested against real client data (no `TROPICALIA_API_KEY` available in this environment) — these should be treated as a reasonable starting point to tune once real retrieval traffic exists, not a benchmarked recommendation. |

## Open Questions (RESOLVED)

1. **Does the Tropicalia upload endpoint reject or mis-handle `.md`/`text/markdown` content?**
   - What we know: the endpoint documents a generic binary `file` field with a 100MB limit; the only example shown in the fetched docs uses a `.pdf`.
   - What's unclear: whether markdown files index/chunk correctly, or whether a `.txt` extension/MIME type would be safer.
   - Recommendation: smoke-test the very first real upload (once `TROPICALIA_API_KEY` is supplied) with a small `.md` file and confirm via `list-documents` that it reaches `status: "ready"` before relying on this path for a demo.
   - **Resolved:** plans upload one new `.md` file per save (02-05) and defer the format smoke-test to the first live upload once the key exists; no design change pending.

2. **What model should `ANTHROPIC_CHAT_MODEL` default to, and what's the expected per-conversation cost?**
   - What we know: Anthropic's currently-documented model family includes `claude-sonnet-4-5`, `claude-opus-4-8`, `claude-haiku-4-5` (confirmed present in official docs fetched this session).
   - What's unclear: which one Juliano/the team wants for cost-vs-quality tradeoffs at v1 chat-assistant scale, and whether a cheaper model (`claude-haiku-4-5`) would be adequate given retrieval is already doing most of the "knowing about this client" work.
   - Recommendation: default to `claude-sonnet-4-5` in code but make it env-configurable (already reflected in the code example) so this can be tuned without a redeploy-requiring code change.
   - **Resolved:** plans default `ANTHROPIC_CHAT_MODEL` to `claude-sonnet-4-5`, env-configurable (02-04 Task 1).

3. **Should the retry-on-interrupted-stream UI action (`"Tentar novamente"`, per 02-UI-SPEC.md) re-send only the last user turn, or truly resume the interrupted stream?**
   - What we know: Anthropic's own docs describe a capture-and-resume strategy for interrupted streams (re-sending the partial response as context and asking the model to continue) — this is more complex than a simple retry.
   - What's unclear: whether this phase's "keep it simple" ethos (D-09, no citations, single history) extends to accepting the simpler "just re-ask the same question" retry over Anthropic's documented resume strategy.
   - Recommendation: given the deadline pressure and v1 scope, a simple retry (re-run generation for the already-persisted last user message, without deleting/duplicating it) is sufficient — the more sophisticated resume strategy is not warranted for this phase.
   - **Resolved:** plans implement the simple last-user-turn re-send retry (02-04 Task 2); no stream-resume.

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Node.js | `@anthropic-ai/sdk` runtime requirement (needs 20 LTS+) | ✓ | v24.12.0 | — |
| `TROPICALIA_API_KEY` | Retrieval (Tropicalia `search`), upload (`saveKnowledge`) | ✗ (confirmed empty in `.env.local` as of 2026-07-16, unchanged as of this research) | — | Degraded mode (D-06/D-07) — briefing-only chat, no retrieval; save-to-knowledge cannot function at all without this key (no fallback exists for CTX-04 — flag as blocking for that specific requirement until the key is supplied) |
| `ANTHROPIC_API_KEY` | Generation (all of CTX-05) | ✗ (not yet in `.env.local` — this phase is the first to need it) | — | None — this is a hard blocker for the entire chat feature; must be added before any implementation can be smoke-tested end-to-end |
| `@anthropic-ai/sdk` npm package | Generation | ✗ (not yet installed — confirmed via `package.json`, no `@anthropic-ai/*` dependency present) | Target: `^0.112.4` | Install as part of this phase's implementation |

**Missing dependencies with no fallback:**
- `ANTHROPIC_API_KEY` — chat cannot generate any response at all without it (the "degraded mode" in this phase's design only covers the *retrieval* half, not the *generation* half — CTX-05's Claude-API requirement has no degraded-mode equivalent). This must be supplied before end-to-end testing/demo is possible.
- `TROPICALIA_API_KEY`, specifically for CTX-04 (save-to-knowledge upload) — there is no fallback for the upload half of this requirement; it can only be implemented in code and smoke-tested once the key exists, same as Phase 1's `retryTropicaliaProvisioning()` pattern.

**Missing dependencies with fallback:**
- `TROPICALIA_API_KEY` for the retrieval half of chat (CTX-01/CTX-02) — has a fully-specified fallback (D-06/D-07 degraded mode), which is in fact the currently-demoable path.

## Validation Architecture

### Test Framework

| Property | Value |
|----------|-------|
| Framework | Node's built-in `node:test` (no external test runner installed) |
| Config file | none — invoked directly via the `test` npm script (`node --test lib/security/*.test.ts`) |
| Quick run command | `node --test lib/chat/*.test.ts` |
| Full suite command | `node --test lib/**/*.test.ts` (update `package.json`'s `test` script glob to include the new `lib/chat/` directory) |

### Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|---------------------|-------------|
| CTX-05 | `searchTropicaliaProject()`'s request body always sets `generate_answer: false` regardless of input | unit | `node --test lib/tropicalia/client.test.ts` | ❌ Wave 0 |
| CTX-01/CTX-02 | `assembleSystemPrompt()` never includes another client's briefing/chunks — given two different client fixtures, output only reflects the one passed in | unit | `node --test lib/chat/assemble-prompt.test.ts` | ❌ Wave 0 |
| CTX-01/D-07 | `assembleSystemPrompt()` still returns a valid, briefing-inclusive prompt when `retrievedChunks` is an empty array (degraded mode) | unit | `node --test lib/chat/assemble-prompt.test.ts` | ❌ Wave 0 |
| CTX-03/CTX-04 | `buildKnowledgeMarkdown()` produces a markdown string containing only the checked messages' content, in chronological order | unit | `node --test lib/chat/build-knowledge-markdown.test.ts` | ❌ Wave 0 |
| CTX-02 | Client-switch stale-response guard: a chunk callback for `clientId=A` is dropped once `activeClientId` has changed to `B` (extract the guard condition into a small pure function for testability, e.g. `shouldAppendChunk(requestClientId, activeClientId)`) | unit | `node --test lib/chat/stale-response-guard.test.ts` | ❌ Wave 0 |
| AUTH-06 (cross-cutting) | `messages` RLS: a PM not assigned to a client cannot select/insert rows for that client's `client_id` | integration (pgTAP, following the existing `supabase/migrations/*_test.sql` convention) | `npx supabase test db` | ❌ Wave 0 |

### Sampling Rate
- **Per task commit:** `node --test lib/chat/*.test.ts`
- **Per wave merge:** `node --test lib/**/*.test.ts` + `npx supabase test db`
- **Phase gate:** Full suite green before `/gsd:verify-work`

### Wave 0 Gaps
- [ ] `lib/tropicalia/client.test.ts` — covers CTX-05's `generate_answer: false` invariant (mock `fetch`, assert on the request body — no real network call)
- [ ] `lib/chat/assemble-prompt.test.ts` — covers CTX-01/CTX-02/D-07 (pure function, no mocking needed)
- [ ] `lib/chat/build-knowledge-markdown.test.ts` — covers CTX-03/CTX-04 (pure function)
- [ ] `lib/chat/stale-response-guard.test.ts` — covers CTX-02's client-switch race condition (pure function extracted from the Client Component)
- [ ] `supabase/migrations/0010_messages_rls_test.sql` — pgTAP test for the new `messages` table's RLS policies, following the same fixture pattern as the existing `0001`–`0003` RLS test files (reuse `rls_helpers.sql`)
- [ ] Route Handler / Server Action end-to-end behavior (actual streaming, actual Tropicalia/Claude calls) is **not** unit-testable without live API keys — this is inherently a manual/smoke-test surface once `ANTHROPIC_API_KEY`/`TROPICALIA_API_KEY` are supplied; flag for a `checkpoint:human-verify` task rather than an automated test.

## Security Domain

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-------------------|
| V2 Authentication | yes (inherited) | Already enforced by `middleware.ts` + Supabase Auth — no new auth surface introduced by this phase. |
| V3 Session Management | yes (inherited) | Supabase SSR cookie-based session, unchanged by this phase. |
| V4 Access Control | yes | This phase's core security property: `pm_assigned_clients()` RLS, enforced via Pattern 1's server-side resolution — the single most important control in this phase. |
| V5 Input Validation | yes | zod schemas (`sendMessageSchema`, `saveKnowledgeSchema`) validating `clientId` (UUID), `content` (non-empty string, reasonable max length to bound Claude/Tropicalia payload size), `messageIds` (array of UUIDs). |
| V6 Cryptography | no | No new cryptographic operations in this phase — `TROPICALIA_API_KEY`/`ANTHROPIC_API_KEY` are server-only secrets handled via the existing `process.env` + non-`NEXT_PUBLIC_` discipline, not a new crypto surface. |

### Known Threat Patterns for this stack

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|----------------------|
| Cross-client context leakage via a tampered/incorrect `tropicaliaProjectId` in a request | Elevation of Privilege / Tampering | Never accept a project ID as request input — always re-derive server-side from `clientId` via RLS (Pattern 1). This is this phase's headline threat, directly named in the project's own constraints. |
| Prompt injection via retrieved Tropicalia chunks or conversation history influencing the system prompt in unintended ways (e.g., a maliciously-crafted uploaded document instructing the model to "ignore prior instructions") | Tampering | Out of scope to fully solve in v1 (no adversarial actors expected — content is curated by the PM), but worth a one-line mitigation: keep the system-prompt's own instructions ("never mention other clients," "respond in the client's tone") as the LAST thing stated after the retrieved content, not first, so it's less likely to be overridden — a low-cost defensive habit, not a hard requirement for this phase. |
| Unbounded `max_tokens`/conversation history growth driving up Claude API cost per request as a single ongoing history (D-03) grows over weeks | Denial of Service (cost) | Not addressed by this phase's locked scope (D-03 explicitly keeps this simple) — flag as a known future concern once real usage accumulates; a simple mitigation (e.g., cap history sent to the last N turns) is cheap to add later without a schema change. |
| Leaking `TROPICALIA_API_KEY`/`ANTHROPIC_API_KEY` to the browser bundle | Information Disclosure | Same discipline already established for `SUPABASE_SECRET_KEY`/`TROPICALIA_API_KEY` (Phase 1) — never import `lib/anthropic/client.ts` or the extended `lib/tropicalia/client.ts` from a Client Component; both keys stay non-`NEXT_PUBLIC_`-prefixed. |

## Sources

### Primary (HIGH confidence)
- `https://docs.tropicalia.dev/api-reference/search.md` — SearchRequest/SearchResponse schema, `generate_answer` default, `retrieval_contents` structure, auth header format, project-scoping via path parameter (fetched 2026-07-21)
- `https://docs.tropicalia.dev/api-reference/upload/file.md` — upload endpoint path/method/multipart requirements (fetched 2026-07-21)
- `https://docs.tropicalia.dev/api-reference/upload/list-documents.md` — document `status` enum confirming async processing pipeline (fetched 2026-07-21)
- `https://docs.tropicalia.dev/api-reference/upload/delete-document.md` — delete endpoint schema (fetched 2026-07-21)
- `https://docs.tropicalia.dev/llms.txt` — full documentation URL index, used to locate the correct (non-404) endpoint doc pages (fetched 2026-07-21)
- `https://platform.claude.com/docs/en/api/messages-streaming` — full SSE event-type reference, TypeScript SDK streaming example, event flow (`message_start` → `content_block_delta` → `message_stop`) (fetched 2026-07-21)
- `https://raw.githubusercontent.com/anthropics/anthropic-sdk-typescript/main/helpers.md` — `.stream()`, `.on('text')`, `.finalMessage()` helper API (fetched 2026-07-21)
- `https://github.com/anthropics/anthropic-sdk-typescript` — package requirements (Node 20 LTS+, TS 4.9+), basic usage example (fetched 2026-07-21)
- `https://nextjs.org/docs/app/api-reference/file-conventions/route` (redirected from the routing docs URL) — official `iteratorToStream()` streaming pattern for Route Handlers, confirmed streaming section (fetched 2026-07-21)
- `https://vercel.com/docs/functions/configuring-functions/duration` — current (2026-07-01-dated doc) Vercel Function duration defaults: 300s default on both Hobby and Pro with fluid compute — confirms no `maxDuration` override is needed for this phase's streaming responses (fetched 2026-07-21)
- `npm view @anthropic-ai/sdk / ai / @ai-sdk/anthropic` — version, repository, creation date, postinstall-script absence (run 2026-07-21)
- `slopcheck scan --pkg npm <name> --json` — legitimacy check for all three evaluated packages, all `[OK]` (run 2026-07-21)
- In-repo: `.planning/phases/01-client-records-isolated-rag-setup/01-PATTERNS.md`, `lib/tropicalia/client.ts`, `lib/actions/clients.ts`, `lib/supabase/server.ts`, `middleware.ts`, `supabase/migrations/0004_rls_policies.sql`, `supabase/migrations/0006_clients_full_record.sql` — established conventions this phase must extend

### Secondary (MEDIUM confidence)
- `https://ai-sdk.dev/docs/ai-sdk-core/generating-text` and `https://ai-sdk.dev/docs/reference/ai-sdk-core/stream-text` and `https://ai-sdk.dev/providers/ai-sdk-providers/anthropic` — Vercel AI SDK v7 API shape, confirmed current method names (`toUIMessageStreamResponse`/`toTextStreamResponse`, not `toDataStreamResponse`), model ID list — used only to inform the Alternatives Considered comparison, not the recommended path (fetched 2026-07-21, WebFetch-summarized rather than raw-quoted)
- `https://docs.tropicalia.dev/working-with-tropicalia/introduction.md` — general ingestion/indexing description, did not yield explicit markdown-format confirmation (fetched 2026-07-21) — see Assumption A2

### Tertiary (LOW confidence)
- None — all findings in this document trace to an official source fetched during this session or an in-repo file read.

## Metadata

**Confidence breakdown:**
- Tropicalia API surface (search/upload/documents): HIGH — confirmed directly against `docs.tropicalia.dev` this session, not training recall
- Anthropic streaming API: HIGH — confirmed directly against `platform.claude.com`/official SDK repo this session
- Next.js/Vercel streaming + duration mechanics: HIGH — confirmed against current (2026-dated) official docs this session
- Exact model choice (`claude-sonnet-4-5`), Tropicalia markdown-format support, and the direct-SDK-vs-Vercel-AI-SDK architectural call: MEDIUM/LOW — see Assumptions Log A1/A2/A3

**Research date:** 2026-07-21
**Valid until:** ~30 days for the architectural patterns (RLS/isolation design, streaming approach); ~14 days for the exact Tropicalia/Anthropic API surface details, since both are actively-evolving hosted APIs and this environment has no live `TROPICALIA_API_KEY`/`ANTHROPIC_API_KEY` to smoke-test against — re-verify endpoint behavior against real credentials before the phase gate.
