# Phase 5: Access & Roles - Research

**Researched:** 2026-07-01
**Domain:** Supabase Auth + RLS multi-tenancy on Next.js App Router (greenfield)
**Confidence:** HIGH (stack/patterns/pitfalls), MEDIUM (exact newest API surface — `getClaims()` is very recent and docs are mid-migration)

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

- **D-01:** Clients do NOT self-signup. PM creates the Client's login directly (email + provisional password), and that login is created *linked to* an existing client record (the client record from Phase 1 must already exist before the login is created — one client record can have 0 or 1 logins in v1).
- **D-02:** PM (and Admin) can create as many Client logins as needed for the clients they manage, and can deactivate a Client's access later (e.g., end of contract).
- **D-03:** PM still self-signs up (email/password) and goes into a "pending approval" state until Admin approves.
- **D-04:** This supersedes the "self-signup with approval for both PM and Client" assumption captured in PROJECT.md/REQUIREMENTS.md during project init — REQUIREMENTS.md AUTH-01/02/03 already reworded (PM signup+approval; Client account is admin/PM-issued, not self-signup).
- **D-05:** If Admin rejects a pending PM signup, the account is marked "rejected" in the database (not deleted) — kept for audit/history, can be reactivated later if needed.
- **D-06:** While pending, a PM sees a static waiting screen ("Seu cadastro está pendente de aprovação. Você será avisado quando for liberado.") — no further actions available.
- **D-07:** No active notification when approved (v1 has no email). PM finds out by trying to log in again later.
- **D-08:** Supabase Auth with email + password (not magic link — magic link would need working email delivery, out of scope for v1).
- **D-09:** When PM creates a Client's provisional password, the Client is forced to change it on first login.
- **D-10:** One login per client company in v1 (no multiple Client-side users per client). Deferred to v2 if a client needs more.

### Claude's Discretion

