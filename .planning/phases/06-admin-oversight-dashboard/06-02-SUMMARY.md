---
phase: 06-admin-oversight-dashboard
plan: 02
subsystem: ui
tags: [nextjs, react, supabase, admin-dashboard, filters]

requires:
  - phase: 06-admin-oversight-dashboard
    provides: "06-01's app/admin/page.tsx loader + app/admin/oversight-panel.tsx table (OversightClient/OversightCard types)"
provides:
  - "lib/cards/oversight-filters.ts: pure, injection-safe ?client=/?pm= parsing + href builder (ADM-03 client half already shipped in 06-01 as row drill-down; this closes the PM half)"
  - "lib/cards/workload.ts: pure per-person active-card aggregation with per-stage breakdown (D-04)"
  - "app/admin/page.tsx + app/admin/oversight-panel.tsx: two URL-backed filter Selects + 'Carga de trabalho' panel"
affects: [06-03]

tech-stack:
  added: []
  patterns:
    - "PostgREST .or() filter strings only ever receive values that already passed a strict UUID regex — the pattern for any future raw-filter-string usage on this page"
    - "Workload query is a third, filter-independent Promise.all branch: operation-wide aggregates must not silently inherit the page's own display filters"

key-files:
  created:
    - lib/cards/oversight-filters.ts
    - lib/cards/oversight-filters.test.ts
    - lib/cards/workload.ts
    - lib/cards/workload.test.ts
  modified:
    - app/admin/page.tsx
    - app/admin/oversight-panel.tsx

key-decisions:
  - "listPmRoster/listEditorRoster/computeWorkload each appear on 2 lines (import + call) rather than the plan's literal 'grep -c returns 1' — the plan's acceptance-criteria grep didn't account for the import statement; each function is still called exactly once, which is the actual intent"

patterns-established:
  - "Pure filter-parsing + pure aggregation modules both follow lib/cards/stages.ts's I/O-free, node:test-covered convention, matching 06-01's staleness.ts"

requirements-completed: [ADM-01, ADM-03]

duration: ~40min
completed: 2026-08-14
---

# Phase 6 Plan 2: Filters & Workload Panel Summary

**`/admin` now has two URL-backed filter Selects (client, person) that narrow the oversight table without a page reload, and a "Carga de trabalho" table below it showing every PM/Editor's active-card count with a per-stage chip breakdown.**

## Performance

- **Duration:** ~40 min (includes a stalled first attempt recovered inline by the orchestrator — see Issues Encountered)
- **Completed:** 2026-08-14
- **Tasks:** 2/2
- **Files modified:** 6 (4 created, 2 modified)

