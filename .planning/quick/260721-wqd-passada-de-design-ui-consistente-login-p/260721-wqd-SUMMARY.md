---
phase: quick
plan: 260721-wqd
subsystem: ui
tags: [nextjs, tailwind-v4, shadcn-ui, design-system, oklch]

requires: []
provides:
  - "app/globals.css: brand --primary/--ring/--accent tokens (muted indigo, oklch(0.45 0.15 265) family) in :root and .dark, replacing the zero-chroma shadcn default"
  - "components/layout/page-shell.tsx: shared PageShell (default/wide/narrow width variants), PageTitle (with optional action slot), SectionTitle, EmptyState presentational components"
  - "Consistent visual pass across login, /pm, /pm/clients (list/create/detail/briefing), /pm/clients/[id]/access, and /pm/chat, all consuming the shared foundation"
affects: [05-access-roles, 02-client-isolated-ai-chat, future-ui-work]

tech-stack:
  added: []
  patterns:
    - "PageShell/PageTitle/SectionTitle/EmptyState in components/layout/page-shell.tsx are the single source of page container width, heading scale, and empty-state markup — new screens should consume these instead of inline max-w-*/text-[28px]/h2 patterns"
    - "Brand hue is defined once in app/globals.css :root/.dark --primary (and mirrored in --ring/--accent) — component code should never hardcode a hue, only reference --color-primary/--color-ring/--color-accent via Tailwind utility classes"

key-files:
  created:
    - components/layout/page-shell.tsx
  modified:
    - app/globals.css
    - "app/(auth)/login/page.tsx"
    - app/pm/page.tsx
    - app/pm/clients/page.tsx
    - app/pm/clients/new/page.tsx
    - components/clients/client-create-form.tsx
    - "app/pm/clients/[id]/page.tsx"
    - components/clients/client-detail-form.tsx
    - "app/pm/clients/[id]/access/page.tsx"
    - components/clients/client-access-panel.tsx
    - app/pm/chat/chat-panel.tsx

key-decisions:
  - "Brand hue chosen as a muted indigo/blue (oklch ~0.45 0.15 265 in light mode, ~0.72 0.13 265 in dark mode) — restrained rather than saturated, per the plan's 'professional, not saturated' instruction"
  - "No next/font/google or any networked font — kept the existing system font stack per the plan's explicit build-safety constraint ahead of the demo"
  - "PageTitle used inside client-detail-form.tsx with an explicit className=\"mb-0\" override (via cn/twMerge) so its default mb-8 doesn't double up with the parent's flex flex-col gap-8 spacing"
  - "npm ci was run to install already-locked dependencies (package-lock.json, no version changes) after discovering node_modules was absent in this worktree — required to run the npm run build gate; no new/unverified package was added"

requirements-completed: [UI-CONSISTENCY]

duration: ~25min
completed: 2026-07-22
---

# Quick Task 260721-wqd: Passada de design/UI consistente (login, PM, clientes, acesso, chat) Summary

**Established a single brand foundation — a muted indigo `--primary`/`--ring`/`--accent` token family in `app/globals.css` plus new `components/layout/page-shell.tsx` (PageShell/PageTitle/SectionTitle/EmptyState) — and migrated all four pre-existing screen areas (login, /pm/clients list+create+detail/briefing, /pm/clients/[id]/access, /pm/chat) onto it, with zero changes to any Server Action, Route Handler, Supabase query, RLS, auth/session, or validation code.**

## Performance

- **Duration:** ~25 min (6 commits spanning 09:14:12–09:18:34 -03:00, plus prior file discovery/reading)
- **Started:** 2026-07-22 (session start)
- **Completed:** 2026-07-22T09:18:34-03:00
- **Tasks:** 6 of 7 completed (Task 7 is the blocking human-verify checkpoint, intentionally not auto-approved)
- **Files modified:** 11 (1 created, 10 modified)

## Accomplishments

