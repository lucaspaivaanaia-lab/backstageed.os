---
phase: 02-client-isolated-ai-chat
plan: 06
subsystem: verification
tags: [chat, rag, client-files, anthropic, human-verify]

requires:
  - phase: 02-client-isolated-ai-chat (02-01..02-05)
    provides: messages table + RLS, pure chat/curation logic, streaming chat UI, curation save UI
  - phase: quick-260722-hnm
    provides: "client_files-based RAG (superseded Tropicalia) — the architecture this checkpoint actually verifies against, not the one 02-06 was originally written for"
provides:
  - Confirmed, live, end-to-end proof of CTX-01 through CTX-05 against production (not just automated tests) — client isolation, streaming, stale-response guard, upload-to-chat immediate reflection, manual curation round-trip
  - Documented a real, local-dev-only (Turbopack `next dev`) intermittent streaming bug in app/api/chat/route.ts, confirmed NOT present in production
affects: [phase-completion, verify-phase-goal, local-dev-environment]

tech-stack:
  added: []
  patterns: []

key-files:
  created: []
  modified: []

key-decisions:
  - "Re-ran this checkpoint against PRODUCTION (https://backstageed-os.vercel.app) instead of local npm run dev, after discovering the local dev server intermittently crashes the chat stream (see 'Local Dev Bug Found' below) — production has already proven itself reliable across many live tests earlier this same session, giving a more trustworthy phase-gate signal than debugging a dev-only artifact under time pressure."
  - "02-06-PLAN.md's original Tropicalia-era wording (ready/status polling, external RAG service) is stale relative to the 2026-07-22 architecture migration (quick task 260722-hnm) to client_files — this checkpoint verifies the CURRENT architecture (direct Supabase storage, full-content injection, no async wait), which the plan's must_haves already describe correctly even though some prose elsewhere in the file still says Tropicalia."

patterns-established: []

requirements-completed: [CTX-01, CTX-02, CTX-03, CTX-04, CTX-05]

duration: ~2h (across debugging a local-dev-only bug + full production verification)
completed: 2026-08-05
---

# Phase 02: Client-Isolated AI Chat — Live Verification Summary

**Task 2 (chat isolation) and Task 3 (upload + curation round-trip) both APPROVED — verified live and end-to-end against production with real clients, real Anthropic API calls, and direct database inspection. CTX-01 through CTX-05 are now genuinely closed, not just automated-test-covered.**

## Performance

- **Duration:** ~2h total, most of it spent root-causing a real local-dev-only bug before pivoting to verify against production instead
- **Tasks:** 3/3 (Task 1 preflight, Task 2 isolation, Task 3 curation — all complete)
- **Completed:** 2026-08-05

## Task 1: Preflight — CONFIRMED GREEN

- `npm test` — 78/78 passing.
- `npx supabase test db` — 12/12 real test files `ok` (Files=12, Tests=49); the trailing `Result: FAIL` is the pre-existing `rls_helpers.sql` cosmetic parse artifact (260716-bjk), not a regression.
- `npx tsc --noEmit` — clean.
- `npm run build` — clean.
- `ANTHROPIC_API_KEY` confirmed present in `.env.local` (value never printed) — the blocker from the original 2026-07-21 attempt no longer applies.

## Local Dev Bug Found (real, but does NOT block this checkpoint)

While verifying live against `npm run dev`, chat messages consistently failed server-side with:
```
chat: stream failed TypeError: Invalid state: Controller is already closed
    at Object.start (app/api/chat/route.ts:123:24)
```

