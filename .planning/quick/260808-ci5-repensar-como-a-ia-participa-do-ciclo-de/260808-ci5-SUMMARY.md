---
phase: quick/260808-ci5
plan: 01
subsystem: ai
tags: [supabase, rls, pgtap, nextjs, server-actions, checklist, anthropic]

requires:
  - phase: 03-content-production-kanban
    provides: checklist_templates/checklist_template_items (CHK-01/CHK-02, admin-only), card_checklist_items snapshot gate (CHK-03)
provides:
  - "Automatic AI checklist-draft generation on every client-file upload (PM or Admin), no manual click required"
  - "Owner-scoped checklist_templates/checklist_template_items RLS write policies letting a PM write/confirm only their own assigned client's draft rows"
  - "confirmChecklistDraft — the only place a draft becomes a client's active/gating checklist"
  - "Self-correcting 'Revalidar com IA': validateCardAgainstChecklist now also rewrites cards.description automatically when checklist items fail (D-06-amendment), with an Undo affordance"
affects: [checklist-templates, client-onboarding, card-detail-dialog, ai-content-validation]

tech-stack:
  added: []
  patterns:
    - "Owner-scoped RLS write policy layered on top of an existing admin-only policy via OR'd `for all` policies (owner_client_id in pm_assigned_clients()), never narrowing the original admin policy"
    - "Draft/confirmed status column pattern for AI-proposed rows that need human review before becoming authoritative (mirrors the existing 'AI proposes, human confirms' pattern from autofillBriefingFromFiles)"

key-files:
  created:
    - supabase/migrations/0023_checklist_templates_owner_scoping.sql
    - supabase/tests/0013_rls_checklist_templates_owner_scoping_test.sql
  modified:
    - lib/actions/checklist-templates.ts
    - app/pm/board/actions.ts
    - components/clients/client-files-section.tsx
    - components/clients/client-checklist-section.tsx
    - app/admin/checklist-templates/template-form.tsx
    - components/clients/client-detail-form.tsx
    - app/admin/clients/[id]/page.tsx
    - app/pm/clients/[id]/page.tsx
    - app/pm/board/board-panel.tsx

key-decisions:
  - "D-Checklist-Approval: a draft checklist only becomes the client's ACTIVE/gating checklist (clients.checklist_template_id) at explicit confirm — never on generation."
  - "D-06-amendment: content self-correction supersedes D-06 (AI-only-advisory) strictly for cards.description; CHK-03's manual per-item PM check-off gate is untouched — the rewrite never touches card_checklist_items and never calls advanceStage/moveCard."

requirements-completed: [CHK-01, CHK-02, CHK-03]

duration: ~2h (across a connection interruption and resume)
completed: 2026-08-10
---

# Quick Task 260808-ci5: Repensar como a IA participa do ciclo de checklist do cliente — Tasks 1-2 Summary

**Automatic AI checklist-draft generation on every client-file upload (PM-or-Admin review/confirm, owner-scoped RLS) + self-correcting "Revalidar com IA" that rewrites `cards.description` on failing checklist items, with an Undo affordance — CHK-03's manual gate untouched.**

## Performance

