---
phase: quick/260810-g3f
plan: 01
subsystem: database, ui
tags: [supabase, postgres, zod, react-hook-form, server-actions]

requires: []
provides:
  - "public.clients.tag column: non-null, case-insensitive unique (clients_tag_key functional index), backfilled for all pre-existing rows"
  - "clientTagUpdateSchema (lib/validation/clients.ts) and updateClientTag Server Action (lib/actions/clients.ts) for editing a client's tag independently of the briefing form"
  - "Tag required on client creation (clientCreateSchema), Tag column on Admin client listing only, Tag section on client detail screen for both Admin and PM viewers"
affects: ["client isolation / RAG key follow-up quick task (assemble-prompt.ts, extraction-prompt.ts, structured-extraction.ts) — deliberately NOT touched by this plan"]

tech-stack:
  added: []
  patterns:
    - "Functional unique index (lower(column)) for case-insensitive uniqueness — same pattern as clients_archived_at_idx"
    - "23505 Postgres error code translated to a friendly duplicate-tag message at the Server Action layer, both on insert and on update"

key-files:
  created:
    - supabase/migrations/0025_clients_tag.sql
  modified:
    - lib/validation/clients.ts
    - lib/actions/clients.ts
    - components/clients/client-create-form.tsx
    - app/admin/clients/page.tsx
    - components/clients/client-detail-form.tsx
    - app/admin/clients/[id]/page.tsx
    - app/pm/clients/[id]/page.tsx

key-decisions:
  - "Task 3 (live checkpoint) reserved for the orchestrator's own session — this executor ran Tasks 1-2 only, per explicit scope instruction."
  - "Hosted Supabase push deferred to the orchestrator — this worktree has no .env.local/hosted credentials, matching the established pattern from 260722-hnm/260805-kio/260808-ci5."

requirements-completed: [QUICK-260810-g3f (Tasks 1-2 only; Task 3 checkpoint still pending)]

duration: ~35min
completed: 2026-08-10
---

# Quick Task 260810-g3f: Client Tag (nome fantasia/código curto) Summary

**`public.clients.tag`, a non-null case-insensitive-unique column distinct from `name`, wired into create/edit/list flows for both Admin and PM — Tasks 1-2 complete, Task 3 (live checkpoint) still owed.**

## Performance

