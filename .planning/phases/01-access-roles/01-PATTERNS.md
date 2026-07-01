# Phase 1: Access & Roles - Pattern Map

**Mapped:** 2026-07-01
**Files analyzed:** 24 (new — greenfield, 0 modified)
**Analogs found:** 0 in-repo / 24 — repo has **zero existing application code** (confirmed: no `package.json`, no `app/`, `lib/`, or `supabase/` directories, no `.ts`/`.tsx`/`.sql` files anywhere outside `.planning/`). Every file below is mapped to its **canonical official-docs pattern** from RESEARCH.md instead of an in-repo analog.

**IMPORTANT for planner:** This is a Wave 0 situation. There is no codebase convention to inherit — the patterns below establish the project's *first* conventions for Supabase client construction, RLS, and role-gated routing. Treat every excerpt in this file as the source of truth to copy from (already vetted/cited in RESEARCH.md), not as "one option among several in-repo styles."

## File Classification

| New File | Role | Data Flow | Closest Analog | Match Quality |
|----------|------|-----------|-----------------|---------------|
| `lib/supabase/client.ts` | provider (Supabase client factory) | request-response | RESEARCH.md Pattern 3 / Supabase official `creating-a-client` docs | no in-repo analog — canonical doc pattern |
| `lib/supabase/server.ts` | provider (Supabase client factory) | request-response | RESEARCH.md Pattern 3 / Supabase official `creating-a-client` docs | no in-repo analog — canonical doc pattern |
| `lib/supabase/middleware.ts` | middleware | request-response | RESEARCH.md Pattern 1 + Pattern 3 / Supabase official `server-side/nextjs` docs | no in-repo analog — canonical doc pattern |
| `lib/supabase/admin.ts` | service (privileged) | request-response | RESEARCH.md Pitfall 4 + Code Examples / Supabase official `auth-admin-createuser` docs | no in-repo analog — canonical doc pattern |
| `middleware.ts` (project root) | middleware | request-response | RESEARCH.md Pattern 1 / Supabase official `server-side/nextjs` docs | no in-repo analog — canonical doc pattern |
| `app/(auth)/signup/page.tsx` | component (form) | request-response | RESEARCH.md Code Examples (PM Self-Signup) | no in-repo analog |
| `app/(auth)/signup/actions.ts` | controller (Server Action) | CRUD (create) | RESEARCH.md Code Examples (PM Self-Signup Server Action) | no in-repo analog — canonical doc pattern |
| `app/(auth)/login/page.tsx` | component (form) | request-response | RESEARCH.md Pattern 3 (session pattern) — no dedicated login example in RESEARCH.md; compose from `signInWithPassword()` per Supabase JS reference | no in-repo analog |
| `app/(auth)/login/actions.ts` | controller (Server Action) | request-response | Same shape as signup Server Action (RESEARCH.md Code Examples) | no in-repo analog — derive from analogous signup action |
| `app/(auth)/pending/page.tsx` | component (static) | request-response | None needed — static content per D-06; no server logic | no analog needed (trivial static screen) |
| `app/(auth)/rejected/page.tsx` | component (static) | request-response | Same as `/pending` — static screen, gated by middleware | no analog needed (trivial static screen) |
| `app/(auth)/change-password/page.tsx` | component (form) | CRUD (update) | RESEARCH.md Pattern 1 (gate) + Supabase `updateUser()` reference | no in-repo analog |
| `app/(auth)/change-password/actions.ts` | controller (Server Action) | CRUD (update) | Same Server Action shape as signup; calls `supabase.auth.updateUser()` + clears `must_change_password` | no in-repo analog |
| `app/admin/approvals/page.tsx` | component (table/list) | CRUD (read) | RESEARCH.md Architecture Patterns / UI-SPEC Screen Inventory #4 | no in-repo analog |
| `app/admin/approvals/actions.ts` | controller (Server Action) | CRUD (update) | RESEARCH.md AUTH-03/04 — Admin-only UPDATE on `profiles.status`/`profiles.role`, RLS-backed | no in-repo analog |
| `app/admin/clients/[id]/access/page.tsx` | component (form) | CRUD (create) | RESEARCH.md Code Examples (PM Creates Client Login) — same UI, Admin-scoped route | no in-repo analog |
| `app/pm/clients/[id]/access/page.tsx` | component (form) | CRUD (create) | RESEARCH.md Code Examples (PM Creates Client Login) | no in-repo analog |
| `app/pm/clients/[id]/access/actions.ts` | controller (Server Action, privileged) | CRUD (create + deactivate) | RESEARCH.md Code Examples ("PM Creates Client Login", "Deactivate Client Access") | no in-repo analog — canonical doc pattern, verbatim-citable |
| `app/admin/clients/[id]/access/actions.ts` | controller (Server Action, privileged) | CRUD (create + deactivate) | Same as PM variant — reuse identical Server Action logic, Admin-scoped route | no in-repo analog |
| `app/pm/page.tsx` | component (placeholder shell) | request-response | UI-SPEC Screen Inventory #7 — trivial placeholder | no analog needed (trivial static screen) |
| `app/client/page.tsx` | component (placeholder shell) | request-response | UI-SPEC Screen Inventory #8 — trivial placeholder | no analog needed (trivial static screen) |
| `app/admin/page.tsx` | component (placeholder shell) | request-response | UI-SPEC Screen Inventory #9 — trivial placeholder | no analog needed (trivial static screen) |
| `supabase/migrations/0001_profiles.sql` | migration | CRUD (schema) | RESEARCH.md Pattern 2 / Supabase official `managing-user-data` docs | no in-repo analog — canonical doc pattern, verbatim-citable |
| `supabase/migrations/0002_pm_clients.sql` | migration | CRUD (schema) | RESEARCH.md Pattern 4 / Supabase official `rls-performance-and-best-practices` docs | no in-repo analog — canonical doc pattern |
| `supabase/migrations/0003_rls_policies.sql` | migration | CRUD (schema) | RESEARCH.md Pattern 4 (`is_admin()`, `pm_assigned_clients()`) / Supabase official RLS docs | no in-repo analog — canonical doc pattern, verbatim-citable |