- Gave the palette a professional brand identity: replaced the pure-neutral (zero-chroma) `--primary` in both `:root` and `.dark` with a muted indigo hue (`oklch(0.45 0.15 265)` light / `oklch(0.72 0.13 265)` dark), and nudged `--ring`/`--accent`/`--accent-foreground` to the same brand family — token VALUES only, no structural/name changes.
- Created `components/layout/page-shell.tsx`, a pure presentational file exporting `PageShell` (width="default"|"wide"|"narrow"), `PageTitle` (with an optional right-aligned action slot), `SectionTitle`, and `EmptyState` — the new single source of container width, heading scale, and empty-state markup.
- Migrated login (`app/(auth)/login/page.tsx`) and the PM landing placeholder (`app/pm/page.tsx`) to share a "BackstageEd.OS" wordmark + consistent Card/spacing, without touching any auth logic, field names, or the `signIn` action wiring.
- Migrated `/pm/clients` (list), `/pm/clients/new` (create), and `client-create-form.tsx` onto `PageShell`/`PageTitle`/`EmptyState` with byte-identical Portuguese copy; replaced the bare "×" remove glyph with a lucide `XIcon` to match the detail form's existing pattern.
- Migrated `/pm/clients/[id]` (detail) and `client-detail-form.tsx` onto `PageShell`/`PageTitle`/`SectionTitle`, preserving the locked section order (name → Briefing → PMs → RAG) and every `react-hook-form`/`useFieldArray` handler untouched.
- Migrated `/pm/clients/[id]/access` and `client-access-panel.tsx` onto `PageShell(narrow)`, keeping every locked UI-SPEC copy string byte-for-byte and all `createClientLogin`/`deactivateClientAccess` calls unchanged; added a subtle brand-tinted border to the provisional-password Card.
- Defensive visual polish of `app/pm/chat/chat-panel.tsx`'s non-happy-path render branches (no-client-selected, no-messages, degraded-mode badge, streaming typing-dots, interrupted/retry box, selection bar, composer footer) — markup/className only, zero `fetch`/`AbortController`/`shouldAppendChunk`/state-hook changes (confirmed via the plan's own added-lines grep gate, which returned 0 matches).
- Ran `npm run build` (full Next.js/Turbopack production build) to completion with no type errors, after installing dependencies from the existing `package-lock.json` (see Deviations) — confirms the whole app compiles, not just the individual-task `tsc --noEmit` checks.
- Re-ran the full plan-level scope gate (`git diff --stat` over `actions.ts`/`api/**`/`lib/actions/**`/`lib/validation/**`/`lib/supabase/**`/`supabase/**`/`middleware.ts` across the entire commit range) — empty, confirming zero logic/RLS/auth files were touched across all 6 tasks.

## Task Commits

1. **Task 1: Shared design foundation — palette tokens + presentational shell components** - `7b3bace` (feat)
2. **Task 2: Login + PM landing — consistent auth entry styling** - `4c3664a` (feat)
3. **Task 3: PM clients list + create — adopt shared shell + polished empty state** - `35e369a` (feat)
4. **Task 4: Client detail + briefing form — consistent sections** - `c27bedf` (feat)
5. **Task 5: Client access screen — consistent Card layout** - `a4e9726` (feat)
6. **Task 6: Chat screen — defensive visual polish of non-happy-path states** - `8b71f8a` (feat)

Task 7 (`checkpoint:human-verify`, `gate="blocking"`) intentionally not executed by this agent — reported back to the orchestrator as a checkpoint for human sign-off.

## Files Modified

- `app/globals.css` - Brand `--primary`/`--primary-foreground`/`--ring`/`--accent`/`--accent-foreground` token values replaced with a muted indigo hue in both `:root` and `.dark`; no token names, `--radius` structure, or `@theme inline` mapping changed.
- `components/layout/page-shell.tsx` (new) - `PageShell`, `PageTitle`, `SectionTitle`, `EmptyState` — pure presentational components, no data/logic imports.
- `app/(auth)/login/page.tsx` - Added wordmark + tagline above the Card; all `useTransition`/`signIn`/error-state logic untouched.
- `app/pm/page.tsx` - Matching wordmark treatment on the PM landing placeholder Card.
- `app/pm/clients/page.tsx` - `PageShell(wide)` + `PageTitle` (action slot = "Criar cliente" button) + `EmptyState`, identical copy; Table/Badge/`.map` logic untouched.
- `app/pm/clients/new/page.tsx` - `PageShell` + `PageTitle("Novo cliente")`; server calls and form props untouched.
- `components/clients/client-create-form.tsx` - PM-picker spacing polish; lucide `XIcon` remove glyph; all `react-hook-form`/`createClientRecord` wiring untouched.
- `app/pm/clients/[id]/page.tsx` - `PageShell`; the two-query `Promise.all`, `createAdminClient`, `notFound()`, `canRetry` untouched.
- `components/clients/client-detail-form.tsx` - `PageTitle`/`SectionTitle` for the h1 and three h2 sections; locked section order preserved; all handlers untouched.
- `app/pm/clients/[id]/access/page.tsx` - `PageShell(narrow)`; `findActiveClientLogin`/`notFound()`/props untouched.
- `components/clients/client-access-panel.tsx` - Subtle brand-tinted border on the provisional-password Card; all locked copy strings and Server Action calls untouched.
- `app/pm/chat/chat-panel.tsx` - `SectionTitle` for empty-state headings, brand-tinted degraded-mode Badge and selection bar, consistent destructive-box treatment for the interrupted/retry state, tidier staggered typing-dots; zero data/streaming/state-hook changes.

