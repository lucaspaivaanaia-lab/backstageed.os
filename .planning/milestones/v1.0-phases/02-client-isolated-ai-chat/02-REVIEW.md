---
phase: 02-client-isolated-ai-chat
reviewed: 2026-07-21T00:00:00Z
depth: standard
files_reviewed: 16
files_reviewed_list:
  - supabase/migrations/0010_messages.sql
  - supabase/tests/0004_rls_messages_scoping_test.sql
  - lib/chat/assemble-prompt.ts
  - lib/chat/assemble-prompt.test.ts
  - lib/chat/build-knowledge-markdown.ts
  - lib/chat/build-knowledge-markdown.test.ts
  - lib/chat/stale-response-guard.ts
  - lib/chat/stale-response-guard.test.ts
  - lib/validation/chat.ts
  - lib/anthropic/client.ts
  - lib/tropicalia/client.ts
  - lib/tropicalia/client.test.ts
  - app/api/chat/route.ts
  - app/pm/chat/page.tsx
  - app/pm/chat/chat-panel.tsx
  - app/pm/chat/actions.ts
findings:
  critical: 1
  warning: 4
  info: 5
  total: 10
status: issues_found
---

# Phase 02: Code Review Report

**Reviewed:** 2026-07-21
**Depth:** standard
**Files Reviewed:** 16
**Status:** issues_found

## Summary

The structural client-isolation boundary itself checks out: `app/api/chat/route.ts` and `app/pm/chat/actions.ts` both resolve `tropicalia_project_id`/client ownership exclusively through RLS-scoped `.eq("id", clientId).single()` reads, never from request-body input; `supabase/migrations/0010_messages.sql` reuses `is_admin()`/`pm_assigned_clients()` without inlining cross-table subqueries and ships its GRANT in the same migration; and `searchTropicaliaProject` hard-codes `generate_answer: false` with a pinned unit test. `assembleSystemPrompt`'s leakage-guard tests and `shouldAppendChunk`'s pure predicate are both correctly designed and tested in isolation.

However, the client-switch race-condition guard has a real, reproducible defect: `chat-panel.tsx`'s `streamResponse` only resets the global `isSending` flag inside an `isStillActive()`-gated `finally` block, but `isStillActive()` is *by definition* false for every switch-triggered abort — so switching clients while a message is streaming permanently disables the composer for the rest of the session (see CR-01). This is exactly the race-condition class the review was asked to focus on, and it is not merely a UI polish issue: it makes the chat unusable after one specific, easy-to-trigger user action. Additional (non-blocking) robustness gaps exist around unhandled JSON parsing, unchecked `messages` insert errors, and a stuck "typing" bubble on a genuine Anthropic mid-stream failure.

## Critical Issues

### CR-01: Switching clients mid-stream permanently disables the composer (isSending never resets)

**File:** `app/pm/chat/chat-panel.tsx:141-234` (root cause at 229-233)
**Issue:** `streamResponse` sets `isSending(true)` unconditionally at the start (line 146), but only clears it inside the `finally` block, and only `if (isStillActive())` (lines 229-233):

```ts
} finally {
  if (isStillActive()) {
    setIsSending(false);
  }
}
```

`isStillActive()` is `shouldAppendChunk(clientId, activeClientIdRef.current ?? "")`, comparing the *request's* captured client id against the *currently active* client id. `handleSwitchClient` (lines 99-112) synchronously updates `activeClientIdRef.current` to the new client and calls `abortControllerRef.current?.abort()`, which causes the in-flight `fetch`/`reader.read()` to reject with `AbortError`. The `catch` block returns early on `AbortError` (line 217), but `finally` still runs afterward — and by that point `isStillActive()` is *always* false, because the whole point of the guard is to detect that the client changed. Since this is the **only** code path that ever calls `setIsSending(false)`, `isSending` is permanently stuck at `true` after any client switch performed while a request is in flight (this includes switching literally 1ms after clicking Send, or switching during the still-pending initial `fetch()` await).

Once `isSending` is stuck, the composer is disabled for the *entire session* (`disabled={!activeClientId || isSending}` on the Textarea/Button, line 411/419) and `handleSend` also short-circuits on `isSending` (line 238) — for every client, not just the one that was being streamed. This reliably reproduces: pick client A, send a message, immediately switch to client B before the stream finishes. The chat becomes permanently unusable until a full page reload.

