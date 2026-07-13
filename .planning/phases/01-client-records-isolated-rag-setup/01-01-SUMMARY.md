---
phase: 01-client-records-isolated-rag-setup
plan: 01
subsystem: auth
tags: [nextjs, supabase, zod, server-actions]

requires: []
provides:
  - "loginSchema/LoginInput zod validation (lib/validation/auth.ts)"
  - "signIn() Server Action (app/(auth)/login/actions.ts) — zod-validated, single generic error string on any Supabase Auth failure"
  - "/login page (app/(auth)/login/page.tsx) matching the /signup visual/state pattern"
  - "TROPICALIA_API_KEY documented placeholder in .env.local.example and .env.local"
affects: [01-02, 01-03, 01-04]

tech-stack:
  added: []
  patterns:
    - "Dev-auth login form mirrors signup form's useState+useTransition+startTransition pattern exactly (D-01)"
    - "Server Actions validate with zod safeParse() before any Supabase call, return single generic error string for all Auth failures (T-01-02)"

key-files:
  created:
    - "app/(auth)/login/actions.ts"
    - "app/(auth)/login/page.tsx"
  modified:
    - "lib/validation/auth.ts"
    - ".env.local.example"
    - ".env.local (not committed — gitignored)"

key-decisions:
  - "Initially did not create or edit .env.local in this worktree because it was genuinely absent (gitignored, not carried over from the main repo checkout) — flagged as a checkpoint rather than routed around. The orchestrator subsequently copied the already-populated .env.local from the main repo into this worktree, resolving the gap; TROPICALIA_API_KEY= was then appended here to match .env.local.example."
  - "Ran `npm install` in the worktree (node_modules also absent, standard lockfile-driven install, not a new/unvetted package) so tsc/build verification could run at all."
  - "Started `npm run dev` in the background and verified it boots cleanly (Ready, no Error lines) and serves 200 on / and /login, per checkpoints.md's automation-first golden rule — Claude sets up the verification environment, the human only clicks through and evaluates."

requirements-completed: []  # CLI-01..04 not completed by this plan by design — see plan objective (this plan only unblocks other plans' auth prerequisite). Task 3's login click-through remains a human-verify step.

duration: ~55min
completed: 2026-07-13
---

# Phase 1 Plan 01: Dev-auth login page and Supabase credential prerequisite Summary

**Minimal `/login` page and `signIn()` Server Action built, type/build-clean, `.env.local`/`.env.local.example` both carry the `TROPICALIA_API_KEY=` placeholder, and a dev server is running with the real Supabase credentials loaded — awaiting only the human click-through login verification (Task 3).**

## Performance

- **Duration:** ~55 min
- **Completed:** 2026-07-13T14:55:00Z (approx.)
- **Tasks:** 2 of 3 fully complete (Task 1 satisfied by prior user action; Task 2 code+env complete); Task 3 server-side automation complete, human click-through pending
- **Files modified:** 5 (2 created, 3 modified — one of which, `.env.local`, is intentionally uncommitted)

## Accomplishments
- `loginSchema`/`LoginInput` added to `lib/validation/auth.ts` alongside the existing `signupSchema`/`clientLoginSchema`, without modifying either.
- `signIn()` Server Action (`app/(auth)/login/actions.ts`): validates with `loginSchema.safeParse()` before any Supabase call, calls `createClient()` + `supabase.auth.signInWithPassword()`, returns the single generic error string `"E-mail ou senha incorretos."` for every Supabase Auth failure (never distinguishes "email not found" from "wrong password" — T-01-02).
- `/login` page (`app/(auth)/login/page.tsx`): copies `/signup`'s exact `useState`+`useTransition` structure, centered `Card w-full max-w-sm`, disabled-while-pending inputs, inline field errors, server-error banner; two fields (email, password); on success `router.push("/")`.
- `.env.local.example` and `.env.local` (worktree-local, uncommitted) both documented with a `TROPICALIA_API_KEY=` block mirroring the existing `SUPABASE_SECRET_KEY` comment convention (D-11: key-absent is a first-class supported state).
- `npx tsc --noEmit` exits 0; `npx next build` succeeds.
- All grep-based acceptance criteria from the plan pass, including the `.env.local` ones, once the orchestrator copied the real `.env.local` into this worktree.
- `npm run dev` started in the background from this worktree with the real Supabase credentials loaded (`- Environments: .env.local` in the boot log); boots cleanly (`✓ Ready in 265ms`, no `Error` lines in the log); `GET /` and `GET /login` both return HTTP 200. Server left running for human click-through verification.

## Task Commits

