---
phase: 03-content-production-kanban
plan: 09
subsystem: ui
tags: [nextjs, react, react-hook-form, zod, radix-select, kanban, board-panel]

# Dependency graph
requires:
  - phase: 03-content-production-kanban
    plan: 07
    provides: "createCard extended with stage/description/assigneeId + D-15 snapshot-on-create, updateCardDetails Server Action, listClientPmRoster"
  - phase: 03-content-production-kanban
    plan: 08
    provides: "DndContext-wrapped board-panel.tsx with DroppableColumn column headers and DraggableCard wrapper"
provides:
  - "app/pm/board/page.tsx: card query extended with description/assignee_id, per-client PM roster load (listClientPmRoster), and assignee id resolution folded into the existing resolvePmNames batch call"
  - "app/pm/board/board-panel.tsx: CreateCardDialog (generalised from CreateCardButton) with per-column '+' triggers, optional multi-line description field, and a client-scoped assignee Select using the NONE_VALUE sentinel pattern"
  - "app/pm/board/board-panel.tsx: BoardCardItem detail Dialog gains Descrição and Responsável sections with a single 'Salvar alterações' save calling updateCardDetails"
affects: ["03-04 (Google Drive attachments — touches the same board-panel.tsx/actions.ts surface)", "03-05 and 03-06 (also build on the same board files)"]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "CreateCardDialog generalised from a single-purpose CreateCardButton into a reusable Dialog taking an explicit trigger element, letting the same create form serve the top-level button, the empty-state action, and five per-column '+' triggers"
    - "NONE_VALUE='none' Radix Select sentinel (established in 03-01) reused for both the create-form assignee picker and the detail-dialog assignee picker, mapped to null/undefined at the Server Action boundary"
    - "Detail-dialog save button disabled via a has-changed comparison against the card's current description/assignee, giving a clear 'nothing to save' affordance"

key-files:
  created: []
  modified:
    - app/pm/board/page.tsx
    - app/pm/board/board-panel.tsx

key-decisions:
  - "Tasks 1-2's diff was produced by a prior executor session that stalled before committing; the orchestrator recovered the uncommitted working-tree diff (already verified clean via tsc/lint/test) and committed it as-is at 9052224, then this continuation session ran an independent verification pass against every Task 1/2 acceptance criterion rather than re-executing the tasks"
  - "The per-column '+' trigger is icon-only with a mandatory aria-label ('Criar card em {rótulo}'), following the same accessibility rule already established for the remove-attachment trigger in 03-UI-SPEC.md"
  - "Description stays out of the board face entirely (D-17) — the detail dialog is the only surface that ever renders card.description as content"

requirements-completed: [KAN-01, KAN-03]

# Metrics
duration: ~20min (continuation session — Tasks 1-2 recovered/committed by the orchestrator before this session started; this session ran the acceptance-criteria verification pass, handled the Task 3 human-verify checkpoint, and wrote this summary)
completed: 2026-07-31
---

# Phase 3 Plan 09: Per-Column Create, Description, and Assignee Fields Summary

**Per-stage "+" create triggers (D-14), a description-only-in-detail-dialog field (D-16/D-17/D-18), and a client-scoped optional assignee (D-19) added to the existing board data load and `board-panel.tsx`, closing the 2026-07-31 mid-execution re-scope's UI side.**

## Status: COMPLETE (3 of 3 tasks)

Tasks 1 and 2 were produced by a prior executor session that stalled (a runtime issue, not a code defect) before it could commit its work. The orchestrator recovered the uncommitted diff from that session, confirmed it was clean via `tsc`/`lint`/`test`, and committed it as `9052224`. This continuation session then ran an independent verification pass — checking the recovered code against every Task 1 and Task 2 acceptance criterion (greps, literal copy strings, the D-17 board-face non-disclosure rule, and cross-client roster isolation) — before handing the running app to the developer for Task 3's `checkpoint:human-verify`. The developer walked all 12 numbered steps and replied "approved."

## Accomplishments

- `app/pm/board/page.tsx`: the `cards` select now reads `description` and `assignee_id` alongside the existing columns; `listClientPmRoster(clientId)` is folded into the same `Promise.all` as the other board reads; the assignee ids feed the same `resolvePmNames` batch call already used for `completed_by` (03-03), so an assignee unassigned from the client after the fact still resolves to a display name instead of a bare uuid
- `app/pm/board/board-panel.tsx`: `CreateCardButton` generalised into `CreateCardDialog({ clientId, stage?, pmRoster, trigger })` — the same Dialog now serves three call sites: the top-level "Criar card" button (still defaults to Briefing, D-14), the "Nenhum card ainda" empty-state action, and a new icon-only "+" in every column header (`aria-label="Criar card em {STAGE_LABELS[stage]}"`)
- The create form gained an optional `Descrição` `Textarea` and a `Responsável` `Select` using the `NONE_VALUE="none"` sentinel pattern from 03-01, with a "Nenhum PM atribuído a este cliente." fallback message when the client's roster is empty
- The card detail Dialog gained `Descrição` and `Responsável` sections between the stage badge and the checklist block, both bound to local draft state and saved together via a single `Salvar alterações` button calling `updateCardDetails`; the button is disabled until either field actually differs from the card's persisted values
- The board card's `meta` line now reads `Criado em {data} · Responsável: {nome}` when assigned, `Criado em {data}` otherwise — the description is never rendered on the board face (D-17)
- Drag-and-drop (03-08) and the `Avançar` gate button are both untouched by this plan — confirmed by `git diff --stat` against `app/pm/board/actions.ts`, `draggable-card.tsx`, and `droppable-column.tsx` being empty across both tasks

