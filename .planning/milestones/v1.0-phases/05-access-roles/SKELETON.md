# Walking Skeleton — BackstageEd.OS

**Phase:** 1
**Generated:** 2026-07-01

## Capability Proven End-to-End

A social-media PM can sign up on `/signup` with email + password and land on a static `/pending` screen — a real form submission that travels Browser → Next.js Server Action → Supabase Auth → a Postgres `INSERT` on `auth.users` that fires the `handle_new_user()` trigger to create a `public.profiles` row (`status='pending'`, `role='pm'`), with the Next.js middleware then reading that row (via a verified `getUser()` JWT) and gating the PM out of every role-scoped route. This one flow exercises scaffold + routing + a real DB write + RLS-enabled schema + an interactive UI wired to the backend against a live hosted Supabase project.

## Architectural Decisions

| Decision | Choice | Rationale |
|---|---|---|
| Framework | Next.js 16.2.x, App Router, TypeScript, root-level `app/` (no `src/`) | Locked by CLAUDE.md project stack; App Router is required for Server Actions + middleware session refresh. Root `app/` per RESEARCH.md Recommended Project Structure. |
| Data layer | Supabase (hosted Postgres) + SQL migrations under `supabase/migrations/`, applied via `supabase db push` | Locked by CLAUDE.md. Migration files (not dashboard edits) are the source of truth so RLS-in-same-file discipline is reviewable in git. |
| Auth | Supabase Auth (GoTrue) email + password via `@supabase/ssr` cookie sessions; app-level `profiles` table is the single source of truth for `role`/`status`/`must_change_password`/`client_id` | D-08 (email+password, no magic link). Supabase Auth has no native "pending approval" or "must change password" concept — both are app-layer columns gated in middleware (RESEARCH.md Pattern 1/2). |
| Authorization | Postgres RLS on every table, backed by `SECURITY DEFINER` + `STABLE` + `language plpgsql` helpers `is_admin()` and `pm_assigned_clients()`; never UI-only gating | AUTH-06/07/08 require enforcement at the data layer. Helper-function routing avoids the `infinite recursion detected in policy` footgun (RESEARCH.md Pitfall 1). RLS enabled in the same migration as every `CREATE TABLE` (Pitfall 2 / CVE-2025-48757). |
| Session strategy | Three `@supabase/ssr` client factories (`client.ts` browser, `server.ts` Server Components/Actions, `middleware.ts` cookie read/write + token refresh) + a server-only service-role `admin.ts` | Only middleware can write refreshed auth cookies, which is what makes AUTH-05 (session persists across refresh) work. `getUser()` (verified JWT), never `getSession()`, for authz decisions (RESEARCH.md Pattern 3). |
| Privileged operations | Service-role key confined to `lib/supabase/admin.ts`, imported only from Server Actions; env var `SUPABASE_SECRET_KEY` (never `NEXT_PUBLIC_`) | `auth.admin.createUser()` / `auth.admin.updateUserById()` (AUTH-09/11) need the secret key; leaking it to the browser bundle is Elevation of Privilege (RESEARCH.md Pitfall 4). |
| Deployment target | Local full-stack dev run against the live hosted Supabase project (`next dev` + `supabase db push`); Vercel deploy deferred to a later slice | Timeline pressure (target 2026-09-30); a live hosted Supabase project is the hard dependency, Vercel hosting is not needed to prove the skeleton. |
| Directory layout | Route groups: `app/(auth)/*` (signup/login/pending/rejected/change-password), `app/admin/*`, `app/pm/*`, `app/client/*`; shared factories under `lib/supabase/*`; validation under `lib/validation/*` | Route groups keep unauthenticated auth screens outside the middleware role-gate matcher while role roots stay cleanly separated (RESEARCH.md Recommended Project Structure). |
| UI system | shadcn (`new-york` style, `neutral` base color, CSS variables), Radix primitives, `lucide-react`, system-UI font; neutral palette with red reserved strictly for destructive actions | Internal B2B ops tool tone per CLAUDE.md / 05-UI-SPEC; no brand-color decision this phase has authority to make. |

## Stack Touched in Phase 5

- [x] Project scaffold (Next.js + TypeScript + Tailwind + ESLint + shadcn + Supabase CLI dev dep) — 05-01
- [x] Routing — real routes: `/signup`, `/pending`, `/login`, `/admin/approvals`, `/pm`, `/client`, `/admin`, `/change-password`, `/pm/clients/[id]/access` — 05-01 through 05-03
- [x] Database — real write (PM signup → `profiles` INSERT via trigger) AND real read (middleware `profiles` SELECT; admin approval queue SELECT) — 05-01, 05-02
- [x] UI — interactive elements wired to the backend (signup form → Server Action; approval queue Aprovar/Rejeitar; create-client-login form; forced password-change form) — 05-01 through 05-03
- [x] Deployment — documented local full-stack run: `supabase db push` (migrations to live project) + `next dev` (against live Supabase env vars in `.env.local`)

## Out of Scope (Deferred to Later Slices)

- Client record CRUD, strategic briefing, and Tropicalia `project_id` — Phase 1 (this phase uses only a minimal seeded `clients` stub for FK + manual AUTH-09/10/11 testing).
- Multiple Client-side users per client company (v1 is 1 login per client) — deferred to v2 (D-10).
- Active/email notification when a PM signup is approved — v1 relies on the PM retrying login (D-07).
- Vercel/production deployment and CI — later hardening slice.
- Playwright e2e / Vitest browser-flow automation — this phase uses pgTAP for RLS (AUTH-06/07/08) and manual click-through for auth/UI flows per 05-VALIDATION.md.
- `getClaims()` JWT-local verification optimization — default to `getUser()` this phase until the project's JWT signing-key type is confirmed (RESEARCH.md Open Question 1).
- Reactivating a deactivated Client / lifting a ban — v1 covers deactivation only (AUTH-11); reactivation is not a phase requirement.

## Subsequent Slice Plan

Each later phase adds one vertical slice on top of this skeleton without altering its architectural decisions (same `@supabase/ssr` factories, same RLS-helper pattern, same route-group layout):

- Phase 1: Client Records & Isolated RAG Setup — `ALTER` the `clients` stub into a full record (strategic briefing + Tropicalia `project_id`), CRUD, PM↔client assignment UI writing to the existing `pm_clients` table.
- Phase 2: Client-Isolated AI Chat — per-client scoped chat backed by the Phase 1 `project_id`, reusing `pm_assigned_clients()` RLS scoping.
- Phase 3: Content Production Kanban — content cards + per-client checklist, all client-scoped through the established RLS helpers.
- Phase 4: Client Approval & Scheduling — Client-role board (reusing the `role='client'` gating from this phase) for approve/adjust + publish-date registration.
- Phase 6: Admin Oversight Dashboard — consolidated cross-client status view, reusing `is_admin()` for unrestricted access.
