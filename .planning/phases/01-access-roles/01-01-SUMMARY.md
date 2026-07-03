---
phase: 01-access-roles
plan: 01
subsystem: auth
tags: [nextjs, supabase, ssr, rls, postgres, zod, shadcn]

# Dependency graph
requires: []
provides:
  - Scaffolded Next.js 16.2.x App Router project (TypeScript, Tailwind v4, ESLint)
  - shadcn UI initialized (style new-york, baseColor neutral, cssVariables true) with button, input, label, form, card, table, badge, select, dialog, alert-dialog, sonner, separator, skeleton
  - Four Supabase client factories (lib/supabase/client.ts, server.ts, middleware.ts, admin.ts)
  - zod validation schemas (lib/validation/auth.ts: signupSchema, clientLoginSchema)
  - Four SQL migrations (profiles + column-immutability trigger, clients stub, pm_clients + D-10 unique index, RLS policies with is_admin()/pm_assigned_clients() helpers)
  - .env.local.example documenting all four required env vars
affects: [01-02, 01-03, 01-04]

# Tech tracking
tech-stack:
  added: ["next@16.2.9", "@supabase/ssr@0.12.0", "@supabase/supabase-js@2.110.0", "zod@4.4.3", "supabase@2.109.0 (dev)", "shadcn@4.12.0 (dev, CLI only)"]
  patterns:
    - "Four Supabase client factories, never hand-rolled cookie/fetch logic"
    - "profiles table as single source of truth for role/status/must_change_password/client_id"
    - "RLS enforced via SECURITY DEFINER + STABLE + language plpgsql helper functions (is_admin, pm_assigned_clients), never inline cross-table subqueries in a policy"
    - "Column-level immutability (role/status) enforced by a BEFORE UPDATE trigger, not by RLS, since RLS cannot restrict individual columns within an allowed row"
    - "Service-role key isolated to lib/supabase/admin.ts, non-NEXT_PUBLIC_ env var name"

key-files:
  created:
    - lib/supabase/client.ts
    - lib/supabase/server.ts
    - lib/supabase/middleware.ts
    - lib/supabase/admin.ts
    - lib/validation/auth.ts
    - supabase/migrations/0001_profiles.sql
    - supabase/migrations/0002_clients_stub.sql
    - supabase/migrations/0003_pm_clients.sql
    - supabase/migrations/0004_rls_policies.sql
    - .env.local.example
    - components.json
  modified: []

key-decisions:
  - "shadcn CLI v4 replaced the classic new-york/neutral init flags with named presets (nova/vega/maia/...); used the `nova` preset to generate matching neutral CSS variables, then hand-wrote components.json with the legacy new-york/neutral schema (still honored by `shadcn add`) to satisfy the plan's literal acceptance criteria"
  - "next lint was removed in Next.js 16 (no CLI subcommand); ESLint's own CLI (npm run lint / eslint .) is the replacement and was used for verification instead"
  - "Pinned turbopack.root in next.config.ts to the worktree directory to avoid Next.js misdetecting an unrelated lockfile on the host machine as the monorepo root"

patterns-established:
  - "Pattern: Supabase client construction — always via lib/supabase/{client,server,middleware,admin}.ts, never instantiate supabase-js directly elsewhere"
  - "Pattern: every migration that creates a table enables RLS in the same file (CVE-2025-48757 discipline)"
  - "Pattern: RLS helper functions live in 0004_rls_policies.sql; triggers that reference them (e.g. prevent_profile_privilege_escalation) can be declared earlier since the function body only resolves at call time"

requirements-completed: []

# Metrics
duration: partial (see below — plan not yet complete)
completed: null
---

# Phase 1 Plan 1: Walking Skeleton (Tasks 1-3 of 5) Summary

**Next.js 16 + shadcn scaffold, four Supabase client factories, and four RLS-enabled SQL migrations (profiles/clients-stub/pm_clients/policies) written and committed — schema push to the live Supabase project and the PM signup slice remain blocked on two still-missing secrets.**

## Status: STOPPED AT CHECKPOINT (secrets still missing)

This plan is **not complete**. Per the orchestrator's checkpoint-resolution instructions, Task 1 (Supabase provisioning) was partially resolved with the project URL and anon/publishable key, but the **service_role/secret key** (`SUPABASE_SECRET_KEY`) and a **personal access token** (`SUPABASE_ACCESS_TOKEN`) were deliberately withheld by the user and are still empty placeholders in `.env.local`. Task 4 (`supabase db push`, live schema push) and Task 5 (PM signup slice, which depends on the pushed schema being live) have **not been executed**.

Tasks 1 (partially — URL/anon key only), 2, and 3 are complete and committed. Task 4 and Task 5 are pending a resume once the user supplies the two missing secrets.

## Performance

- **Started:** 2026-07-01T19:48:30Z
- **Tasks completed:** 2 of 5 fully (Task 2, Task 3); Task 1 partially resolved by the orchestrator before this agent started
- **Files created:** 37 (scaffold) + 6 (migrations) = 43

## Accomplishments

