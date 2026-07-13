---
phase: 01-client-records-isolated-rag-setup
plan: 04
subsystem: clients
tags: [nextjs, supabase, zod, react-hook-form, tropicalia, server-actions]

requires:
  - phase: 01-client-records-isolated-rag-setup (01-02)
    provides: "clients table full record (tropicalia_project_id + briefing fields), clients_update_scoped RLS"
  - phase: 01-client-records-isolated-rag-setup (01-03)
    provides: "createClientRecord()/listPmRoster()/resolvePmNames() (lib/actions/clients.ts), clientCreateSchema, client list pages, PM Dialog+checkbox picker composition"
provides:
  - "updateBriefing()/assignPms()/retryTropicaliaProvisioning() Server Actions (lib/actions/clients.ts) alongside the three from Plan 01-03"
  - "briefingSchema/BriefingInput (lib/validation/clients.ts)"
  - "components/clients/client-detail-form.tsx: Display heading -> Briefing estratégico (useFieldArray content-pillars chips) -> PMs atribuídos (Admin-only) -> RAG status/retry"
  - "app/admin/clients/[id] and app/pm/clients/[id] detail pages"
  - "components/ui/textarea.tsx (shadcn official registry)"
  - "List pages now Link the name cell into the detail page"
affects: []

tech-stack:
  added: []
  patterns:
    - "Second precedent of the zod input/output type-identity requirement first documented in Plan 01-03: any array field with `.default([])` breaks `useForm<T>()` + `zodResolver` typed Resolver assignment — drop `.default()`, keep the field a plain required array, since every caller already supplies one."
    - "useFieldArray on a primitive string[] field via `name: \"contentPillars\" as never` (01-PATTERNS.md's documented adaptation) — fields[].id used as React key, actual displayed value read via form.watch(`contentPillars.${index}`) rather than field.value."
    - "Privileged multi-step transaction split into three distinct Server Actions (updateBriefing RLS-scoped, assignPms admin-only, retryTropicaliaProvisioning RLS-scoped) rather than one combined action — each has its own authorization boundary (RLS vs. app-layer admin check)."

key-files:
  created:
    - "components/ui/textarea.tsx"
    - "components/clients/client-detail-form.tsx"
    - "app/admin/clients/[id]/page.tsx"
    - "app/pm/clients/[id]/page.tsx"
  modified:
    - "lib/validation/clients.ts"
    - "lib/actions/clients.ts"
    - "app/admin/clients/page.tsx"
    - "app/pm/clients/page.tsx"

key-decisions:
  - "Dropped briefingSchema.contentPillars' .default([]) — same zod input/output type-identity bug documented in Plan 01-03 for clientCreateSchema.pmIds. useForm<BriefingInput>() (built from the schema's output type, a required string[]) no longer type-matched zodResolver's expected input type (string[] | undefined) once .default() was present. Every caller (Server Action's formData.getAll('contentPillars'), the form's defaultValues: { contentPillars: client.contentPillars }) already always supplies an array, so removing the default is lossless."
  - "assignPms() replaces the client's full pm_clients set (delete-all then insert) rather than diffing add/remove — simpler and sufficient at this project's scale (per the plan's own stated design), matching the plan's explicit instruction."
  - "PM-assignment chip removal and the Dialog's 'Concluir' button both call assignPms() immediately (not deferred to a page-level save) — matches the plan's read that PM reassignment is its own independent action from the briefing form's Salvar briefing button, with its own pending/error state."
  - "Ran `npm install` again in this worktree — node_modules was present when checked without an explicit `cd` (a different resolved cwd) but genuinely absent once commands consistently `cd`'d into the worktree root; `npx next build`'s Turbopack workspace-root resolution needs it locally, same precedent as Plans 01-01/01-03. Standard lockfile-driven install, not a new/unvetted package."

requirements-completed: [CLI-02, CLI-04]

duration: ~50min
completed: 2026-07-13
---

# Phase 1 Plan 04: Strategic briefing form, PM reassignment, and RAG retry Summary

