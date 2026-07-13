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
  - "TROPICALIA_API_KEY documented placeholder in .env.local.example"
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

key-decisions:
  - "Did not create or edit .env.local in this worktree — the file does not exist in this isolated checkout (gitignored, not carried over from the main repo checkout where the user already populated it). Explicit instruction from the orchestrator context was to treat this as a genuine checkpoint rather than route around it (e.g. by copying the file from the main repo)."
  - "Ran `npm install` in the worktree (node_modules also absent, standard lockfile-driven install, not a new/unvetted package) so tsc/build verification could run at all."

requirements-completed: []  # CLI-01..04 not completed by this plan — see plan objective; this plan only unblocks other plans' auth prerequisite. Full completion pending .env.local resolution (see Deviations).

duration: ~45min
completed: 2026-07-13
---

# Phase 1 Plan 01: Dev-auth login page and Supabase credential prerequisite Summary

**Minimal `/login` page and `signIn()` Server Action built and type/build-clean; the credential-population half of this plan (`.env.local`) is blocked because `.env.local` does not exist in this isolated worktree checkout — flagged as a checkpoint, not routed around.**

## Performance

- **Duration:** ~45 min
- **Completed:** 2026-07-13T14:40:55Z
- **Tasks:** 1 satisfied (pre-existing, no commit needed), 1 partially completed (code done, one file edit blocked), 1 blocked (cannot be manually verified in this worktree)
- **Files modified:** 4 (2 created, 2 modified)

## Accomplishments
- `loginSchema`/`LoginInput` added to `lib/validation/auth.ts` alongside the existing `signupSchema`/`clientLoginSchema`, without modifying either.
- `signIn()` Server Action (`app/(auth)/login/actions.ts`): validates with `loginSchema.safeParse()` before any Supabase call, calls `createClient()` + `supabase.auth.signInWithPassword()`, returns the single generic error string `"E-mail ou senha incorretos."` for every Supabase Auth failure (never distinguishes "email not found" from "wrong password" — T-01-02).
- `/login` page (`app/(auth)/login/page.tsx`): copies `/signup`'s exact `useState`+`useTransition` structure, centered `Card w-full max-w-sm`, disabled-while-pending inputs, inline field errors, server-error banner; two fields (email, password); on success `router.push("/")`.
- `.env.local.example` documented with a new `TROPICALIA_API_KEY=` block mirroring the existing `SUPABASE_SECRET_KEY` comment convention (D-11: key-absent is a first-class supported state).
- `npx tsc --noEmit` exits 0; `npx next build` succeeds (build does not require env vars at build time — Supabase client creation is lazy).
- All grep-based acceptance criteria from the plan pass except the `.env.local` ones (see below).

## Task Commits

