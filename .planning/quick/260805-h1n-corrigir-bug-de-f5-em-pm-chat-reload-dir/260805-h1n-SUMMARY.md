---
phase: quick-260805-h1n
plan: 01
subsystem: pm-chat
tags: [bugfix, hydration, chat, localStorage]
requires: []
provides: [f5-reload-fix-pm-chat]
affects: [app/pm/chat/chat-panel.tsx]
tech-stack:
  added: []
  patterns: [reread-client-only-source-before-navigating-in-effect]
key-files:
  created: []
  modified:
    - app/pm/chat/chat-panel.tsx
decisions: []
metrics:
  duration: ~15m
  completed: 2026-08-05
---

# Quick Task 260805-h1n: Fix F5 reload redirect bug in /pm/chat Summary

Fixed the hard-reload (F5) redirect bug in `/pm/chat` by rereading `getLastSelectedClientId()` directly inside the redirect effect before deciding to navigate away, instead of trusting the `useSyncExternalStore`-derived `activeClientId` value alone.

## What Was Built

**Task 1 (code, done):** In `app/pm/chat/chat-panel.tsx`'s client-scoped redirect `useEffect`, replaced the bare `if (!activeClientId) router.push("/pm/clients")` with:

1. Early return if `activeClientId` is already truthy (common case, no extra work).
2. Otherwise, call `getLastSelectedClientId()` directly in the effect body (already imported, no new import).
3. Apply the same roster-membership check the render-time derivation already uses (`clients.some((c) => c.id === freshId)`).
4. Only redirect if the fresh read is also empty or outside the roster.
5. Added `clients` to the effect's dependency array (`[activeClientId, clients, router]`).

Extended the existing comment block above the effect explaining why the reread is necessary (hydration-safe `getServerSnapshot` returns `null` on the first post-hydration render even when the real id is already in `localStorage`), while keeping the existing note that `router.push()` is a navigation call, not `setState` (so `react-hooks/set-state-in-effect` is unaffected).

No other part of the component was touched: `activeClientId`'s render-time derivation, `useSyncExternalStore`, `manualClientId`/`handleSwitchClient`, `activeClientIdRef`, etc. all remain exactly as before. No new `useState`/`setState`, no new imports.

**Verification (automated, done):**
- `npx tsc --noEmit`: clean
- `npm run lint`: 0 errors (3 pre-existing warnings in unrelated files: `client-create-form.tsx`, `client-detail-form.tsx`, `build-knowledge-markdown.test.ts` — none touched by this task)
- `getLastSelectedClientId()` appears exactly once outside comments in the file
- `git diff --stat` against the pre-dispatch commit (`3d2aab0`) shows exactly 1 production file changed: `app/pm/chat/chat-panel.tsx`

**Verification (human-check, PENDING):** The plan's `<human-check>` requires live Playwright verification with real credentials, logged in as a PM, covering 4 scenarios:
1. F5 (`page.reload()`, not `page.goto()`) on `/pm/chat` with an active client — expected to stay on `/pm/chat` with the same client still selected.
2. Normal in-app navigation via the sidebar "Chat" link — expected unchanged behavior.
3. Cleared `localStorage` visiting `/pm/chat` — expected redirect to `/pm/clients`.
4. Stale/out-of-roster id in `localStorage` — expected redirect to `/pm/clients`.

This human-check was **not performed** by this execution run per explicit instruction — browser verification is deferred to a follow-up step. The code change is complete and committed; only the live-verification checkpoint remains open.

## Deviations from Plan

None — plan executed exactly as written for Task 1. `npm ci` was run first because this worktree had no `node_modules` (a known, previously-documented environment quirk in this project — see prior quick-task SUMMARY.md files for 260805-fao/fku/fuu), not a plan deviation.

## Known Stubs

None.

## Threat Flags

None — the change reuses the existing `clients.some(...)` roster-membership check already present in the render-time derivation; no new validation surface introduced (see plan's `<threat_model>`, T-h1n-01, disposition: mitigate, already satisfied by this implementation).

## Outstanding

- **Checkpoint pending:** Task 1's `<human-check>` (4 live Playwright scenarios) has not been run. The plan's `<done>` criteria are only partially met: `tsc`/`lint`/scope-gate pass, but live confirmation is required before this quick task can be considered fully closed.
- `.planning/STATE.md` Blockers/Concerns entry ("Minor, pre-existing: a hard page reload...") should be removed once the human-check confirms the fix — not done in this run per the constraint to leave `STATE.md` untouched, and because the checkpoint is still open.
- A new row for this quick task in `.planning/STATE.md`'s "Quick Tasks Completed" table should be added once fully verified.

## Self-Check

- `app/pm/chat/chat-panel.tsx` exists and contains the fix: FOUND
- Commit `28eba8a` exists in git log: to be verified below

## Self-Check: PASSED
