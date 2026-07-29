---
phase: quick-260728-uab
plan: 02

tags: [tailwind-v4, lucide-react, shadcn-table, react-hook-form]

# Dependency graph
requires:
  - phase: quick-260728-uab-01
    provides: StatusBadge, ErrorBox, DataCard, TableRowsSkeleton/CardSkeleton primitives, PageShell/PageTitle/EmptyState (icon slot), AppSidebar
provides:
  - Refined shadcn Table primitive (denser header/cell rhythm, rounded bordered container) with no sort/filter/paginate added
  - PM and Admin client-list pages sharing one visual structure (PageShell/PageTitle/EmptyState/StatusBadge/lucide icons)
  - Three new loading.tsx skeleton states (/pm/clients, /admin/clients, /pm/clients/[id])
  - Client forms (create, detail/briefing, files) consuming ErrorBox/DataCard instead of ad-hoc destructive markup
affects: [quick-260728-uab-03, phase-03-content-production-kanban]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Table primitive: uppercase text-meta headers + px-4/py-3 cells + rounded-lg border container, reused as-is by any future table screen (e.g. Phase 3 Kanban list views)"
    - "DataCard children wrapped in an inner flex flex-col gap-N div when a section previously relied on its own section wrapper's gap — DataCard's CardContent (px-6) provides padding but not a stacking gap"

key-files:
  created:
    - app/pm/clients/loading.tsx
    - app/admin/clients/loading.tsx
    - app/pm/clients/[id]/loading.tsx
  modified:
    - components/ui/table.tsx
    - app/pm/clients/page.tsx
    - app/admin/clients/page.tsx
    - components/clients/client-create-form.tsx
    - components/clients/client-detail-form.tsx
    - components/clients/client-files-section.tsx

key-decisions:
  - "Chose the 4th-column ChevronRightIcon layout (not inline-in-name-cell) for the row affordance, applied identically to both PM and Admin tables per the plan's either/or instruction"
  - "FILE_LIMIT constant reused (not re-literaled) in both the DataCard description and the new EmptyState description in client-files-section.tsx"

patterns-established:
  - "loading.tsx skeleton pages mirror the real page's PageShell width and layout shape exactly, to avoid any layout shift on hydration"

requirements-completed: [UIUX-04, UIUX-05]

# Metrics
duration: ~20min
completed: 2026-07-29
---

# Quick Task 260728-uab Plan 02: Table Refinement, Client Listings & Forms Summary

**Refined the shadcn Table density/borders, unified PM and Admin client-list pages onto PageShell/StatusBadge, added three loading.tsx skeletons, and swapped ad-hoc error boxes/sections in the three client forms for ErrorBox/DataCard — zero logic changes.**

## Performance

- **Duration:** ~20 min
- **Completed:** 2026-07-29T02:10:00Z
- **Tasks:** 2
- **Files modified:** 9 (3 created, 6 modified)