- **Tasks completed:** 2 of 3 (Task 3 is a blocking human-verify checkpoint, reserved for the orchestrator's live session — not attempted, per explicit dispatch constraint)
- **Files created:** 2 (migration + pgTAP test)
- **Files modified:** 9

## Accomplishments

- **Migration 0023** adds `status` (`draft`/`confirmed`, defaults to `confirmed` so every pre-existing row is unaffected) and `owner_client_id` to `checklist_templates`, plus two new owner-scoped RLS write policies (`checklist_templates_owner_write`, `checklist_template_items_owner_write`) that OR a second permissive write path onto the existing admin-only policies from `0013_checklist_templates.sql` — a PM can now write/confirm ONLY a draft owned by their own `pm_assigned_clients()`, and shared/library templates (`owner_client_id is null`) remain Admin-only exactly as before.
- **pgTAP test `0013_rls_checklist_templates_owner_scoping_test.sql`** (7 assertions, all passing standalone): pm_a can insert/update-status a draft owned by client_a, is blocked inserting a template or item owned by client_b, is blocked inserting a template with `owner_client_id` omitted (the shared-library regression proof), and admin_user stays unrestricted for owner-scoped rows too.
- **`lib/actions/checklist-templates.ts`**: extracted the AI-proposal core (`proposeChecklistFromFiles`) so the existing admin-only `generateChecklistFromFiles` and the new `generateChecklistDraftFromFiles` share one prompt/schema/parsing path with zero duplication. Added `generateChecklistDraftFromFiles` (PM-or-Admin, RLS-scoped, never touches `clients.checklist_template_id`), `getClientChecklistDraft`, `getChecklistTemplateForEdit`, and `confirmChecklistDraft` (the only place a draft becomes the client's active/gating checklist — the owning client is derived from the re-read template row, never from caller input).
- **`app/pm/board/actions.ts`**: `validateCardAgainstChecklist` now also asks the model for a `revisedDescription` and, when it differs from the current text, persists it to `cards.description`/`updated_at` only — a comment directly above the write documents the D-06-amendment hard boundary (never `card_checklist_items`, never `advanceStage`/`moveCard`). A missing/invalid `revisedDescription` from the model is logged and treated as "no rewrite" rather than failing the whole call, so the pre-existing pass/fail report keeps working unconditionally.
- **UI wiring**: uploading a client file (PM or Admin) now silently regenerates the client's draft checklist in the background (same trigger/posture as the existing briefing autofill). `ClientChecklistSection` is rewritten to render for both PM and Admin (the admin-only manual "Gerar/Atualizar checklist com IA" button now lives INSIDE the section, gated individually, rather than gating the whole section); a new "Rascunho gerado pela IA — aguardando revisão" badge + "Revisar e confirmar" flow (own independent Dialog/state) opens `TemplateForm mode="confirm-draft"`. `board-panel.tsx`'s revalidate flow surfaces `revisedDescription` into the description textarea with a "Desfazer revisão" undo button.

## Task Commits

1. **Task 1: Data layer + Server Action contracts** — `32a3e48` (feat)
2. **Task 2: Wire the UI** — `7b65a3e` (feat)

Task 3 (live checkpoint) intentionally not started — see "Task 3 / Pending Work" below.

## Files Created/Modified

- `supabase/migrations/0023_checklist_templates_owner_scoping.sql` — owner-scoped RLS write policies + `status`/`owner_client_id` columns
- `supabase/tests/0013_rls_checklist_templates_owner_scoping_test.sql` — 7-assertion pgTAP proof of the new policies
- `lib/actions/checklist-templates.ts` — `proposeChecklistFromFiles` (extracted), `generateChecklistDraftFromFiles`, `getClientChecklistDraft`, `getChecklistTemplateForEdit`, `confirmChecklistDraft`
- `app/pm/board/actions.ts` — `validateCardAgainstChecklist` rewritten to self-correct `cards.description`
- `components/clients/client-files-section.tsx` — auto-triggers `generateChecklistDraftFromFiles` after a successful upload batch
- `components/clients/client-checklist-section.tsx` — rewritten: PM+Admin visible, draft review/confirm UI, admin-only manual regenerate scoped inside
- `app/admin/checklist-templates/template-form.tsx` — new `mode="confirm-draft"` calling `confirmChecklistDraft`
- `components/clients/client-detail-form.tsx` — renders `ClientChecklistSection` unconditionally, passes `checklistDraft`
- `app/admin/clients/[id]/page.tsx`, `app/pm/clients/[id]/page.tsx` — fetch `getClientChecklistDraft` alongside the existing template read
- `app/pm/board/board-panel.tsx` — `preRevisionDescription` state + "Desfazer revisão" undo affordance

## Decisions Made

- D-Checklist-Approval and D-06-amendment (see frontmatter `key-decisions`) implemented exactly per `260808-ci5-CONTEXT.md` and the plan's `<interfaces>` block — no scope changes.
- `generateChecklistDraftFromFiles` deliberately has NO `profiles.role` check (only the RLS-scoped client re-read) so it stays PM-usable, matching the plan's explicit instruction not to add a redundant admin-only gate.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Bootstrapped missing `node_modules` via `npm ci`**
- **Found during:** Task 2 (`npm run build` verification step)
- **Issue:** This worktree had no `node_modules` directory at all (only `package-lock.json` was present). Node's module resolution silently found `tsc`/`eslint` binaries by walking up to the main repo's `node_modules`, so `tsc --noEmit` and `eslint` passed cleanly with no signal — but Turbopack's stricter workspace-root detection correctly refused to build ("Next.js inferred your workspace root ... files outside of the project directory will not be compiled"), since `next.config.ts`'s pinned `turbopack.root` didn't match where the resolved `next` package actually lived.
- **Fix:** Ran `npm ci` (not `npm install <pkg>` — this exclusively reproduces the exact, already-committed `package-lock.json` tree; no new/unverified package name was introduced, so this does not fall under the package-manager-install exclusion that requires a `checkpoint:human-verify`). 715 packages installed, build then succeeded cleanly.
- **Files modified:** none tracked (`node_modules/` is gitignored)
- **Verification:** `npm run build` exit 0, full route manifest printed, no errors
- **Committed in:** N/A — no diff to commit (node_modules is gitignored)

### Verify-Script Quirk (not a code deviation)

The plan's Task 2 verify line `grep -c "generateChecklistDraftFromFiles" components/clients/client-files-section.tsx | grep -qx 1` expects the string to appear on exactly 1 line. My implementation (import + single call inside the `successCount > 0` branch, mirroring the plan's own instruction to call it "immediately after the existing `autofillBriefingFromFiles(clientId)` call") produces 2 matching lines (the import statement + the one call site) — identical in shape to the pre-existing `autofillBriefingFromFiles` reference two lines above it, which also matches on 2 lines. This is very likely an off-by-one in the plan's verify script (any correct TypeScript implementation needs both an import line and a call line), not a wiring defect. The functionally meaningful part of that check — a SINGLE call site, not once-per-file-in-a-loop (the exact bug class 260805-dkr fixed for the sibling `autofillBriefingFromFiles` call) — is satisfied: `generateChecklistDraftFromFiles(clientId)` is called exactly once, only inside the `successCount > 0` branch, after the batch loop completes. The other two `WIRING_OK` sub-checks (`confirm-draft` in `template-form.tsx`, `draftTemplate` in `client-checklist-section.tsx`) both pass as literally specified.

---

**Total deviations:** 1 auto-fixed (1 blocking — environment bootstrap), 1 documented verify-script quirk (no code change needed)
**Impact on plan:** No scope creep. The `npm ci` bootstrap was required purely to run the plan's own `npm run build` verification step; it made no code changes. The verify-script quirk does not indicate any functional gap — confirmed by manual line-by-line inspection matching the plan's own stated intent.

## Issues Encountered

- A transient connection error interrupted the session mid-Task-1 (after the migration + pgTAP test files were written and passing, before the Server Action code was written). Resumed in the same worktree with all prior work intact — no rework needed, continued exactly from the `lib/actions/checklist-templates.ts` function additions as instructed.

## Verification Results

- `npx supabase test db` (full suite): all 14 test files show `ok`, `grep -c '^not ok'` = 0 (`SUITE_NO_FAILURES`). The trailing `Result: FAIL` is the pre-existing `rls_helpers.sql`-glob cosmetic artifact (no TAP plan in that fixture-only file), expected and ignored per this project's established convention (260716-bjk).
- `npx supabase test db supabase/tests/0013_rls_checklist_templates_owner_scoping_test.sql` → `Result: PASS` (7/7).
- `npx supabase test db supabase/tests/0006_rls_checklist_templates_scoping_test.sql` → `Result: PASS` (4/4, untouched cross-file regression control for the original admin-only guarantee on shared templates).
- `npx tsc --noEmit` → clean.
- `npx eslint` (all 11 touched files) → 0 errors, 2 pre-existing `react-hooks/incompatible-library` warnings unrelated to this task's changes (react-hook-form's `watch()`, on lines this task did not touch).
- `npm run build` → succeeds, full route manifest printed, no errors (after the `npm ci` bootstrap documented above).
- D-06-amendment static gate: zero occurrences of `card_checklist_items").insert/update/delete`, `advanceStage(`, or `moveCard(` inside `validateCardAgainstChecklist`'s function body (`D06_BOUNDARY_OK`).
- `git diff --stat` against the plan's base commit (`5c24012`) matches exactly the plan's `files_modified` list plus the two new files — no incidental edits elsewhere.
- Board-panel advance-call regression gate: `moveCard(`/`advanceStage(` call-site count unchanged from HEAD baseline (2 == 2, `NO_NEW_ADVANCE_CALLS`).