Root-caused via elimination:
- A direct Node script calling `anthropic.messages.stream()` (bypassing Next.js entirely) succeeded cleanly — the Anthropic SDK, API key, and model are not at fault.
- Reproduced across multiple fresh `npm run dev` restarts, a cleared `.next`/Turbopack cache, and brand-new clients with empty conversation history — ruled out stale cache and conversation-history corruption as causes.
- The failure was **intermittent**, not deterministic (roughly 3 of 4 attempts failed; the successful attempt's assistant reply persisted correctly in `public.messages`), pointing at a timing-sensitive interaction between the Anthropic streaming SDK's async iteration and Next.js 16 Turbopack dev server's response-streaming path (this project's `middleware.ts` deprecation warning about the new "proxy" convention suggests Next.js 16's dev-mode streaming plumbing is genuinely new/still-settling).
- **Confirmed absent in production**: every chat call made against `https://backstageed-os.vercel.app` during this session (both earlier today and during this checkpoint's own verification) streamed and persisted correctly with zero such errors. Production runs a pre-compiled build, not Turbopack's on-demand dev compiler, which is consistent with a dev-mode-only artifact.

This is logged as a **non-blocking, local-development-only observation** in `STATE.md`'s Blockers/Concerns — worth a future look (e.g., trying `next dev --webpack` to confirm it's Turbopack-specific) but does not affect real users, and is why this checkpoint's live verification ran against production instead of localhost.

## Task 2: Live Chat Isolation — APPROVED

Verified against production with two fresh test clients ("Alfa" briefed with a unique invented brand-color fact, "Beta" briefed with a different one) and real Claude-generated responses:

1. **Streaming + correct client-scoped answer (CTX-01/CTX-05):** asked Alfa's chat about its brand color; the real, streamed response correctly named Alfa's invented fact.
2. **No cross-client bleed (CTX-02):** switched to Beta, asked the same question; the response correctly named Beta's own fact and did **not** mention Alfa's — proven in both directions, not just "no leak" but "correct own content."
3. **Stale-response guard:** sent a long-form message on Alfa, switched to Beta before it finished streaming, waited, and confirmed Beta's thread never received Alfa's late-arriving tokens — the `AbortController`-based abort-on-switch (`chat-panel.tsx`) works correctly live, not just in the pure `stale-response-guard` unit tests.
4. **Degraded-mode badge (D-06/D-07):** confirmed "Nenhum arquivo de referência — respostas usam apenas o briefing do cliente." shows for a client with zero `client_files` rows, and the chat still answers correctly from the briefing alone.

## Task 3: Upload + Immediate Reflection + Curation Round-Trip — APPROVED

Verified against production, same test client (Alfa), continuing from Task 2:

1. Uploaded a real `.txt` file containing a specific invented fact (a number) absent from the briefing — confirmed it appears in "Arquivos do cliente" immediately.
2. Confirmed the degraded-mode badge disappeared (client now has 1 file) and a fresh chat question about that exact fact was answered correctly and **immediately** — no async wait, no polling, no `status: ready` step of any kind, consistent with this app's architecture (client_files content is injected in full into the system prompt every turn; there is no external RAG service to index against, per the 2026-07-22 migration away from Tropicalia).
3. Curated the Q+A pair via the checkbox + "Salvar como conhecimento" — confirmed the success toast, AND confirmed directly in the database that a new `client_files` row was created (`conversa-2026-08-05T18-53-45-167Z.md`, `file_type: markdown`) containing the curated exchange — the actual persistence mechanism, not just the UI toast.
4. Confirmed nothing was saved automatically at any earlier point — only the explicit checkbox + click produced the new row (verified by checking `client_files` count was exactly 1 — the uploaded file only — before the explicit curation click, and 2 immediately after).

Not separately re-tested: Task 3's optional step 6 (hitting the file-count limit) — superseded by quick task 260805-i1m, which already raised `FILE_LIMIT` from 3 to 20 and is covered by that task's own live verification; re-testing the same mechanism here would be redundant.

## Test Data Cleanup

All test clients created across this checkpoint's several verification attempts (including two abandoned local-dev debugging clients and one accidental duplicate from an early failed script run) were identified and deleted, along with their `client_files`, `messages`, and `pm_clients` rows: 7 clients total, confirmed removed via direct database query after the final passing run.

## Issues Encountered

- Multiple Playwright test-script bugs during the debugging process (not product bugs): reliance on `page.goto(?client=)` alone to select an active client — this never writes to `localStorage`, only clicking a real client-list link or in-app switcher does, per `lib/client-selection.ts`'s design; case-sensitive string matching against AI-generated text that capitalizes the first word of a sentence; an ambiguous Playwright locator matching two identically-named test clients (the accidental duplicate mentioned above) resolved by switching to id-based navigation for that one case; a response-detection race (checking `.animate-bounce` count too early after a client switch, reading "not yet started" as "already finished"). None of these were product defects — each was diagnosed by comparing live server logs and direct database state against the browser-observed behavior, consistent with this project's established debugging discipline.

## User Setup Required

None — `ANTHROPIC_API_KEY` was already configured.

## Next Phase Readiness

Phase 2 (Client-Isolated AI Chat) is now fully, live-verified complete. CTX-01 through CTX-05 all confirmed working end-to-end in production. ROADMAP.md and STATE.md updated to reflect Phase 2 as complete.

The local-dev-only intermittent streaming bug is tracked as a non-blocking STATE.md concern for a future investigation, not a phase gap.

---
*Phase: 02-client-isolated-ai-chat*
*Completed: 2026-08-05*

## Self-Check: PASSED

- FOUND: client_files row `conversa-2026-08-05T18-53-45-167Z.md` confirmed in database with correct curated content.
- FOUND: both isolation directions (Alfa→own fact, Beta→own fact + no Alfa leak) confirmed via literal string checks against real AI responses.
- FOUND: stale-response guard confirmed (Beta thread never contains Alfa's fact after a mid-stream switch).
- Test data cleanup confirmed: 0 test clients remain matching today's test names.