This is precisely the "race condition safety when a PM switches clients mid-stream" property the phase's own plan (02-04) claims to guarantee ("switching clients aborts any in-flight request via AbortController" and "T-2-07 (mitigate)") — the abort itself works correctly (no cross-client bleed), but the state cleanup that should accompany it does not.

**Fix:** Reset `isSending` unconditionally in `finally`, since it is not (and should not be) scoped per-client — it reflects "is *a* request currently owned by this component in flight", and a switch always terminates that ownership:

```ts
} finally {
  setIsSending(false);
}
```

(Any state updates that must remain guarded by `isStillActive()` — e.g. appending chunks to `messages`, setting `sendError`/`interrupted` — should stay guarded exactly as they are; only the `isSending` reset needs to be unconditional.)

## Warnings

### WR-01: Interrupted-by-server-error stream leaves a permanently "typing" bubble with partial content

**File:** `app/pm/chat/chat-panel.tsx:216-228`
**Issue:** In the `catch` block, the streaming placeholder bubble is only removed if its content is still empty:

```ts
if (last?.streaming && last.content === "") {
  next.pop();
}
```

If the Anthropic stream errors *after* some tokens have already been enqueued (e.g. a mid-stream rate-limit/network failure on `app/api/chat/route.ts`'s `for await (const event of stream)`, which has no try/catch — see WR-04), the bubble is left with `streaming: true` and non-empty partial content. No code path ever sets `streaming: false` on the error path when content is non-empty, so the three pulsing "typing" dots animate indefinitely even though the response has actually failed. `sendError` is shown alongside it, but the stuck bubble itself is confusing and never self-heals except via `loadHistory` on the next successful turn or a client switch.
**Fix:** Always clear the `streaming` flag on error, regardless of whether content is empty; only decide whether to *pop* the bubble entirely based on emptiness:

```ts
setMessages((prev) => {
  const next = [...prev];
  const last = next[next.length - 1];
  if (last?.streaming) {
    if (last.content === "") {
      next.pop();
    } else {
      next[next.length - 1] = { ...last, streaming: false };
    }
  }
  return next;
});
```

### WR-02: Malformed JSON body crashes the Route Handler instead of returning 400

**File:** `app/api/chat/route.ts:23`
**Issue:** `const body = await request.json();` is not wrapped in a try/catch. A request with a malformed or missing JSON body (e.g. empty body, wrong `Content-Type`, truncated payload) throws inside `request.json()`, which is never caught — the handler exits via an unhandled exception instead of the intended `sendMessageSchema.safeParse` → 400 path a few lines below.
**Fix:**
```ts
let body: unknown;
try {
  body = await request.json();
} catch {
  return new Response("Dados inválidos.", { status: 400 });
}
const parsed = sendMessageSchema.safeParse(body);
```

### WR-03: Unchecked `messages` insert errors risk silent conversation-history drift

**File:** `app/api/chat/route.ts:84-86, 118-122`
**Issue:** Neither the pre-generation user-turn insert nor the post-generation assistant-turn insert checks the returned `error`:
```ts
await supabase.from("messages").insert({ client_id: clientId, role: "user", content });
...
await supabase.from("messages").insert({ client_id: clientId, role: "assistant", content: ... });
```
If either insert fails (network blip, transient RLS/connection issue), the code proceeds as if it succeeded. The user-turn case is the more serious of the two: if it silently fails, the assistant still generates and persists a reply, but the corresponding question is missing from `messages` — the next turn's `history` query (lines 76-80) and any later `saveKnowledge`/curation pass would show an assistant answer with no matching question, and the PM has no indication anything went wrong.
**Fix:** Check `error` on both inserts; on the user-turn insert failure, fail the request before calling Claude (this is the persist-before-generate contract the code's own comment claims to uphold); on the assistant-turn insert failure, at minimum log server-side so drift is observable.

### WR-04: Anthropic stream consumption inside the `ReadableStream` has no error handling

**File:** `app/api/chat/route.ts:104-125`
**Issue:** The `for await (const event of stream)` loop and the subsequent `finalMessage()`/insert have no try/catch. If the Anthropic stream errors mid-response (rate limit, network drop, content-policy stop), the `ReadableStream`'s `start()` promise rejects with no server-side logging, `controller.close()` is never reached, and the assistant turn is never persisted — the failure is only observable client-side as a broken stream (compounding WR-01 above). The code comment ("an Anthropic failure is NOT swallowed... it propagates") documents the propagation but not the complete absence of handling/observability.
**Fix:** Wrap the loop in try/catch, log the error server-side, and call `controller.error(err)` explicitly so the failure mode is deliberate rather than incidental:
```ts
try {
  for await (const event of stream) { ... }
  ...
} catch (err) {
  console.error("chat stream failed", err);
  controller.error(err);
}
```

## Info

### IN-01: Retrieval chunks missing a `document` field are rendered as empty bullet points instead of filtered out

**File:** `app/api/chat/route.ts:68-70`
**Issue:** `chunks = retrieved.map((chunk) => ({ document: typeof chunk.document === "string" ? chunk.document : "" }))` keeps every chunk Tropicalia returns, even ones without a usable `document` string, turning into a bare `"- "` line in the assembled retrieval block (`assemble-prompt.ts:52-55`). This adds noise to the prompt rather than failing gracefully.
**Fix:** Filter rather than coerce: `retrieved.filter((c) => typeof c.document === "string").map((c) => ({ document: c.document as string }))`.

### IN-02: Redundant sort — Server Action already orders ascending, then `buildKnowledgeMarkdown` re-sorts

**File:** `app/pm/chat/actions.ts:56-61`, `lib/chat/build-knowledge-markdown.ts:28-30`
**Issue:** `saveKnowledge`'s Supabase query already applies `.order("created_at", { ascending: true })`, and `buildKnowledgeMarkdown` independently re-sorts the same array by the same key. This is documented as an intentional defensive choice in 02-02-SUMMARY.md ("cheaper to guarantee correctness in the pure layer"), which is a reasonable call for the pure module in isolation, but the duplication at this specific call site is pure waste and slightly obscures that the Server Action's `.order()` clause is dead weight.
**Fix:** No functional change needed; consider dropping the `.order()` clause on this specific query (or a comment noting it's intentionally redundant/defense-in-depth) so a future reader doesn't assume it's load-bearing.

### IN-03: React list rendering falls back to array index as key for unpersisted messages

**File:** `app/pm/chat/chat-panel.tsx:340`
**Issue:** `key={message.id ?? index}` — the in-progress user bubble (pushed optimistically with no `id`) and the streaming assistant placeholder both key off `index` until the post-stream `loadHistory` replaces the array. Index-based keys are a known React footgun for reconciliation correctness when list order/length changes mid-render; here it happens to work because only one un-ided item exists at a time, but it's a fragile invariant to depend on silently.
**Fix:** Use a stable client-generated id (e.g. `crypto.randomUUID()`) for optimistic/streaming messages instead of falling back to `index`.

### IN-04: `saveKnowledgeSchema.messageIds` has no upper bound

**File:** `lib/validation/chat.ts:30-35`
**Issue:** `messageIds: z.array(z.string().uuid()).min(1, ...)` has a minimum but no maximum array length. Since the Server Action re-verifies ownership via RLS before using the ids, this isn't an isolation bypass, but an unbounded array from the client is passed straight into a Supabase `.in("id", ids)` call with no cap.
**Fix:** Add a reasonable `.max(...)` (e.g. matching the visible history length a PM could plausibly select) for defense-in-depth input bounding, consistent with the `content.max(4000)` rationale already applied to `sendMessageSchema`.

### IN-05: No tiebreaker for `messages` ordered by `created_at` when timestamps collide

**File:** `app/api/chat/route.ts:76-80`, `app/pm/chat/actions.ts:56-61`
**Issue:** Both the chat-history read and the curation read order strictly by `created_at timestamptz` with no secondary sort key. Two messages inserted within the same clock tick (millisecond-resolution timestamp, e.g. rapid back-to-back inserts) have no guaranteed stable relative order across repeated reads.
**Fix:** Add `id` (or an explicit sequence column) as a secondary sort key, e.g. `.order("created_at", { ascending: true }).order("id", { ascending: true })`, to make ordering deterministic.

---

_Reviewed: 2026-07-21_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
