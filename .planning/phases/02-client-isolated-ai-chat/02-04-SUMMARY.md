---
phase: 02-client-isolated-ai-chat
plan: 04
subsystem: api
tags: [nextjs, route-handler, streaming, anthropic-sdk, tropicalia, supabase-rls, shadcn]

# Dependency graph
requires:
  - phase: 02-client-isolated-ai-chat (02-01)
    provides: public.messages table + RLS policies (messages_select_scoped, messages_insert_scoped)
  - phase: 02-client-isolated-ai-chat (02-02)
    provides: assembleSystemPrompt, shouldAppendChunk, sendMessageSchema (pure/testable logic)
  - phase: 02-client-isolated-ai-chat (02-03)
    provides: getAnthropicClient, searchTropicaliaProject/uploadTropicaliaDocument (server-only wrappers)
provides:
  - Working /pm/chat screen (client switcher, message list, composer)
  - Streaming POST /api/chat Route Handler wiring resolve -> retrieve -> assemble -> stream -> persist
  - Server-side structural isolation boundary (tropicalia_project_id resolved from clientId via RLS, never from request body)
  - Race-safe client switching (shouldAppendChunk + AbortController) and visible degraded mode
affects: [02-05 (save-to-knowledge curation), 02-06 (human-verify checkpoint against live APIs)]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Server-computed boolean prop crossing the server/client boundary (hasRag), mirroring the existing canRetry precedent in client-detail-form.tsx"
    - "Route Handler ReadableStream wrapping an Anthropic SDK async-iterable stream, per Next.js's official streaming pattern"
    - "Client Component refetches persisted history via the RLS-scoped browser Supabase client (lib/supabase/client.ts) on every client switch, rather than carrying in-memory state across clients"

key-files:
  created:
    - app/api/chat/route.ts
    - app/pm/chat/page.tsx
    - app/pm/chat/chat-panel.tsx
  modified: []

key-decisions:
  - "Mapped raw Tropicalia retrieval chunks (typed `{id: string; [key: string]: unknown}` by the already-merged 02-03 client) into the `{document: string}` shape assembleSystemPrompt expects via a defensive string-typeof check, since 02-03's shipped type is looser than 02-RESEARCH.md's example type"
  - "Used the existing lib/supabase/client.ts browser client (RLS-scoped) to refetch a client's persisted message history on every switch — this plan's file list didn't include a separate history GET route, and a direct RLS-scoped read mirrors the same resolve-via-RLS discipline as the POST route"
  - "Added an explicit `className=\"size-11\"` override on the icon-only send Button (shadcn's `size=\"icon\"` variant is 36px) to satisfy the UI-SPEC's 44x44px minimum touch-target rule for icon-only controls"

patterns-established:
  - "Streaming chat Route Handler: resolve client via RLS -> degraded-mode-safe Tropicalia retrieval (try/catch, never a shared fallback project) -> assembleSystemPrompt -> anthropic.messages.stream() -> ReadableStream -> persist both turns"

requirements-completed: [CTX-01, CTX-02, CTX-05]

# Metrics
duration: ~35min
completed: 2026-07-21
---

# Phase 02 Plan 04: Streaming client-isolated chat Summary

**Working /pm/chat screen where a PM picks a client, sends a message, and watches a server-assembled, client-scoped Claude response stream token-by-token, with tropicalia_project_id resolved exclusively server-side via RLS.**

## Performance

- **Duration:** ~35 min
- **Completed:** 2026-07-21T21:13:25Z
- **Tasks:** 2/2 completed
- **Files modified:** 3 (all new)

## Accomplishments
- `app/api/chat/route.ts`: a single streaming `POST` Route Handler that resolves the client's `tropicalia_project_id` through an RLS-scoped `.eq("id", clientId).single()` read (the structural isolation boundary), degrades to briefing-only in the same code path when Tropicalia is unavailable, persists the user turn before generation and the assistant turn after `finalMessage()`, and streams Claude's tokens back as a `ReadableStream`.
- `app/pm/chat/page.tsx`: an RLS-scoped Server Component roster loader that computes `hasRag` per client server-side (mirroring the `canRetry` precedent) and hands it to the panel as a prop — the badge never reads `process.env` client-side.
- `app/pm/chat/chat-panel.tsx`: full chat UI — client switcher, message list (alignment-only differentiation per D-09), composer with Enter-to-send/Shift+Enter-newline, a reader loop gated on every chunk by `shouldAppendChunk`, an `AbortController` that cancels in-flight requests on client switch, the degraded-mode badge, empty states, and send-error / interrupted-stream copy exactly as specified in 02-UI-SPEC.md.

## Task Commits

Each task was committed atomically:

1. **Task 1: Streaming chat Route Handler (app/api/chat/route.ts)** - `a2d116a` (feat)
2. **Task 2: Chat screen — roster loader page + streaming chat panel** - `10e57d4` (feat)

**Plan metadata:** committed alongside this SUMMARY.

## Files Created/Modified
- `app/api/chat/route.ts` - streaming POST Route Handler: resolve -> retrieve -> assemble -> stream -> persist
- `app/pm/chat/page.tsx` - RLS-scoped Server Component roster loader, computes per-client `hasRag`
- `app/pm/chat/chat-panel.tsx` - client switcher, message list, composer, streaming reader with stale-response guard

## Decisions Made
- See `key-decisions` in frontmatter: chunk-shape mapping, browser-client history refetch on switch, and the 44x44px send-button touch-target override.

## Deviations from Plan

None — plan executed exactly as written. The three items above are implementation-detail decisions filling in ambiguity the plan left open (exact chunk field typing, the history-refetch mechanism, and touch-target sizing), not corrections to broken plan guidance, so they're recorded as decisions rather than Rule 1-4 deviations.

## Issues Encountered
- `node_modules` was not present in the worktree at execution start; ran `npm install` (no new packages added to `package.json` — all dependencies, including `@anthropic-ai/sdk`, were already declared from 02-03) to enable `npx tsc --noEmit` and `npm run build` verification. Both passed cleanly with no errors in the three new files.
- Host disk was critically low on free space (~1GB available) during execution; `npm install` and `npm run build` both completed successfully without hitting the limit, but this is worth flagging as an environment risk for subsequent plans in this phase.

## User Setup Required

None - no external service configuration required. Note carried from 02-03: real `ANTHROPIC_API_KEY` / `TROPICALIA_API_KEY` values still need to be supplied by the user before this route can be exercised end-to-end against live APIs — that live verification is deferred to the 02-06 human-verify checkpoint, per this plan's own `<verification>` section.

## Next Phase Readiness
- CTX-01, CTX-02, and CTX-05 are now structurally true: chat is client-scoped, switching clients cannot bleed context (guarded client-side and never trusted from request input server-side), and Claude — never Tropicalia — always generates the response.
- Ready for 02-05 (save-to-knowledge curation, CTX-03/CTX-04) to build on the same `messages` table and `createClient()`/RLS pattern.
- Ready for 02-06's human-verify checkpoint once live `ANTHROPIC_API_KEY`/`TROPICALIA_API_KEY` values are available.

---
*Phase: 02-client-isolated-ai-chat*
*Completed: 2026-07-21*

## Self-Check: PASSED

- FOUND: app/api/chat/route.ts
- FOUND: app/pm/chat/page.tsx
- FOUND: app/pm/chat/chat-panel.tsx
- FOUND commit: a2d116a
- FOUND commit: 10e57d4
