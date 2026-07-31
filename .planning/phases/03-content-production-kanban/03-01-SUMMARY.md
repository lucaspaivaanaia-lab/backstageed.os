---
phase: 03-content-production-kanban
plan: 01
subsystem: database, ui
tags: [supabase, rls, pgtap, zod, react-hook-form, nextjs, server-actions]

# Dependency graph
requires:
  - phase: 05-access-roles
    provides: is_admin() / pm_assigned_clients() RLS helpers, PM/Admin/Client role model
provides:
  - checklist_templates + checklist_template_items tables (reusable admin-authored templates, D-03)
  - clients.checklist_template_id FK for per-client 1:1 template assignment (CHK-02)
  - pgTAP proof that PM read-but-not-write / admin write on both new tables
  - /admin/checklist-templates screen: create/edit/delete templates, per-client assignment
affects: [03-02, 03-03 (card checklist gate consumes checklist_templates/clients.checklist_template_id)]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Checklist template = live admin-editable source; snapshot-at-entry into card_checklist_items is a later plan's concern (D-04), not touched here"
    - "Server Action authorization: app-layer profiles.status/role check as primary boundary, admin-only RLS policy as defense-in-depth, proved by pgTAP throws_like"
    - "Radix Select cannot carry an empty-string value — nullable FK assignment uses a NONE_VALUE sentinel mapped to null before the Server Action call"

key-files:
  created:
    - supabase/migrations/0013_checklist_templates.sql
    - supabase/migrations/0014_clients_checklist_template.sql
    - supabase/tests/0006_rls_checklist_templates_scoping_test.sql
    - lib/validation/checklist.ts
    - lib/actions/checklist-templates.ts
    - app/admin/checklist-templates/page.tsx
    - app/admin/checklist-templates/template-list.tsx
    - app/admin/checklist-templates/template-form.tsx
    - app/admin/checklist-templates/client-assignment.tsx
  modified:
    - app/admin/layout.tsx

key-decisions:
  - "Followed 03-RESEARCH.md Pattern 2 DDL verbatim for checklist_templates/checklist_template_items (copy-table snapshot model, not JSONB)"
  - "Remote Supabase migration history had 5 orphan timestamped entries (0008-0012's effects, applied via MCP tool in prior sessions under different version identifiers) blocking a clean db push — repaired via 'migration repair --status reverted' on the orphans and 'migration repair --status applied' on local 0008-0012 (bookkeeping only, no DDL executed) before pushing 0013/0014"

patterns-established:
  - "Admin-only Server Action module: every exported action repeats its own inline profiles.status/role check (not a shared helper) so a grep-based acceptance gate can count exactly one check per action"

requirements-completed: [CHK-01, CHK-02]

# Metrics
duration: ~35min (Tasks 1-3) + human verification
completed: 2026-07-31
---

# Phase 3 Plan 01: Admin Checklist Templates Summary

**Reusable checklist-template CRUD (name + ordered item list) with per-client 1:1 assignment, both migrations live on the hosted database and pgTAP-proven at the RLS layer — PM read, admin-only write.**

## Status: COMPLETE (4 of 4 tasks)

Tasks 1-3 completed by the executor, committed, and automated-verified. Task 4 (`checkpoint:human-verify`, `gate="blocking"`) was walked through by the developer against the merged `main` branch on 2026-07-31 — all 7 verification steps confirmed correct ("check! everything correct"). Plan closed.

## Performance

- **Duration:** ~35 min (Tasks 1-3) + human verification pass
- **Started:** 2026-07-31T13:49:39Z
- **Completed:** Tasks 1-3 done 2026-07-31T14:23:59Z; Task 4 (human sign-off) confirmed 2026-07-31
- **Tasks:** 4 of 4 complete
- **Files modified:** 10 (3 new migrations/tests, 7 new/modified application files)

