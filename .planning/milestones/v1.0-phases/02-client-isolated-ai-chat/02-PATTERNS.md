# Phase 2: Client-Isolated AI Chat - Pattern Map

**Mapped:** 2026-07-21
**Files analyzed:** 18 (new/modified)
**Analogs found:** 13 exact/role-match / 18 — this phase introduces three genuinely new categories the codebase has no prior example of (a Route Handler, a streamed HTTP response, and an LLM-generation client), so those are matched at "partial" quality against the closest structural analog with the gap called out explicitly, and RESEARCH.md's own Pattern 2/3 code is cited as the canonical source to fill it.

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|---|---|---|---|---|
| `app/pm/chat/page.tsx` | component (Server Component, data loader) | request-response | `app/pm/clients/[id]/page.tsx` | exact |
| `app/pm/chat/chat-panel.tsx` | component (Client Component) | streaming | `components/clients/client-access-panel.tsx` | partial — Server Action/`useTransition`/toast shell is exact, the `fetch`+`ReadableStream` reader loop has no in-repo analog |
| `app/pm/chat/actions.ts` (`saveKnowledge`, `listMessagesForClient`) | controller (Server Action) | CRUD | `app/pm/clients/[id]/access/actions.ts` | exact |
| `app/api/chat/route.ts` | controller (Route Handler) | streaming | none in-repo (first Route Handler, first streamed response) | no analog — compose from RESEARCH.md Pattern 2 + `app/pm/clients/[id]/access/actions.ts`'s RLS-scoped-read/authorization shape |
| `lib/tropicalia/client.ts` (MODIFY — add `searchTropicaliaProject`, `uploadTropicaliaDocument`) | service (external API wrapper) | request-response (outbound REST) | same file's existing `createTropicaliaProject` | exact — extend, don't fork |
| `lib/anthropic/client.ts` (NEW) | service (server-only client factory) | — | `lib/supabase/admin.ts` | role-match |
| `lib/chat/assemble-prompt.ts` (NEW) | utility (pure function) | transform | `lib/security/client-access-authz.ts` | exact — same "pure, I/O-free, node:test-able" discipline |
| `lib/chat/build-knowledge-markdown.ts` (NEW) | utility (pure function) | transform | `lib/security/client-access-authz.ts` | exact |
| `lib/chat/stale-response-guard.ts` (NEW) | utility (pure function, extracted from Client Component per Validation Architecture) | event-driven | `lib/security/client-access-authz.ts` | exact |
| `lib/validation/chat.ts` (NEW — `sendMessageSchema`, `saveKnowledgeSchema`) | utility (validation) | — | `lib/validation/client-access.ts` | exact |
| `supabase/migrations/0010_messages.sql` (NEW) | migration (CREATE TABLE + RLS + GRANT) | CRUD (schema) | `supabase/migrations/0004_rls_policies.sql` (policy shape) + `supabase/migrations/0008_clients_grants.sql` (GRANT — but this time in the SAME migration, not a follow-up) | exact |
| `supabase/tests/0004_rls_messages_scoping_test.sql` (NEW) | test (pgTAP) | CRUD (RLS) | `supabase/tests/0002_rls_client_scoping_test.sql` | exact |
| `lib/tropicalia/client.test.ts` (NEW) | test (unit) | — | `lib/security/client-access-authz.test.ts` | exact |
| `lib/chat/assemble-prompt.test.ts` (NEW) | test (unit) | — | `lib/security/client-access-authz.test.ts` | exact |
| `lib/chat/build-knowledge-markdown.test.ts` (NEW) | test (unit) | — | `lib/security/client-access-authz.test.ts` | exact |
| `lib/chat/stale-response-guard.test.ts` (NEW) | test (unit) | — | `lib/security/client-access-authz.test.ts` | exact |
| `.env.local.example` (MODIFY — add `ANTHROPIC_API_KEY`, `ANTHROPIC_CHAT_MODEL`) | config | — | same file's existing `TROPICALIA_API_KEY` block | exact |
| `package.json` (MODIFY — add `@anthropic-ai/sdk`, extend `test` script glob) | config | — | same file's existing `test` script (`node --test lib/security/*.test.ts`) | exact |