**`/admin/clients/[id]` and `/pm/clients/[id]` detail pages ship the strategic briefing form (objective/tone/audience textareas + useFieldArray content-pillars chips), Admin-only PM reassignment (delete-all-then-insert via `assignPms()`), and the D-08/D-11-correct RAG retry button — all type-checked, build-clean, and served by a running dev server; the phase-gate manual walkthrough (Task 3) is handed off to the orchestrator/user per this plan's own checkpoint.**

## Performance

- **Duration:** ~50 min
- **Completed:** 2026-07-13T15:29:00Z (approx.)
- **Tasks:** 2 of 3 fully complete (Task 1: Server Actions; Task 2: detail page). Task 3 (`checkpoint:human-verify` phase-gate walkthrough) intentionally NOT performed by this agent — see Checkpoint below.
- **Files modified:** 8 (4 created, 4 modified)

## Accomplishments

- `briefingSchema`/`BriefingInput` added to `lib/validation/clients.ts` alongside `clientCreateSchema`, untouched.
- `lib/actions/clients.ts` now exports 6 functions total (grep-verified): the 3 from Plan 01-03 (`createClientRecord`, `listPmRoster`, `resolvePmNames`, all unchanged) plus this plan's 3:
  - `updateBriefing(clientId, formData)` — RLS-scoped `createClient()`, zod-whitelisted field names only passed to `.update()` (no raw `formData` spread — T-01-15 mitigated).
  - `assignPms(clientId, pmIds)` — app-layer `role === "admin" && status === "approved"` re-check server-side (T-01-16 mitigated — the UI's `viewerIsAdmin` gate is a convenience only), `createAdminClient()` full-replace write.
  - `retryTropicaliaProvisioning(clientId)` — D-11 `process.env.TROPICALIA_API_KEY` null-check precedes any `createTropicaliaProject()` call; D-08 exact catch-block error string verbatim.
- `components/ui/textarea.tsx` installed via `npx shadcn@latest add textarea` (official registry, zero new npm dependency).
- `components/clients/client-detail-form.tsx`: renders, in the UI-SPEC-locked order, `{client.name}` (Display) -> "Briefing estratégico" (Heading, three `Textarea` fields + `useFieldArray`-backed content-pillars chip list, each remove button `aria-label="Remover {pillar}"`) -> "PMs atribuídos" (Heading, chips `aria-label="Remover {name}"`, add/remove UI rendered only when `viewerIsAdmin`) -> "RAG" status (Badge Pronto/Pendente + conditional "Tentar novamente" button, present only when `canRetry` is true; D-11's "RAG setup pendente." label with zero adjacent button when false). Zero `process.env` reads in this Client Component (T-01-17 mitigated — `canRetry` crosses the Server->Client boundary as a plain boolean prop only).
- `app/admin/clients/[id]/page.tsx` / `app/pm/clients/[id]/page.tsx`: async Server Components. `notFound()` fires immediately after the RLS-scoped `clients_select_scoped` query fails, BEFORE any `createAdminClient()` read runs (T-01-18 mitigated). Fetch assigned-PM ids via `createAdminClient()` reading `pm_clients` for this client id (closing the same `pm_clients_select_own_or_admin` RLS gap Plan 01-03's `resolvePmNames()`/`listPmRoster()` already close), resolve names, fetch the roster, compute `canRetry` server-side.
- `app/admin/clients/page.tsx` / `app/pm/clients/page.tsx`: name cell now wrapped in `next/link` `Link` to `./${client.id}`, actually navigating into the new detail pages.
- `npx tsc --noEmit` exits 0; `npx next build` succeeds — route table now includes `/admin/clients/[id]` and `/pm/clients/[id]` as dynamic routes.
- Dev server started in the background from this worktree, boots cleanly (`✓ Ready in 202ms`, no `Error` lines in the log). `GET /` and `GET /login` return HTTP 200; `GET /admin/clients` and `GET /pm/clients` return HTTP 307 (expected — middleware redirects unauthenticated requests to `/login`, confirming route wiring and the auth gate both function with no runtime error).

## Task Commits

1. **Task 1: Server Actions — updateBriefing(), assignPms(), retryTropicaliaProvisioning()** — `2c40f57` (feat)
2. **Task 2: Client detail/edit page — briefing form, PM assignment, RAG status/retry** — `471d5ea` (feat)
3. **Task 3: Phase-gate walkthrough — all 4 ROADMAP Phase 1 success criteria** — NOT PERFORMED by this agent (`checkpoint:human-verify`, `gate="blocking"`). Server-side automation (dev server running, boots cleanly, key routes confirmed) is complete; the actual click-through requires a human with real seeded Admin/PM credentials — see Checkpoint below.

**Plan metadata:** (deferred — orchestrator owns the final metadata commit for worktree-mode plans per parallel-execution instructions)

## Files Created/Modified

- `lib/validation/clients.ts` - Added `briefingSchema`/`BriefingInput`
- `lib/actions/clients.ts` - Added `updateBriefing()`, `assignPms()`, `retryTropicaliaProvisioning()`
- `components/ui/textarea.tsx` - shadcn textarea (official registry)
- `components/clients/client-detail-form.tsx` - Briefing form + PM assignment + RAG status/retry (shared component)
- `app/admin/clients/[id]/page.tsx` - Admin detail/edit route wrapper
- `app/pm/clients/[id]/page.tsx` - PM detail/edit route wrapper
- `app/admin/clients/page.tsx` - Name cell now links to `./${id}`
- `app/pm/clients/page.tsx` - Name cell now links to `./${id}`

## Decisions Made

See `key-decisions` in frontmatter: (1) dropped `briefingSchema.contentPillars`' `.default([])` for the same zod type-identity reason as Plan 01-03's `pmIds` fix; (2) `assignPms()` does a full delete-then-insert replace, not a diff; (3) PM-chip removal and the picker's "Concluir" both save immediately via `assignPms()`, independent of the briefing form's own save button; (4) ran `npm install` again in this worktree for Turbopack's local `node_modules` requirement.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] `briefingSchema.contentPillars`'s `.default([])` broke `useForm<BriefingInput>()`'s zodResolver typing**
- **Found during:** Task 2 (`npx tsc --noEmit`)
- **Issue:** With `.default([])` on `contentPillars`, the schema's input type (`string[] | undefined`) diverged from its output type (`string[]`, what `BriefingInput = z.infer<...>` and `useForm<BriefingInput>()` are built from). `zodResolver(briefingSchema)`'s `Resolver<...>` type parameter then no longer matched what `useForm`/`useFieldArray`/`form.handleSubmit` expected, producing 5 distinct TS2322/TS2345 errors.
- **Fix:** Removed `.default([])` from `contentPillars` in `lib/validation/clients.ts`, making it a plain required `z.array(z.string().trim().min(1))`. Every actual caller (the Server Action's `formData.getAll("contentPillars")`, always an array even if empty; the form's `defaultValues: { contentPillars: client.contentPillars }`, always an array from the DB's `not null default '{}'` column) already supplies an array unconditionally.
- **Files modified:** `lib/validation/clients.ts` (bundled into Task 2's commit `471d5ea`, since the type error only surfaced once Task 2 wired the schema into `useForm`/`useFieldArray`; Task 1's own `npx tsc --noEmit` gate passed because Task 1 never constructs a typed `useForm<BriefingInput>()`).
- **Verification:** `npx tsc --noEmit` exits 0 after the fix; `npx next build` succeeds.
- **Committed in:** `471d5ea`

**2. [Rule 3 - Blocking] `node_modules` absent when consistently `cd`'d into this worktree, blocking `next build`'s Turbopack workspace-root resolution**
- **Found during:** Task 2 verification (`npx next build`)
- **Issue:** Same class of gap documented in Plans 01-01/01-03 — Turbopack's `next build` explicitly refuses to resolve packages outside the pinned worktree root when `node_modules` isn't present locally.
- **Fix:** Ran `npm install` from the existing, already-committed `package-lock.json` — standard lockfile-driven install of already-declared dependencies, excluded from the package-install checkpoint rule per the established precedent.
- **Files modified:** None tracked (`node_modules/` is gitignored).
- **Verification:** `npx next build` succeeds afterward, producing all routes including the two new `[id]` dynamic routes.
- **Committed in:** N/A (no file change; `node_modules` is gitignored)

---

**Total deviations:** 2 auto-fixed (1 Rule 1 type bug, 1 Rule 3 environment-setup gap). Neither changed the plan's functional scope — both are mechanical corrections needed to make the plan's own acceptance criteria (`npx tsc --noEmit && npx next build`) actually pass.
**Impact on plan:** None on functional scope. `briefingSchema`'s runtime validation behavior (content pillars: array of non-empty trimmed strings, empty array valid) is unchanged — only its TypeScript-level input/output type shape was corrected.

## Issues Encountered

- Same `node_modules`-presence inconsistency documented in the Deviations section above — resolved by `npm install`, no scope impact.
- `.env.local` was already present in this worktree at plan start (carried over from Plans 01-01/01-02/01-03), including a real (though still-empty per this run's environment) `TROPICALIA_API_KEY=` — matching this plan's D-11 default-state expectation. `canRetry` therefore evaluates to `false` for every existing client in this run's environment; the D-08 "Tentar novamente" button path was implemented and type/build-checked but not exercised against a live Tropicalia call.

## User Setup Required

None beyond what prior plans already required. `.env.local` has all required values in this worktree.

## Next Phase Readiness

- Phase 1's full client-record lifecycle promise ("create it, then fill and edit its strategic briefing") is implemented end-to-end in code: `createClientRecord()` (01-03) -> `updateBriefing()`/`assignPms()`/`retryTropicaliaProvisioning()` (this plan) -> detail pages rendering and persisting all of it.
- **Task 3 of this plan — the phase-gate manual walkthrough of all 4 ROADMAP Phase 1 success criteria — was intentionally NOT performed by this agent.** It requires a live browser session with real seeded Admin/PM credentials and human judgment (visual confirmation, RLS-boundary probing by navigating to another PM's client id, etc.) — the same category of deferred step Plans 01-01 and 01-03 each left for their own human-verify steps. A dev server is running and confirmed healthy (see Checkpoint below) so the walkthrough can start immediately.
- No blockers for the phase-gate walkthrough itself, other than it needing a human.
- `TROPICALIA_API_KEY` remains empty in this worktree's `.env.local` — the walkthrough's CLI-03 sub-step 4 (key-present success case) is expected to be deferred as an open item per this plan's own `<how-to-verify>` text, unless Juliano has supplied the real key by the time the walkthrough runs.

## Known Stubs

None. Every code path in this plan is fully wired to live Supabase data — no hardcoded empty values or placeholder UI text stand in for unimplemented functionality.

## Threat Flags

None beyond what this plan's own `<threat_model>` already covers (T-01-15 through T-01-18, T-01-SC) — all mitigations were implemented exactly as specified and grep-verified: `updateBriefing()` never spreads raw `formData` (T-01-15), `assignPms()` re-checks `role === "admin"` server-side regardless of UI state (T-01-16), `client-detail-form.tsx` has zero `process.env` reads (T-01-17), both detail pages call `notFound()` before any `createAdminClient()` read (T-01-18), `textarea` installed from the official shadcn registry with zero new npm dependency (T-01-SC).

## Self-Check: PASSED

- FOUND: lib/validation/clients.ts
- FOUND: lib/actions/clients.ts
- FOUND: components/ui/textarea.tsx
- FOUND: components/clients/client-detail-form.tsx
- FOUND: app/admin/clients/[id]/page.tsx
- FOUND: app/pm/clients/[id]/page.tsx
- FOUND commit: 2c40f57 (Task 1)
- FOUND commit: 471d5ea (Task 2)

---
*Phase: 01-client-records-isolated-rag-setup*
*Completed: 2026-07-13*