1. **Task 1: Populate Supabase credentials and seed Admin + PM logins** — no commit (manual dashboard prerequisite; per orchestrator context, already completed by the user in the live Supabase dashboard prior to this run — `SUPABASE_SECRET_KEY`/`SUPABASE_ACCESS_TOKEN` populated and Admin/PM profiles seeded with `status='approved'` in the live project's `.env.local`, which lives in the main repo checkout, not this worktree).
2. **Task 2: Add TROPICALIA_API_KEY placeholder and build the minimal /login page** — `e5650be` (feat) — completed for all files except `.env.local` itself (see Deviations).
3. **Task 3: Verify seeded Admin and PM can both log in** — NOT PERFORMED. Cannot be manually verified from this worktree: `npm run dev` here would run without ANY `.env.local` (not just the two secret vars — `NEXT_PUBLIC_SUPABASE_URL`/`NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` are also absent in this checkout), so no live Supabase connection is possible here.

**Plan metadata:** (deferred — orchestrator owns the final metadata commit for worktree-mode plans per parallel-execution instructions)

## Files Created/Modified
- `app/(auth)/login/actions.ts` - `signIn()` Server Action, zod-validated, generic error string
- `app/(auth)/login/page.tsx` - Email+password login form matching `/signup` visual pattern
- `lib/validation/auth.ts` - Added `loginSchema`/`LoginInput` export
- `.env.local.example` - Documented `TROPICALIA_API_KEY=` placeholder block

## Decisions Made
- Did not touch `.env.local` in this worktree. The file is gitignored and worktrees only carry committed files, so it does not exist in this isolated checkout even though the user already populated the equivalent file in the main repo checkout. The orchestrator's briefing for this run was explicit: if `.env.local` is genuinely missing from the worktree, treat it as a legitimate checkpoint rather than working around it (e.g., copying the file across the worktree boundary). Followed that instruction literally.
- Ran `npm install` in this worktree because `node_modules` was also absent (not tracked by git, no worktree carryover) — this is a standard lockfile-driven install of already-declared dependencies, not introduction of a new/unvetted package, so it does not trigger the Rule 3 package-install exclusion.

## Deviations from Plan

### Blocked (not auto-fixable — explicit checkpoint per orchestrator instruction)

**1. `.env.local` does not exist in this worktree checkout**
- **Found during:** Task 2
- **Issue:** The plan's Task 2 action requires appending `TROPICALIA_API_KEY=` to `.env.local` (in addition to `.env.local.example`). `.env.local` is git-ignored (confirmed in `.gitignore`) and this worktree was created from the main repo's committed tree only — it never carried the user's already-populated `.env.local` (which exists in the main repo checkout at `/Users/lucaspaiva/projects/backstageed.OS/.env.local` with `SUPABASE_SECRET_KEY`/`SUPABASE_ACCESS_TOKEN` already filled in, per the user's completed manual setup).
- **Why not auto-fixed:** The orchestrator's run-specific instructions explicitly directed: if `.env.local` is genuinely missing from the worktree, this is a legitimate checkpoint, "not something to route around." Copying the file from the main repo, or fabricating a fresh one, would have bypassed that explicit instruction.
- **Impact:** (a) The plan's acceptance criterion `grep -c '^TROPICALIA_API_KEY=' .env.local` cannot be satisfied inside this worktree. (b) Task 3's manual login verification cannot be performed from this worktree at all — `npm run dev` here has no Supabase URL/keys of any kind, not just the two secret vars this plan is responsible for.
- **Resolution needed:** Either (a) the orchestrator/user copies `.env.local` from the main repo into this worktree before merge, and appends `TROPICALIA_API_KEY=` there, and then performs Task 3's manual verification in an environment where `.env.local` is present (worktree or main repo, whichever is used to run `npm run dev`); or (b) Task 3's manual verification is performed directly in the main repo checkout, where `.env.local` already has the two required secrets, after appending `TROPICALIA_API_KEY=` there.

---

**Total deviations:** 1 blocked (infrastructure/isolation gap, not a code defect)
**Impact on plan:** All in-scope code (schema, Server Action, page, `.env.local.example`) is complete, type-clean, and build-clean. The plan's stated success criteria "`SUPABASE_SECRET_KEY` and `SUPABASE_ACCESS_TOKEN` are populated" and "seeded Admin and seeded PM can both reach the app post-login" are true in the main repo checkout (per the user's prior manual work) but not verifiable/reproducible from this isolated worktree.

## Issues Encountered
- `node_modules` was absent in this worktree (not tracked by git). Ran `npm install` from the existing `package-lock.json` to enable `tsc`/`next build` verification — no new packages were added to `package.json`.
- `npx next build` succeeded even with zero `.env.local` present, confirming this plan's code changes introduce no build-time hard dependency on Supabase env vars (only runtime, inside Server Actions/middleware).

## User Setup Required
None beyond what Task 1 already required (already completed by the user per orchestrator context). The unresolved item is **worktree file access**, not a new external-service configuration: `.env.local` (already correctly populated in the main repo) needs to be present wherever Task 3's manual browser verification is actually run, and `TROPICALIA_API_KEY=` needs to be appended there before or during merge.

## Next Phase Readiness
- Code for `/login` is complete, type-safe, and ready to merge as-is.
- Plans 01-02/01-03 (which depend on `SUPABASE_SECRET_KEY`/`SUPABASE_ACCESS_TOKEN`) are unblocked in the main repo checkout (already populated there) but would be blocked if executed from a worktree that never receives `.env.local`.
- Recommend the orchestrator resolve the `.env.local` worktree-carryover gap (either by policy — copy `.env.local` into new worktrees at spawn time — or manually before merge) so Task 3's manual verification, and any future plan's `npm run dev`, can actually run.

## Known Stubs
None. No hardcoded empty values or placeholder UI text were introduced.

## Threat Flags
None. This plan's only new surface (`/login` Server Action) was already fully modeled in the plan's own `<threat_model>` (T-01-01 through T-01-04), and the implementation follows the plan's mitigations exactly (generic error string, zod validation before any Supabase call, no `NEXT_PUBLIC_` prefix on server-only vars).

---
*Phase: 01-client-records-isolated-rag-setup*
*Completed: 2026-07-13*