## Accomplishments
- `checklist_templates` + `checklist_template_items` tables shipped with RLS enabled, PM-read/admin-write policies, and GRANTs in the same migration (CHK-01)
- `clients.checklist_template_id` FK added for strict 1:1 per-client template assignment (CHK-02)
- pgTAP suite (`0006_rls_checklist_templates_scoping_test.sql`) proves PM read-access and PM write-rejection (2x `throws_like`), and admin write-success — 0 `not ok` lines across the full local suite (0001-0006)
- Both migrations (0013, 0014) applied to the linked hosted database (`ancfwsgyzoostoidqzqj`) and confirmed present via `supabase migration list --linked`
- `/admin/checklist-templates` screen: template list (name/item-count/client-count), create/edit Dialog with an add/remove ordered item list (react-hook-form + zod, `useFieldArray`), delete confirmation (`AlertDialog`), and a per-client template `Select` (with a "Nenhum" unassign option)
- "Checklists" nav entry added to the Admin sidebar

## Task Commits

1. **Task 1: Ship the checklist-template schema and its RLS proof** - `e332956` (feat)
2. **Task 2: Apply the migrations to the live database and run the RLS suite** - no commit (no source files changed — see Deviations for the migration-history repair performed as part of this task)
3. **Task 3: Build the admin checklist-template screen end to end** - `396002f` (feat)
4. **Task 4: Human verification** - CONFIRMED by developer 2026-07-31 (all 7 steps passed; no commit, verification only)

## Files Created/Modified
- `supabase/migrations/0013_checklist_templates.sql` - checklist_templates + checklist_template_items tables, RLS, GRANTs
- `supabase/migrations/0014_clients_checklist_template.sql` - clients.checklist_template_id FK
- `supabase/tests/0006_rls_checklist_templates_scoping_test.sql` - pgTAP: PM read/no-write, admin write
- `lib/validation/checklist.ts` - checklistTemplateSchema, assignTemplateSchema
- `lib/actions/checklist-templates.ts` - createTemplate/updateTemplate/deleteTemplate/assignTemplateToClient
- `app/admin/checklist-templates/page.tsx` - Server Component data load (Promise.all templates+clients)
- `app/admin/checklist-templates/template-list.tsx` - Table, CreateTemplateButton, per-row edit/delete
- `app/admin/checklist-templates/template-form.tsx` - name + ordered item list form (create/edit)
- `app/admin/checklist-templates/client-assignment.tsx` - per-client template Select
- `app/admin/layout.tsx` - added "Checklists" sidebar nav item

## Decisions Made
- No `.default([])` on the zod `items` array schema (matches the established `lib/validation/clients.ts` convention — keeps zodResolver's input/output types identical for `useForm`).
- `sort_order` is always derived from array index at submit time in both `createTemplate` and `updateTemplate` — never accepted as client input.
- `updateTemplate` replaces the full item set (delete-then-insert) rather than diffing individual items — simpler and matches the plan's explicit instruction; `card_checklist_items` (a later plan's snapshot table) is never touched by this delete.
- Radix `SelectItem` cannot carry an empty-string `value`; the per-client assignment's "Nenhum" (unassign) option uses a `"none"` sentinel string, mapped to `null` before calling `assignTemplateToClient`.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Repaired remote Supabase migration history before Task 2's `db push` could succeed**
- **Found during:** Task 2 (apply migrations 0013/0014 to the hosted database)
- **Issue:** `supabase db push --dry-run` failed with "Remote migration versions not found in local migrations directory," listing 5 timestamped remote entries (`20260716122549`, `20260716122557`, `20260721205750`, `20260722171143`, `20260722171151`). These are the historical effects of local migrations 0008-0012, which prior sessions applied to the hosted DB via the MCP tool (not this repo's CLI), so they were recorded under mismatched timestamp version identifiers instead of the local `0008`-`0012` filenames (STATE.md's 05-06-SUMMARY.md documents the same class of gap for 0008/0009 specifically). Confirmed via `supabase db query --linked` that the actual schema effects of 0008-0012 (the `messages`/`client_files` tables, the dropped `tropicalia_project_id` column) were already live before touching anything.
- **Fix:** `supabase migration repair --linked --status reverted <5 timestamps>` (discards the orphan bookkeeping entries, no DDL) followed by `supabase migration repair --linked --status applied 0008 0009 0010 0011 0012` (marks the already-applied local versions as applied in remote history, no DDL). This is bookkeeping-only — it does not create, alter, or drop any table — verified by re-running `supabase migration list --linked` showing all of 0001-0012 aligned local=remote before the real `db push` of 0013/0014.
- **Files modified:** none (remote migration history table only, not tracked in git)
- **Verification:** `supabase migration list --linked` shows 0013/0014 in the Remote column after `db push`; `supabase test db` (local, Docker) shows 0 `not ok` lines across all of 0001-0006.
- **Committed in:** n/a (no source files changed by this fix)

