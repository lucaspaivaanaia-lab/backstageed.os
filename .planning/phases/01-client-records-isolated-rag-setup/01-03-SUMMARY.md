---
phase: 01-client-records-isolated-rag-setup
plan: 03
subsystem: clients
tags: [nextjs, supabase, zod, react-hook-form, tropicalia, server-actions]

requires:
  - phase: 01-client-records-isolated-rag-setup (01-01)
    provides: "/login page and dev-auth session prerequisite"
  - phase: 01-client-records-isolated-rag-setup (01-02)
    provides: "clients table full record (tropicalia_project_id + briefing fields), is_pm() helper, clients_insert_admin_or_pm/clients_update_scoped RLS"
provides:
  - "createClientRecord() privileged multi-step transaction (lib/actions/clients.ts) — clients insert + pm_clients insert + conditional Tropicalia provisioning"
  - "listPmRoster()/resolvePmNames() read-only display helpers closing the profiles/pm_clients RLS gap for PM roster and assigned-PM-name display"
  - "createTropicaliaProject() server-only fetch wrapper (lib/tropicalia/client.ts), stores response.public_id"
  - "clientCreateSchema (lib/validation/clients.ts)"
  - "/admin/clients and /pm/clients list pages with RAG/briefing status badges"
  - "/admin/clients/new and /pm/clients/new client creation form (Dialog+checkbox PM multi-select)"
affects: [01-04]

tech-stack:
  added: []
  patterns:
    - "Privileged multi-step transaction: app-layer role/status authorization check via RLS-scoped createClient() happens BEFORE any createAdminClient() write (Pattern 2)"
    - "Server-only Tropicalia fetch wrapper with AbortSignal.timeout(10s), never imports from a Client Component (Pattern 3)"
    - "react-hook-form + zodResolver + shadcn Form/FormField for multi-field forms (first use of components/ui/form.tsx in this codebase)"
    - "zod schema fields must keep input/output types identical (no bare .default()) when the schema also drives a typed useForm<T>() + zodResolver — otherwise TS raises a Resolver<...> type mismatch"

key-files:
  created:
    - "lib/validation/clients.ts"
    - "lib/tropicalia/client.ts"
    - "lib/actions/clients.ts"
    - "components/ui/checkbox.tsx"
    - "app/admin/clients/page.tsx"
    - "app/pm/clients/page.tsx"
    - "components/clients/client-create-form.tsx"
    - "app/admin/clients/new/page.tsx"
    - "app/pm/clients/new/page.tsx"
  modified: []

key-decisions:
  - "Dropped clientCreateSchema.pmIds' `.default([])` — with zod v4 + zodResolver v5, a field carrying `.default()` produces a schema whose *input* type is `T | undefined` while its *output* type (z.infer) is `T`; useForm<ClientCreateInput>() (built from the output type) then no longer type-matches zodResolver's expected input type, and TS refuses to compile. Since every caller (Server Action's `formData.getAll('pmIds')`, the form's `defaultValues: { pmIds: [currentUserId] }`) already always supplies an array, no default was needed in practice — removing it keeps input/output identical and resolves the mismatch losslessly."
  - "node_modules was absent in this fresh worktree (same gap 01-01-SUMMARY documented) — ran `npm install` from the existing package-lock.json to enable `npx next build`'s Turbopack workspace-root resolution (tsc alone tolerated the gap via Node's walk-up module resolution into the parent repo's node_modules, but Turbopack explicitly refuses to resolve outside the pinned worktree root). Standard lockfile-driven install of already-declared dependencies, not a new/unvetted package — excluded from the package-install checkpoint rule."
  - "TROPICALIA_API_KEY confirmed present but empty in .env.local (orchestrator-provided) — matches the plan's stated expectation that D-11's key-absent path is the default state right now. createClientRecord()'s conditional Tropicalia block was implemented and type-checks/builds correctly but was not exercised end-to-end against a live Tropicalia call in this run (no key to call with)."