- Exact copy/wording of the pending-approval screen.
- Exact UI for Admin's approval queue (list vs table, batch actions vs one-by-one) — hard requirement is Admin sees pending PM signups and approves/rejects each.
- Exact mechanism for forcing password change on first Client login (Supabase Auth's own flow vs custom check) — resolved by this research below (Supabase Auth has no native "must change password" flag; requires app-layer flag + gate).

### Deferred Ideas (OUT OF SCOPE)

- Multiple Client-side users per client company (v1 is 1 login per client) — reconsider if a client's team grows.
- Active notification (beyond in-app) when a PM's signup is approved — v1 relies on the PM retrying login.

</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| AUTH-01 | PM can sign up with email and password | `supabase.auth.signUp()` + `profiles` trigger pattern (Standard Stack, Code Examples) |
| AUTH-02 | New PM signup requires admin approval before gaining access | App-layer `status` column gate, checked post-auth in middleware/layout (Architecture Patterns: Pattern 1) |
| AUTH-03 | Admin can view, approve, or reject pending PM signups (rejected marked, not deleted) | `profiles.status` enum (`pending`/`approved`/`rejected`), Admin RLS + UI query (Code Examples) |
| AUTH-04 | Admin can assign a role (PM or Admin) to an approved PM signup | `profiles.role` enum, updated by Admin-only RLS UPDATE policy (Architecture Patterns: Pattern 2) |
| AUTH-05 | User session persists across browser refresh | `@supabase/ssr` cookie-based session + middleware token refresh (Architecture Patterns: Pattern 3) |
| AUTH-06 | PM can only access clients they are assigned to (RLS) | `pm_clients` join table + `SECURITY DEFINER` helper function to avoid recursion (Architecture Patterns: Pattern 4, Common Pitfalls: Pitfall 1) |
| AUTH-07 | Client can only access their own content (RLS) | `profiles.client_id` FK + RLS policy scoped to own client_id (Architecture Patterns: Pattern 4) |
| AUTH-08 | Admin can access all clients, PMs, and content (RLS) | `is_admin()` SECURITY DEFINER helper, OR-ed into every policy (Architecture Patterns: Pattern 4) |
| AUTH-09 | PM can create a Client login (email + provisional password) linked to existing client record, no self-signup/approval | `auth.admin.createUser()` via service role in a Server Action/Route Handler (Code Examples) |
| AUTH-10 | Client is forced to change provisional password on first login | `profiles.must_change_password` boolean + redirect gate (Architecture Patterns: Pattern 1, Don't Hand-Roll notes this has no native Supabase flag) |
| AUTH-11 | PM (or Admin) can deactivate a Client's access | `auth.admin.updateUserById(uid, { ban_duration: '876000h' })` (Code Examples) |

</phase_requirements>

## Summary

This phase is a standard Supabase Auth + Postgres RLS multi-tenancy build on Next.js App Router — a well-trodden path with excellent official documentation, but with three specific gaps that have **no built-in Supabase feature** and must be hand-built at the application layer: (1) a "pending approval" gate before granting in-app access (Supabase Auth only knows "confirmed" vs "unconfirmed" email, nothing about admin approval), (2) forcing a password change on first login (no native flag), and (3) role-based routing (Admin/PM/Client) driven by an app-level `profiles` table, not Supabase Auth's built-in `role` claim (which means `authenticated`/`anon`/`service_role`, a different concept entirely).

The multi-tenant RLS layer (PM→clients, Client→own data, Admin→everything) is the highest-risk area technically: naive policies that query a join table directly from within another table's policy are a well-documented Postgres/Supabase footgun (`infinite recursion detected in policy`), and the fix (`SECURITY DEFINER` helper functions, `STABLE`, wrapped in `(select ...)`) is a specific, verifiable pattern from official Supabase docs — not folklore. Separately, RLS being **opt-in per table** (not on by default) is the single highest-impact pitfall in the entire Supabase ecosystem right now (CVE-2025-48757, disclosed May 2025, affected 170+ production apps) and must be treated as a hard gate in verification for this phase.

**Primary recommendation:** Use `@supabase/ssr` for all session/cookie handling (never hand-roll cookie parsing), a `public.profiles` table (1:1 with `auth.users`, populated by a DB trigger) as the single source of truth for `role`, `status`, `must_change_password`, and `client_id`, and enforce every access rule via RLS policies backed by `SECURITY DEFINER` helper functions (`is_admin()`, `pm_assigned_clients()`) — never via UI conditionals alone. Client account creation and deactivation must go through `supabase.auth.admin.*` methods called from server-only code using the **secret/service role key**, never exposed to the browser.

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| PM signup (email/password) | API/Backend (Server Action) | Browser (form) | Supabase Auth call must happen server-side to set cookies correctly via `@supabase/ssr` |
| Pending-approval gate | Frontend Server (SSR) | Database | Middleware/layout checks `profiles.status` on every request; source of truth is Postgres |
| Admin approve/reject PM | API/Backend (Server Action) | Database (RLS) | Mutation restricted by RLS UPDATE policy scoped to `is_admin()` |
| Role assignment (PM/Admin) | API/Backend | Database (RLS) | Same as above — Admin-only UPDATE on `profiles.role` |
| Session persistence | Browser + Frontend Server | — | Cookies set/read by both browser client and middleware; `@supabase/ssr` bridges them |
| Client login provisioning | API/Backend (server-only, service role) | Database | `auth.admin.createUser()` requires secret key — must never run in browser or Client Component |
| Forced password change (first login) | Frontend Server (SSR) | Database | Gate checked in middleware/layout against `profiles.must_change_password`; enforced again via RLS-adjacent app logic since Supabase Auth has no native flag |
| PM → assigned-clients scoping | Database (RLS) | API/Backend | Must be enforced at Postgres level per AUTH-06 (explicit non-negotiable in phase success criteria) |
| Client → own-data scoping | Database (RLS) | API/Backend | Same — per AUTH-07 |
| Admin → full access | Database (RLS) | — | `is_admin()` helper OR-ed into every policy, not a UI-only bypass |
| Client deactivation | API/Backend (server-only, service role) | Database | `auth.admin.updateUserById` ban — server-only |

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `@supabase/ssr` | 0.12.0 [VERIFIED: npm registry] | Cookie-based Supabase client for Next.js (browser, server, middleware) | Official Supabase-maintained package specifically for SSR frameworks; replaces deprecated `@supabase/auth-helpers-nextjs` |
| `@supabase/supabase-js` | 2.110.0 [VERIFIED: npm registry] | Core Supabase client (auth, database, admin API) | The underlying SDK `@supabase/ssr` wraps; also used directly for `auth.admin.*` calls server-side |
| `next` | 16.2.9 [VERIFIED: npm registry] | App Router framework | Already locked by project stack (CLAUDE.md) |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `zod` | 4.4.3 [VERIFIED: npm registry] | Server Action input validation (signup form, create-client-login form) | Validate email/password shape before calling Supabase Auth; not a hard requirement but standard for Server Action safety |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| `@supabase/ssr` | `@supabase/auth-helpers-nextjs` | Deprecated by Supabase in favor of `@supabase/ssr` — do not use for new projects [CITED: supabase.com/docs/guides/auth/server-side/migrating-to-ssr-from-auth-helpers] |
| Custom `profiles.role` column | Supabase custom claims via `custom_access_token_hook` (role embedded in JWT) | JWT-embedded role avoids a DB round-trip per request but adds hook-config complexity and stale-claim risk (role change doesn't take effect until token refresh); for this phase's small scale, a `profiles` table read is simpler and always current — recommended default. Hook approach documented in Code Examples as an optional future optimization. |
| `auth.admin.updateUserById(ban_duration)` for deactivation | Custom `is_active` boolean checked in RLS | `ban_duration` blocks login at the Supabase Auth layer itself (defense in depth); a custom flag only blocks RLS-gated queries but the session/JWT would still validate. Recommend using **both**: `ban_duration` to block login, AND keep `profiles.status` in sync for UI/audit clarity. |

**Installation:**
```bash
npm install @supabase/ssr @supabase/supabase-js zod
```

**Version verification:** Verified via `npm view <pkg> version` on 2026-07-01 against the public npm registry — see Package Legitimacy Audit below. All versions above are current as of this research date.

## Package Legitimacy Audit

| Package | Registry | Age | Source Repo | slopcheck | Disposition |
|---------|----------|-----|-------------|-----------|-------------|
| `@supabase/ssr` | npm | Published 2023-09-06 (first release), actively maintained | github.com/supabase/ssr | OK | Approved |
| `@supabase/supabase-js` | npm | Long-established, official Supabase SDK | github.com/supabase/supabase-js | OK | Approved |
| `next` | npm | Long-established | github.com/vercel/next.js | OK | Approved |
| `react` / `react-dom` | npm | Long-established | github.com/facebook/react | OK | Approved |
| `zod` | npm | Long-established | github.com/colinhacks/zod | OK | Approved |

No `postinstall` scripts detected on `@supabase/ssr`, `@supabase/supabase-js`, or `next` (checked via `npm view <pkg> scripts.postinstall`, all returned empty).

**Packages removed due to slopcheck [SLOP] verdict:** none
**Packages flagged as suspicious [SUS]:** none

All packages above were discovered via official Supabase/Next.js documentation (not training-data recall alone) and confirmed via `npm view` + `slopcheck scan --pkg npm`, so they are tagged `[VERIFIED: npm registry]` per the package-name provenance rule.

## Architecture Patterns

### System Architecture Diagram

```
Browser (Client Component)
  │  signUp() / signInWithPassword() / updateUser()
  ▼
Next.js Middleware (@supabase/ssr — createServerClient)
  │  refreshes session token, syncs cookies (request + response)
  │  calls supabase.auth.getUser() to validate JWT
  ▼
┌─────────────────────────────────────────────┐
│ Route decision based on profiles row:       │
│  - no row / status=pending → /pending       │
│  - status=rejected → /rejected (or blocked) │
│  - must_change_password=true → /change-pw  │
│  - role=admin → /admin/*                    │
│  - role=pm → /pm/*                          │
│  - role=client → /client/*                 │
└─────────────────────────────────────────────┘
  ▼
Server Component / Server Action (createServerClient, cookies from request)
  │  all reads/writes go through Supabase client bound to logged-in user's JWT
  ▼
Postgres (RLS enforced per-row, per-table)
  │  policies call SECURITY DEFINER helpers: is_admin(), pm_assigned_clients(), current_client_id()
  ▼
auth.users (Supabase Auth) ←── admin.createUser() / admin.updateUserById()
  │  ONLY called from server-only code using SECRET/service_role key
  │  (Server Action for "PM creates Client login", "PM/Admin deactivates Client")
  ▼
public.profiles (trigger-populated on auth.users INSERT)
  role: admin | pm | client
  status: pending | approved | rejected
  must_change_password: boolean
  client_id: uuid (nullable, FK to clients — Phase 1 table)
```

### Recommended Project Structure
```
app/
├── (auth)/
│   ├── signup/page.tsx          # PM self-signup form
│   ├── login/page.tsx           # shared login for all roles
│   ├── pending/page.tsx         # static waiting screen (D-06)
│   └── change-password/page.tsx # forced first-login password change (AUTH-10)
├── admin/
│   ├── approvals/page.tsx       # AUTH-03/04: pending PM queue, approve/reject/assign role
│   └── clients/[id]/access/     # create/deactivate Client logins (AUTH-09/11) — Admin can do this too
├── pm/
│   └── clients/[id]/access/     # PM creates/deactivates Client logins for assigned clients
├── client/
│   └── ...                      # Client-facing area (built out in later phases)
└── middleware.ts                 # session refresh + role/status routing gate

lib/
└── supabase/
    ├── client.ts                # createBrowserClient
    ├── server.ts                # createServerClient (Server Components/Actions)
    ├── middleware.ts             # updateSession() helper used by middleware.ts
    └── admin.ts                 # service-role client — server-only, never imported into a Client Component

supabase/
└── migrations/
    ├── 0001_profiles.sql         # profiles table + trigger + RLS
    ├── 0002_pm_clients.sql       # PM-to-client assignment join table + RLS helper
    └── 0003_rls_policies.sql     # is_admin(), pm_assigned_clients(), policies
```

### Pattern 1: Pending-Approval / Forced-Password-Change Gate (App-Layer, No Native Supabase Feature)

**What:** Supabase Auth has no concept of "pending admin approval" or "must change password." Both must be modeled as columns on `public.profiles` and enforced by checking that row on every protected request (in middleware or a shared layout), redirecting to a dedicated screen if the gate isn't satisfied.

**When to use:** Every request that isn't the login/signup/pending page itself.

**Example:**
```typescript
// middleware.ts (excerpt) — Source: pattern derived from https://supabase.com/docs/guides/auth/server-side/nextjs
// combined with app-specific profile gate (no official Supabase equivalent exists for this)
const { data: { user } } = await supabase.auth.getUser()

if (!user) {
  return NextResponse.redirect(new URL('/login', request.url))
}

const { data: profile } = await supabase
  .from('profiles')
  .select('role, status, must_change_password')
  .eq('id', user.id)
  .single()

if (!profile || profile.status === 'pending') {
  return NextResponse.redirect(new URL('/pending', request.url))
}
if (profile.status === 'rejected') {
  return NextResponse.redirect(new URL('/rejected', request.url))
}
if (profile.must_change_password && !request.nextUrl.pathname.startsWith('/change-password')) {
  return NextResponse.redirect(new URL('/change-password', request.url))
}
```
`[ASSUMED]` — this exact composition is not published as a single official Supabase example; it is a straightforward combination of the officially documented middleware pattern (session refresh) with app-specific business logic. Flagged for planner as a custom-code area, not a library feature.

### Pattern 2: `profiles` Table as Single Source of Truth for Role/Status

**What:** A `public.profiles` row is created automatically via a DB trigger the moment a row is inserted into `auth.users` (whether via self-signup or `admin.createUser()`), defaulting to `role='pm', status='pending'` for self-signup and `role='client', status='approved', must_change_password=true` for PM-provisioned Client logins (distinguished via `raw_user_meta_data` passed at creation time).

**When to use:** All role/status checks in RLS policies and route gating.

**Example:**
```sql
-- Source: pattern from https://supabase.com/docs/guides/auth/managing-user-data (official)
create type public.user_role as enum ('admin', 'pm', 'client');
create type public.approval_status as enum ('pending', 'approved', 'rejected');

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  role public.user_role not null default 'pm',
  status public.approval_status not null default 'pending',
  must_change_password boolean not null default false,
  client_id uuid references public.clients(id), -- nullable; set only for role='client'
  created_at timestamptz not null default now()
);

alter table public.profiles enable row level security;

create function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = ''
as $$
begin
  insert into public.profiles (id, role, status, must_change_password, client_id)
  values (
    new.id,
    coalesce((new.raw_user_meta_data->>'role')::public.user_role, 'pm'),
    case when (new.raw_user_meta_data->>'role') = 'client' then 'approved' else 'pending' end,
    coalesce((new.raw_user_meta_data->>'must_change_password')::boolean, false),
    (new.raw_user_meta_data->>'client_id')::uuid
  );
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();
```
`[CITED: supabase.com/docs/guides/auth/managing-user-data]` for the trigger scaffold; the role/status branching logic on `raw_user_meta_data` is `[ASSUMED]` (project-specific composition, not an official example).

### Pattern 3: Session Persistence via `@supabase/ssr` (Browser + Server + Middleware Clients)

**What:** Three separate Supabase client constructors are needed: `createBrowserClient` (Client Components), `createServerClient` (Server Components/Actions, cookies read-only), and a middleware variant of `createServerClient` (cookies read/write, refreshes tokens). This is what makes session persistence across refresh work — Server Components alone cannot write cookies, so middleware must intercept every request to refresh and re-set the auth cookie before it expires.

**When to use:** Always, for every Supabase interaction in this app — never instantiate `supabase-js` directly with raw fetch/cookie handling.

**Example:**
```typescript
// lib/supabase/server.ts — Source: https://supabase.com/docs/guides/auth/server-side/creating-a-client (official, Next.js variant)
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'

export async function createClient() {
  const cookieStore = await cookies()
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, // or PUBLISHABLE_KEY — see State of the Art
    {
      cookies: {
        getAll() { return cookieStore.getAll() },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options))
          } catch {
            // setAll called from a Server Component — ignore if middleware refreshes sessions
          }
        },
      },
    }
  )
}
```
`[CITED: supabase.com/docs/guides/auth/server-side/creating-a-client]` — confirmed pattern, exact code for the Next.js variant specifically should be pulled fresh from the docs page at implementation time since Supabase iterates this scaffold periodically (see Open Questions).

**Route protection:** call `supabase.auth.getUser()` (or `getClaims()` — see State of the Art) inside middleware before trusting any session data. **Never** trust `getSession()` alone in server code for authorization decisions — it reads from a cookie that could in principle be tampered with before signature verification; the official docs explicitly warn against relying on it for protecting pages. `[CITED: supabase.com/docs/guides/auth/server-side/nextjs]`

### Pattern 4: RLS Multi-Tenancy via SECURITY DEFINER Helper Functions

**What:** Three helper functions encapsulate the three access rules (AUTH-06/07/08), each marked `SECURITY DEFINER` (bypasses RLS internally, preventing recursion) and `STABLE` (allows Postgres to cache the result once per statement instead of re-evaluating per row).

**When to use:** Every RLS policy in the schema, on every table containing client-scoped data (clients, briefings, cards, etc. — this phase only needs it wired for `profiles` and a `pm_clients` join table; later phases reuse these same helpers).

**Example:**
```sql
-- Source: pattern from https://supabase.com/docs/guides/troubleshooting/rls-performance-and-best-practices-Z5Jjwv (official)
create table public.pm_clients (
  pm_id uuid not null references public.profiles(id) on delete cascade,
  client_id uuid not null references public.clients(id) on delete cascade,
  primary key (pm_id, client_id)
);
alter table public.pm_clients enable row level security;

-- is_admin(): used to OR into every policy for full admin access (AUTH-08)
create or replace function public.is_admin()
returns boolean
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  return exists (
    select 1 from public.profiles
    where id = (select auth.uid()) and role = 'admin' and status = 'approved'
  );
end;
$$;

-- pm_assigned_clients(): returns the set of client_ids this PM can see (AUTH-06)
create or replace function public.pm_assigned_clients()
returns setof uuid
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  return query select client_id from public.pm_clients where pm_id = (select auth.uid());
end;
$$;

-- Example policy on a future "clients" table (Phase 1), shown here to demonstrate the pattern:
create policy "pm_sees_assigned_clients_only"
on public.clients
for select
to authenticated
using (
  (select public.is_admin())
  or id in (select public.pm_assigned_clients())
  or id = (select client_id from public.profiles where id = (select auth.uid())) -- Client sees own record
);

-- Index required for RLS performance (AUTH-06/07 at scale):
create index idx_pm_clients_pm_id on public.pm_clients (pm_id);
create index idx_profiles_client_id on public.profiles (client_id);
```
`[CITED: supabase.com/docs/guides/troubleshooting/rls-performance-and-best-practices-Z5Jjwv]` and `[CITED: supabase.com/docs/guides/database/postgres/row-level-security]` for the SECURITY DEFINER + STABLE + `(select ...)` wrapping pattern. The specific table/column names (`pm_clients`, `pm_assigned_clients()`) are project-specific `[ASSUMED]` naming, not official examples.

### Anti-Patterns to Avoid

- **Checking role/status only in the UI (hiding buttons/links):** AUTH-06/07 explicitly require enforcement "at the data layer (RLS), not just hidden in the UI" per the phase success criteria. A hidden button is not a security boundary — any authenticated user can call the Supabase REST/JS API directly.
- **Querying a join table directly inside another table's RLS policy** (e.g., `client_id in (select client_id from pm_clients where pm_clients.client_id = clients.id)` written inline in the `clients` policy while `pm_clients` also has its own RLS policy): triggers `infinite recursion detected in policy` at runtime. Always route through a `SECURITY DEFINER` function instead (Pattern 4, Pitfall 1).
- **Leaving RLS disabled on a new table "temporarily" during development:** RLS is opt-in per table in Postgres/Supabase — a newly created table with no RLS enabled is fully readable/writable by anyone holding the anon/publishable key. This is the exact root cause of CVE-2025-48757 (170+ exposed apps). Every migration that creates a table must include `alter table ... enable row level security;` in the same migration, never as a follow-up step.
- **Using the service role / secret key in any Client Component or client-side bundle:** `auth.admin.*` methods (used for AUTH-09 create-Client-login and AUTH-11 deactivate) must only run in Server Actions/Route Handlers, never shipped to the browser.
- **Relying on `getSession()` alone for authorization in server code:** use `getUser()` (or `getClaims()`) to force JWT verification against the Auth server / JWKS rather than trusting an unverified cookie payload.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Cookie parsing/session sync across browser/server/middleware | Custom cookie reader/writer for Supabase JWTs | `@supabase/ssr`'s `createBrowserClient`/`createServerClient` | Official package handles PKCE flow, cookie chunking for large JWTs, and refresh-token rotation edge cases that are easy to get subtly wrong by hand |
| Password hashing/storage | Any custom password storage | Supabase Auth (`auth.users`, `signUp`, `signInWithPassword`) | Supabase Auth (GoTrue) already handles bcrypt hashing, rate limiting, and email/password validation |
| User deactivation/ban | Custom `is_active` check only in RLS | `auth.admin.updateUserById(uid, { ban_duration })` | Native ban blocks login at the Auth layer itself, not just data access — defense in depth that a custom flag alone doesn't provide |
| Admin-provisioned user creation | Manual `auth.users` INSERT via raw SQL | `auth.admin.createUser()` | Handles password hashing, email confirmation flags, and metadata correctly; direct `auth.users` inserts bypass Auth internals and commonly break |
| Role-based data isolation | App-layer `WHERE` clauses added manually to every query | Postgres RLS policies | App-layer filtering is trivially bypassed by anyone calling the Supabase REST API directly with valid credentials; RLS is enforced at the database connection level regardless of client |

**Key insight:** Supabase's value proposition for this phase is that Auth + RLS together remove the need for a custom authorization middleware layer — but only if RLS is actually turned on for every table and helper functions are used correctly. Any "shortcut" that reintroduces app-layer-only authorization (UI hiding, manual WHERE clauses, disabled RLS) defeats the entire point of the stack choice documented in PROJECT.md.

## Common Pitfalls

### Pitfall 1: Infinite Recursion in RLS Policies on Join Tables

**What goes wrong:** A policy on `clients` that queries `pm_clients` (which itself has RLS enabled) inside a subquery triggers Postgres to re-evaluate `pm_clients`'s own policy, which may reference `clients` again, causing `ERROR: infinite recursion detected in policy for relation "..."` — a 500 error in production.
**Why it happens:** RLS policies are not aware of "who is asking" in a way that lets Postgres short-circuit; if two tables' policies reference each other (directly or transitively), the planner loops.
**How to avoid:** Wrap any cross-table check in a `SECURITY DEFINER` (+ `STABLE`) function using `language plpgsql` (not `language sql`, which Postgres may inline and lose the security-definer context). See Pattern 4.
**Warning signs:** Any RLS policy whose `USING`/`WITH CHECK` clause contains a subquery against a *different* table that also has RLS enabled.

### Pitfall 2: RLS Not Enabled on a New Table (CVE-2025-48757 class of bug)

**What goes wrong:** A table created via migration or the Supabase dashboard Table Editor has RLS **off by default**. Any request using the anon/publishable key can read/write every row until RLS is explicitly enabled.
**Why it happens:** RLS is opt-in per table in Postgres; Supabase does not force it on for new tables (there is a dashboard-level "Enable RLS on new tables" toggle, but it must be turned on manually and doesn't retroactively cover tables created via SQL migrations run outside the dashboard).
**How to avoid:** Every migration file that runs `CREATE TABLE` must be followed in the same file by `ALTER TABLE ... ENABLE ROW LEVEL SECURITY;` and at least a default-deny policy set. Treat "table exists with no RLS policy" as equivalent to "table is public," because that is literally true for the `anon` role.
**Warning signs:** Any table visible in `select * from pg_tables where rowsecurity = false and schemaname = 'public';` post-migration is a hard blocker for this phase's verification.
**Source:** `[CITED]` — CVE-2025-48757, disclosed May 2025, found 303 exposed endpoints across 170+ production Lovable/Supabase apps due to exactly this default. This is a HIGH-severity, real-world-documented pitfall, not theoretical.

### Pitfall 3: Confusing Supabase Auth's `role` Claim with Application-Level Role

**What goes wrong:** Supabase Auth's JWT `role` claim is always one of `anon`, `authenticated`, or `service_role` — this is a Postgres connection-role concept, unrelated to "Admin/PM/Client" in this app's domain. Developers sometimes try to use `auth.jwt() ->> 'role'` expecting `'admin'`/`'pm'`/`'client'` and get `'authenticated'` for everyone.
**Why it happens:** Naming collision between Postgres/Supabase's built-in `role` and the app's own business-role concept.
**How to avoid:** Always source app-level role from `public.profiles.role` (or a custom claim injected via `custom_access_token_hook`, if adopted later — see State of the Art), never from `auth.jwt() ->> 'role'` directly.
**Warning signs:** Any RLS policy or middleware check comparing `auth.jwt()->>'role'` to `'admin'`/`'pm'`/`'client'` — this will never match.

### Pitfall 4: Service Role Key Leaking to the Client Bundle

**What goes wrong:** `auth.admin.createUser()` (needed for AUTH-09) and `auth.admin.updateUserById(ban_duration)` (needed for AUTH-11) require the service_role/secret key. If this client is instantiated in a file imported by a Client Component (even transitively), Next.js may bundle the key into client-side JS, or a developer may accidentally prefix the env var with `NEXT_PUBLIC_`.
**Why it happens:** Easy copy-paste mistake when there are already two other Supabase clients (browser, server) in the codebase using similarly-named env vars.
**How to avoid:** Keep the admin client in a clearly-separated `lib/supabase/admin.ts`, only ever imported from Server Actions/Route Handlers (files with `'use server'` or under `app/api/`), and name its env var without the `NEXT_PUBLIC_` prefix (e.g., `SUPABASE_SECRET_KEY`, never `NEXT_PUBLIC_SUPABASE_SECRET_KEY`). Add this to a lint/review checklist.
**Warning signs:** Any `NEXT_PUBLIC_*` env var containing `SECRET` or `SERVICE_ROLE` in its name.

### Pitfall 5: Trigger on `auth.users` Failing Silently Blocks All Signups

**What goes wrong:** The `handle_new_user()` trigger (Pattern 2) runs synchronously as part of the `auth.users` INSERT transaction. If it throws (e.g., an enum cast fails because `raw_user_meta_data->>'role'` is an unexpected string), the entire signup fails with an opaque 500 from Supabase Auth — not a clear "profile creation failed" error.
**Why it happens:** The trigger function has no error handling, and metadata passed from a Server Action's `signUp()`/`admin.createUser()` call isn't validated before insertion.
**How to avoid:** Validate `role`/`client_id` metadata with `zod` in the Server Action before calling Supabase Auth, and keep the trigger function's logic minimal and defensively coded (e.g., `coalesce` with safe defaults, as shown in Pattern 2). Test both signup paths (PM self-signup, PM-provisioned Client) end-to-end before considering this phase done.
**Warning signs:** Signup returns a generic "Database error saving new user" message from Supabase Auth.

## Code Examples

### PM Self-Signup (Server Action)
```typescript
// app/(auth)/signup/actions.ts
'use server'
import { createClient } from '@/lib/supabase/server'

export async function signUp(formData: FormData) {
  const supabase = await createClient()
  const { error } = await supabase.auth.signUp({
    email: formData.get('email') as string,
    password: formData.get('password') as string,
    options: { data: { role: 'pm' } }, // read by handle_new_user() trigger
  })
  if (error) return { error: error.message }
  return { success: true } // redirect to /pending
}
```
`[ASSUMED]` composition; `signUp()` call itself is `[CITED: supabase.com/docs/reference/javascript/auth-signup]`.

### PM Creates Client Login (Server Action, service role)
```typescript
// app/pm/clients/[id]/access/actions.ts
'use server'
import { createAdminClient } from '@/lib/supabase/admin' // service_role key, server-only

export async function createClientLogin(clientId: string, email: string, tempPassword: string) {
  const supabaseAdmin = createAdminClient()
  const { data, error } = await supabaseAdmin.auth.admin.createUser({
    email,
    password: tempPassword,
    email_confirm: true, // skip email confirmation flow — no email delivery in v1
    user_metadata: { role: 'client', client_id: clientId, must_change_password: true },
  })
  if (error) return { error: error.message }
  return { userId: data.user.id }
}
```
`[CITED: supabase.com/docs/reference/javascript/auth-admin-createuser]` for the `createUser` call and `email_confirm` flag; the `must_change_password` metadata is `[ASSUMED]` project-specific composition consumed by the trigger in Pattern 2.

### Deactivate Client Access
```typescript
// app/pm/clients/[id]/access/actions.ts
'use server'
import { createAdminClient } from '@/lib/supabase/admin'

export async function deactivateClientAccess(userId: string) {
  const supabaseAdmin = createAdminClient()
  const { error } = await supabaseAdmin.auth.admin.updateUserById(userId, {
    ban_duration: '876000h', // ~100 years — effectively permanent until manually lifted
  })
  return { error: error?.message }
}
```
`[CITED: supabase.com/docs/reference/javascript/auth-admin-updateuserbyid]`

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| `@supabase/auth-helpers-nextjs` | `@supabase/ssr` | Deprecated, migration guide published | Do not scaffold new projects with `auth-helpers-nextjs` — it is explicitly superseded |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` (+ `SUPABASE_SECRET_KEY` server-side) | New key format (`sb_publishable_...`/`sb_secret_...`) rolling out through 2026; legacy anon/service_role keys still work but are being deprecated by end of 2026 | For a greenfield project starting now, use the new publishable/secret key naming from day one to avoid a migration later — but confirm against the actual Supabase project dashboard at implementation time, since both old and new keys currently coexist |
| `supabase.auth.getUser()` for route protection | `supabase.auth.getClaims()` | Very recent (2026) — docs are actively being updated, and a still-open/recently-closed GitHub issue (#39947) notes inconsistency between guides | `getClaims()` verifies the JWT locally against a cached JWKS (faster, no network round-trip) when the project uses asymmetric signing keys; falls back to behaving like `getUser()` on projects still using symmetric (legacy) signing keys. **MEDIUM confidence**: for a brand-new project this phase should default to `getUser()` (universally documented, unambiguous, works regardless of signing-key type) and treat `getClaims()` as an optional follow-up optimization once the team confirms the project's JWT signing key type in the Supabase dashboard. |

**Deprecated/outdated:**
- `@supabase/auth-helpers-nextjs`: superseded by `@supabase/ssr`, do not install.
- Relying solely on `getSession()` for authorization: officially discouraged in current docs regardless of the getUser/getClaims question above.

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | Exact composition of the pending-approval + must-change-password middleware gate (no single official Supabase example covers this combined flow) | Architecture Patterns: Pattern 1 | Low — logic is straightforward conditional routing; worst case is a redirect-loop bug caught in manual testing, not a security hole |
| A2 | Role/status branching logic inside `handle_new_user()` trigger based on `raw_user_meta_data` | Architecture Patterns: Pattern 2 | Medium — if metadata isn't validated before signup, a malformed payload could set an unintended role; mitigated by zod validation in Server Action (Pitfall 5) |
| A3 | Table/function names (`pm_clients`, `pm_assigned_clients()`, `is_admin()`) are project-specific naming, not official examples | Architecture Patterns: Pattern 4 | Low — cosmetic; the underlying SECURITY DEFINER pattern is officially cited |
| A4 | Recommendation to default to `getUser()` over `getClaims()` for this phase given uncertain JWT signing-key type on a brand-new Supabase project | State of the Art | Low-Medium — if wrong, `getClaims()` would simply have been the faster/more current choice; using `getUser()` still works correctly, just with one extra network round-trip per protected request. No security risk either way per official docs. |
| A5 | `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`/`SUPABASE_SECRET_KEY` naming vs legacy `ANON_KEY`/`SERVICE_ROLE_KEY` — exact naming to use depends on which key format the actual Supabase project (once created) exposes in its dashboard | Standard Stack, State of the Art | Low — both formats currently work; wrong guess just means renaming an env var later |

**If this table is empty:** N/A — assumptions listed above should be confirmed against the live Supabase project dashboard during Wave 0 of planning (project not yet created).

## Open Questions (RESOLVED)

1. **Has the Supabase project for this app been created yet, and if so, does it default to asymmetric (ECC/RSA) or symmetric (HS256) JWT signing keys?**
   - What we know: New Supabase projects created recently may default to asymmetric signing keys, which is what makes `getClaims()` fast; older/legacy projects use symmetric keys.
   - What's unclear: Whether this specific project (not yet created per code_context in CONTEXT.md) will get asymmetric keys by default, and whether that affects the `getUser()` vs `getClaims()` choice materially for a small-scale app (~10 clients).
   - Recommendation: Default to `getUser()` in the plan (always correct, simpler mental model); leave `getClaims()` as a documented future optimization, not a blocking decision for this phase.

2. **Should Client login creation skip Supabase's email confirmation entirely (`email_confirm: true`), given there's no email delivery in v1?**
   - What we know: D-08/D-09 confirm email+password auth with no magic link; PM sets the provisional password directly.
   - What's unclear: Whether Supabase Auth would otherwise send a confirmation email on `admin.createUser()` that the Client would never receive (no email infra in v1), effectively locking them out.
   - Recommendation: Set `email_confirm: true` on `admin.createUser()` calls (shown in Code Examples) to bypass any email-confirmation requirement — this is an explicit, documented parameter for exactly this scenario, not a workaround.

3. **Exact current code for `middleware.ts` / `lib/supabase/middleware.ts` on the official Next.js SSR guide page** — WebFetch's summarizer stripped the literal code blocks from `supabase.com/docs/guides/auth/server-side/nextjs` during this research session (page content is fetched through an intermediate model that dropped code fences). The conceptual pattern (refresh token in middleware, sync cookies both directions) is confirmed and cited, and the general `createServerClient` shape is confirmed from the sibling "creating-a-client" page, but the planner/implementer should pull the literal current code directly from that URL (or via `curl`/browser) at implementation time rather than relying solely on this research's reconstructed example in Pattern 3.
   - Recommendation: Treat Pattern 3's code sample as directionally correct and citeable for structure, but re-verify the literal snippet against the live docs page before finalizing `middleware.ts` in Wave 0.

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Node.js | Next.js dev/build | ✓ | v24.12.0 | — |
| npm | package installs | ✓ | 11.6.2 | — |
| Supabase CLI (`supabase`) | Local dev stack, migrations | ✗ | — | Install via `npm install supabase --save-dev` or Homebrew before Wave 0; not strictly required if migrations are applied directly to a hosted Supabase project via SQL editor, but strongly recommended for repeatable migrations |
| Supabase project (hosted) | All Auth/RLS work in this phase | Unknown — not yet created per CONTEXT.md code_context ("Greenfield project — no code exists yet") | — | Must be provisioned (new project on supabase.com) before any implementation task in this phase can start; this is a Wave 0 blocker, not optional |

**Missing dependencies with no fallback:**
- A created Supabase project (URL + keys) — this phase cannot proceed at all without one. Must be the first task in the plan.

**Missing dependencies with fallback:**
- Supabase CLI — can be added as a dev dependency at the start of Wave 0; not a hard blocker if the team is comfortable running migrations through the Supabase dashboard SQL editor initially, but CLI-based migrations are strongly preferred for reviewability/version control.

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | None detected — greenfield project, no test config exists yet |
| Config file | none — see Wave 0 |
| Quick run command | To be established in Wave 0 (recommend `vitest` for unit tests of helper logic, e.g. role-gating functions, if any pure functions emerge) |
| Full suite command | To be established in Wave 0 |

### Phase Requirements → Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| AUTH-01 | PM signup creates pending profile | integration (Supabase local + Playwright or manual) | manual-only for v1 — justification: no test framework exists yet, RLS/Auth flows are most reliably verified against a real (local) Supabase instance rather than mocked | ❌ Wave 0 |
| AUTH-02 | Pending PM cannot access platform | integration / manual | manual-only (see above) | ❌ Wave 0 |
| AUTH-03 | Admin approves/rejects, rejected not deleted | integration / manual | manual-only (see above) | ❌ Wave 0 |
| AUTH-04 | Admin assigns role, takes effect next login | integration / manual | manual-only (see above) | ❌ Wave 0 |
| AUTH-05 | Session persists across refresh | manual (browser refresh test) | manual-only — justification: browser session persistence is best verified with an actual browser (Playwright e2e) rather than unit test; Playwright not yet installed | ❌ Wave 0 |
| AUTH-06 | PM blocked from unassigned client at RLS layer | integration (SQL-level RLS test via `supabase test db` or direct psql as different roles) | `supabase test db` (pgTAP) if Supabase CLI installed, else manual psql verification with `set role authenticated; set request.jwt.claims = ...` | ❌ Wave 0 |
| AUTH-07 | Client blocked from other clients' data at RLS layer | integration (same as AUTH-06) | same as above | ❌ Wave 0 |
| AUTH-08 | Admin sees everything | integration (same as AUTH-06) | same as above | ❌ Wave 0 |
| AUTH-09 | PM creates Client login linked to client record | integration / manual | manual-only for v1 | ❌ Wave 0 |
| AUTH-10 | Client forced to change password on first login | manual (browser flow) | manual-only for v1 | ❌ Wave 0 |
| AUTH-11 | PM/Admin deactivates Client access | integration / manual | manual-only for v1 | ❌ Wave 0 |

**Rationale for manual-only classification:** This phase is fundamentally about Postgres RLS policies and Supabase Auth state transitions — the highest-fidelity test is against a real (local, via Supabase CLI) Postgres instance with RLS enabled, not a mocked unit test. Given no test framework exists yet and the project is time-pressured toward a 2026-09-30 target, recommend `pgTAP` (via `supabase test db`) specifically for the RLS policies (AUTH-06/07/08) since those are the highest-risk, most security-critical behaviors and are well-suited to SQL-level automated testing. Browser-flow behaviors (signup, approval, login, password change) are recommended as manual verification checklists for this phase, with Playwright e2e coverage deferred to a later hardening pass — flag this tradeoff explicitly to the user during planning.

### Sampling Rate
- **Per task commit:** Manual click-through of the specific flow just built (e.g., after building signup, manually sign up a test PM and confirm `pending` status)
- **Per wave merge:** Full manual pass through all AUTH-01–11 success criteria listed in the phase goal, plus `supabase test db` if pgTAP tests were written for RLS policies
- **Phase gate:** All 6 success criteria from the phase description must be manually verified true before `/gsd:verify-work`

### Wave 0 Gaps
- [ ] Supabase project provisioned (hosted or local via CLI) — hard blocker, see Environment Availability
- [ ] `supabase/migrations/` directory + Supabase CLI installed, OR a documented decision to apply migrations via dashboard SQL editor instead
- [ ] Decision on whether to invest in `pgTAP` tests for RLS policies (AUTH-06/07/08) given phase criticality, or accept manual-only verification for v1 given timeline pressure — **flag this explicitly to the user**, since RLS bugs are the single highest-severity risk class in this phase (see Pitfall 2 / CVE-2025-48757)
- [ ] No test framework installed at all — if the team wants any automated coverage beyond pgTAP, Vitest + Playwright would need to be added

## Security Domain

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-------------------|
| V2 Authentication | Yes | Supabase Auth (GoTrue) — email/password, bcrypt hashing, built-in rate limiting |
| V3 Session Management | Yes | `@supabase/ssr` cookie-based JWT sessions, refresh-token rotation handled by Supabase Auth |
| V4 Access Control | Yes | Postgres RLS policies backed by `SECURITY DEFINER` helper functions — this is the core of the phase |
| V5 Input Validation | Yes | `zod` schema validation on Server Action inputs (email format, password length) before calling Supabase Auth |
| V6 Cryptography | Partial | Password hashing delegated entirely to Supabase Auth (GoTrue) — never hand-roll; JWT signing (HS256/ES256) is a Supabase project-level setting, not something this phase configures directly |

### Known Threat Patterns for Supabase + Next.js Multi-Tenant Apps

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| RLS disabled on a table (default-open data) | Information Disclosure / Elevation of Privilege | `ALTER TABLE ... ENABLE ROW LEVEL SECURITY` in the same migration as every `CREATE TABLE`; verify with `pg_tables.rowsecurity` (Pitfall 2, CVE-2025-48757) |
| Recursive RLS policy causing 500/DoS-like failure | Denial of Service (availability) | `SECURITY DEFINER` helper functions (Pitfall 1) |
| Service role key exposed to browser bundle | Elevation of Privilege | Server-only admin client, non-`NEXT_PUBLIC_` env var naming (Pitfall 4) |
| UI-only role gating (buttons hidden, no RLS backing) | Elevation of Privilege | RLS enforced at DB layer regardless of UI state — explicit phase success criterion (AUTH-06/07) |
| Trusting `getSession()`/unverified cookie payload for authorization | Spoofing | `getUser()`/`getClaims()` JWT verification, never raw session trust (Pattern 3) |
| Weak provisional passwords for Client accounts guessable/reused | Spoofing | Forced password change on first login (AUTH-10); recommend generating provisional passwords with sufficient entropy (e.g., a random 12+ char string) rather than a PM-chosen simple password, even though D-09 doesn't specify generation method — flag as a planning decision |

## Sources

### Primary (HIGH confidence)
- https://supabase.com/docs/guides/auth/server-side/creating-a-client — client construction patterns (browser/server/middleware)
- https://supabase.com/docs/guides/auth/server-side/nextjs — Next.js SSR setup, getUser()/getClaims() guidance, publishable key env var naming
- https://supabase.com/docs/guides/database/postgres/row-level-security — RLS fundamentals, SECURITY DEFINER pattern, indexing
- https://supabase.com/docs/guides/troubleshooting/rls-performance-and-best-practices-Z5Jjwv — recursion avoidance, `(select auth.uid())` caching, join-table pitfall
- https://supabase.com/docs/guides/auth/managing-user-data — `profiles` table + trigger pattern
- https://supabase.com/docs/guides/database/postgres/custom-claims-and-role-based-access-control-rbac — custom_access_token_hook (alternative considered, not adopted for v1)
- https://supabase.com/docs/reference/javascript/auth-admin-createuser — `admin.createUser()` params
- https://supabase.com/docs/reference/javascript/auth-admin-updateuserbyid — `ban_duration` deactivation pattern
- https://supabase.com/docs/reference/javascript/auth-getclaims — getClaims() reference

### Secondary (MEDIUM confidence)
- GitHub issue supabase/supabase#39947 — documents an active docs inconsistency between `getUser()` and `getClaims()` in SSR guides, cross-verified with official getClaims reference
- npm registry (`npm view`) — version/publish-date verification for all recommended packages, cross-verified with slopcheck `OK` status

### Tertiary (LOW confidence)
- vibeappscanner.com, byteiota.com, blog.vibecoder.me — CVE-2025-48757 coverage; cross-verified core claim (RLS opt-in, not default) against official Supabase RLS docs, which independently confirm RLS must be manually enabled per table

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — `@supabase/ssr` + `@supabase/supabase-js` are unambiguously the official, current, non-deprecated choice; versions verified against live npm registry
- Architecture: HIGH for RLS/SECURITY DEFINER patterns (directly cited from official troubleshooting docs); MEDIUM for the pending-approval/forced-password-change gate composition (no single official example covers this exact combined flow — reasonable synthesis of documented pieces, flagged in Assumptions Log)
- Pitfalls: HIGH — RLS recursion and RLS-disabled-by-default are both officially documented and independently corroborated by a real, named CVE
- Security: HIGH for what Supabase provides natively (Auth, RLS); MEDIUM for the app-layer gates this phase must hand-build (approval status, forced password change) since those have no official reference implementation to point to

**Research date:** 2026-07-01
**Valid until:** ~30 days (stable domain — Supabase Auth/RLS fundamentals are mature; the `getUser()`→`getClaims()` transition and publishable/secret key rename are actively moving targets worth re-checking if implementation starts more than a few weeks after this research)