## Pattern Assignments

### `lib/supabase/client.ts` (provider, request-response)

**Analog:** No in-repo analog. Canonical source: Supabase official docs, `supabase.com/docs/guides/auth/server-side/creating-a-client` — browser variant (RESEARCH.md does not print this exact snippet but cites the same doc page as Pattern 3's server variant; the browser client is the sibling constructor on the same page).

**Core pattern to follow (browser client — construct from `createBrowserClient`, same doc family as the server excerpt actually reproduced in RESEARCH.md Pattern 3):**
```typescript
// lib/supabase/client.ts
import { createBrowserClient } from '@supabase/ssr'

export function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY! // or ANON_KEY — confirm against live project dashboard (RESEARCH.md Assumption A5)
  )
}
```
`[ASSUMED composition]` — RESEARCH.md only reproduces the server-side excerpt verbatim (see below); the browser-client constructor shape must be pulled fresh from the same official page at implementation time per RESEARCH.md's own Open Question 3 caveat (code fences were stripped from the live fetch during research).

---

### `lib/supabase/server.ts` (provider, request-response)

**Analog:** No in-repo analog. Canonical source: `[CITED: supabase.com/docs/guides/auth/server-side/creating-a-client]` — this exact excerpt is reproduced in RESEARCH.md Architecture Patterns, Pattern 3.

**Core pattern (verbatim from RESEARCH.md):**
```typescript
// lib/supabase/server.ts
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
**Note:** RESEARCH.md explicitly flags this as needing re-verification against the live docs page before finalizing (Supabase iterates this scaffold periodically) — planner should treat this as directionally correct, not frozen.

---

### `lib/supabase/middleware.ts` + `middleware.ts` (middleware, request-response)

**Analog:** No in-repo analog. Canonical source: RESEARCH.md Architecture Patterns, Pattern 1 (`[ASSUMED]` composition of an officially-documented session-refresh middleware pattern combined with app-specific gating — no single official Supabase example covers this exact combined flow).

**Core pattern (verbatim from RESEARCH.md Pattern 1):**
```typescript
// middleware.ts (excerpt)
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
**Route protection rule (RESEARCH.md Pattern 3, cited):** Always use `supabase.auth.getUser()` — never `getSession()` alone — for authorization decisions in server/middleware code. Default to `getUser()` over `getClaims()` per RESEARCH.md's recommendation (Open Question 1 / Assumption A4) unless the live Supabase project is confirmed to use asymmetric JWT signing keys.

**Role-based redirect table to add on top of the gate above** (from RESEARCH.md System Architecture Diagram):
```
role=admin → /admin/*
role=pm    → /pm/*
role=client → /client/*
```

---

### `lib/supabase/admin.ts` (service, privileged, request-response)

**Analog:** No in-repo analog. Canonical source: RESEARCH.md Pitfall 4 + Code Examples (`auth-admin-createuser`, `auth-admin-updateuserbyid` official refs).

**Core pattern — MUST be server-only, MUST NOT be imported by any Client Component:**
```typescript
// lib/supabase/admin.ts — server-only, never imported into a Client Component
import { createClient } from '@supabase/supabase-js'

export function createAdminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SECRET_KEY! // NEVER prefix with NEXT_PUBLIC_ — RESEARCH.md Pitfall 4
  )
}
```
**Hard rule (RESEARCH.md Pitfall 4, Anti-Patterns):** name the env var without `NEXT_PUBLIC_` (e.g. `SUPABASE_SECRET_KEY`, not `NEXT_PUBLIC_SUPABASE_SECRET_KEY`), and only import this file from Server Actions (`'use server'`) or Route Handlers (`app/api/`).

---

### `app/(auth)/signup/actions.ts` (controller / Server Action, CRUD-create)

**Analog:** No in-repo analog. Canonical source: `[CITED: supabase.com/docs/reference/javascript/auth-signup]` for the `signUp()` call itself; `[ASSUMED]` for the metadata composition — reproduced verbatim in RESEARCH.md Code Examples.

**Core pattern (verbatim from RESEARCH.md):**
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
**Validation pattern to layer on top:** RESEARCH.md Standard Stack recommends `zod` for input validation before this call — this is not optional per Pitfall 5 ("Trigger on `auth.users` Failing Silently Blocks All Signups"): validate `role`/`client_id` metadata shape with `zod` in the Server Action *before* calling `signUp()`/`admin.createUser()`.

---

### `app/(auth)/login/actions.ts` (controller / Server Action, request-response)

**Analog:** No in-repo analog and no example reproduced verbatim in RESEARCH.md (research covers signup, not login, explicitly). Derive from the same Server Action shape as `signup/actions.ts` above, substituting `supabase.auth.signInWithPassword()` per the official JS client reference (same client construction, same error-return shape). Copy per UI-SPEC error states: "E-mail ou senha incorretos..." (wrong credentials) and "Seu cadastro não foi aprovado..." (rejected account attempts login) — both are UI-layer error mappings on top of the Supabase Auth error / profile status check, not native Supabase error strings.

---

### `app/(auth)/change-password/actions.ts` (controller / Server Action, CRUD-update)

**Analog:** No in-repo analog. Compose from: `supabase.auth.updateUser({ password })` (standard Supabase JS API) + an UPDATE on `profiles.must_change_password = false` gated by RLS (self-row update only). This is the resolution to CONTEXT.md's "Claude's Discretion" item on forced-password-change mechanism — RESEARCH.md confirms there is no native Supabase "must change password" flag (State of the Art / Pattern 1), so this Server Action must explicitly flip the app-layer flag after `updateUser()` succeeds.

---

### `app/pm/clients/[id]/access/actions.ts` and `app/admin/clients/[id]/access/actions.ts` (controller / Server Action, privileged, CRUD-create + deactivate)

**Analog:** No in-repo analog. Canonical source: `[CITED: supabase.com/docs/reference/javascript/auth-admin-createuser]` and `[CITED: supabase.com/docs/reference/javascript/auth-admin-updateuserbyid]` — both reproduced verbatim in RESEARCH.md Code Examples. These two routes (`/pm/clients/[id]/access` and `/admin/clients/[id]/access`) should share identical Server Action logic (RESEARCH.md: "Admin can do this too") — same action file content, different route wrapper.

**Create pattern (verbatim from RESEARCH.md):**
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

**Deactivate pattern (verbatim from RESEARCH.md):**
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
**Reminder (RESEARCH.md Alternatives Considered):** keep `profiles.status` in sync alongside `ban_duration` for UI/audit clarity — use both, not either/or.

---

### `app/admin/approvals/actions.ts` (controller / Server Action, CRUD-update)

**Analog:** No in-repo analog. No verbatim code example in RESEARCH.md for this specific action (AUTH-03/04 describes the requirement and RLS backing, not a code sample) — compose as a standard Server Action pattern matching the shape of the other actions in this file (server client via `lib/supabase/server.ts`, not admin client — this is a regular authenticated UPDATE gated by RLS's `is_admin()` policy, no service role needed):
```typescript
// app/admin/approvals/actions.ts (shape to follow — no verbatim source, composed from RESEARCH.md AUTH-03/04 + Pattern 4 RLS backing)
'use server'
import { createClient } from '@/lib/supabase/server'

export async function approveSignup(profileId: string, role: 'pm' | 'admin') {
  const supabase = await createClient()
  const { error } = await supabase
    .from('profiles')
    .update({ status: 'approved', role })
    .eq('id', profileId)
  return { error: error?.message }
}

export async function rejectSignup(profileId: string) {
  const supabase = await createClient()
  const { error } = await supabase
    .from('profiles')
    .update({ status: 'rejected' })
    .eq('id', profileId)
  return { error: error?.message }
}
```
This relies entirely on the RLS policy restricting `profiles` UPDATE to `is_admin()` (see migration patterns below) — do not add an app-layer `if (currentUser.role !== 'admin')` check as the *only* safeguard; RLS is the actual boundary per RESEARCH.md Anti-Patterns.

---

### `supabase/migrations/0001_profiles.sql` (migration, CRUD-schema)

**Analog:** No in-repo analog. Canonical source: `[CITED: supabase.com/docs/guides/auth/managing-user-data]` for the trigger scaffold — reproduced verbatim in RESEARCH.md Pattern 2. Role/status branching logic is `[ASSUMED]` project-specific composition.

**Core pattern (verbatim from RESEARCH.md Pattern 2):**
```sql
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
**Hard rule (Pitfall 2 / CVE-2025-48757):** `alter table ... enable row level security;` MUST be in this same migration file, never a follow-up step — the table is fully public to any `anon`-key holder until this line runs. This migration also needs at least a default-deny or self-select policy added in `0003_rls_policies.sql` immediately after table creation — do not leave a gap between table creation and policy attachment across migration files if they'd run out of order; sequence 0001→0003 must always apply together.

**Note:** `profiles.client_id` references `public.clients(id)` — the `clients` table itself is a Phase 2 deliverable per CONTEXT.md phase boundary. This FK will need `clients` to exist first; confirm migration ordering/dependency with the planner (Phase 1 may need to either stub a minimal `clients` table or defer the FK constraint — flag as an open sequencing question, not resolved by this pattern map).

---

### `supabase/migrations/0002_pm_clients.sql` + `0003_rls_policies.sql` (migration, CRUD-schema)

**Analog:** No in-repo analog. Canonical source: `[CITED: supabase.com/docs/guides/troubleshooting/rls-performance-and-best-practices-Z5Jjwv]` and `[CITED: supabase.com/docs/guides/database/postgres/row-level-security]` — reproduced verbatim in RESEARCH.md Pattern 4. Table/function names are `[ASSUMED]` project-specific naming (cosmetic only — underlying SECURITY DEFINER pattern is officially cited).

**Core pattern (verbatim from RESEARCH.md Pattern 4):**
```sql
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

-- Example policy on a future "clients" table (Phase 2), shown here to demonstrate the pattern:
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
**Hard rules to enforce in this migration:**
1. `language plpgsql` (not `language sql`) — Postgres may inline SQL-language functions and lose the `security definer` context (Pitfall 1).
2. Every cross-table RLS check must route through one of these two helper functions — never inline a subquery against another RLS-enabled table directly inside a policy (Pitfall 1: infinite recursion).
3. `profiles` itself also needs its own RLS policies in this migration (self-select, self-update restricted to non-role/non-status columns, admin-full-access via `is_admin()`) — RESEARCH.md's `clients`-table example is illustrative of the *pattern*; the planner must additionally write the analogous policies for `profiles` and `pm_clients` themselves in this phase, since those are the two tables Phase 1 actually owns.

---

## Shared Patterns

### Supabase Client Construction (three variants, never hand-rolled)
**Source:** RESEARCH.md Pattern 3, `[CITED: supabase.com/docs/guides/auth/server-side/creating-a-client]`
**Apply to:** every file that touches Supabase — `lib/supabase/client.ts` (browser), `lib/supabase/server.ts` (Server Components/Actions), `lib/supabase/middleware.ts` (middleware, cookie read/write + token refresh), `lib/supabase/admin.ts` (privileged, server-only).
**Rule:** Never instantiate `supabase-js` directly with raw fetch/cookie handling anywhere else in the app — always go through one of these four factory files.

### Route Protection / Authorization Check
**Source:** RESEARCH.md Pattern 3 (cited) + Pitfall 3
**Apply to:** `middleware.ts`, every Server Action that mutates privileged data (`approvals/actions.ts`, `access/actions.ts`)
```typescript
const { data: { user } } = await supabase.auth.getUser() // never getSession() alone for authz
```
Never read `auth.jwt() ->> 'role'` expecting `'admin'/'pm'/'client'` — that claim is always `anon`/`authenticated`/`service_role` (Pitfall 3). App role always comes from `public.profiles.role`.

### Pending-Approval / Forced-Password-Change Gate
**Source:** RESEARCH.md Pattern 1 (`[ASSUMED]` composition)
**Apply to:** `middleware.ts`, and defensively re-checked in `app/(auth)/change-password/page.tsx` and `app/admin/approvals/page.tsx` (don't rely on middleware alone for a screen that must never be reachable in the wrong state).

### RLS via SECURITY DEFINER Helpers
**Source:** RESEARCH.md Pattern 4 (cited), Pitfall 1
**Apply to:** all three migrations, and every future phase's tables that reference `profiles`/`clients` scoping (this phase establishes `is_admin()` and `pm_assigned_clients()` as reusable helpers for the whole project).

### Service-Role Isolation
**Source:** RESEARCH.md Pitfall 4
**Apply to:** `lib/supabase/admin.ts`, `app/pm/clients/[id]/access/actions.ts`, `app/admin/clients/[id]/access/actions.ts` — these are the only three files in this phase allowed to import the secret key. Add to code-review checklist: any `NEXT_PUBLIC_*` env var containing `SECRET`/`SERVICE_ROLE` is an automatic block.

### Input Validation Before Auth Calls
**Source:** RESEARCH.md Standard Stack (`zod`), Pitfall 5
**Apply to:** `signup/actions.ts`, `login/actions.ts`, `change-password/actions.ts`, `access/actions.ts` (both PM and Admin variants) — validate email/password/metadata shape with `zod` before any `supabase.auth.*` call, since a malformed `raw_user_meta_data` payload can silently fail the `handle_new_user()` trigger and produce an opaque 500.

## No Analog Found

All 24 files have no in-repo analog (confirmed empty repo). Files needing the most custom composition (no verbatim RESEARCH.md example to copy, only a described requirement) — planner should budget extra review time for these:

| File | Role | Data Flow | Reason |
|------|------|-----------|--------|
| `app/(auth)/login/actions.ts` | controller | request-response | RESEARCH.md covers signup and admin-createUser flows verbatim but not login; must be derived from the same Server Action shape + standard `signInWithPassword()` API |
| `app/(auth)/change-password/actions.ts` | controller | CRUD-update | No verbatim example; composed from `updateUser()` + custom `must_change_password` flag clear, per Pattern 1's stated gap ("no native Supabase flag") |
| `app/admin/approvals/actions.ts` | controller | CRUD-update | AUTH-03/04 described at requirement level only; no code sample in RESEARCH.md — composed pattern shown above, backed by RLS `is_admin()` |
| `supabase/migrations/0001_profiles.sql` (FK to `clients`) | migration | CRUD-schema | `clients` table is a Phase 2 deliverable — cross-phase dependency/ordering needs explicit resolution by planner (stub table vs deferred FK) |

## Metadata

**Analog search scope:** Entire repository (`.` excluding `.git/` and `.planning/`) — confirmed zero source files of any kind (`*.ts`, `*.tsx`, `*.js`, `*.sql`, `package.json`) exist outside planning docs.
**Files scanned:** Full repo tree (root listing + recursive find for source-file extensions) — 0 matches.
**Pattern extraction date:** 2026-07-01
**Extraction source:** 100% from `.planning/phases/01-access-roles/01-RESEARCH.md` (Architecture Patterns, Code Examples sections) and `01-UI-SPEC.md` (Screen Inventory, Copywriting Contract) — no other codebase context was available.