## Task Commits

1. **Task 1: Extend the board data load and add the per-column create triggers with the richer create form** — `9052224` (feat, recovered and committed by the orchestrator from a stalled prior session)
2. **Task 2: Add the Descrição and Responsável sections to the card detail Dialog and the assignee line to the board card** — `9052224` (feat, same commit — the stalled session had completed both tasks' code before it stopped, so the recovered diff covers both)
3. **Task 3: Human verification** — CONFIRMED by developer 2026-07-31 (all 12 steps, including per-column creation landing in the correct stage, the D-15 snapshot on direct gated creation, the board-face non-disclosure of the description, and client-scoped assignee isolation across a client switch); no task commit, verification only

## Files Created/Modified

- `app/pm/board/page.tsx` (149 lines) — `description`/`assignee_id` added to the cards select, `listClientPmRoster` call, assignee ids folded into `resolvePmNames`
- `app/pm/board/board-panel.tsx` (840 lines) — `CreateCardDialog`, per-column "+" triggers, `Descrição`/`Responsável` create-form fields, detail-dialog `Descrição`/`Responsável` sections with `Salvar alterações`, board-card meta line assignee suffix

## Decisions Made

See `key-decisions` in the frontmatter above. In summary: the recovered diff was verified rather than redone; the "+" trigger reuses the existing icon-only aria-label convention; and the description is structurally excluded from every board-face code path (no `description` prop passed to `DataCard` on a board card, confirmed by grep).

## Deviations from Plan

### Recovered session work (not a Rule 1-4 deviation, documented for traceability)

Tasks 1 and 2's implementation was produced by an executor session that stalled (a runtime issue) before it could run its commit step. The orchestrator recovered the uncommitted working-tree diff from that stalled session — already independently confirmed clean via `tsc --noEmit`, `lint`, and `test` — and committed it as-is at `9052224`. A separate verification pass in a follow-up session then explicitly checked the recovered code against every Task 1 and Task 2 acceptance criterion:

- `app/pm/board/page.tsx` contains `listClientPmRoster`, `assignee_id`, and `description` — confirmed.
- `app/pm/board/board-panel.tsx` contains `CreateCardDialog` at 4 occurrences (definition + 3 call sites) — confirmed.
- The literal copy strings `Criar card em `, `O card será criado na etapa `, `Sem responsável`, `Nenhum PM atribuído a este cliente.`, `Opcional — contexto, briefing rápido, referências.`, `Descrição`, `Responsável`, `Sem descrição.`, `Salvar alterações`, `Salvando...`, `Card atualizado.`, and `Responsável: ` all present — confirmed.
- D-17 board-face non-disclosure: `description={` returns 0 occurrences in `board-panel.tsx` — the description is never passed to `DataCard` on a board card — confirmed.
- Cross-client isolation: `listClientPmRoster` performs its RLS visibility check on `clients` before any privileged read (shipped in 03-07, re-confirmed unmodified by this plan) — confirmed by the developer at Task 3 step 11 (switching clients changes the Responsável options with no cross-client bleed).
- `git diff --stat app/pm/board/actions.ts app/pm/board/draggable-card.tsx app/pm/board/droppable-column.tsx` empty across both tasks — confirmed.

**One minor grep-count discrepancy, judged not a real defect:** the plan's Task 1 acceptance criterion expects `grep -c 'resolvePmNames' app/pm/board/page.tsx` to return 1 ("a single combined call, not two"). The actual count is 2 — one for the `import` statement and one for the call site itself. The behavioral intent of the criterion (a single combined `resolvePmNames` invocation covering both `completed_by` and `assignee_id` ids, rather than two separate calls) is satisfied — there is exactly one call site. The grep simply also matches the import line naming the same identifier. No code change was made for this; it is a test-assertion artifact, not a functional gap.

## Issues Encountered

None beyond the recovered-session note above. `npx tsc --noEmit`, `npm run lint`, and `npm test` all pass against the recovered code (re-confirmed by the orchestrator before this continuation session started).

## User Setup Required

None — no external service configuration required.

## Next Phase Readiness

- `app/pm/board/board-panel.tsx` is now at 840 lines with `DndContext`, the five per-column create triggers, and the extended detail dialog all in place. Plan 03-04 (Google Drive attachments) and plans 03-05/03-06 all touch this same file and `app/pm/board/actions.ts` — they should read the current `BoardCardItem`/`CreateCardDialog` structure carefully before adding markup, since the detail dialog's flex-col section stack now has four sibling blocks (stage badge, Descrição, Responsável, checklist) instead of two.
- `app/pm/board/page.tsx`'s `Promise.all` now batches four reads (cards, checklist items, PM roster, resolved names) — any future plan adding another per-client read should fold into the same batch rather than awaiting separately, per the pattern established across 03-03/03-07/03-09.
- This closes the three-plan mid-execution re-scope (03-07 server, 03-08 drag-and-drop, 03-09 rich cards) recorded as D-12 through D-19 in `03-CONTEXT.md`. Phase 3's remaining plans can now treat `stage`, `description`, and `assignee_id` as stable, fully-wired card fields.

---
*Phase: 03-content-production-kanban*
*Completed: 2026-07-31*

## Self-Check: PASSED

- FOUND: app/pm/board/page.tsx
- FOUND: app/pm/board/board-panel.tsx
- FOUND: .planning/phases/03-content-production-kanban/03-09-SUMMARY.md
- FOUND commit: 9052224 (Task 1 + Task 2, recovered)