## Pattern Assignments

### `app/pm/chat/page.tsx` (component, request-response)

**Analog:** `app/pm/clients/[id]/page.tsx`

**Full shape to copy** (`app/pm/clients/[id]/page.tsx` lines 1-73, entire file — this is the "RLS-scoped Server Component data loader passing typed props to a Client Component" pattern this phase's chat screen should reuse verbatim, adapted for a client-roster query instead of a single-client-by-id query):
```tsx
import { createClient } from "@/lib/supabase/server";
import { ChatPanel } from "./chat-panel";

export default async function PmChatPage() {
  const supabase = await createClient();

  // D-12-equivalent: zero additional app-layer filtering — clients_select_scoped
  // (0004_rls_policies.sql) already returns only clients in
  // pm_assigned_clients() for a PM caller. This IS the roster for the client
  // switcher (D-01) — never a separate unscoped query.
  const { data: clients } = await supabase
    .from("clients")
    .select("id, name")
    .order("name", { ascending: true });

  return <ChatPanel clients={clients ?? []} />;
}
```
Key convention carried over: `notFound()` is NOT relevant here (no `[id]` param — this is a roster page, closer to `app/pm/clients/page.tsx`'s "zero additional app-layer filtering beyond the RLS-scoped query" comment, lines 27-31 of that file) — cite both analogs, but structurally this page's props-passing shape (fetch server-side, hand typed data to a `"use client"` sibling) is `[id]/page.tsx`'s pattern.

**Auth pattern:** none needed beyond the RLS-scoped `createClient()` read itself — same as both analogs, no separate `auth.getUser()` gate on this page (middleware already enforces the `/pm` role root).

---

### `app/pm/chat/chat-panel.tsx` (component, streaming)

**Analog (shell/state pattern):** `components/clients/client-access-panel.tsx`

**Analog (streaming reader loop — NO in-repo precedent):** RESEARCH.md Pattern 4, `app/pm/chat/chat-panel.tsx` example (02-RESEARCH.md lines 550-582)

**Imports + state-management shell to copy** (`components/clients/client-access-panel.tsx` lines 1-34):
```tsx
"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
// ... shadcn imports per 02-UI-SPEC.md: Select, Textarea, Checkbox, Skeleton, Badge
import { saveKnowledge } from "./actions";
```
This file's `useTransition` + local `useState` error/pending pattern (lines 58-109 of the analog: `const [isPending, startTransition] = useTransition(); ... startTransition(async () => { const result = await action(...); if ("error" in result) { setServerError(result.error); return; } toast.success(...) })`) is the exact shape to reuse for `saveKnowledge()`.

**New pattern this file needs (no analog) — stale-response guard + stream reader**, copy verbatim from RESEARCH.md (02-RESEARCH.md lines 550-582):
```tsx
const activeClientIdRef = useRef(activeClientId);
useEffect(() => { activeClientIdRef.current = activeClientId; }, [activeClientId]);

async function sendMessage(clientId: string, content: string) {
  const controller = new AbortController();
  currentRequestControllerRef.current?.abort();
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
    if (activeClientIdRef.current !== clientId) break; // Pitfall #3 guard
    appendToStreamingBubble(decoder.decode(value));
  }
}
```
Extract the `activeClientIdRef.current !== clientId` condition into `lib/chat/stale-response-guard.ts`'s `shouldAppendChunk(requestClientId, activeClientId)` per the Validation Architecture's testability requirement — don't inline the raw boolean check in the component.

**Error handling pattern:** same inline `<p className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">` block used in both `client-access-panel.tsx` (lines 155-159) and `client-detail-form.tsx` (lines 294-298) — reuse verbatim for send-failure and save-knowledge-failure states, per 02-UI-SPEC.md's locked copy ("Não foi possível enviar sua mensagem...", "Não foi possível salvar o conhecimento...").

---

### `app/pm/chat/actions.ts` (controller/Server Action, CRUD)

**Analog:** `app/pm/clients/[id]/access/actions.ts`

**Imports pattern** (lines 1-11):
```ts
"use server";

import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { saveKnowledgeSchema } from "@/lib/validation/chat";
```

**Authorization pattern to copy** — the analog's `assertCallerManagesClient()` (lines 28-77) is the template for re-verifying client ownership before any privileged action; for this phase's simpler case (RLS-scoped `createClient()` reads are sufficient, no admin-client cross-user write needed), follow RESEARCH.md Pattern 1/3's simpler inline shape instead (single `.eq("id", clientId).single()` read whose emptiness IS the 403), but keep the same discipline: **never accept a project ID or message content as trusted input — always re-derive via a fresh RLS-scoped query keyed only by `clientId`.**

**Core CRUD pattern** (`saveKnowledge`, composing the analog's structure with RESEARCH.md Pattern 3, 02-RESEARCH.md lines 466-514):
```ts
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
  // ... (full body: RESEARCH.md Pattern 3)
}
```

**Error handling pattern:** same `{ success: true } | { error: string }` discriminated-union return type used by every Server Action in `lib/actions/clients.ts` (`ActionResult` type, line 132) and `access/actions.ts` (`DeactivateClientAccessResult`, line 188) — reuse this exact shape, never throw from a Server Action that a Client Component awaits directly.

---

### `app/api/chat/route.ts` (controller, streaming — NO IN-REPO ANALOG)

**Canonical source:** RESEARCH.md Pattern 2, full code block (02-RESEARCH.md lines 370-457) — this is the first Route Handler and the first streamed response in this codebase, so there is no closer in-repo file to copy from. The **authorization/RLS-scoped-read shape**, however, should still mirror existing Server Action conventions:

**Auth pattern to copy from `app/pm/clients/[id]/access/actions.ts` lines 28-45** (adapt `assertCallerManagesClient`'s `auth.getUser()` + fail-closed-on-error shape into the Route Handler's own inline auth check):
```ts
const supabase = await createClient();
const { data: { user } } = await supabase.auth.getUser();
if (!user) return new Response("Não autenticado.", { status: 401 });
```

**Core streaming pattern:** copy RESEARCH.md's full Route Handler body verbatim (`export const runtime = "nodejs"`, zod-parse request body, RLS-scoped `clients` read as the sole authorization+project-ID-resolution step per Pattern 1, conditional `searchTropicaliaProject()` call wrapped in try/catch that degrades to `chunks = []` — never throws, `ReadableStream` constructed from the Anthropic SDK's async-iterable `.stream()`, persist user message before generation starts and assistant message after `stream.finalMessage()` resolves).

**Error handling pattern:** every failure path returns a plain `new Response(message, { status })` — no JSON envelope, matching this being a streamed-body endpoint, not a typical Server Action. 403/401/400 short-circuit before any external API call; Tropicalia failures are swallowed (empty chunk list, D-06/D-07 "one code path" rule) but Claude/Anthropic failures are NOT swallowed the same way (CTX-05 has no degraded-mode equivalent — see Assumptions Log A-none, Environment Availability table).

---

### `lib/tropicalia/client.ts` (MODIFY — service, request-response)

**Analog:** same file's existing `createTropicaliaProject()` (lines 34-59) — extend, do not create a parallel client.

**Imports/module-level pattern already established** (lines 1-14):
```ts
/**
 * SERVER-ONLY. Never import this file from a Client Component —
 * `TROPICALIA_API_KEY` must never reach the browser bundle...
 */
const TROPICALIA_BASE_URL = "https://api.tropicalia.dev";
```
Both new functions (`searchTropicaliaProject`, `uploadTropicaliaDocument`) must follow this file's three established conventions verbatim:
1. `const apiKey = process.env.TROPICALIA_API_KEY; if (!apiKey) throw new Error(...)` — defensive backstop, same message style (line 38-40).
2. `signal: AbortSignal.timeout(10_000)` for JSON calls (line 51) — RESEARCH.md's upload function uses `30_000` instead (uploads take longer), still the same `AbortSignal.timeout()` mechanism, never a bare unguarded `fetch`.
3. `if (!res.ok) throw new Error(...)` with the endpoint name + status in the message (lines 54-56) — same shape for both new functions.

**CTX-05 hard requirement (new — not in the existing file, must be added):** `searchTropicaliaProject()`'s request body must set `generate_answer: false` explicitly (RESEARCH.md Pitfall #2) — this is the one place this phase's convention diverges from a pure "copy the existing function," and it must be unit-tested (`lib/tropicalia/client.test.ts`, mocking `fetch`, asserting on the constructed request body).

---

### `lib/anthropic/client.ts` (NEW — service, server-only client factory)

**Analog:** `lib/supabase/admin.ts` (full file, 24 lines)

**Pattern to copy:**
```ts
// lib/supabase/admin.ts (analog, lines 1-23)
import { createClient as createSupabaseClient } from "@supabase/supabase-js";

export function createAdminClient() {
  return createSupabaseClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SECRET_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  );
}
```
Same "SERVER-ONLY, never import from a Client Component, secret key never `NEXT_PUBLIC_`-prefixed" doc-comment discipline (lines 4-11) — copy the comment block's wording pattern, not just the code. Deviation: `lib/anthropic/client.ts` adds a module-level singleton cache (`let cached: Anthropic | null = null`) per RESEARCH.md Pattern 2 (02-RESEARCH.md lines 316-323) since the Anthropic SDK client is more expensive to construct repeatedly than a Supabase client — this is a deliberate, justified deviation from the exact analog shape, not an oversight.

---

### `lib/chat/assemble-prompt.ts`, `lib/chat/build-knowledge-markdown.ts`, `lib/chat/stale-response-guard.ts` (NEW — pure-function utilities)

**Analog:** `lib/security/client-access-authz.ts` (full file, 38 lines)

**Pattern to copy — the module-level doc comment establishing "why this file has no I/O"** (lines 1-8):
```ts
/**
 * Pure authorization predicates for the Client-access Server Actions...
 * Intentionally free of any Supabase client import or I/O so this module
 * can be imported by its sibling `*.test.ts` via a relative path and
 * exercised with Node's built-in test runner — no live DB, no service-role
 * key, no Docker.
 */
```
**Function shape to copy** (lines 17-25, `isClientActionAuthorized`) — small, single-purpose, fully-typed input object, boolean/string return, no `async`, no imports beyond nothing:
```ts
export function isClientActionAuthorized(input: {
  isAdmin: boolean;
  assignedClientIds: string[];
  clientId: string;
}): boolean {
  return input.isAdmin || input.assignedClientIds.includes(input.clientId);
}
```
Apply this exact discipline to all three new pure functions:
- `assembleSystemPrompt(client, retrievedChunks)` — RESEARCH.md Pattern 2 full body (02-RESEARCH.md lines 326-367) already matches this shape (typed input, string return, no I/O).
- `buildKnowledgeMarkdown(clientName, messages)` — same discipline; body is new (not in RESEARCH.md verbatim) but must follow the same "pure, testable" contract per the Validation Architecture table.
- `shouldAppendChunk(requestClientId, activeClientId)` — extracted from the Client Component's inline guard per Validation Architecture's explicit instruction ("extract the guard condition into a small pure function for testability").

**Test pattern for all three:** `lib/security/client-access-authz.test.ts` (full file, 66 lines) — `import { test } from "node:test"; import assert from "node:assert/strict";`, one `test(...)` block per POSITIVE/NEGATIVE case, `assert.equal(fn(...), expected)`. Copy this file's structure exactly for `assemble-prompt.test.ts`, `build-knowledge-markdown.test.ts`, and `stale-response-guard.test.ts`.

---

### `lib/validation/chat.ts` (NEW — utility, validation)

**Analog:** `lib/validation/client-access.ts` (full file, 36 lines)

**Pattern to copy** (lines 1-16):
```ts
import { z } from "zod";

/**
 * [Purpose]. A NEW file (not an edit to lib/validation/clients.ts, which is
 * owned by 01-0X) per [this phase]'s interfaces section, to avoid a
 * file-ownership conflict between plans.
 */
export const sendMessageSchema = z.object({
  clientId: z.string().uuid({ message: "Cliente inválido." }),
  content: z.string().trim().min(1, { message: "Mensagem não pode estar vazia." }).max(4000),
});
export type SendMessageInput = z.infer<typeof sendMessageSchema>;

export const saveKnowledgeSchema = z.object({
  clientId: z.string().uuid({ message: "Cliente inválido." }),
  messageIds: z.array(z.string().uuid()).min(1, { message: "Selecione ao menos uma mensagem." }),
});
export type SaveKnowledgeInput = z.infer<typeof saveKnowledgeSchema>;
```
Same "new file per phase, not an edit to an existing owned file" rationale documented in the analog's own comment (lines 4-9) applies here — do not add these schemas into `lib/validation/clients.ts`.

---

### `supabase/migrations/0010_messages.sql` (NEW — migration)

**Analog (policy shape):** `supabase/migrations/0004_rls_policies.sql`, `clients_select_scoped`/`clients_insert_admin_only` policies (lines 119-140)

**Analog (GRANT — but this time same-migration, not a follow-up fix):** `supabase/migrations/0008_clients_grants.sql` (full file, 21 lines) — this migration exists ONLY because 0004 forgot the GRANT; Pitfall #4 explicitly says do not repeat that mistake.

**Pattern to copy** (RESEARCH.md's fully-worked migration, 02-RESEARCH.md lines 643-681, reusing `is_admin()`/`pm_assigned_clients()` from 0004 rather than inlining a cross-table subquery — Pitfall-1 rule from 01-PATTERNS.md, reinforced by this phase's own CONTEXT.md):
```sql
create table public.messages (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.clients(id) on delete cascade,
  role text not null check (role in ('user', 'assistant')),
  content text not null,
  created_at timestamptz not null default now()
);

alter table public.messages enable row level security;

create policy "messages_select_scoped"
on public.messages for select to authenticated
using ((select public.is_admin()) or client_id in (select public.pm_assigned_clients()));

create policy "messages_insert_scoped"
on public.messages for insert to authenticated
with check ((select public.is_admin()) or client_id in (select public.pm_assigned_clients()));

-- Pitfall #4: GRANT in the SAME migration, not a follow-up like 0008 had to be.
grant select, insert on public.messages to authenticated;
```

---

### `supabase/tests/0004_rls_messages_scoping_test.sql` (NEW — pgTAP test)

**Analog:** `supabase/tests/0002_rls_client_scoping_test.sql` (full file, 55 lines)

**Pattern to copy** (lines 1-25, structure + `tests.set_auth()` usage):
```sql
begin;
select plan(4); -- pick N to match your assertion count

\ir rls_helpers.sql

select tests.set_auth('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'); -- pm_a, assigned to client_a only

select results_eq(
  $$ select count(*) from public.messages where client_id = '11111111-1111-1111-1111-111111111111' $$,
  $$ values (0::bigint) $$, -- or seed a fixture row and assert (1::bigint)
  'AUTH-06-equivalent: PM sees messages for their assigned client'
);

select results_eq(
  $$ select count(*) from public.messages where client_id = '22222222-2222-2222-2222-222222222222' $$,
  $$ values (0::bigint) $$,
  'PM is blocked from another client''s messages (client_b)'
);

reset role;
select set_config('request.jwt.claims', '', true);

select * from finish();
rollback;
```
Reuse `rls_helpers.sql`'s existing fixed-uuid fixtures (`client_a`/`client_b`/`pm_a`/`client_a_user`/`admin_user` — documented at the top of that file) rather than inventing new fixture rows; insert one or two `messages` rows scoped to `client_a` inside this test file's own transaction (rolled back at the end) to have something non-zero to assert on for the "sees own" case.

---

## Shared Patterns

### Server-only secret discipline
**Source:** `lib/supabase/admin.ts` (lines 4-11), `lib/tropicalia/client.ts` (lines 4-7)
**Apply to:** `lib/anthropic/client.ts`, the extended `lib/tropicalia/client.ts`
```ts
/**
 * SERVER-ONLY. Never import this file from a Client Component — the
 * secret key must never reach the browser bundle.
 */
```
Every new secret (`ANTHROPIC_API_KEY`) follows the exact same non-`NEXT_PUBLIC_`-prefixed, `process.env` direct-read convention already used for `TROPICALIA_API_KEY`/`SUPABASE_SECRET_KEY`.

### RLS-scoped-read-as-authorization-boundary
**Source:** `app/pm/clients/[id]/page.tsx` (lines 24-37), `app/pm/clients/[id]/access/actions.ts`'s `assertCallerManagesClient` (lines 28-77)
**Apply to:** `app/api/chat/route.ts`, `app/pm/chat/actions.ts`'s `saveKnowledge`
A single `.eq("id", clientId).single()` read through the RLS-scoped `createClient()` (never `createAdminClient()`) IS the authorization check — an empty/errored result means "not found or not permitted," collapsed into one 403/`notFound()` response, never a separate authorization branch.

### Server Action discriminated-union return type
**Source:** `lib/actions/clients.ts` (`ActionResult`, line 132), `app/pm/clients/[id]/access/actions.ts` (`DeactivateClientAccessResult`, line 188)
**Apply to:** `app/pm/chat/actions.ts`'s `saveKnowledge`
```ts
type ActionResult = { success: true } | { error: string };
```
Every Server Action this phase adds returns this shape — no thrown errors across the Server Action boundary, no different shape for different failure types (the caller only ever checks `"error" in result`).

### Client Component `useTransition` + toast feedback
**Source:** `components/clients/client-access-panel.tsx` (lines 58-109), `components/clients/client-detail-form.tsx` (lines 163-171)
**Apply to:** `app/pm/chat/chat-panel.tsx`'s save-knowledge button
```tsx
const [isPending, startTransition] = useTransition();
const [serverError, setServerError] = useState<string | null>(null);

function handleAction() {
  setServerError(null);
  startTransition(async () => {
    const result = await someAction(...);
    if ("error" in result) { setServerError(result.error); return; }
    toast.success("...");
  });
}
```

### Inline error-message rendering
**Source:** `components/clients/client-access-panel.tsx` (lines 155-159, 227-231), `components/clients/client-detail-form.tsx` (lines 294-298, 382-386, 419-423)
**Apply to:** every error state in `chat-panel.tsx`
```tsx
{serverError ? (
  <p className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">
    {serverError}
  </p>
) : null}
```

### Degraded-mode / "Pendente" badge convention
**Source:** `components/clients/client-detail-form.tsx` (lines 389-417, the RAG-status section: `Badge variant="outline"` + `<Clock />` icon + conditional retry button)
**Apply to:** the chat screen's degraded-mode notice (02-UI-SPEC.md's "Busca de contexto indisponível" badge) — same `Badge variant="outline"` neutral-tone convention, explicitly NO retry button in the chat context (per 02-UI-SPEC.md, unlike the client-detail page's RAG section which does show one) — do not copy the retry button, only the badge styling.

## No Analog Found

Files with no close match in the codebase (planner should use RESEARCH.md patterns instead):

| File | Role | Data Flow | Reason |
|------|------|-----------|--------|
| `app/api/chat/route.ts` | controller (Route Handler) | streaming | First Route Handler in this codebase — every prior server-side write goes through a Server Action. Use RESEARCH.md Pattern 2 (02-RESEARCH.md lines 370-457) as the canonical source, composed with the RLS-scoped-read authorization convention from existing Server Actions. |
| `lib/anthropic/client.ts` | service | — | First LLM SDK integration (no `@anthropic-ai/*` dependency exists yet). `lib/supabase/admin.ts` supplies the "server-only client factory" shell; the singleton-caching addition and the SDK-specific constructor call are new, sourced from RESEARCH.md Pattern 2 (02-RESEARCH.md lines 310-323). |
| Streaming reader loop inside `chat-panel.tsx` | component (Client Component fragment) | streaming | No prior `fetch`+`ReadableStream`-reading code exists in any Client Component. Source: RESEARCH.md Pattern 4 (02-RESEARCH.md lines 542-582), verbatim. |

## Metadata

**Analog search scope:** `app/`, `components/`, `lib/`, `supabase/migrations/`, `supabase/tests/` (full repo excluding `node_modules`, `.next`, `.git`, `.claude/worktrees`)
**Files scanned:** ~45 TS/TSX/SQL source files (via `find` + targeted `Read`/`Grep`)
**Pattern extraction date:** 2026-07-21