## Accomplishments
- Pure `lib/cards/oversight-filters.ts` (`parseOversightFilters`, `buildOversightHref`) rejects the `"all"` Select sentinel, empty/whitespace values, and a literal PostgREST filter-injection payload — only a strict UUID reaches the `.or()` template literal in `app/admin/page.tsx` (T-06-06)
- `/admin` gained two `Select` filters (client, person) wired to `router.push(buildOversightHref(...))`, each preserving the other filter's current value; a person filter matches cards held via either `assignee_id` or `media_assignee_id`
- Distinct "Nenhum card encontrado" empty state for a zero-result filter, separate from 06-01's "Nenhum card ainda"
- Pure `lib/cards/workload.ts` (`computeWorkload`) with the asymmetric attribution rule: a PM row counts only `assignee_id`, an Editor row counts only `media_assignee_id` — the same card is never double-counted under two people
- A third, filter-independent `cards` query (`card_type in (single, piece)`, `publish_at is null`) feeds the workload panel so it always reads operation-wide, regardless of the two filters above it (T-06-09, called out for 06-03's live checkpoint)
- "Carga de trabalho" table renders below the main table: `Pessoa` / `Cards ativos` / `Distribuição por etapa` (one neutral `StatusBadge` chip per non-empty stage, `STAGE_ORDER` order), omitting anyone with zero active cards

## Task Commits

Each task was committed atomically:

1. **Task 1: Injection-safe filter module + both filter Selects wired to the URL** - `bbb3a41` (feat)
2. **Task 2: Workload panel — active cards per PM/Editor by stage** - `bacf6bb` (feat)

_Note: no plan-metadata commit is included here — this plan ran in a parallel worktree, so STATE.md/ROADMAP.md updates are owned by the orchestrator after merge._

## Files Created/Modified
- `lib/cards/oversight-filters.ts` - Pure `parseOversightFilters`/`buildOversightHref`, strict UUID guard
- `lib/cards/oversight-filters.test.ts` - node:test coverage: no-params, valid UUID, `"all"` sentinel, injection payload, empty/whitespace, uppercase-hex UUID, both-filters, all four `buildOversightHref` combinations
- `lib/cards/workload.ts` - Pure `computeWorkload`: asymmetric PM/Editor attribution, `STAGE_ORDER`-derived `byStage`, zero-row omission, total-desc/email-asc sort
- `lib/cards/workload.test.ts` - node:test coverage: PM-only attribution, Editor-only attribution, same-id-in-both-columns asymmetry, zero-card omission, `byStage` ordering, total-sum invariant, sort order, empty `people`/`cards`
- `app/admin/page.tsx` - Added `searchParams` prop + `parseOversightFilters`; `.eq("client_id", ...)` and `.or("assignee_id.eq...,media_assignee_id.eq...")` on the main query; a third filter-independent workload query; `computeWorkload(people, workloadCards)` call; `isActiveStage` extracted as a shared helper between the main and workload card narrowing
- `app/admin/oversight-panel.tsx` - Two `Select` filters wired to `buildOversightHref` + `router.push`; branched empty state; "Carga de trabalho" `SectionTitle` + table appended inside `PageShell`

## Decisions Made
- Extracted `isActiveStage(clientId, stage)` as a small shared helper (used by both `isActiveCard` for the main query and the workload query's inline filter) instead of duplicating the non-archived-client + non-null-stage narrowing verbatim in a second place, per the plan's explicit instruction to avoid duplication.
- Three of the plan's acceptance-criteria greps (`listPmRoster`, `listEditorRoster`, `computeWorkload` "returns 1") were written assuming a single matching line, but each name legitimately appears on two lines — its import and its one call site. Verified via `grep -n` that each function is called exactly once; treated the grep count itself as an authoring imprecision in the plan (Rule 1 category), not a defect to work around.

## Deviations from Plan

**Execution path deviation (orchestrator-level, not a plan/behavior deviation):** the first executor attempt for this plan stalled mid-Task-1 (no progress for 600s) after committing only the TDD RED commit (`test(06-02): add failing test for oversight filter parsing`) and leaving Task 1's implementation uncommitted-but-written in the worktree. The orchestrator inspected the stalled worktree, verified the uncommitted work was substantive and correct (the filter module, its test file, and both `page.tsx`/`oversight-panel.tsx` wiring were already complete and matched the plan), ran the full verification suite against it, and continued the plan inline in that same worktree rather than discarding the work and restarting from scratch. Task 1 was committed as-is; Task 2 (workload panel) was then written and committed following the same plan. No plan requirements, behavior, or scope changed as a result — this is a recovery-path note, not a deviation from what was built.

## Issues Encountered
- Same known, previously-documented worktree limitation as 06-01: `npm run build` cannot complete inside this isolated git worktree (Turbopack cannot resolve `next/package.json` from the nested worktree directory). `npx tsc --noEmit`, `npm run lint`, and `npm test` all ran clean with zero errors/regressions (185/185 tests passing after Task 2, up from 164 after 06-01) for both tasks. Orchestrator should run `npm run build` post-merge, per established precedent.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness
- `/admin` now fully satisfies ADM-01/ADM-02/ADM-03 and D-04: cross-client table, staleness, drill-down, client/PM filters, and the workload panel are all in place for 06-03's phase-gate live checkpoint to exercise end-to-end.
- T-06-09 (workload panel intentionally ignores the two filters above it) is called out explicitly here so 06-03's live checkpoint script can confirm the behaviour rather than a developer discovering it fresh.

---
*Phase: 06-admin-oversight-dashboard*
*Completed: 2026-08-14*

## Self-Check: PASSED

All 4 claimed files verified present on disk; all commits (`94c1c21`, `bbb3a41`, `bacf6bb`, `74fb2c6`) verified present in `git log`.