## Accomplishments
- `components/ui/table.tsx`: `TableHead` now `h-11 px-4 text-meta font-medium uppercase tracking-wide text-muted-foreground`, `TableCell` now `px-4 py-3`, `TableHeader` has explicit `border-border`, and the outer `Table` container gained `rounded-lg border` — a denser, more delimited Linear/Notion-style table block. No sort/filter/pagination logic added (verified: 0 matches for `sort|orderby|filter\(|paginat`).
- `app/admin/clients/page.tsx` fully migrated off its ad-hoc `max-w-4xl mx-auto px-6 py-8` / `text-[28px]` / inline empty-state markup onto `PageShell width="wide"` + `PageTitle` (with `PlusIcon` action) + `EmptyState` (with `UsersIcon`) — now structurally identical to `app/pm/clients/page.tsx`. Both pages still make exactly one `from("clients")` call with the original select and byte-identical `briefingEmpty`/`assignedPmEmails` calculations.
- Briefing badges in both list pages swapped from shadcn `Badge variant="outline"/"secondary"` to `StatusBadge tone="neutral"/"success"`; both `Badge` imports removed. Each row's name cell is a `flex items-center gap-2 font-medium hover:text-primary` link, and a 4th (screen-reader-labeled) column holds a `ChevronRightIcon` affordance — same pattern in both tables.
- Three new `loading.tsx` files (`/pm/clients`, `/admin/clients`, `/pm/clients/[id]`), each a Server Component with no props/data: the two list-page loaders render `PageShell width="wide"` + a title `Skeleton` + `TableRowsSkeleton rows={5} columns={3}`; the detail-page loader renders `PageShell` (default width, matching the real page) + a title `Skeleton` + two `CardSkeleton`s.
- `client-create-form.tsx`: `serverError` paragraph replaced with `<ErrorBox>`; "Adicionar PM" button gained a `PlusIcon`. PM chips still use shadcn `Badge secondary` + `XIcon` (removable input chips, intentionally not `StatusBadge`, per plan).
- `client-detail-form.tsx`: "Briefing estratégico" and "PMs atribuídos" sections now render as `DataCard`s (the first with a `description` explaining it feeds the client's AI context); their `SectionTitle`s were removed (import dropped) since `DataCard`'s `title` slot replaces them. Both `briefingServerError` and `pmServerError` now render via `ErrorBox`. "Adicionar PM" gained a `PlusIcon`. Root container spacing changed `gap-8` -> `gap-section` (both resolve to the same `2rem` token). Locked section order (name -> Briefing -> PMs -> Arquivos) preserved.
- `client-files-section.tsx`: wrapped in a `DataCard` (`title="Arquivos do cliente"`, `description` built from the imported `FILE_LIMIT` constant, no re-literaled number); each listed file row gained a `FileTextIcon`; the previously-plain "Nenhum arquivo enviado ainda" text now renders as an `EmptyState` with a `FileTextIcon` icon (description also built from `FILE_LIMIT`); `uploadError` now renders via `ErrorBox`.
- Full diff review of all three form files confirms every `useForm`/`useTransition`/`useFieldArray`/handler/Server Action call (`onSubmit`, `togglePm`, `removePm`, `addPillar`, `savePmAssignment`, `handleUpload`, `handleDelete`, `createClientRecord`, `updateBriefing`, `assignPms`, `uploadClientFile`, `deleteClientFile`, `listClientFiles`) is byte-identical to before — only imports, JSX structure, and Tailwind classes changed.

## Task Commits

Each task was committed atomically:

1. **Task 4: Refino visual da tabela + listas de clientes (PM e Admin) uniformizadas** - `0e8c404` (feat)
2. **Task 5: Polimento dos formulários — criar cliente, briefing e arquivos do cliente** - `ea63e30` (feat)

## Files Created/Modified
- `components/ui/table.tsx` - Denser TableHead/TableCell rhythm, rounded-bordered table container, no sort/filter/paginate added
- `app/pm/clients/page.tsx` - PlusIcon/UsersIcon/ChevronRightIcon added, Badge -> StatusBadge, 4th chevron column
- `app/admin/clients/page.tsx` - Migrated ad-hoc shell/heading/empty-state to PageShell/PageTitle/EmptyState, now structurally identical to the PM list
- `app/pm/clients/loading.tsx` - New: PageShell + title Skeleton + TableRowsSkeleton
- `app/admin/clients/loading.tsx` - New: PageShell + title Skeleton + TableRowsSkeleton
- `app/pm/clients/[id]/loading.tsx` - New: PageShell + title Skeleton + two CardSkeleton
- `components/clients/client-create-form.tsx` - ErrorBox for serverError, PlusIcon on "Adicionar PM"
- `components/clients/client-detail-form.tsx` - Briefing + PMs atribuídos as DataCards, ErrorBox for both server errors, PlusIcon, gap-section spacing
- `components/clients/client-files-section.tsx` - DataCard wrapper, FileTextIcon per row, EmptyState for zero-files, ErrorBox for uploadError

## Decisions Made
- Picked the 4th-column chevron layout over the inline-in-name-cell alternative the plan offered (`<Link> ... ChevronRightIcon` inside the same cell as the name) — a dedicated `sr-only`-labeled column keeps the name cell's own `hover:text-primary` link target simple and matches the plan's own suggested markup verbatim; applied identically to `/pm/clients` and `/admin/clients`.
- In `client-detail-form.tsx`'s "PMs atribuídos" `DataCard`, wrapped the three conditional blocks (assigned-PM badges, admin picker dialog, error box) in an inner `<div className="flex flex-col gap-4">` — `DataCard`'s `CardContent` only supplies `px-6` padding, not a stacking gap, so this preserves the original `<section className="flex flex-col gap-4">`'s visual rhythm without touching any state/handler logic.
- `client-files-section.tsx`'s new empty-state and DataCard-description strings both interpolate the imported `FILE_LIMIT` constant rather than hardcoding "3", per the plan's explicit constraint not to re-literal the number.

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
- At spawn time this worktree's branch (`worktree-agent-ae340760fa703fe2a`) was several commits behind the plan's expected baseline (`940a3a4fe06d70a3c26f84fd9e3e4e8f6ebb9cf7`, Plan 01's completion commit) — it was still sitting on an old point in `main`'s history from before the 260728-uab split existed. Corrected via the mandatory `git reset --hard 940a3a4f...` in the worktree branch check step before any file edits; working tree was clean at the time so no work was lost.
- The plan's own overall `<verification>` step 3 (`grep -rn 'bg-destructive/10' components/clients/` must be empty) does not pass at the whole-directory level: `components/clients/client-access-panel.tsx` still has two ad-hoc `bg-destructive/10` boxes. That file is explicitly out of this plan's scope — it is not in Task 4 or Task 5's `<files>` list, not in the plan's `files_modified` frontmatter, and the plan's own `<objective>`/`<locked_decisions>` (D-03) and the orchestrator's `critical_notes` both state it belongs to Plan 03. All three files actually in Task 5's scope (`client-create-form.tsx`, `client-detail-form.tsx`, `client-files-section.tsx`) individually have zero `bg-destructive/10` occurrences (verified via per-file grep). Not a deviation on this plan's part — documented here so Plan 03's executor/verifier isn't surprised.

## Next Phase Readiness
- Plan 03 can now build on a fully-unified client-list + client-form visual layer; only `app/pm/chat/chat-panel.tsx` and `components/clients/client-access-panel.tsx` still carry the old ad-hoc badge/error-box markup, exactly as scoped to Plan 03 by D-03.
- Scope gate (`git diff --stat 0b45df7 -- 'app/**/actions.ts' 'app/api/**' 'app/auth/**' 'lib/**' 'supabase/**' middleware.ts`) returned empty after both tasks — zero business-logic/RLS/auth files touched.
- `npx tsc --noEmit` passes clean; `npx eslint` on all 9 touched files returns 0 errors (2 pre-existing `react-hooks/incompatible-library` warnings on `form.watch()` calls, unrelated to this plan's changes).

---
*Phase: quick-260728-uab*
*Completed: 2026-07-29*

## Self-Check: PASSED

All 9 claimed code files verified present on disk (3 created, 6 modified), plus this SUMMARY.md. Both task commits (`0e8c404`, `ea63e30`) confirmed present in `git log --all`.