1. **Task 1: Populate Supabase credentials and seed Admin + PM logins** — no commit (manual dashboard prerequisite; per orchestrator context, already completed by the user in the live Supabase dashboard prior to this run — Admin/PM `profiles` rows seeded with `status='approved'`).
2. **Task 2: Add TROPICALIA_API_KEY placeholder and build the minimal /login page** — `e5650be` (feat, tracked files) — `.env.local` itself was updated after this commit (see Decisions) but is intentionally NOT committed (gitignored, contains live secrets).
3. **Task 3: Verify seeded Admin and PM can both log in** — PARTIALLY PERFORMED. Server-side automation complete (dev server running, boots cleanly, / and /login return 200). The actual browser click-through (Admin login, PM login, refresh-persists-session, invalid-password generic-error check) is a genuine human-verify step and was intentionally NOT attempted by this agent — see Checkpoint below.

**Plan metadata:** (deferred — orchestrator owns the final metadata commit for worktree-mode plans per parallel-execution instructions)

## Files Created/Modified
- `app/(auth)/login/actions.ts` - `signIn()` Server Action, zod-validated, generic error string
- `app/(auth)/login/page.tsx` - Email+password login form matching `/signup` visual pattern
- `lib/validation/auth.ts` - Added `loginSchema`/`LoginInput` export
- `.env.local.example` - Documented `TROPICALIA_API_KEY=` placeholder block
- `.env.local` - (uncommitted, gitignored) Appended `TROPICALIA_API_KEY=` placeholder block, after the orchestrator copied the real, already-populated file into this worktree

## Decisions Made
- Initially left `.env.local` untouched because it was genuinely absent from this worktree (gitignored, no carryover) and the run's instructions were explicit: treat that as a checkpoint, not something to route around. The orchestrator then copied the file in directly; at that point appending `TROPICALIA_API_KEY=` to it was the same mechanical action already applied to `.env.local.example`, so it was completed immediately.
- Ran `npm install` in this worktree because `node_modules` was also absent (not tracked by git) — standard lockfile-driven install of already-declared dependencies, not a new/unvetted package.
- Started the dev server in the background and verified boot health via log inspection + curl, per checkpoints.md: Claude automates all setup; the user is only asked to visually/functionally verify. Did not attempt any login click-through myself.

## Deviations from Plan

None beyond the resolved worktree/`.env.local` propagation gap (documented below as an Issue Encountered, not a plan deviation — the plan's own scope and acceptance criteria were followed exactly once the environment was complete).

## Issues Encountered
- `node_modules` was absent in this worktree (not tracked by git). Ran `npm install` from the existing `package-lock.json` to enable `tsc`/`next build` verification — no new packages were added to `package.json`.
- `.env.local` was initially absent in this worktree (gitignored, no worktree carryover of the user's already-populated main-repo file). Raised as a checkpoint; the orchestrator resolved it by copying the file into the worktree mid-run. `TROPICALIA_API_KEY=` was then appended here to match `.env.local.example`.
- `npx next build` succeeded even before `.env.local` was present, confirming this plan's code changes introduce no build-time hard dependency on Supabase env vars (only runtime, inside Server Actions/middleware).

## User Setup Required
None beyond what Task 1 already required (already completed by the user). `.env.local` now has all required values (`SUPABASE_SECRET_KEY`, `SUPABASE_ACCESS_TOKEN`, `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`, `TROPICALIA_API_KEY=` placeholder) in this worktree.

## Next Phase Readiness
- Code for `/login` is complete, type-safe, build-clean, and ready to merge.
- A dev server is running at **http://localhost:3000** (also reachable at `http://192.168.0.160:3000` on the local network) from this worktree, with real Supabase credentials loaded, serving `/` and `/login` with HTTP 200 and no runtime errors in the boot log.
- Plans 01-02/01-03 (which depend on `SUPABASE_SECRET_KEY`/`SUPABASE_ACCESS_TOKEN`) are unblocked in this worktree now that `.env.local` is present.
- Outstanding: a human needs to visit `http://localhost:3000/login` and confirm (a) the seeded Admin logs in and lands on the app without bouncing to `/pending`/`/rejected`, session persists across refresh; (b) the same for the seeded PM; (c) an invalid password shows exactly "E-mail ou senha incorretos." with no distinguishing info. This is the only remaining item before Task 3 (and the plan as a whole) can be marked fully complete.

## Known Stubs
None. No hardcoded empty values or placeholder UI text were introduced.

## Threat Flags
None. This plan's only new surface (`/login` Server Action) was already fully modeled in the plan's own `<threat_model>` (T-01-01 through T-01-04), and the implementation follows the plan's mitigations exactly (generic error string, zod validation before any Supabase call, no `NEXT_PUBLIC_` prefix on server-only vars).

---
*Phase: 01-client-records-isolated-rag-setup*
*Completed: 2026-07-13*
