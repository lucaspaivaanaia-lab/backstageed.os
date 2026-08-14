---
phase: 02-client-isolated-ai-chat
plan: 05
subsystem: ai-chat
tags: [nextjs, server-actions, supabase-rls, tropicalia, shadcn, sonner]

# Dependency graph
requires:
  - phase: 02-client-isolated-ai-chat (02-02, 02-03, 02-04)
    provides: buildKnowledgeMarkdown (02-02), uploadTropicaliaDocument (02-03), chat-panel.tsx message list + composer (02-04)
provides:
  - saveKnowledge Server Action (app/pm/chat/actions.ts) — RLS-re-verified manual curation upload
  - listMessagesForClient Server Action (app/pm/chat/actions.ts) — RLS-scoped history refetch with row ids
  - Per-message checkboxes + sticky "Salvar como conhecimento" bar in chat-panel.tsx
affects: [02-06 (human-verify checkpoint), future phases touching client-facing Tropicalia knowledge base]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Server Action re-verification: never trust ids-only payloads from the browser — re-resolve ownership (.eq(id).single()) and re-read content (.in(id, ids)) via RLS before any privileged action"
    - "One-file-per-save curation: no append/update endpoint exists on Tropicalia, so every save produces exactly one new .md Blob upload"
    - "Ephemeral-until-persisted UI state: a chat bubble only becomes checkbox-eligible once it carries a real DB id from a post-stream history refetch"

key-files:
  created:
    - app/pm/chat/actions.ts
  modified:
    - app/pm/chat/chat-panel.tsx

key-decisions:
  - "loadHistory (client-switch + post-stream refetch) now calls the listMessagesForClient Server Action instead of a direct browser Supabase read, so every rendered message carries a real DB id usable for curation checkboxes"
  - "After a stream completes cleanly (not interrupted, not aborted), the panel refetches history so the just-persisted user+assistant turn becomes checkbox-eligible; an in-progress streaming bubble never renders a checkbox"

patterns-established:
  - "Manual-curation Server Action shape: validate -> re-resolve client via RLS -> fail-closed on missing project id/API key -> re-fetch checked rows via RLS -> build+upload -> generic error on any failure, mirroring app/pm/clients/[id]/access/actions.ts's discriminated-union return"

requirements-completed: [CTX-03, CTX-04]

duration: 35min
completed: 2026-07-21
---

# Phase 02 Plan 05: Manual Knowledge Curation Summary

**Adds RLS-re-verified saveKnowledge + listMessagesForClient Server Actions and wires per-message checkboxes plus a sticky "Salvar como conhecimento" bar into the chat panel, so a PM can package exactly the messages they check into one new .md file uploaded to the client's Tropicalia project — nothing is ever saved automatically.**

## Performance

- **Duration:** ~35 min
- **Started:** 2026-07-21T22:07:00Z
- **Completed:** 2026-07-21T22:42:17Z
- **Tasks:** 2
- **Files modified:** 2 (1 created, 1 modified)

## Accomplishments
- `saveKnowledge` re-resolves the client via `.eq("id", clientId).single()` and re-fetches the checked message rows via `.eq("client_id", clientId).in("id", messageIds)` — content and ownership are always re-verified server-side, never trusted from the browser (T-2-01).
- Exactly one new curated `.md` Blob is built via `buildKnowledgeMarkdown` and uploaded via `uploadTropicaliaDocument` per save, with a single generic error message covering validation failure, missing client, missing project id/API key, no messages found, or upload failure.
- `listMessagesForClient` gives the panel an RLS-scoped history read that includes row ids — the panel now uses this (instead of a direct browser Supabase query) both on client switch and immediately after a chat turn finishes streaming, so newly-persisted messages become checkbox-eligible.
- Every persisted message renders a `Checkbox` (`aria-label="Incluir esta mensagem no conhecimento salvo"`); the "Salvar como conhecimento" bar appears above the composer only when >=1 message is checked, calls `saveKnowledge` inside `useTransition`, and shows the exact UI-SPEC success/error toast copy, clearing the selection on success.

## Task Commits

Each task was committed atomically:

1. **Task 1: saveKnowledge + listMessagesForClient Server Actions** - `1c068ea` (feat)
2. **Task 2: Wire per-message checkboxes + save bar into chat-panel.tsx** - `1e9c00e` (feat)

_No TDD tasks in this plan — both are `type="auto"`._

## Files Created/Modified
- `app/pm/chat/actions.ts` - New file: `saveKnowledge(clientId, messageIds)` (RLS re-verification + one-file upload) and `listMessagesForClient(clientId)` (RLS-scoped history read with ids)
- `app/pm/chat/chat-panel.tsx` - Per-message `Checkbox`, ephemeral `Set<string>` selection state, sticky save bar wired to `saveKnowledge` via `useTransition` + `sonner` toast, and `loadHistory` switched to the new `listMessagesForClient` Server Action (both on client switch and after a stream finishes cleanly)

## Decisions Made
- Reused `listMessagesForClient` (built for Task 1) as the panel's single history-fetch path, replacing the prior direct `createClient()` browser query in `loadHistory` — this was necessary to give rendered messages real DB ids for the checkboxes, and keeps message reads consistent behind one RLS-scoped Server Action rather than two divergent read paths.
- After a stream completes cleanly (not aborted, not client-switch-interrupted), the panel refetches history so the two new rows (user question + assistant answer) get real ids and become checkbox-eligible immediately, without waiting for a manual client switch.

## Deviations from Plan

None - plan executed exactly as written. The `loadHistory` refactor to use `listMessagesForClient` was explicitly anticipated by Task 1's own description ("used by the panel to refetch persisted history on client switch") and Task 2's read_first list — not an unplanned addition.

## Issues Encountered

**Disk-constrained verification environment:** This worktree has no `node_modules` (consistent with the documented ~1.7GB free-disk constraint), so a literal `npx tsc --noEmit` initially reported a false "clean" pass due to a stale `tsconfig.tsbuildinfo` left over from the worktree's setup — it wasn't actually resolving any imports. To get a real verification without running `npm install` (avoided per the disk-space note, and confirmed identical `package-lock.json` with the main repo), a temporary symlink from this worktree's `node_modules` to the main repo's already-installed `node_modules` was created for verification only, `tsconfig.tsbuildinfo` was deleted, and `npx tsc --noEmit` was re-run — it now genuinely resolves all imports and reports **zero errors across the whole project**, including both files touched by this plan. The symlink and any regenerated `tsconfig.tsbuildinfo` were removed afterward (both are gitignored; `git status` is clean of them) and no node_modules content was committed.

`npm run build` could not be completed: Turbopack refuses to follow a `node_modules` symlink that resolves outside the worktree's own directory tree ("Symlink [project]/node_modules is invalid, it points out of the filesystem root"), and a real `npm install` here would consume ~739MB against only ~2GB free — too risky given the disk-space note's explicit guidance to avoid unnecessary installs and to report disk issues rather than silently working around them. The plan-level `npx tsc --noEmit` verification (the stronger, type-accurate check) is confirmed clean; the `npm run build` bullet in `<verification>` is deferred to the 02-06 human-verify checkpoint, which already runs in an environment with a full install.

## User Setup Required

None - no external service configuration required. (Live Tropicalia upload round-trip verification remains deferred to the 02-06 human-verify checkpoint per the plan's `<plan_specific_note>` and `<verification>` section — `TROPICALIA_API_KEY` is not available in this environment.)

## Next Phase Readiness
- The manual curation slice (CTX-03/CTX-04) is fully wired: checkbox selection state, the save bar, and the RLS-re-verified upload path all exist and type-check cleanly against the real dependency graph.
- Ready for 02-06's human-verify checkpoint to exercise a live upload (real `TROPICALIA_API_KEY` + browser session) and confirm the toast/error copy and DB-id-gated checkbox behavior visually.
- No blockers identified for subsequent plans in this phase.

---
*Phase: 02-client-isolated-ai-chat*
*Completed: 2026-07-21*

## Self-Check: PASSED

- FOUND: app/pm/chat/actions.ts
- FOUND: app/pm/chat/chat-panel.tsx
- FOUND: 1c068ea (Task 1 commit)
- FOUND: 1e9c00e (Task 2 commit)