## Task 3 / Pending Work — IMPORTANT for the orchestrator

**Task 3 (live checkpoint) was intentionally NOT attempted** — it is a `type="checkpoint:human-verify" gate="blocking"` task reserved for the orchestrator's live session per explicit dispatch instructions.

**The hosted Supabase migration push is still owed.** Migration `0023_checklist_templates_owner_scoping.sql` has been applied and fully tested against this worktree's LOCAL Docker Supabase instance only (`npx supabase migration up --local`) — this worktree deliberately lacks `.env.local`/hosted credentials, the same recurring, established limitation as prior quick tasks this session (260722-hnm, 260805-kio) and Phase 3 waves 8-9 (03-05, 03-06). **Before Task 3's live checkpoint can be meaningfully run against production data, the orchestrator must:**
1. Run `npx supabase db push` (or equivalent) against the hosted project (`ancfwsgyzoostoidqzqj`) to apply migration 0023.
2. Confirm via `npx supabase db dump` (or a direct query) that the hosted `checklist_templates`/`checklist_template_items` tables now have the `status`/`owner_client_id` columns and the two new owner-scoped RLS policies.

That said, **Task 3's own `<how-to-verify>` steps 1-6 are written to run against local `npm run dev` + local Supabase**, which is fully functional right now (migration applied locally, full suite green) — the checkpoint itself does not strictly require the hosted push to be exercised locally. The hosted push only becomes necessary if the orchestrator intends to verify against the production Vercel deployment (`https://backstageed-os.vercel.app`) instead of local dev, per this project's established pattern of sometimes running checkpoints directly against production (see Phase 2's 02-06 in STATE.md).

## Next Phase Readiness

- Tasks 1-2 are complete, fully verified, and committed. Task 3 (live checkpoint, all 6 steps in the plan) is ready to run as soon as the orchestrator picks this up — either against local dev (works right now) or against production (requires the hosted migration push first, see above).
- No blockers for Task 3 beyond the explicit developer walkthrough itself.

---
*Phase: quick/260808-ci5*
*Completed: 2026-08-10 (Tasks 1-2; Task 3 pending orchestrator)*

## Self-Check: PASSED

- All 11 code files claimed as created/modified are tracked in git (`git ls-files` confirms each).
- Both task commit hashes (`32a3e48`, `7b65a3e`) confirmed present in `git log --oneline --all`.
- No missing items.