## Decisions Made

- Chose a muted indigo/blue brand hue (`oklch(0.45 0.15 265)` light-mode `--primary`) rather than a more saturated color, per the plan's explicit "muted, professional look, not saturated" instruction.
- Did not add `next/font/google` or any networked font dependency — kept the existing system font stack, per the plan's explicit build-safety constraint (a failed font fetch could break the pre-demo build).
- In `client-detail-form.tsx`, passed `className="mb-0"` to `PageTitle` (merged via `cn`/`twMerge`) so its default `mb-8` margin doesn't stack with the parent `flex flex-col gap-8` container's own spacing.
- Ran `npm ci` (installing exactly what `package-lock.json` already specifies, no new/upgraded packages) after discovering `node_modules` was entirely absent in this worktree — this was required to execute the plan's own `npm run build` checkpoint gate.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Installed dependencies from existing lockfile to run the build gate**
- **Found during:** Post-Task-6 overall verification (`npm run build`)
- **Issue:** This worktree had no `node_modules` directory at all, so `next build` failed immediately with a Turbopack workspace-root resolution error (`next/package.json` not found) — unrelated to any code change in this plan.
- **Fix:** Ran `npm ci`, which installs exactly the versions already pinned in the project's committed `package-lock.json` — no new package was added, no package.json edit was made, and no version was upgraded. This is distinct from the "package install" exclusion in the deviation rules (which concerns adding an unverified new package name); `npm ci` here reproduces the existing, already-audited lockfile state.
- **Files modified:** None (only installed the existing lockfile's `node_modules`, which is gitignored and was not committed).
- **Verification:** `npm run build` then completed successfully (Turbopack compiled, typechecked, and generated all 19 routes with no errors).
- **Committed in:** N/A — no commit needed; `node_modules` is gitignored and `git status --short` showed no untracked changes after the install.

---

**Total deviations:** 1 auto-fixed (Rule 3 - blocking environment gap, not a code change).
**Impact on plan:** No scope creep — no code, config, or dependency-manifest file was touched; this was purely local environment setup needed to run the plan's own verification gate.

## Issues Encountered

None beyond the dependency-installation gap documented above.

## User Setup Required

None - no external service configuration required.

## Threat Flags

None found — this plan deliberately touched only presentational markup/CSS/Tailwind classes and one new pure-presentational component file; no new network endpoint, auth path, file-access pattern, or schema change was introduced.

## Known Stubs

None — all four screen areas render real data-driven markup (no hardcoded empty/placeholder values were introduced by this plan's changes).

## Next Phase Readiness

- All 6 auto tasks complete; the plan's final task (Task 7, `checkpoint:human-verify`, `gate="blocking"`) is a mandatory human sign-off before this quick task can be considered fully closed — it has NOT been auto-approved.
- `npm run build` passes cleanly (Turbopack, TypeScript, all 19 routes generated).
- The plan's own scope gate (`git diff --stat` over all Server Action/Route Handler/Supabase/RLS/middleware paths, run across the full commit range) is empty — confirmed zero logic/security-surface changes.
- Human verification still needed per the checkpoint's `<how-to-verify>`: visual confirmation of `/login`, `/pm/clients` (list/create/detail/briefing), `/pm/clients/[id]/access`, and `/pm/chat` (load + client-select only, NOT live streaming — that remains gated behind Phase 02's own pending checkpoint).

## Self-Check: PASSED

- `app/globals.css` - FOUND, brand `--primary` confirmed non-zero-chroma in both `:root` and `.dark`.
- `components/layout/page-shell.tsx` - FOUND, exports `PageShell`, `PageTitle`, `SectionTitle`, `EmptyState` confirmed via read-back.
- `app/(auth)/login/page.tsx`, `app/pm/page.tsx`, `app/pm/clients/page.tsx`, `app/pm/clients/new/page.tsx`, `components/clients/client-create-form.tsx`, `app/pm/clients/[id]/page.tsx`, `components/clients/client-detail-form.tsx`, `app/pm/clients/[id]/access/page.tsx`, `components/clients/client-access-panel.tsx`, `app/pm/chat/chat-panel.tsx` - all FOUND and confirmed modified via `git diff --stat`.
- Commit `7b3bace` - FOUND (verified via `git log --oneline`).
- Commit `4c3664a` - FOUND (verified via `git log --oneline`).
- Commit `35e369a` - FOUND (verified via `git log --oneline`).
- Commit `c27bedf` - FOUND (verified via `git log --oneline`).
- Commit `a4e9726` - FOUND (verified via `git log --oneline`).
- Commit `8b71f8a` - FOUND (verified via `git log --oneline`).

---
*Phase: quick*
*Completed: 2026-07-22*
