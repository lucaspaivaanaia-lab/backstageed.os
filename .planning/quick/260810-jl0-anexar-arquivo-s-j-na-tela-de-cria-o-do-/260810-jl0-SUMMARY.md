---
phase: quick/260810-jl0
plan: 01
subsystem: ui
tags: [nextjs, react-hook-form, client-side-orchestration, sonner]

requires:
  - phase: quick/260805-dkr
    provides: "lib/client-files/multi-upload.ts (splitBySlots, summarizeUploadOutcomes, UploadOutcome) and the sequential-upload-loop pattern this plan replicates"
  - phase: quick/260808-ci5
    provides: "generateChecklistDraftFromFiles + autofillBriefingFromFiles Server Actions and handleBriefingAutofilled, all reused unmodified"
provides:
  - "Optional multi-file picker on the client-creation form (/admin/clients/new, /pm/clients/new)"
  - "Post-create sequential upload -> checklist-draft generation -> conditional autofillBriefing redirect signal, all inside one submit"
  - "Detail-page mount effect that consumes the autofillBriefing signal and triggers the existing briefing-autofill flow on the newly created client's already-mounted form"
affects: [client-onboarding, checklist-generation, briefing-autofill]

tech-stack:
  added: []
  patterns:
    - "Cross-page hand-off via a one-shot query-param signal (?autofillBriefing=1), consumed by a ref-guarded mount effect and stripped via router.replace"

key-files:
  created: []
  modified:
    - components/clients/client-create-form.tsx
    - components/clients/client-detail-form.tsx

key-decisions:
  - "autofillBriefingFromFiles is called from client-detail-form.tsx, never client-create-form.tsx — the creation screen navigates away immediately after create and has no mounted briefing form to apply the proposal to."
  - "generateChecklistDraftFromFiles stays a direct call from client-create-form.tsx since it persists a DB row visible on next page load, unlike the autofill proposal."

patterns-established:
  - "Redirect-borne one-shot signal + ref guard + router.replace(pathname) for handing off a client-side action across a Server Action redirect boundary."

requirements-completed: []  # QUICK-260810-jl0 not yet complete — Task 3 (live human-verify checkpoint) is still pending, reserved for the orchestrator's live session.

duration: ~35min (Tasks 1-2 only)
completed: 2026-08-10
---

# Quick Task 260810-jl0: Attach file(s) at client-creation screen — Tasks 1-2 Summary

**Optional multi-file picker on client-creation, wired to sequentially upload + generate a checklist draft in the same submit, then hand off a briefing-autofill signal to the new client's detail page via a `?autofillBriefing=1` redirect param.**

## Performance

- **Duration:** ~35 min (Tasks 1-2 only; Task 3 is a live human-verify checkpoint reserved for the orchestrator)
- **Tasks:** 2 of 3 completed (Task 3 intentionally NOT executed — blocking human-verify checkpoint, orchestrator's live session)
- **Files modified:** 2

## Accomplishments

- `components/clients/client-create-form.tsx` gained an optional file-picker (hidden input + "Escolher arquivo(s)" button + name summary), reusing `client-files-section.tsx`'s established pattern verbatim.
- `onSubmit` now: creates the client via the unmodified `createClientRecord`, then — only if files were selected — sequentially uploads each file (never `Promise.all`, matching the same `FILE_LIMIT` race-safety discipline `client-files-section.tsx` already established for T-dkr-02), then (only if at least one upload succeeded) calls `generateChecklistDraftFromFiles(clientId)`, then unconditionally redirects — appending `?autofillBriefing=1` only when at least one upload succeeded.
- The submit button label now reads live upload progress ("Enviando N de M...") while more than one file is uploading, falling back to "Criando..." otherwise — same progress-text branch shape as `client-files-section.tsx`'s own submit button.
- Partial upload failures are surfaced via `toast.error` (not an inline `ErrorBox`, since the page navigates away immediately after) without blocking the redirect.
- `components/clients/client-detail-form.tsx` gained a mount-time, ref-guarded `useEffect` that reads the `autofillBriefing` query param, calls `autofillBriefingFromFiles(client.id)` itself, applies the result to the already-mounted briefing form via the existing `handleBriefingAutofilled` function (zero duplicated `form.setValue`/`replace` logic), shows the same "Briefing preenchido pela IA..." toast `client-files-section.tsx` already uses, and always strips the query param via `router.replace(pathname)` afterward.
- Submitting the creation form with zero files attached is byte-for-byte unchanged from before this task — `successCount` stays `0`, so no upload/checklist/autofill call fires and no query param is appended.

## Task Commits

Each task was committed atomically:

1. **Task 1: File picker + post-create sequential upload/checklist orchestration + redirect signal** - `c9341e3` (feat)
2. **Task 2: Detail-page autofill-on-redirect trigger** - `1a946d4` (feat)

_Task 3 (live human-verify checkpoint) intentionally not attempted — reserved for the orchestrator's live session per execution constraints._

## Files Created/Modified

- `components/clients/client-create-form.tsx` - Optional file-picker UI + post-create sequential-upload-then-checklist-draft orchestration + conditional `autofillBriefing` redirect signal
- `components/clients/client-detail-form.tsx` - Mount-time effect consuming the `autofillBriefing` signal, triggering the existing briefing-autofill flow, then stripping the query param

## Decisions Made

None beyond what the plan already specified — plan executed exactly as written for Tasks 1-2. See `key-decisions` in frontmatter for the two load-bearing design choices the plan itself made explicit (both followed verbatim, not new decisions made during execution).

## Deviations from Plan

None - plan executed exactly as written for Tasks 1 and 2. No auto-fixes were needed; `tsc --noEmit`, `eslint`, `npm run build`, and the full `npm test` suite (89/89) were all clean on first pass with no Rule 1/2/3 interventions required.

## Issues Encountered

None. `node_modules` was bootstrapped via `npm ci` (worktree infra prerequisite, not a plan deviation) before running any verification command.

## User Setup Required

None - no external service configuration required. No Server Action, migration, or RLS change in this plan (confirmed: `git diff --stat` on `lib/actions/clients.ts`, `lib/actions/client-files.ts`, `lib/actions/checklist-templates.ts`, and `lib/client-files/multi-upload.ts` is empty).

## Next Phase Readiness

Tasks 1-2 are code-complete and verified via the plan's automated verification gates (`tsc`, `eslint`, the required greps, the 4-file zero-diff scope gate, a full `npm run build`, and the full `npm test` suite — all clean, no regressions). **Task 3 — the plan's blocking live human-verify checkpoint — has NOT been run.** It requires a real `npm run dev` session, real file uploads, a real Anthropic API call for briefing autofill, and manual confirmation of the end-to-end redirect/autofill/toast/query-param-stripping behavior described in the plan. This is reserved for the orchestrator's live session per this task's execution constraints. The plan's overall `requirements-completed` (QUICK-260810-jl0) stays open until Task 3 is approved.

## Self-Check: PASSED

- FOUND: components/clients/client-create-form.tsx
- FOUND: components/clients/client-detail-form.tsx
- FOUND commit c9341e3 (verified via `git log --oneline --all | grep c9341e3`)
- FOUND commit 1a946d4 (verified via `git log --oneline --all | grep 1a946d4`)

---
*Quick task: 260810-jl0*
*Completed (Tasks 1-2 only): 2026-08-10*
