---
phase: 2
slug: client-isolated-ai-chat
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-07-21
---

# Phase 2 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Node's built-in `node:test` (no external test runner installed) |
| **Config file** | none — invoked directly via the `test` npm script |
| **Quick run command** | `node --test lib/chat/*.test.ts` |
| **Full suite command** | `node --test lib/**/*.test.ts` (update `package.json`'s `test` script glob to include the new `lib/chat/` directory) |
| **Estimated runtime** | ~5 seconds |

---

## Sampling Rate

- **After every task commit:** Run `node --test lib/chat/*.test.ts`
- **After every plan wave:** Run `node --test lib/**/*.test.ts` + `npx supabase test db`
- **Before `/gsd:verify-work`:** Full suite must be green
- **Max feedback latency:** 10 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| TBD | TBD | 0 | CTX-05 | T-2-01 | `searchTropicaliaProject()`'s request body always sets `generate_answer: false` regardless of input | unit | `node --test lib/tropicalia/client.test.ts` | ❌ W0 | ⬜ pending |
| TBD | TBD | 0 | CTX-01/CTX-02 | T-2-01 | `assembleSystemPrompt()` never includes another client's briefing/chunks — given two different client fixtures, output only reflects the one passed in | unit | `node --test lib/chat/assemble-prompt.test.ts` | ❌ W0 | ⬜ pending |
| TBD | TBD | 0 | CTX-01 | — | `assembleSystemPrompt()` still returns a valid, briefing-inclusive prompt when `retrievedChunks` is an empty array (degraded mode) | unit | `node --test lib/chat/assemble-prompt.test.ts` | ❌ W0 | ⬜ pending |
| TBD | TBD | 0 | CTX-03/CTX-04 | — | `buildKnowledgeMarkdown()` produces a markdown string containing only the checked messages' content, in chronological order | unit | `node --test lib/chat/build-knowledge-markdown.test.ts` | ❌ W0 | ⬜ pending |
| TBD | TBD | 0 | CTX-02 | T-2-01 | Client-switch stale-response guard: a chunk callback for `clientId=A` is dropped once `activeClientId` has changed to `B` | unit | `node --test lib/chat/stale-response-guard.test.ts` | ❌ W0 | ⬜ pending |
| TBD | TBD | 0 | AUTH-06 (cross-cutting) | T-2-01 | `messages` RLS: a PM not assigned to a client cannot select/insert rows for that client's `client_id` | integration (pgTAP) | `npx supabase test db` | ❌ W0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `lib/tropicalia/client.test.ts` — covers CTX-05's `generate_answer: false` invariant (mock `fetch`, assert on the request body — no real network call)
- [ ] `lib/chat/assemble-prompt.test.ts` — covers CTX-01/CTX-02/degraded-mode (pure function, no mocking needed)
- [ ] `lib/chat/build-knowledge-markdown.test.ts` — covers CTX-03/CTX-04 (pure function)
- [ ] `lib/chat/stale-response-guard.test.ts` — covers CTX-02's client-switch race condition (pure function extracted from the Client Component)
- [ ] `supabase/migrations/0010_messages_rls_test.sql` — pgTAP test for the new `messages` table's RLS policies, following the same fixture pattern as the existing `0001`–`0003` RLS test files (reuse `rls_helpers.sql`)

*Plan-level Task IDs to be filled in by the planner once PLAN.md files exist.*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| End-to-end streaming chat (actual Tropicalia search + actual Claude generation) | CTX-01, CTX-02, CTX-03 | Not unit-testable without live `ANTHROPIC_API_KEY`/`TROPICALIA_API_KEY` — inherently a manual/smoke-test surface | Open chat for Client A, ask a question, confirm response is scoped only to Client A's briefing/RAG content; switch to Client B, repeat, confirm no bleed-through |
| Curated save-to-memory round-trip | CTX-04 | Depends on Tropicalia's async `uploaded → queued → processing → ready` pipeline, which cannot be simulated without live credentials | Select messages, save as knowledge, wait for document to reach `ready` status via `list-documents`, then start a new chat and confirm the saved content is retrievable |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 10s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