- Scaffolded a Next.js 16.2.9 App Router project (TypeScript, Tailwind v4, ESLint) at the repo root, preserving the pre-existing `.planning/`, `CLAUDE.md`, and `README.md`.
- Initialized shadcn with the `new-york` / `neutral` preset (via a hybrid path — see Deviations) and installed all 13 components the UI-SPEC requires.
- Built all four canonical Supabase client factories (`client.ts`, `server.ts`, `middleware.ts`, `admin.ts`), with the admin client strictly isolated to a non-`NEXT_PUBLIC_` secret env var.
- Wrote `lib/validation/auth.ts` with zod schemas for signup and client-login, ready for reuse in Task 5 and later plans.
- Wrote and verified all four SQL migrations: `profiles` (with email mirror, `handle_new_user()` trigger, and the `prevent_profile_privilege_escalation()` column-immutability trigger), `clients` stub (seeded), `pm_clients` (with the D-10 partial unique index), and `is_admin()`/`pm_assigned_clients()` RLS helpers + policies for all three tables.
- `npx tsc --noEmit`, `npm run lint` (ESLint), and `npx next build` all pass clean against the current scaffold.

## Task Commits

Each task was committed atomically:

1. **Task 1: Provision the Supabase project and capture credentials** — resolved by the orchestrator before this agent started (URL + anon/publishable key written into `.env.local`/`.env.local.example` as part of Task 2's commit); secret key and access token still outstanding.
2. **Task 2: Scaffold Next.js app, Supabase client factories, and validation** - `7f83c1b` (feat)
3. **Task 3: Write the four migrations** - `943e637` (feat)

Task 4 and Task 5 are **not yet committed** — blocked on missing secrets (see below).

## Files Created/Modified

- `package.json`, `package-lock.json`, `tsconfig.json`, `next.config.ts`, `eslint.config.mjs`, `postcss.config.mjs` — Next.js scaffold config
- `components.json` — shadcn config (style: new-york, baseColor: neutral, cssVariables: true)
- `components/ui/*.tsx` — button, input, label, form, card, table, badge, select, dialog, alert-dialog, sonner, separator, skeleton
- `app/layout.tsx`, `app/page.tsx`, `app/globals.css` — root layout (system UI sans font per UI-SPEC), minimal landing page
- `lib/supabase/client.ts` - `createBrowserClient` factory
- `lib/supabase/server.ts` - `createServerClient` factory (Server Components/Actions)
- `lib/supabase/middleware.ts` - `updateSession()` helper (session refresh, cookie sync)
- `lib/supabase/admin.ts` - service-role client factory, server-only
- `lib/validation/auth.ts` - `signupSchema`, `clientLoginSchema` (zod)
- `.env.local.example` - documents all four env vars
- `.env.local` (gitignored) - seeded with URL + publishable key; `SUPABASE_SECRET_KEY` and `SUPABASE_ACCESS_TOKEN` still empty
- `supabase/config.toml`, `supabase/.gitignore` - via `supabase init`
- `supabase/migrations/0001_profiles.sql` - enums, profiles table, RLS enabled, `handle_new_user()` trigger, `prevent_profile_privilege_escalation()` trigger
- `supabase/migrations/0002_clients_stub.sql` - clients stub table, RLS enabled, seeded, FK from profiles.client_id
- `supabase/migrations/0003_pm_clients.sql` - pm_clients join table, RLS enabled, indexes, D-10 partial unique index
- `supabase/migrations/0004_rls_policies.sql` - `is_admin()`, `pm_assigned_clients()`, RLS policies for profiles/pm_clients/clients

## Decisions Made

- **shadcn CLI v4 preset drift:** The plan (and RESEARCH.md/UI-SPEC.md) assumed the classic `shadcn init` prompts (`style: new-york`, `baseColor: neutral` as direct flags). The installed `shadcn@4.12.0` CLI replaced this with named presets (`nova`, `vega`, `maia`, `lyra`, `mira`, `luma`, `sera`, `rhea`) and no longer exposes `--style`/`--base-color` flags. Resolution: ran `shadcn init --preset nova` (which writes grayscale/neutral OKLCH CSS variables matching the UI-SPEC's neutral palette), then hand-wrote `components.json` with the literal legacy schema (`"style": "new-york"`, `"baseColor": "neutral"`) since `shadcn add` still honors that config shape and produces the expected new-york-style component variants (verified by inspecting the generated `button.tsx`). This satisfies the plan's literal acceptance-criteria grep checks and the underlying design intent, but is worth flagging to the planner/verifier since it means `components.json`'s `style` field no longer reflects what `shadcn init` itself would natively write going forward — new-york is being kept alive as a legacy config value, not a currently-offered preset.
- **`next lint` removal:** Next.js 16 removed the `next lint` CLI subcommand entirely (confirmed via `npx next --help`). The plan's automated verification (`npx tsc --noEmit && npx next lint`) was adjusted to use ESLint's own CLI (`npm run lint`, which invokes `eslint`) since that's the project's actual lint entrypoint post-scaffold. Both produced zero errors.
- **`turbopack.root` pin:** Added to `next.config.ts` to eliminate a Next.js build warning caused by an unrelated lockfile discovered elsewhere on the host filesystem (outside this repo) being misdetected as a monorepo root. Cosmetic, but prevents `next build` output from being noisy in future task verifications.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] shadcn CLI v4 no longer supports direct new-york/neutral init flags**
- **Found during:** Task 2
- **Issue:** `npx shadcn init` (v4.12.0, the current published version) replaced the classic style/baseColor prompt flow with named presets and rejected `--base-color`/direct style flags entirely.
- **Fix:** Used `shadcn init --preset nova` to get matching neutral CSS variables, then manually wrote `components.json` in the legacy `new-york`/`neutral` schema (confirmed `shadcn add` still accepts and honors this format).
- **Files modified:** `components.json`, `app/globals.css`
- **Verification:** `grep -E '"style"|"baseColor"' components.json` shows both `new-york` and `neutral`; `components/ui/button.tsx` shows the expected new-york-style variant classes.
- **Committed in:** `7f83c1b`

**2. [Rule 3 - Blocking] `next lint` command no longer exists in Next.js 16**
- **Found during:** Task 2 verification
- **Issue:** The plan's verify step (`npx tsc --noEmit && npx next lint`) fails because `next lint` was removed as a subcommand in this Next.js version.
- **Fix:** Ran `npm run lint` (project's `eslint` script) instead — equivalent coverage, zero errors.
- **Files modified:** none (verification-only)
- **Verification:** `npm run lint` exits clean with no output.
- **Committed in:** `7f83c1b` (no separate commit needed — verification-only adjustment)

**3. [Rule 3 - Blocking] `create-next-app` refuses to scaffold into a non-empty directory**
- **Found during:** Task 2, start
- **Issue:** The worktree already contains `.planning/`, `CLAUDE.md`, `README.md` — `create-next-app` aborts on any existing files.
- **Fix:** Scaffolded into a temporary directory outside the repo, then `rsync`'d the generated files into the worktree while excluding `.git`, `node_modules`, `.next`, and the scaffold's own `CLAUDE.md`/`AGENTS.md`/`README.md` (to avoid clobbering the project's real docs).
- **Files modified:** all scaffold files (see Files Created/Modified)
- **Verification:** `.planning/`, `CLAUDE.md`, `README.md` all remained untouched and unmodified after the merge (confirmed via `git status` showing them absent from the diff).
- **Committed in:** `7f83c1b`

---

**Total deviations:** 3 auto-fixed (all Rule 3 — blocking issues caused by tooling having moved past what RESEARCH.md/PATTERNS.md/the plan anticipated). No scope creep; all three were necessary to make the literally-specified plan actions work against currently-installed tool versions.

## Issues Encountered

- **Blocked before Task 4:** `.env.local` still has empty `SUPABASE_SECRET_KEY` and `SUPABASE_ACCESS_TOKEN` values. Per the orchestrator's explicit checkpoint-resolution instructions, this agent did NOT fabricate or guess these values, did NOT attempt `supabase db push` (which would fail without `SUPABASE_ACCESS_TOKEN` and cannot be meaningfully retried in a loop), and did NOT proceed to Task 5 (PM signup slice), since that slice's manual verification step depends on the migrations actually being live on the hosted Supabase project.

## User Setup Required

**Two secrets are still needed to unblock Task 4 and Task 5:**

1. `SUPABASE_SECRET_KEY` — Supabase Dashboard → Project Settings → API Keys → service_role/secret key. Paste into `.env.local` (already scaffolded with a placeholder and a comment showing exactly where it goes).
2. `SUPABASE_ACCESS_TOKEN` — Supabase Dashboard → Account → Access Tokens → create a new personal access token. Paste into `.env.local` (same placeholder pattern).

Once both are set, a continuation agent should:
1. Run `supabase link --project-ref ancfwsgyzoostoidqzqj` (using `SUPABASE_ACCESS_TOKEN` from the environment) if not already linked.
2. Run `supabase db push` to apply all four migrations to the live project (Task 4).
3. Verify RLS is enabled on every public table and the D-10 unique index exists on the live DB (Task 4 acceptance criteria).
4. Proceed to Task 5 (PM signup Server Action + `/signup` + `/pending` pages + `middleware.ts` role/status gate), which depends on the live pushed schema.

## Next Phase Readiness

- Scaffold, client factories, validation schemas, and all four migrations are complete, committed, and verified against the plan's literal grep-based acceptance criteria.
- **Not ready to proceed to plans 01-02/01-03/01-04** until Task 4 (live schema push) and Task 5 (PM signup slice) of this plan are completed — those plans build directly on the pushed schema and the established middleware gate.
- No blockers other than the two missing secrets described above; once supplied, Task 4 and Task 5 should proceed without further architectural decisions (Task 3's migrations and Task 2's client factories already fully satisfy what Task 5 needs).

---
*Phase: 01-access-roles*
*Completed: incomplete — stopped at secrets checkpoint before Task 4*
