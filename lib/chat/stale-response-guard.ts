/**
 * Pure client-switch stale-response guard for the chat panel
 * (app/pm/chat/chat-panel.tsx, 02-03/02-04). Intentionally free of any
 * Supabase/Anthropic client import or I/O so this module can be
 * imported by its sibling `stale-response-guard.test.ts` via a relative
 * path and exercised with Node's built-in test runner — no live DB, no
 * Docker (02-RESEARCH.md Pattern 4, Pitfall #3, CTX-02).
 *
 * When the PM switches the active client while a response is still
 * streaming for the previous client, in-flight chunks must not be
 * appended to the new client's message list. The chat panel captures the
 * `clientId` at request-start time and calls this predicate on every
 * chunk against the currently-active client id; the panel itself also
 * cancels the in-flight fetch via AbortController on switch (not this
 * module's concern — this is the pure comparison only).
 */
export function shouldAppendChunk(
  requestClientId: string,
  activeClientId: string
): boolean {
  return requestClientId === activeClientId;
}