**2. Worktree lacked `.env.local` / linked-project state (structural, not a code fix)**
- **Found during:** Task 2 start
- **Issue:** This git worktree is a fresh checkout and `.env.local` / `supabase/.temp/project-ref` are both gitignored, so neither existed here — `supabase db push` failed with an IPv6 connectivity error before even reaching the migration-history problem above.
- **Fix:** Copied `.env.local` and `supabase/.temp/project-ref` from the main checkout into this worktree (both gitignored, confirmed via `git status --short` showing no change and `git ls-files` showing them untracked — copying introduces no git-tracked change) and ran `supabase link --project-ref ancfwsgyzoostoidqzqj` to establish the IPv4 pooler connection.
- **Files modified:** none (gitignored local files only)
- **Verification:** `supabase migration list --linked` succeeded afterward.
- **Committed in:** n/a

### Out-of-scope, deferred (not fixed)

- **`package-lock.json` drift on `npm install`:** running `npm install` (node_modules did not exist in this fresh worktree) reported the lockfile out of sync with `package.json` (an `@emnapi/wasi-threads` version mismatch, unrelated to any file this plan touches) and rewrote `package-lock.json`. Reverted via `git checkout -- package-lock.json` immediately after (`node_modules` stays installed and untracked, unaffected by the revert) since this is pre-existing drift out of this plan's scope per the Scope Boundary rule. Logged here rather than in a separate `deferred-items.md` since it is a one-line, already-resolved (reverted) note.

---

**Total deviations:** 2 auto-fixed (both Rule 3 - blocking, both required to complete Task 2, neither touched application code or committed files), 1 out-of-scope item reverted and logged.
**Impact on plan:** No scope creep — both fixes were necessary preconditions for the BLOCKING Task 2 to complete at all, and neither altered schema beyond what 0013/0014 themselves define.

## Issues Encountered
None beyond the deviations documented above.

## User Setup Required
None - no new external service configuration required. (The migration-history repair above touched only the already-linked hosted Supabase project's own bookkeeping table, not a new service.)

## Next Phase Readiness

- `public.checklist_templates`, `public.checklist_template_items`, and `public.clients.checklist_template_id` are live on the hosted database, ready for Plan 03-03's card-checklist-gate snapshot logic to read (D-04: snapshot-at-entry into `card_checklist_items`, not built here).
- Plan fully closed — no blockers for Wave 2 (03-02).

## Execution Note (orchestrator deviation)

Task 4's checkpoint asked the developer to run `npm run dev` and verify — but the executor ran in an isolated git worktree not yet merged to `main`, so the developer's existing dev server (on `main`) didn't show the new UI. The orchestrator merged the worktree's Task 1-3 commits into `main` (via `git merge --no-ff`, no conflicts, no new dependencies) *before* the human-verify step, so the developer could test against their normal running app. This is earlier than the standard post-wave merge point but was necessary for a mid-plan human-verify checkpoint under worktree isolation to be testable at all.

---
*Phase: 03-content-production-kanban*
*Completed: 2026-07-31 (all 4 tasks)*

## Self-Check: PASSED

- FOUND: supabase/migrations/0013_checklist_templates.sql
- FOUND: supabase/migrations/0014_clients_checklist_template.sql
- FOUND: supabase/tests/0006_rls_checklist_templates_scoping_test.sql
- FOUND: lib/validation/checklist.ts
- FOUND: lib/actions/checklist-templates.ts
- FOUND: app/admin/checklist-templates/page.tsx
- FOUND: app/admin/checklist-templates/template-list.tsx
- FOUND: app/admin/checklist-templates/template-form.tsx
- FOUND: app/admin/checklist-templates/client-assignment.tsx
- FOUND: app/admin/layout.tsx
- FOUND commit: e332956 (Task 1)
- FOUND commit: 396002f (Task 3)