- **Duration:** ~35 min (Tasks 1-2 only)
- **Completed:** 2026-08-10 (Tasks 1-2)
- **Tasks:** 2 of 3 (Task 3 is a blocking human-verify checkpoint reserved for the orchestrator's live session)
- **Files modified:** 8 (1 created, 7 modified)

## Accomplishments

- Migration `0025_clients_tag.sql`: `tag` column, `clients_tag_key` functional unique index on `lower(tag)`, CTE-based backfill deriving a tag from each pre-existing client's `name` (deterministic collision-suffix logic, not conditioned on the current data being collision-free), `NOT NULL` enforced after backfill.
- `lib/validation/clients.ts`: shared `tagSchema` (shape-only: 1-40 chars, `[A-Za-z0-9-]+`), `clientCreateSchema` now requires `tag`, new exported `clientTagUpdateSchema`/`ClientTagUpdateInput`.
- `lib/actions/clients.ts`: `createClientRecord` inserts `tag` and translates a Postgres `23505` violation to `"Essa tag já está em uso por outro cliente."`; new `updateClientTag(clientId, tag)` Server Action mirrors `updateBriefing`'s exact pattern (RLS-scoped `createClient()`, not `createAdminClient()`), same duplicate-tag translation on edit.
- `client-create-form.tsx`: Tag input rendered beside Nome (`flex gap-4`, matching layout), required, submitted via `formData.append("tag", ...)`.
- `app/admin/clients/page.tsx`: new `Tag` column, populated from the query's `tag` select. `app/pm/clients/page.tsx` confirmed untouched (`git diff --stat` empty).
- `client-detail-form.tsx`: new "Tag do cliente" `DataCard` between the page heading and "Briefing estratégico", unconditioned on `viewerIsAdmin` — both Admin and assigned PM can view/edit/save independently of the briefing form's own save button.
- Both `[id]/page.tsx` route wrappers (`admin` and `pm`) select `tag` and pass it through to `ClientDetailForm`.

## Task Commits

1. **Task 1: Migration — tag column, unique case-insensitive index, backfill, NOT NULL** - `1b1c88b` (feat)
2. **Task 2: Validation, Server Actions, and UI wiring end-to-end** - `6ee94e0` (feat)

**Plan metadata:** not yet committed by this executor — SUMMARY.md itself is committed separately below per the docs-only exception in this executor's task instructions; STATE.md/ROADMAP.md updates are the orchestrator's responsibility.

## Files Created/Modified

- `supabase/migrations/0025_clients_tag.sql` - tag column, case-insensitive unique index, backfill, NOT NULL
- `lib/validation/clients.ts` - `tagSchema`, `clientCreateSchema.tag`, exported `clientTagUpdateSchema`
- `lib/actions/clients.ts` - `createClientRecord` tag insert + 23505 translation, new `updateClientTag`
- `components/clients/client-create-form.tsx` - Tag `FormField` beside Nome
- `app/admin/clients/page.tsx` - Tag column in the listing table
- `components/clients/client-detail-form.tsx` - "Tag do cliente" `DataCard`, editable by Admin and PM
- `app/admin/clients/[id]/page.tsx` - selects/passes `tag`
- `app/pm/clients/[id]/page.tsx` - selects/passes `tag`

## Decisions Made

- Followed the plan's `<interfaces>` block verbatim for the migration SQL, schema shapes, and action signatures — no deviation from the specified contracts.
- Applied migration 0025 to the LOCAL Docker Supabase stack only (`npx supabase migration up --local`), per this worktree's explicit scope. Local seed data differs from the hosted project's 5 real clients (local has 3 RLS-test-fixture rows, not "Cliente Demo"/"eduardo"/"Juliano"/"juju"/"Lucas Paiva") — the backfill logic itself is generic and was verified against the local rows; the specific 5-hosted-client backfill still needs confirming once the orchestrator pushes to hosted (Task 3, step 2 of the plan's checkpoint covers this).
- Hosted Supabase push (`npx supabase db push`) NOT attempted — this worktree has no `.env.local`/hosted credentials by design, matching the established pattern from quick tasks 260722-hnm, 260805-kio, and 260808-ci5. **This push is still owed by the orchestrator** before Task 3's live checkpoint can meaningfully verify the 5 real hosted clients.

## Deviations from Plan

None - plan executed exactly as written for Tasks 1-2. The `<interfaces>` block's SQL, schema, and Server Action patterns were used directly without re-derivation.

## Issues Encountered

None. `tsc --noEmit` clean; `eslint` clean (2 pre-existing, unrelated `react-hooks/incompatible-library` warnings on `form.watch()` calls in `client-create-form.tsx`/`client-detail-form.tsx` — present before this task's changes, not introduced by it). All migration verification queries (NOT NULL rejection, case-insensitive unique-index rejection, zero-null-tags, distinct-tags) passed against the local DB.

## User Setup Required

None for Tasks 1-2. Task 3's checkpoint will require the orchestrator (or developer) to run `npx supabase db push` against the hosted project before live-verifying the 5 real clients' tags.

## Next Phase Readiness

**Task 3 (live human-verify checkpoint) is still pending** — reserved for the orchestrator's live session per this executor's scope instructions. Before running it:
1. Push migration 0025 to hosted Supabase (`npx supabase db push`, credentials available in the orchestrator's environment/session, not in this worktree).
2. Confirm the 5 real hosted clients ("Cliente Demo", "eduardo", "Juliano", "juju", "Lucas Paiva") each got a distinct, non-null tag from the backfill.
3. Then walk through the plan's Task 3 `<how-to-verify>` steps (create-form Tag field + validation + duplicate error, Admin listing Tag column, PM listing has no Tag column, detail-page tag edit for both Admin and PM, duplicate-tag error on edit, regression check on briefing/PM-assignment/file-upload/archive).

No blockers for Tasks 1-2's own scope — both are code-complete, committed, and verified locally.

---
*Phase: quick/260810-g3f*
*Completed: 2026-08-10 (Tasks 1-2; Task 3 pending)*
