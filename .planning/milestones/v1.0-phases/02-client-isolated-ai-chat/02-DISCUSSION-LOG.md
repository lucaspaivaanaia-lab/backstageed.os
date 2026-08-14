# Phase 2: Client-Isolated AI Chat - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-07-16
**Phase:** 2-Client-Isolated AI Chat
**Areas discussed:** Chat placement & history, Curation UX (CTX-03), Missing Tropicalia key / unprovisioned client, Response delivery & transparency

---

## Chat placement & history

| Option | Description | Selected |
|--------|-------------|----------|
| Tab on client's own page | e.g. `app/pm/clients/[id]/chat` — reuses existing client-detail layout/routing | |
| Dedicated chat screen with switcher | Standalone `/pm/chat` route with a client picker — ChatGPT-style | ✓ |

**User's choice:** Dedicated chat screen with switcher

| Option | Description | Selected |
|--------|-------------|----------|
| Persisted per client | Messages table in Supabase, RLS-scoped, PM can return to history later | ✓ |
| Ephemeral per session | No messages table, resets on navigate/refresh | |

**User's choice:** Persisted per client

| Option | Description | Selected |
|--------|-------------|----------|
| One thread per client | Simplest — no thread-list UI, one continuous conversation | (later reversed to this) |
| Multiple threads per client | ChatGPT-style conversation list, needs threads table + thread-list UI | ✓ (initially) |

**User's choice (initial):** Multiple threads per client
**Notes:** Reversed during the final "ready for context?" check — user flagged that multiple threads implies a new data model (threads table) and UI (create/name/switch threads) that's bigger scope than needed for a demo, given the 2026-07-18 deadline (2 days out). Final decision: **single ongoing history per client** for Phase 2; multiple threads deferred to a later window (user said "16-30 ago").

---

## Curation UX (CTX-03)

| Option | Description | Selected |
|--------|-------------|----------|
| Checkbox per message | Each message has a select control, PM checks ones worth keeping | ✓ |
| Highlight/select text | Custom text-selection UI for finer-grained control | |
| Copy into an editable note | Seed a draft note from selected messages, edit freely before saving | |

**User's choice:** Checkbox per message

| Option | Description | Selected |
|--------|-------------|----------|
| Straight upload, no preview | Check → Save → .md generated verbatim → uploaded immediately | ✓ |
| Preview/edit before confirming | See generated draft, edit, then confirm upload | |

**User's choice:** Straight upload, no preview

| Option | Description | Selected |
|--------|-------------|----------|
| New file each time | Every curation action = one new .md file uploaded | |
| Append to one running file | One knowledge.md per client that grows over time | |

**User's choice:** Neither — user said "skip questions about tropicalia for now" (freeform). Deferred to research/Claude's discretion as a Tropicalia-API-mechanics detail rather than a user preference.

---

## Missing Tropicalia key / unprovisioned client

| Option | Description | Selected |
|--------|-------------|----------|
| Block chat entirely | Disable input, show "RAG ainda não configurado" | |
| Degrade: Claude-only, no retrieval | Chat works, skips retrieval, visible note that retrieval is unavailable | ✓ |

**User's choice:** Degrade: Claude-only, no retrieval

| Option | Description | Selected |
|--------|-------------|----------|
| Use the briefing as fallback context | Claude gets structured briefing even without Tropicalia retrieval | ✓ |
| Zero client context in degraded mode | Generic/unhelpful chat until RAG is provisioned | |

**User's choice:** Use the briefing as fallback context

| Option | Description | Selected |
|--------|-------------|----------|
| Always include briefing | Every turn sends briefing + retrieved context together, one code path | ✓ |
| Briefing only as fallback | Two distinct code paths — normal mode is retrieval-only per CTX-05's literal wording | |

**User's choice:** Always include briefing

---

## Response delivery & transparency

| Option | Description | Selected |
|--------|-------------|----------|
| Stream token-by-token | Modern chat feel, needs SSE/Vercel AI SDK streaming setup | ✓ |
| Full response after wait | Simpler, one request/one response | |

**User's choice:** Stream token-by-token

| Option | Description | Selected |
|--------|-------------|----------|
| Show retrieved sources | Expandable "sources used" section, builds trust/debuggability | |
| Just the final answer | Cleaner UI, matches plain ChatGPT-style experience | ✓ |

**User's choice:** Just the final answer

---

## Claude's Discretion

- File shape for Tropicalia uploads (new file per save vs. append to one running file) — explicitly deferred by user to research.
- Exact chat screen layout (message bubbles, client-switcher placement).
- Exact wording of the degraded-mode notice.
- Exact messages-table schema shape.
- Streaming implementation choice (raw SSE vs. Vercel AI SDK vs. other).

## Deferred Ideas

- Multiple threads per client (conversation list, thread naming/switching) — deferred to a later window (user: "16-30 ago"). Phase 2 ships with single ongoing history per client instead.
- File-shape question for Tropicalia uploads (see Claude's Discretion above) — technically a deferral to research, not a future-phase item, but tracked here since it came up as a "skip" during discussion.