requirements-completed: [CLI-01, CLI-02, CLI-03]

duration: ~45min
completed: 2026-07-13
---

# Phase 1 Plan 03: Client creation, PM assignment, and Tropicalia auto-provisioning Summary

**Sub-phase 1A delivered end-to-end: `createClientRecord()`'s privileged transaction (clients insert + pm_clients insert + conditional Tropicalia provisioning storing `public_id`) is wired to real `/admin/clients` and `/pm/clients` list pages and a `/admin/clients/new` / `/pm/clients/new` creation form with a Dialog+checkbox PM multi-select — all type-checked and build-clean.**

## Performance

- **Duration:** ~45 min
- **Completed:** 2026-07-13T15:18:00Z (approx.)
- **Tasks:** 3 of 3 complete
- **Files modified:** 9 created, 0 modified (excluding the mid-plan zod schema fix, tracked as a deviation within Task 3's own commit)

## Accomplishments

- `lib/validation/clients.ts`: `clientCreateSchema` (`name` + `pmIds`), input/output types kept identical for `useForm`/`zodResolver` compatibility.
- `lib/tropicalia/client.ts`: `createTropicaliaProject()` server-only wrapper, `AbortSignal.timeout(10_000)`, stores `response.public_id` — zero `.project_id` property accesses anywhere in the file (grep-verified).
- `lib/actions/clients.ts`: `createClientRecord()` — app-layer `profiles.status === "approved" && role in ("admin","pm")` authorization check runs before any `createAdminClient()` write; always links the creating user plus any explicitly selected PMs; Tropicalia provisioning is gated on `process.env.TROPICALIA_API_KEY` and never rolls back client creation on failure (D-08/D-11). `listPmRoster()`/`resolvePmNames()` read-only privileged reads for display purposes only.
- `components/ui/checkbox.tsx` installed via `npx shadcn@latest add checkbox` (official registry, zero new npm dependency — confirmed by 01-UI-SPEC.md Registry Safety).
- `app/admin/clients/page.tsx` / `app/pm/clients/page.tsx`: near-identical Server Components, zero additional app-layer filtering beyond the RLS-scoped `clients` query (D-12 — verified no `.eq("pm_id"` or manual filter in either file), correct badge copy (Pronto/Pendente/Vazio/Preenchido), matching empty-state copy.
- `components/clients/client-create-form.tsx` + two thin wrapper pages: `useForm` + `zodResolver(clientCreateSchema)`, Dialog+checkbox PM picker pre-selecting the creator, removable chips with `aria-label="Remover {email}"`, submission inside `startTransition`, redirect to `${basePath}/${clientId}` on success.
- `npx tsc --noEmit` exits 0; `npx next build` succeeds (Turbopack), producing dynamic routes for `/admin/clients`, `/admin/clients/new`, `/pm/clients`, `/pm/clients/new`.
- Verified via grep across the whole codebase: `pm_clients` is only ever written to inside `createClientRecord()` via `createAdminClient()` — every other reference is a read (RLS-scoped nested select in the list pages, or reads inside `resolvePmNames()`).

## Task Commits

1. **Task 1: Validation schema, Tropicalia wrapper, and the privileged createClientRecord() transaction** — `3742dd7` (feat)
2. **Task 2: Client list pages (Admin + PM) with status badges** — `9dd9717` (feat)
3. **Task 3: Client creation form (shared component + Admin/PM route wrappers) with PM multi-select** — `ba37b62` (feat)

**Plan metadata:** (deferred — orchestrator owns the final metadata commit for worktree-mode plans per parallel-execution instructions)

## Files Created/Modified

- `lib/validation/clients.ts` - `clientCreateSchema`/`ClientCreateInput`
- `lib/tropicalia/client.ts` - `createTropicaliaProject()`, `TropicaliaProject` type
- `lib/actions/clients.ts` - `createClientRecord()`, `listPmRoster()`, `resolvePmNames()`
- `components/ui/checkbox.tsx` - shadcn checkbox (official registry)
- `app/admin/clients/page.tsx` - Admin client list
- `app/pm/clients/page.tsx` - PM client list
- `components/clients/client-create-form.tsx` - shared creation form + PM multi-select
- `app/admin/clients/new/page.tsx` - Admin creation route wrapper
- `app/pm/clients/new/page.tsx` - PM creation route wrapper

## Decisions Made

See `key-decisions` in frontmatter: (1) dropped `clientCreateSchema.pmIds`' `.default([])` to keep zod input/output types identical for `useForm<ClientCreateInput>()` + `zodResolver` compatibility; (2) ran `npm install` in this fresh worktree (node_modules absent, same gap as 01-01) to satisfy Turbopack's stricter same-directory node_modules requirement for `next build`; (3) confirmed `TROPICALIA_API_KEY` is present-but-empty in this worktree's `.env.local`, matching the plan's stated D-11 default-state expectation — the conditional provisioning block is implemented and compiles but was not exercised against a live Tropicalia call this run.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] `clientCreateSchema.pmIds`'s `.default([])` broke `useForm<ClientCreateInput>()`'s zodResolver typing**
- **Found during:** Task 3
- **Issue:** With `.default([])` on the `pmIds` field, zod's input type (`string[] | undefined`) diverged from its output type (`string[]`, used by `ClientCreateInput = z.infer<...>`). `useForm<ClientCreateInput>({ resolver: zodResolver(clientCreateSchema) })` then failed to type-check — `zodResolver`'s `Resolver<...>` type parameter expected the schema's *input* type, which no longer matched the *output* type the form was typed against.
- **Fix:** Removed `.default([])` from `pmIds` in `lib/validation/clients.ts`, making it a plain required `z.array(z.string().uuid())`. Every actual caller (the Server Action's `formData.getAll("pmIds")`, which always returns an array even if empty; the form's `defaultValues: { pmIds: [currentUserId] }`) already supplies an array unconditionally, so the default was never functionally necessary.
- **Files modified:** `lib/validation/clients.ts`
- **Verification:** `npx tsc --noEmit` exits 0 after the fix; `npx next build` succeeds.
- **Committed in:** `ba37b62` (bundled into Task 3's commit, since the type error only surfaced once Task 3 wired the schema into `useForm`)

**2. [Rule 3 - Blocking] `node_modules` absent in this fresh worktree, blocking `next build`'s Turbopack workspace-root resolution**
- **Found during:** Task 3 verification (`npx next build`)
- **Issue:** `npx tsc --noEmit` succeeded even without a local `node_modules` (Node's classic module resolution walks up into the parent repo checkout's `node_modules`), but Turbopack's `next build` explicitly refuses to resolve packages outside the pinned worktree root (`turbopack.root` in `next.config.ts`), erroring "we couldn't find the Next.js package... files outside of the project directory will not be compiled."
- **Fix:** Ran `npm install` from the existing, already-committed `package-lock.json` — a standard lockfile-driven install of already-declared dependencies (same precedent documented in 01-01-SUMMARY.md), not a new/unvetted package. Excluded from the package-install checkpoint rule per that precedent.
- **Files modified:** None tracked (`node_modules/` is gitignored).
- **Verification:** `npx next build` succeeds afterward, producing all 4 new routes.
- **Committed in:** N/A (no file change; `node_modules` is gitignored)

---

**Total deviations:** 2 auto-fixed (1 Rule 1 type bug, 1 Rule 3 environment-setup gap). Neither changed the plan's scope or intended behavior — both are mechanical corrections (schema type shape, local dev-environment setup) needed to make the plan's own acceptance criteria (`npx tsc --noEmit && npx next build`) actually pass.
**Impact on plan:** None on functional scope. `clientCreateSchema`'s runtime validation behavior (required array of UUID strings, empty array is valid input) is unchanged — only its TypeScript-level input/output type shape was corrected.

## Issues Encountered

- Same `node_modules`-absence gap as Plan 01-01 (documented there as an "Issues Encountered" item, not a deviation) — this worktree is a fresh checkout and does not carry over the main repo's `node_modules`. Resolved by `npm install`, see Deviations above.
- `.env.local` was already present in this worktree at plan start (the orchestrator's copy from Plan 01-01/01-02 persisted), including a `TROPICALIA_API_KEY=` line with an empty value — matching the plan's stated expectation exactly, no gap to flag.

## User Setup Required

None. All required env vars (`SUPABASE_SECRET_KEY`, `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`) were already present and populated in `.env.local`. `TROPICALIA_API_KEY` remains an intentionally empty placeholder — Juliano has not yet supplied the real key; once he does, `createClientRecord()`'s conditional block activates automatically with zero code changes (D-11's designed behavior).

## Next Phase Readiness

- Sub-phase 1A's own definition of done ("client created, PM linked, Tropicalia project auto-provisioned") is implemented end-to-end in code: a real Admin or PM can create a client from `/admin/clients/new` or `/pm/clients/new`, the creating PM is always linked via `pm_clients`, and the client immediately appears in that PM's own `/pm/clients` list (RLS-scoped, zero app-layer filtering).
- The MANUAL verification step from this plan's own `<verification>` block ("create a client as the seeded PM — confirm it appears in that PM's own `/pm/clients` list immediately, and NOT in another (unassigned) PM's list") was NOT performed by this agent — it requires a live browser session against the running dev server and a human decision about which seeded PM account to use. This is the same category of deferred manual step Plan 01-01 left for its own Task 3 login click-through. Flagging for the orchestrator/user to verify directly, or for `/gsd:verify-work` to re-surface.
- Plan 01-04 (briefing edit form, D-08 retry action, client detail page) is unblocked: `createClientRecord()` redirects to `${basePath}/${clientId}`, a route that does not exist yet (expected/acceptable per this plan's own `<done>` criteria — Plan 01-04 builds it) and will currently 404 until Plan 01-04 lands.
- No blockers for Plan 01-04.

## Known Stubs

None. Every code path in this plan is fully wired to live data (real Supabase queries, real Tropicalia fetch call gated correctly) — there are no hardcoded empty values or placeholder UI text standing in for unimplemented functionality. The one intentionally-unfinished edge (the `/admin/clients/{id}` and `/pm/clients/{id}` detail-page 404 after creation) is explicitly scoped to Plan 01-04 per this plan's own `<done>` criteria for Task 3, not a stub.

## Threat Flags

None beyond what this plan's own `<threat_model>` already covers (T-01-09 through T-01-14, T-01-SC) — all mitigations were implemented exactly as specified: app-layer authorization check before any privileged write (T-01-09), `TropicaliaProject.public_id` typed field with zero `.project_id` accesses (T-01-13), `AbortSignal.timeout(10_000)` on every Tropicalia call (T-01-14), `lib/tropicalia/client.ts` has no `"use client"` directive and is only imported from the `'use server'` `lib/actions/clients.ts` (T-01-12), `checkbox` installed from the official shadcn registry with zero new npm dependency (T-01-SC).

## Self-Check: PASSED

- FOUND: lib/validation/clients.ts
- FOUND: lib/tropicalia/client.ts
- FOUND: lib/actions/clients.ts
- FOUND: components/ui/checkbox.tsx
- FOUND: app/admin/clients/page.tsx
- FOUND: app/pm/clients/page.tsx
- FOUND: components/clients/client-create-form.tsx
- FOUND: app/admin/clients/new/page.tsx
- FOUND: app/pm/clients/new/page.tsx
- FOUND commit: 3742dd7 (Task 1)
- FOUND commit: 9dd9717 (Task 2)
- FOUND commit: ba37b62 (Task 3)
- FOUND commit: 73c2226 (SUMMARY commit)

---
*Phase: 01-client-records-isolated-rag-setup*
*Completed: 2026-07-13*
