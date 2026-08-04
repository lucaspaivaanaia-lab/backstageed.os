---
phase: 03-content-production-kanban
plan: 04
subsystem: database, ui
tags: [supabase, rls, pgtap, zod, sonner, alert-dialog, kanban]

# Dependency graph
requires:
  - phase: 03-content-production-kanban
    plan: 09
    provides: "Descrição/Responsável sections and meta-line composition in board-panel.tsx's card detail Dialog — this plan inserts Anexos between Responsável and the checklist"
provides:
  - "public.card_attachments table: RLS scoped through cards.client_id (cross-table subquery, non-recursive), select+write+delete policies, GRANT shipped in the same migration"
  - "lib/attachments/drive-url.ts: isLikelyDriveLink/driveLinkType/INVALID_DRIVE_LINK_MESSAGE — the ONE Drive-URL validation module, imported by both the browser (instant feedback) and the Server Action (the actual boundary, 03-RESEARCH.md Pitfall 5)"
  - "addAttachment/removeAttachment Server Actions (app/pm/board/actions.ts)"
  - "Anexos section in the card detail Dialog: per-type icon + outline badge list, AlertDialog-confirmed remove, attach form with instant validation, '· N anexos' meta-line segment"
affects: ["03-05 (admin audit view will also read card_attachments for the audit trail)", "P0 pivot 2026-08-04 item 3 (AI card validation) — waited on this plan's checkpoint before touching the same card detail Dialog"]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Shared client+server validation module (lib/attachments/drive-url.ts) with zero Supabase/React import — importable by both a Client Component and a Server Action without ever letting the two copies drift apart"
    - "Migration ships its own GRANT in the same file as the table (Pitfall 2, repeated every phase) — hosted Supabase auto-grants at provisioning, local supabase start does not"
    - "Board meta-line built as an array of segments joined with ' · ' rather than nested ternaries, so later plans (03-06's package-piece marker) can push another segment onto the same array"

key-files:
  created:
    - supabase/migrations/0018_card_attachments.sql
    - supabase/tests/0010_rls_card_attachments_scoping_test.sql
    - lib/attachments/drive-url.ts
    - lib/attachments/drive-url.test.ts
  modified:
    - lib/validation/cards.ts
    - app/pm/board/actions.ts
    - app/pm/board/page.tsx
    - app/pm/board/board-panel.tsx

key-decisions:
  - "isLikelyDriveLink parses with new URL() and compares hostname for exact equality against drive.google.com/docs.google.com — never a substring/regex over the raw string, which is what would let a lookalike domain like not-drive.google.com.evil.example slip through (T-03-19)"
  - "driveLinkType infers a default from the URL shape but the PM can freely override it in the attach form — a Drive share link's opaque file id carries no extension, so inference alone is unreliable"
  - "Every attachment anchor carries rel=\"noopener noreferrer\" alongside target=\"_blank\" — reverse-tabnabbing mitigation (T-03-20)"
  - "No cap on attachments per card (D-09) — deliberately no count-limit/disable-when-N-reached logic anywhere in this plan"

requirements-completed: [KAN-05]

# Metrics
duration: "~3 sessions across 2026-07-31 to 2026-08-04 — two executor-agent sessions stalled mid-task (a runtime/infra issue unrelated to the code, diagnosed as a per-worktree Supabase CLI link cache never being populated); the orchestrator recovered committed work each time and, after a third stall, implemented Tasks 2-3 directly rather than retrying the same failure mode again"
completed: 2026-08-04
---

# Phase 3 Plan 04: Google Drive Link Attachments Summary

**A PM can paste one or more Google Drive links onto a card without leaving the platform: pick its type, see it listed with an icon and outline badge, open it in a new tab, remove it after confirming — validated identically client- and server-side by one shared module, with no cap on link count.**

## Status: COMPLETE (4 of 4 tasks)

## Accomplishments

