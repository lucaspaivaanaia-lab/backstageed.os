---
phase: quick
plan: 260805-fao
subsystem: client-files
tags: [next-config, server-actions, bugfix]

requires:
  - phase: quick-260805-dkr
    provides: "components/clients/client-files-section.tsx multi-file upload (surfaced this pre-existing bug during live testing)"
  - phase: P0-pivot-2026-08-04
    provides: "lib/actions/client-files.ts uploadClientFile (MAX_FILE_BYTES = 5MB validation, unmodified by this fix)"
provides:
  - "next.config.ts: experimental.serverActions.bodySizeLimit = '6mb'"
affects: [client-files-ui]

tech-stack:
  added: []
  patterns: []

key-files:
  created: []
  modified:
    - next.config.ts

key-decisions:
  - "Set bodySizeLimit to 6mb, not exactly 5mb — gives headroom above MAX_FILE_BYTES (the real 5MB business-logic ceiling, enforced inside uploadClientFile) for multipart/form-data framing overhead, so a file at exactly 5MB isn't rejected by the transport layer before the action's own check ever runs"
  - "Did not touch MAX_FILE_BYTES, ALLOWED_EXTENSIONS, or any upload logic — this was purely a missing framework-level config, not a business-rule change"

patterns-established: []

requirements-completed: [QUICK-260805-fao]

duration: ~15min
completed: 2026-08-05
---

# Quick Task 260805-fao: Fix "Body exceeded 1 MB limit" on client file upload Summary

**Root-caused and fixed a runtime error the user hit live immediately after 260805-dkr shipped: Next.js Server Actions default their request body to a 1MB limit, but `lib/actions/client-files.ts` already validated files up to 5MB (`MAX_FILE_BYTES`) — `next.config.ts` had simply never configured the framework's own ceiling to match. Any single file over ~1MB, uploaded alone or in a batch, would have hit this; it just hadn't been exercised with a real file that large until now. Fixed by setting `experimental.serverActions.bodySizeLimit: "6mb"` in `next.config.ts`. Verified live with a real 1.1MB `.txt` file — upload succeeds, file appears in the list, no runtime error.**

## Performance

- **Duration:** ~15 min (root-cause identification + 1-line config fix + live verification)
- **Tasks:** 1 (single-file config change)
- **Files modified:** 1 (`next.config.ts`)

## Accomplishments

- Diagnosed the user-reported "Body exceeded 1 MB limit" runtime error at `/pm/clients/[id]` down to a missing `experimental.serverActions.bodySizeLimit` in `next.config.ts` — confirmed via `node_modules/next/dist/server/config-schema.js` that Next.js 16.2.9 defaults this to 1MB, and confirmed via `lib/actions/client-files.ts` that the app's own intended ceiling is 5MB (`MAX_FILE_BYTES`).
- Added `experimental.serverActions.bodySizeLimit: "6mb"` to `next.config.ts`, with a comment explaining the 1MB-vs-5MB mismatch and why 6mb (not exactly 5mb) was chosen.
- Restarted the dev server (`next.config.ts` changes are not hot-reloadable) and re-ran `tsc`/`lint`/`build` — all green, same 3 pre-existing unrelated lint warnings as before.
- Live-verified via Playwright with real credentials: created a disposable test client, generated a real 1.1MB `.txt` file, uploaded it through "Arquivos do cliente" — no "Body exceeded" error, no runtime error page, file landed in the list. Deleted the test client afterward.

## Task Commits

1. **Task 1: Configure bodySizeLimit** — committed together with this SUMMARY as part of the quick-task docs commit (single trivial config change, no separate code-only commit was warranted given the size).

## Live Verification

1. Restarted `npm run dev` after the `next.config.ts` edit (required — this config is read once at server boot, not hot-reloaded).
2. Logged in with real PM credentials, created client "QA Bodysize Fix Teste".
3. Generated a real 1.1MB `.txt` file (well above the old 1MB Next.js default, under the app's 5MB `MAX_FILE_BYTES`), selected and uploaded it via the native file picker.
4. Confirmed: no "Body exceeded 1 MB limit" text anywhere on the page, no "Runtime Error" banner, the file appeared in the client's file list (count went 0 → 1).
5. Deleted the test client and its file via a throwaway service-role script immediately after.

**Verdict: fixed and verified.**

## Files Created/Modified

- `next.config.ts` — added `experimental.serverActions.bodySizeLimit: "6mb"` alongside the existing `turbopack.root` config; nothing else changed.

## Decisions Made

See `key-decisions` in frontmatter above.

## Deviations from Plan

None — this was executed directly by the orchestrator (not delegated to a planner/executor subagent pair) given the fix was a single well-understood line in a config file, already root-caused and already live-verified by the time the quick-task docs were written. PLAN.md and this SUMMARY.md were authored to keep the `.planning/quick/` record consistent with every other quick task, per this project's GSD workflow enforcement.

## Issues Encountered

None.

## User Setup Required

None — no restart needed in production/Vercel (this only affects local dev process startup, and Vercel deployments always start fresh with the current `next.config.ts`).

## Next Phase Readiness

- File uploads (single or batch, per 260805-dkr) now work correctly for any file up to the app's real 5MB ceiling.
- No follow-up required.

## Self-Check: PASSED

- `next.config.ts` — FOUND, contains `bodySizeLimit`.
- `npx tsc --noEmit`, `npm run lint`, `npm run build` — all green.
- Live verification — PASSED (1.1MB file uploaded successfully), test data cleaned up.

---
*Phase: quick*
*Completed: 2026-08-05*