- `card_attachments` table live on the hosted Supabase project (migration `0018`), RLS-scoped through `cards.client_id` via the same cross-table-subquery shape already proven safe by `client_files` → `clients`; GRANT shipped in the same migration (Pitfall 2)
- `lib/attachments/drive-url.ts` — the single Drive-URL validator, covered by 11 unit tests including the lookalike-domain rejection case (T-03-19)
- `addAttachment`/`removeAttachment` Server Actions: `addAttachment` re-runs `isLikelyDriveLink` server-side from the SAME shared module before the INSERT (never a second copy of the pattern — asserted by a zero-count grep on `drive.google.com` literals in `actions.ts`); `removeAttachment` relies entirely on `card_attachments_delete_scoped` RLS, accepting no `cardId`/`clientId` from the browser
- "Anexos" section inserted into the card detail Dialog between "Responsável" and the checklist (per 03-UI-SPEC.md's locked order): per-type icon (image/video/PDF/other) + `Badge variant="outline"` type label, `target="_blank" rel="noopener noreferrer"` link, `AlertDialog`-confirmed remove using the exact UI-SPEC copy
- Attach form: URL input with instant on-blur `isLikelyDriveLink` feedback, optional label, type `Select` defaulting from `driveLinkType` but freely overridable, submit disabled while the URL is non-empty and invalid
- Board card meta line extended with a `· N anexos` segment, built via an array/join so 03-06 can append its own package-piece marker to the same array without restructuring the composition
- pgTAP `0010_rls_card_attachments_scoping_test.sql`: all assertions green, confirmed on both the hosted project and a local `supabase db reset`

## Task Commits

1. **Task 1: Ship the attachments table with its RLS proof and the shared Drive-URL module, then push it live** — `bf68dd4` (feat; recovered by the orchestrator after the executing agent's worktree died silently mid-task — root cause: the worktree's local `supabase/.temp/` link cache was never populated, since it isn't version-controlled and each fresh worktree starts without it, which appears to have hung the schema-push step. Migration `0018` had NOT been pushed by the dead session; the orchestrator pushed it live directly from the main checkout, which has a working link)
2. **Task 2: Add addAttachment and removeAttachment Server Actions** — `782197c` (feat; implemented directly by the orchestrator after two further continuation-agent sessions stalled at or before this task with zero progress each time — same class of session-level stall, not a logic problem, confirmed by re-reading the plan's task spec and matching every acceptance-criteria grep before committing)
3. **Task 3: Render the attachment list and attach form in the card detail Dialog** — `84aaa47` (feat; also implemented directly by the orchestrator in the same session as Task 2, verified against every literal-copy-string and grep criterion in the plan before committing)
4. **Task 4: Human verification** — CONFIRMED by developer 2026-08-04 (all 11 numbered steps: empty-state copy, invalid-link message, successful attach with toast + icon + badge, new-tab open, no-cap on a third link, meta-line count, confirmed removal, reload persistence, and confirmation that Descrição/Responsável/checklist/Avançar/drag-and-drop all still work); no task commit, verification only

## Files Created/Modified

- `supabase/migrations/0018_card_attachments.sql` (new) — table, index, RLS policies, GRANT
- `supabase/tests/0010_rls_card_attachments_scoping_test.sql` (new) — pgTAP scoping proof
- `lib/attachments/drive-url.ts` / `lib/attachments/drive-url.test.ts` (new) — shared validator + 11 unit tests
- `lib/validation/cards.ts` (modified) — `attachDriveLinkSchema`, `removeAttachmentSchema`
- `app/pm/board/actions.ts` (modified) — `addAttachment`, `removeAttachment`
- `app/pm/board/page.tsx` (modified) — batched `card_attachments` read alongside the existing checklist read, `BoardAttachment` type export
- `app/pm/board/board-panel.tsx` (modified) — `AttachmentRow`, `AttachDriveLinkForm`, Anexos section, meta-line segment array

## Decisions Made

See `key-decisions` in the frontmatter above.

## Deviations from Plan

No deviations in the delivered code — every task was completed exactly per the plan's task specifications, verified against each task's literal acceptance-criteria greps before committing (including after the two mid-plan recoveries).

The process deviated from the standard wave-executor pattern: this plan's executor sessions stalled three separate times across Tasks 1-3 (a background-agent/runtime issue — sessions stopped making progress and either returned a stall-watchdog failure or died with no notification at all — never a code-logic failure). After the first two stalls, the orchestrator recovered already-committed or in-progress work and re-dispatched a continuation. After the third stall left zero progress, the orchestrator implemented Tasks 2 and 3 directly rather than retrying the same failure mode again, applying the identical verification rigor (full acceptance-criteria greps, `tsc`/lint/build/test) before each commit.

## Issues Encountered

- Two Supabase CLI schema-push failures during Task 1 recovery, both root-caused and resolved by the orchestrator: (1) a fresh worktree's `supabase/.temp/` link cache is empty (not version-controlled), which likely hung the original push; (2) the local Docker test database was out of sync with migration `0018` until `supabase db reset` was run, which initially made `supabase test db` fail on `0010` with "relation does not exist" before the reset — resolved, not a code defect.
- The developer's `npm run dev` needed a restart after each worktree merge across this whole phase (a recurring pattern already documented in prior plans' summaries) — expected, not a bug.

## User Setup Required

None beyond what was already required for this phase (`ANTHROPIC_API_KEY`/Supabase env vars, already configured earlier in this session for unrelated P0 work).

## Next Phase Readiness

- `app/pm/board/board-panel.tsx` now carries description/assignee (03-09), drag-and-drop (03-08), and Anexos (this plan) in the card detail Dialog. Plan 03-05 (admin audit view, currently paused per the 2026-08-04 P0 pivot) will read `card_attachments` alongside the checklist audit trail — no new schema needed from this plan's side.
- The P0 pivot's item 3 (AI validation of a card against its checklist) was explicitly held back until this plan's checkpoint closed, since it also touches the card detail Dialog — it is unblocked as of this SUMMARY.

---
*Phase: 03-content-production-kanban*
*Completed: 2026-08-04*

## Self-Check: PASSED

- FOUND: supabase/migrations/0018_card_attachments.sql
- FOUND: lib/attachments/drive-url.ts
- FOUND: app/pm/board/actions.ts (addAttachment, removeAttachment)
- FOUND: app/pm/board/board-panel.tsx (Anexos section)
- FOUND commit: bf68dd4 (Task 1)
- FOUND commit: 782197c (Task 2)
- FOUND commit: 84aaa47 (Task 3)
