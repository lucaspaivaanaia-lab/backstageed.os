# Phase 1: Client Records & Isolated RAG Setup - Research

**Researched:** 2026-07-08
**Domain:** Next.js Server Actions + Supabase Postgres/RLS CRUD, external REST API integration (Tropicalia)
**Confidence:** HIGH (Supabase/RLS patterns, existing codebase conventions), HIGH (Tropicalia `POST /v1/projects` contract — confirmed via official docs + OpenAPI spec), MEDIUM (Tropicalia error modes/rate limits — undocumented, defensive design required)

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

**Dev-auth workaround (Phase 1 scope only — not an architecture change)**
- **D-01:** Build a minimal `/login` page + Server Action now (`supabase.auth.signInWithPassword()`), styled to match the existing shadcn card/form pattern already used by `/signup`. `middleware.ts` already lists `/login` in `PUBLIC_PATHS` and already redirects unauthenticated users there — the page itself just doesn't exist yet.
- **D-02:** Seed both an Admin user AND a PM user directly via SQL in the Supabase dashboard (insert into `auth.users`, set `role`/`status='approved'` in `profiles`) — not Admin-only.
- **D-03:** This `/login` is intentionally minimal/throwaway for Phase 1-4 dev testing: email+password → session, nothing else. The full login, admin approval queue, and PM self-signup flow stay exactly as planned in Phase 5 (05-02).

**Strategic briefing form (CLI-04)**
- **D-04:** "Pilares de conteúdo" is a structured add/remove list (tags/chips), not free text.
- **D-05:** "Objetivo", "tom de voz", "público-alvo" are free text (one textarea each) — narrative fields.
- **D-06:** Single form, all four fields on one page — no multi-step wizard.
- **D-07:** Briefing is optional at client creation, fillable/editable anytime after.

**Tropicalia provisioning (CLI-03)**
- **D-08:** If `POST /v1/projects` is attempted (key present) but fails, the client record is still created; `tropicalia_project_id` stays null; a visible "RAG setup pendente" status is shown with a manual retry action. Client creation never rolls back because of an external API failure.
- **D-09:** Retry is a manual button ("tentar novamente"), not automatic background retry.
- **D-10:** A client whose Tropicalia project failed or is pending can still be edited (briefing, PM assignment).
- **D-11:** `TROPICALIA_API_KEY` does not exist yet. Add it to `.env.local` as an empty placeholder now. Every Tropicalia call MUST null-check the key first: **if the key is absent, skip the call silently** — no attempt, no error — set `tropicalia_project_id = null`, show "RAG setup pendente" (no retry button for this case, since nothing to retry). Once the key is dropped in, integration activates with zero code changes. **key present + call fails** → retry-button flow; **key absent** → silent skip, no retry button.

**Client list & PM assignment (CLI-01, CLI-02)**
- **D-12:** Client list visibility follows the RLS policy in `0004_rls_policies.sql` exactly: Admin sees all (`is_admin()`), PM sees only clients linked via `pm_clients` (`pm_assigned_clients()`). UI does no additional filtering.
- **D-13:** PM-to-client assignment happens via a multi-select PM picker directly on the client creation/edit form — no separate "manage assignments" admin screen.
- **D-14:** Each client-list row shows: name, assigned PM(s), briefing status (empty/filled), RAG status (pendente/pronto).

### Claude's Discretion
- Exact copy/wording of the "RAG setup pendente" status label and retry button (now locked by 01-UI-SPEC.md Copywriting Contract — see below).
- Client list layout (table vs. card grid) — column set is locked (D-14), visual layout is not.
- Briefing edit UX (inline edit vs. separate edit mode/page).
- Storage shape for "pilares de conteúdo" (e.g. `text[]` column vs. `jsonb`) — D-04 only locks that it's structured, not the exact schema.
- Exact `/login` page copy and error-message strings.

### Deferred Ideas (OUT OF SCOPE)
None — discussion stayed within phase scope.

### From 01-UI-SPEC.md (locked visual/copy contract)
- Status badges: RAG pronto = `Badge variant="secondary"` + `CheckCircle2` + "Pronto"; RAG pendente (both D-08 and D-11 cases) = `Badge variant="outline"` + `Clock` + "Pendente" — visually identical, retry button presence is what differs. Briefing vazio = `outline` + "Vazio"; preenchido = `secondary` + "Preenchido".
- Copy locked: "Criar cliente", "Salvar briefing", "Adicionar PM", "Tentar novamente" (D-08 case only, never shown for D-11), error strings for RAG failure and validation.
- New shadcn component needed: `checkbox` (official registry, PM multi-select picker as Dialog + checkbox list).
- Layout: list/briefing pages use top-aligned `max-w-3xl`/`max-w-4xl mx-auto px-6 py-8` container (not the centered auth-card pattern).
- `aria-label="Remover {tag}"` required on every icon-only chip-remove button (content pillars, PM chips).

</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| CLI-01 | Admin or PM can create a new client record | Corrected RLS insert policy (`is_admin() or is_pm()`) + Server Action pattern — see Architecture Patterns, Common Pitfalls #2 |
| CLI-02 | Admin can assign one or more PMs to a client | Privileged Server Action using `createAdminClient()` for `pm_clients` writes, gated by app-layer role check — see Architecture Patterns Pattern 2, Common Pitfalls #3 |
| CLI-03 | Each client record stores a Tropicalia `project_id`, isolating that client's RAG context | `POST /v1/projects` contract (Code Examples), D-08/D-09/D-11 branching logic, response field is `public_id` not `project_id` (Common Pitfalls #1) |
| CLI-04 | PM can fill and edit a client's structured strategic briefing | Corrected RLS update policy scoped via `pm_assigned_clients()`, react-hook-form + zodResolver pattern (Don't Hand-Roll) |

</phase_requirements>

## Summary

This phase is a standard Next.js Server Action + Supabase RLS CRUD build, extending the existing `clients` stub table from Phase 5's walking skeleton, plus one external REST integration (Tropicalia `POST /v1/projects`). The codebase already has every low-level building block this phase needs — four Supabase client factories, a zod validation pattern, a Server-Action-co-located-with-route convention, and a full shadcn component set — so the implementation risk is low. The real risk is entirely in the RLS layer: the existing `0004_rls_policies.sql` restricts `clients` insert/update to admins only, which directly contradicts CLI-01 ("Admin or PM can create") and CLI-04 ("PM can edit briefing"). CONTEXT.md already flags this conflict and prescribes the fix (PM insert allowed generally, PM update scoped via `pm_assigned_clients()`).

Research surfaced a **second, related RLS conflict CONTEXT.md did not explicitly flag**: `pm_clients_insert_admin_only` blocks a PM from linking itself (or other PMs) to a client, but D-13 puts the PM multi-select picker directly on the *creation* form that a PM can now use — meaning a PM creating a client also needs to be able to write to `pm_clients` in that same flow, or the PM who just created the client won't see it again afterward (since `clients_select_scoped` depends on `pm_assigned_clients()`). Loosening `pm_clients` RLS to allow arbitrary self-insert is unsafe (a PM could grant themselves access to any client's `pm_clients` row). The recommended fix, consistent with the precedent already set in Phase 5 (`auth.admin.createUser()` for Client login provisioning), is to perform the entire client-creation transaction (insert `clients` row → insert `pm_clients` links → call Tropicalia → update `tropicalia_project_id`) through the **privileged admin client** (`lib/supabase/admin.ts`), with authorization enforced in application code (verify the caller's `profiles.role` is `admin` or `pm` and `status = 'approved'` before any write), and leave `pm_clients` RLS as admin-only for defense-in-depth. This is flagged as an [ASSUMED] interpretation of D-13 + CLI-01 combined — see Assumptions Log.

On the Tropicalia side, the exact `POST /v1/projects` contract is confirmed from official documentation (`docs.tropicalia.dev`) and its OpenAPI spec: request is `{ name, description? }`, response is `{ public_id, name, description, created_at, modified_at }` — note the response field is `public_id`, not `project_id`, a naming mismatch with the `tropicalia_project_id` column that is an easy, silent bug if missed. No documented error codes or rate limits exist beyond the 201 success case, so the integration must be defensively coded (timeout via `AbortSignal`, catch-all on non-201/network failure) rather than relying on documented error shapes.

**Primary recommendation:** Extend `0002_clients_stub.sql` via a new `ALTER TABLE` migration (briefing fields + `tropicalia_project_id`), fix the RLS policies in a new migration (`is_pm()` helper, `clients_insert_admin_or_pm`, `clients_update_scoped`), and drive client creation + PM assignment + Tropicalia provisioning through one privileged Server Action using `createAdminClient()`, with all subsequent edits (briefing, retry) going through the normal RLS-scoped `createClient()` (server) now that the corrected policies grant PM access.

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Client creation (CLI-01) | API/Backend (Server Action, admin client) | Database (RLS insert policy as defense-in-depth) | Multi-step privileged transaction (client + pm_clients + Tropicalia); app-layer role check is the real gate |
| PM assignment (CLI-02) | API/Backend (Server Action, admin client) | Database (`pm_clients`) | Same transaction as creation; also used standalone when editing PM assignment on an existing client |
| Tropicalia RAG provisioning (CLI-03) | API/Backend (server-only `fetch` to `api.tropicalia.dev`) | Database (`clients.tropicalia_project_id`) | `TROPICALIA_API_KEY` must never reach the browser; external call happens inside the Server Action, result persisted to Postgres |
| Strategic briefing CRUD (CLI-04) | API/Backend (Server Action, RLS-scoped client) | Database (RLS update policy via `pm_assigned_clients()`) | Standard scoped update — no privilege escalation needed once RLS is corrected |
| Client list rendering + status badges | Frontend Server (SSR, Server Component) | Database (RLS select) | Server Component reads the already-scoped `clients` query; no client-side filtering (D-12) |
| Minimal dev login (D-01/02/03) | Browser (form) + Frontend Server (Server Action) | Database (Supabase Auth) | `signInWithPassword()` server-side via `createClient()` (server), session cookie set by `@supabase/ssr` |
| Multi-tenancy enforcement | Database (RLS) | — | Non-negotiable per CLAUDE.md — isolation must be structural, not a UI filter |

## Standard Stack

### Core (all already installed — zero new npm dependencies required this phase)
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|---------------|
| `next` | 16.2.9 [VERIFIED: npm registry] | App Router, Server Actions | Already locked project stack |
| `@supabase/ssr` | 0.12.0 [VERIFIED: npm registry] | Cookie-based Supabase client (browser/server/middleware) | Already used by every existing route in the codebase |
| `@supabase/supabase-js` | 2.110.0 [VERIFIED: npm registry] | Core SDK, incl. admin/service-role client | Underlies `lib/supabase/admin.ts`, needed for the privileged client-creation transaction |
| `zod` | 4.4.3 [VERIFIED: npm registry] | Server Action input validation | Existing `lib/validation/auth.ts` pattern to extend |
| `react-hook-form` | 7.80.0 [VERIFIED: npm registry, installed but unused so far] | Form state for the multi-field briefing form + client-creation form | Already a dependency with a shadcn `Form` wrapper (`components/ui/form.tsx`) present but not yet used anywhere in the codebase — this phase is the natural first consumer |
| `@hookform/resolvers` | 5.4.0 [VERIFIED: npm registry, installed but unused so far] | zod ↔ react-hook-form bridge (`zodResolver`) | Pairs with the above |

### Supporting (new shadcn component, not a new npm dependency)
| Component | Registry | Purpose | When to Use |
|-----------|----------|---------|-------------|
| `checkbox` | shadcn official (`npx shadcn@latest add checkbox`) | PM multi-select picker (D-13), rendered inside a `Dialog` with a checkbox list per 01-UI-SPEC.md | Adds no new npm package — imports from the already-installed `radix-ui` umbrella package (confirmed: `select.tsx`/`dialog.tsx` already import `{ Select as SelectPrimitive } from "radix-ui"` / `{ Dialog as DialogPrimitive } from "radix-ui"`, same umbrella covers `Checkbox`) |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Native `fetch()` for Tropicalia calls | `@tropicalia/sdk` (npm, v0.1.1, published ~5 months ago by `leosmfktp@tropicalia.dev`, Fern-generated TS SDK) | SDK exists and is legitimate (official maintainer, matches `github.com/tropicalia-ai/typescript-sdk`), but is a single-endpoint integration for this phase (`POST /v1/projects` only) — adding a whole SDK dependency for one call is unjustified; native `fetch` matches the "no HTTP client library in package.json" convention already established. Revisit for Phase 2 if the SDK covers `search`/`upload` more ergonomically than raw `fetch`. |
| Admin client (`createAdminClient()`) for the pm_clients write during creation | Loosen `pm_clients` RLS to allow `pm_id = auth.uid()` self-insert | Self-insert RLS would let ANY approved PM link themselves to ANY client at ANY time (not just at creation of their own client) — a real access-control regression. Admin client + app-layer authorization avoids this; see Common Pitfalls #3. |
| `content_pillars` as `text[]` | `jsonb` array | `text[]` is simpler for a flat list of strings, has native Postgres array semantics, and Supabase JS returns it as a plain JS array with no extra parsing — recommended default. `jsonb` only pays off if pillars later need per-item metadata (not required by D-04). Final call is Claude's Discretion per CONTEXT.md — this is the recommendation, not a lock. |

**Installation:**
```bash
# No new npm packages required.
npx shadcn@latest add checkbox
```

**Version verification:** All core packages verified via `npm view <pkg> version` against the same versions already locked in `package.json` (unchanged since Phase 5's 05-01 research, re-confirmed 2026-07-08).

## Package Legitimacy Audit

This phase installs **zero new npm packages** — `checkbox` is a shadcn CLI code-copy that imports from the already-installed `radix-ui` package, not a new `package.json` dependency. `react-hook-form` and `@hookform/resolvers` are already present in `package.json` (installed during initial scaffolding, unused until now).

slopcheck was not run (`pip install slopcheck` skipped) because there is nothing new to audit. The one external package referenced only as a **considered alternative** (not recommended), `@tropicalia/sdk`, was checked via `npm view`:

| Package | Registry | Age | Source Repo | slopcheck | Disposition |
|---------|----------|-----|--------------|-----------|-------------|
| `@tropicalia/sdk` | npm | Published ~5 months ago (per `npm view`), 1 version (0.1.1) | `github.com/tropicalia-ai/typescript-sdk` (matches maintainer email domain `tropicalia.dev`) | not run — [ASSUMED] legitimate based on maintainer/repo alignment | **Not recommended for use this phase** (see Alternatives Considered) — not being installed |

**Packages removed due to slopcheck [SLOP] verdict:** none (nothing installed)
**Packages flagged as suspicious [SUS]:** none

## Architecture Patterns

### System Architecture Diagram

```
Browser (Client Component — client-creation form / briefing form)
  │  react-hook-form + zodResolver, submits via Server Action
  ▼
┌─────────────────────────────────────────────────────────────┐
│ Server Action: createClient(formData)                        │
│  1. auth check: current user role admin|pm, status=approved  │
│     (createClient() [server] + profiles lookup)               │
│  2. zod-validate name + selected PM ids                       │
│  3. createAdminClient() [privileged]:                         │
│       insert into clients (name)                              │
│       insert into pm_clients (pm_id, client_id) for each PM   │
│  4. if TROPICALIA_API_KEY present:                             │
│       POST https://api.tropicalia.dev/v1/projects              │
│         Authorization: Bearer <TROPICALIA_API_KEY>             │
│         body: { name: client.name }                            │
│       on 201 → update clients.tropicalia_project_id = public_id│
│       on failure/timeout → leave null, status = "pendente"     │
│     else (key absent) → skip silently, status = "pendente"     │
└─────────────────────────────────────────────────────────────┘
  ▼
Postgres (RLS enforced on subsequent reads/edits — clients_select_scoped,
          clients_update_scoped via pm_assigned_clients())
  ▼
Server Component (client list, client detail) — createClient() [server],
  reads through RLS, renders badges (Pronto/Pendente, Vazio/Preenchido)

Later edits (briefing, RAG retry) — separate Server Actions using the
normal RLS-scoped createClient() [server], now that the corrected
clients_update_scoped policy grants PM access via pm_assigned_clients().
```

### Recommended Project Structure
```
app/
├── (dashboard)/                     # or app/admin, app/pm per existing role-root convention
│   └── clients/
│       ├── page.tsx                 # client list (Server Component, RLS-scoped query)
│       ├── new/
│       │   ├── page.tsx             # client-creation form (Client Component)
│       │   └── actions.ts           # createClient() Server Action (admin client, privileged)
│       └── [id]/
│           ├── page.tsx             # client detail / briefing form
│           └── actions.ts           # updateBriefing(), assignPms(), retryTropicalia() Server Actions
├── (auth)/
│   └── login/
│       ├── page.tsx                 # D-01/02/03 — minimal dev login
│       └── actions.ts               # signIn() Server Action
lib/
├── tropicalia/
│   └── client.ts                    # createTropicaliaProject() — server-only fetch wrapper
├── validation/
│   └── clients.ts                   # clientSchema, briefingSchema (extends existing auth.ts pattern)
supabase/migrations/
├── 0006_clients_full_record.sql     # ALTER clients: briefing fields + tropicalia_project_id
├── 0007_clients_rls_fix.sql         # is_pm() helper, clients_insert_admin_or_pm, clients_update_scoped
```

### Pattern 1: Corrected RLS policies (clients table)
**What:** Replace admin-only insert/update with role-scoped policies, adding a new `is_pm()` helper alongside the existing `is_admin()` / `pm_assigned_clients()`.
**When to use:** Required before CLI-01 (PM create) or CLI-04 (PM edit briefing) can function — the existing policies from `0004_rls_policies.sql` hard-block both today.
**Example:**
```sql
-- Source: pattern from 0004_rls_policies.sql (project's own established
-- SECURITY DEFINER + plpgsql convention), extended per CONTEXT.md's
-- flagged conflict resolution guidance.

create or replace function public.is_pm()
returns boolean
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  return exists (
    select 1 from public.profiles
    where id = (select auth.uid()) and role = 'pm' and status = 'approved'
  );
end;
$$;

drop policy if exists "clients_insert_admin_only" on public.clients;
create policy "clients_insert_admin_or_pm"
on public.clients
for insert
to authenticated
with check ((select public.is_admin()) or (select public.is_pm()));

drop policy if exists "clients_update_admin_only" on public.clients;
create policy "clients_update_scoped"
on public.clients
for update
to authenticated
using (
  (select public.is_admin())
  or id in (select public.pm_assigned_clients())
)
with check (
  (select public.is_admin())
  or id in (select public.pm_assigned_clients())
);
```

### Pattern 2: Privileged multi-step client-creation transaction
**What:** Client creation + PM linking + Tropicalia provisioning happen as one server-only operation using the admin/service-role client, gated by an application-layer role check — not by relying on `clients`/`pm_clients` RLS alone.
**When to use:** Specifically for the *creation* flow, where the creating PM is not yet in `pm_clients` and therefore cannot pass `clients_update_scoped` or the (intentionally admin-only) `pm_clients_insert_admin_only` policy. This mirrors the exact precedent already set in Phase 5 for `auth.admin.createUser()` (Client login provisioning).
**Example:**
```typescript
// Source: pattern from app/(auth)/signup/actions.ts (Server Action shape,
// zod-first validation) + lib/supabase/admin.ts (privileged client,
// established in 05-01) + new pattern for this phase (multi-step
// privileged transaction, app-layer authorization).
"use server";

import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { clientCreateSchema } from "@/lib/validation/clients";
import { createTropicaliaProject } from "@/lib/tropicalia/client";

export async function createClientRecord(formData: FormData) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Não autenticado." };

  const { data: profile } = await supabase
    .from("profiles")
    .select("role, status")
    .eq("id", user.id)
    .single();

  const isAuthorized =
    profile?.status === "approved" &&
    (profile.role === "admin" || profile.role === "pm");
  if (!isAuthorized) return { error: "Sem permissão para criar clientes." };

  const parsed = clientCreateSchema.safeParse({
    name: formData.get("name"),
    pmIds: formData.getAll("pmIds"),
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Dados inválidos." };
  }

  const admin = createAdminClient();

  const { data: client, error: insertError } = await admin
    .from("clients")
    .insert({ name: parsed.data.name })
    .select("id, name")
    .single();
  if (insertError || !client) return { error: "Não foi possível criar o cliente." };

  // Always link the creating PM (or the specific PMs selected by an Admin).
  const pmIds = parsed.data.pmIds.length > 0 ? parsed.data.pmIds : [user.id];
  await admin
    .from("pm_clients")
    .insert(pmIds.map((pm_id) => ({ pm_id, client_id: client.id })));

  // D-11: null-check the key first — silent skip if absent.
  if (process.env.TROPICALIA_API_KEY) {
    try {
      const project = await createTropicaliaProject(client.name);
      await admin
        .from("clients")
        .update({ tropicalia_project_id: project.public_id })
        .eq("id", client.id);
    } catch {
      // D-08: client creation never rolls back on Tropicalia failure.
      // tropicalia_project_id stays null; UI shows "Pendente" + retry.
    }
  }

  return { success: true, clientId: client.id };
}
```

### Pattern 3: Tropicalia server-only fetch wrapper with timeout
**What:** A small server-only module wrapping `POST /v1/projects`, never imported from a Client Component.
**When to use:** Every Tropicalia call this phase (and Phase 2's `search`/`upload` later).
**Example:**
```typescript
// Source: https://docs.tropicalia.dev/api-reference/projects/create-project.md
// (request/response schema), https://docs.tropicalia.dev/openapi.json
// (security scheme: BearerAuth, tr_ prefixed key)
const TROPICALIA_BASE_URL = "https://api.tropicalia.dev";

type TropicaliaProject = {
  public_id: string;
  name: string;
  description: string | null;
  created_at: string;
  modified_at: string;
};

export async function createTropicaliaProject(
  name: string
): Promise<TropicaliaProject> {
  const apiKey = process.env.TROPICALIA_API_KEY;
  if (!apiKey) {
    // Caller is responsible for the D-11 null-check before invoking this —
    // this throw is a defensive guard, not the primary skip path.
    throw new Error("TROPICALIA_API_KEY is not set");
  }

  const res = await fetch(`${TROPICALIA_BASE_URL}/v1/projects`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ name }),
    signal: AbortSignal.timeout(10_000), // no documented Tropicalia timeout — 10s is a defensive default
  });

  if (!res.ok) {
    throw new Error(`Tropicalia project creation failed: ${res.status}`);
  }

  // NOTE: the response field is `public_id`, NOT `project_id` — this is
  // the field to store in clients.tropicalia_project_id. See Common
  // Pitfalls #1.
  return res.json();
}
```

### Anti-Patterns to Avoid
- **Calling Tropicalia from a Client Component or exposing `TROPICALIA_API_KEY` without `NEXT_PUBLIC_`-safety review:** the key must only ever be read inside server-only code (Server Actions, `lib/tropicalia/client.ts`), matching the existing `SUPABASE_SECRET_KEY` discipline in `lib/supabase/admin.ts`.
- **Loosening `pm_clients` RLS to a broad self-insert policy:** would let any PM grant themselves access to any client — see Common Pitfalls #3.
- **Inline subqueries against `clients`/`pm_clients`/`profiles` inside a new RLS policy:** the project's established, hard rule (Pitfall 1 from 05-RESEARCH.md) is `SECURITY DEFINER` `plpgsql` helper functions only — the new `is_pm()` helper must follow this exact shape.
- **Assuming Tropicalia's response has a `project_id` field:** it's `public_id` — see Common Pitfalls #1.
- **Building the multi-field briefing form with raw `useState`/`FormData` (the `/signup` pattern):** that pattern was chosen for a 2-field auth form; this phase's forms (name + PM multi-select on creation, 4 briefing fields including a dynamic chip list) are the natural first use case for the already-installed-but-unused `react-hook-form` + `@hookform/resolvers` + `components/ui/form.tsx`.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|--------------|-----|
| Multi-field form state + validation (client creation, briefing) | Custom `useState` per field + manual FormData parsing | `react-hook-form` + `zodResolver` + shadcn `Form`/`FormField` (already installed, `components/ui/form.tsx` already present, currently unused) | Already a project dependency; avoids re-deriving field-level error state the `/signup` page hand-rolled for a much simpler 2-field case |
| Structured add/remove chip list (content pillars, D-04) | Custom tag-input component from scratch | A small controlled array field driven by `react-hook-form`'s `useFieldArray` (or a simple local array state synced into a single hidden RHF field), rendered with existing `Badge` + icon-only remove button (already in 01-UI-SPEC.md contract) | `useFieldArray` is the standard react-hook-form primitive for exactly this pattern; no need for a third-party tag-input library |
| PM multi-select picker (D-13) | Custom multi-select dropdown | shadcn `Dialog` + `checkbox` list (per 01-UI-SPEC.md — "Dialog + checkbox list", official shadcn registry, no third-party registry) | Locked by the UI-SPEC; matches existing shadcn conventions already in the codebase |
| Tropicalia HTTP client | Hand-rolled retry/backoff logic, custom error taxonomy | Simple `fetch` + `AbortSignal.timeout` + a single catch-all failure branch (D-08/D-09 already define the only two outcomes needed: succeeded or "pendente + manual retry") | Tropicalia's API has no documented rate-limit/retry semantics to build sophisticated backoff against; over-engineering this against undocumented behavior is wasted effort at this scale (~10 clients) |
| Password/session handling for `/login` | Custom session cookie logic | `supabase.auth.signInWithPassword()` via `createClient()` (server) — identical pattern to `/signup`'s `supabase.auth.signUp()` | Already established, `@supabase/ssr` handles all cookie mechanics |

**Key insight:** Every piece of this phase has a direct precedent already in the codebase (Server Action shape, Supabase client factories, RLS helper-function pattern, shadcn component set) except the privileged multi-step transaction pattern (Pattern 2) and the Tropicalia integration — both are new to the codebase but not complex enough to justify any additional library.

## Common Pitfalls

### Pitfall 1: Tropicalia response field is `public_id`, not `project_id`
**What goes wrong:** Code assumes the create-project response has a `project_id` field (matching the `tropicalia_project_id` DB column name) and silently stores `undefined`, leaving `tropicalia_project_id` null even though the API call succeeded (HTTP 201).
**Why it happens:** Natural naming assumption — the DB column is `tropicalia_project_id`, so it's easy to expect the API to echo `project_id`.
**How to avoid:** Store `response.public_id` explicitly; add a type (`TropicaliaProject`) with `public_id: string` so TypeScript catches a typo at compile time (see Code Examples Pattern 3).
**Warning signs:** A client shows "Pendente" status despite the Tropicalia dashboard showing the project was actually created.

### Pitfall 2: `clients` RLS blocks the exact operations this phase requires (CONTEXT.md-flagged)
**What goes wrong:** `clients_insert_admin_only` / `clients_update_admin_only` from `0004_rls_policies.sql` reject any PM-initiated insert/update, causing every PM-driven CLI-01/CLI-04 action to fail with a Postgres RLS error surfaced as an opaque 4xx from PostgREST.
**Why it happens:** Those policies were correct for Phase 5's own scope at the time (client CRUD wasn't built yet) but were never revisited when CLI-01/CLI-04 were defined.
**How to avoid:** Apply the migration in Architecture Patterns Pattern 1 (`is_pm()` helper, `clients_insert_admin_or_pm`, `clients_update_scoped`) before/alongside building the Server Actions — this must be an early task, not an afterthought discovered during manual testing.
**Warning signs:** PM-authenticated manual test of "create client" or "edit briefing" fails while the same action works fine as Admin.

### Pitfall 3: `pm_clients` RLS blocks the creating PM from ever seeing their own new client (NOT flagged by CONTEXT.md — new finding)
**What goes wrong:** Even after fixing `clients` RLS (Pitfall 2), `pm_clients_insert_admin_only` still blocks a PM from linking itself to the client it just created. The client row exists, but `clients_select_scoped` depends on `pm_assigned_clients()`, so the creating PM can't see the client it just made (unless they're also an Admin) — Sub-phase 1A's own definition of done ("client created, PM linked") silently fails.
**Why it happens:** `0004_rls_policies.sql`'s `pm_clients` insert policy was written when only Admin-driven flows existed (05-01 scope); D-13 (multi-select PM picker on the *creation* form) introduces a PM-initiated write to `pm_clients` that the existing policy doesn't anticipate.
**How to avoid:** Do not loosen `pm_clients` RLS to a broad self-insert policy (see Anti-Patterns). Instead, perform the client + `pm_clients` + Tropicalia writes as one privileged transaction via `createAdminClient()`, authorized by an app-layer role check in the Server Action (Pattern 2). Leave `pm_clients_insert_admin_only` as-is for defense-in-depth against direct PostgREST calls.
**Warning signs:** A PM creates a client successfully (per Pitfall 2's fix) but the client never appears in that PM's own client list afterward.

### Pitfall 4: `SUPABASE_SECRET_KEY` is currently empty in `.env.local`
**What goes wrong:** `createAdminClient()` (needed for Pattern 2's privileged transaction) will fail at runtime — either throwing on client construction or failing every privileged query — if `SUPABASE_SECRET_KEY` is blank.
**Why it happens:** Phase 5's 05-01 scaffolded the file and factory but the actual secret-key value was never populated (`auth.admin.createUser()`, the only prior consumer, is paused until Phase 5 resumes at 05-04).
**How to avoid:** This is an environment/config gap, not a code gap — flag as a Wave 0 setup task: fetch the value from Supabase Dashboard → Project Settings → API Keys → service_role/secret key, and populate `.env.local` before implementing Pattern 2. Low external-dependency risk (it's the project's own Supabase project, not a third party like Tropicalia) but it does block local testing of client creation until done.
**Warning signs:** Client-creation Server Action throws on the very first `createAdminClient().from("clients").insert(...)` call during manual testing.

### Pitfall 5: `TROPICALIA_API_KEY` absence must be a silent skip, not an error path
**What goes wrong:** Naively calling `createTropicaliaProject()` unconditionally (letting the function itself throw on a missing key) surfaces as a visible "creation failed" error to the user, even though D-11 requires this to be indistinguishable from a normal "not provisioned yet" state — no error toast, no retry button.
**Why it happens:** It's tempting to centralize the null-check inside the Tropicalia client module and let the caller "just handle the throw," but that conflates the D-08 (key present, call failed → show retry button) and D-11 (key absent → no retry button) cases, which the UI-SPEC explicitly requires to render differently.
**How to avoid:** The `if (process.env.TROPICALIA_API_KEY)` check must happen in the calling Server Action (Pattern 2), before `createTropicaliaProject()` is ever invoked — not just inside the module. Track which of the two "pendente" cases applies (e.g., a derived value, not a stored DB column — both cases store `tropicalia_project_id = null`) so the UI can decide whether to render the retry button.
**Warning signs:** Retry button appears for a client when the key has literally never been supplied yet, contradicting the UI-SPEC copy contract ("Error — RAG key absent (D-11)... no retry button").

### Pitfall 6: Seeded dev users (D-02) must have `status='approved'` and `must_change_password=false`
**What goes wrong:** A seeded Admin/PM row inserted directly into `auth.users`/`profiles` via SQL that leaves `status='pending'` (the `profiles` table default) or `must_change_password=true` will get redirected by `middleware.ts` to `/pending` or `/change-password` instead of reaching the app — blocking this phase's own manual verification.
**Why it happens:** `handle_new_user()`'s trigger defaults (`status` defaults to `'pending'` unless `role='client'` in metadata) only apply to signups through `supabase.auth.signUp()`/`admin.createUser()`; a raw SQL insert into `auth.users` bypasses that trigger logic differently depending on how it's done, and it's easy to forget to also set the `profiles` row explicitly.
**How to avoid:** When seeding via the Supabase dashboard SQL editor (D-02), explicitly `UPDATE public.profiles SET status = 'approved', must_change_password = false, role = 'admin'|'pm' WHERE id = '<seeded-uid>'` after the `auth.users` insert — don't rely on trigger defaults for a manually-seeded row.
**Warning signs:** Logging in as the seeded Admin/PM redirects straight to `/pending` or `/change-password` instead of the client-management UI.

### Pitfall 7: Unbounded Tropicalia fetch call can hang the Server Action
**What goes wrong:** A `fetch()` call with no timeout, against an API with no documented SLA, can leave the client-creation Server Action (and the user's submit button) hanging indefinitely if Tropicalia is slow/unresponsive.
**Why it happens:** Native `fetch()` has no default timeout.
**How to avoid:** Use `AbortSignal.timeout(10_000)` (or similar) as shown in Code Examples Pattern 3, and treat a timeout the same as any other D-08 failure (client still created, status "pendente").
**Warning signs:** Client-creation form appears to hang with no feedback during manual testing against a slow/rate-limited Tropicalia response.

## Code Examples

### zod schema for client creation + briefing (extends existing `lib/validation/auth.ts` pattern)
```typescript
// New file: lib/validation/clients.ts
// Source: pattern from lib/validation/auth.ts (signupSchema) — same
// trim/message conventions, Portuguese error strings matching the
// existing signup form and 01-UI-SPEC.md's Copywriting Contract.
import { z } from "zod";

export const clientCreateSchema = z.object({
  name: z.string().trim().min(1, { message: "Nome é obrigatório." }),
  pmIds: z.array(z.string().uuid()).default([]),
});
export type ClientCreateInput = z.infer<typeof clientCreateSchema>;

export const briefingSchema = z.object({
  objective: z.string().trim().max(5000).optional().nullable(),
  toneOfVoice: z.string().trim().max(5000).optional().nullable(),
  targetAudience: z.string().trim().max(5000).optional().nullable(),
  contentPillars: z.array(z.string().trim().min(1)).default([]),
});
export type BriefingInput = z.infer<typeof briefingSchema>;
```

### Migration: ALTER clients into the full record (CLI-03, CLI-04)
```sql
-- supabase/migrations/0006_clients_full_record.sql
-- Phase 1: Client Records & Isolated RAG Setup
-- Extends the Phase 5 stub (id, name, created_at) with the strategic
-- briefing fields (CLI-04) and the Tropicalia project link (CLI-03).
-- RLS was already enabled on public.clients in 0002_clients_stub.sql —
-- ALTER TABLE does not disable it, so no re-enable needed here
-- (CVE-2025-48757 discipline only applies to new CREATE TABLE statements).

alter table public.clients
  add column tropicalia_project_id text,
  add column objective text,
  add column tone_of_voice text,
  add column target_audience text,
  add column content_pillars text[] not null default '{}',
  add column updated_at timestamptz not null default now();
```

### RAG retry Server Action (D-09 — manual retry, key-present-call-failed case only)
```typescript
"use server";

import { createClient } from "@/lib/supabase/server";
import { createTropicaliaProject } from "@/lib/tropicalia/client";

export async function retryTropicaliaProvisioning(clientId: string) {
  const supabase = await createClient(); // RLS-scoped — relies on
  // clients_update_scoped now granting access via pm_assigned_clients()

  const { data: client, error: fetchError } = await supabase
    .from("clients")
    .select("id, name")
    .eq("id", clientId)
    .single();
  if (fetchError || !client) return { error: "Cliente não encontrado." };

  // D-11: retry button is never rendered when the key is absent, but
  // defend server-side too — never attempt the call without a key.
  if (!process.env.TROPICALIA_API_KEY) {
    return { error: "RAG setup pendente." };
  }

  try {
    const project = await createTropicaliaProject(client.name);
    const { error: updateError } = await supabase
      .from("clients")
      .update({ tropicalia_project_id: project.public_id })
      .eq("id", clientId);
    if (updateError) return { error: "Não foi possível salvar as alterações. Verifique sua conexão e tente novamente." };
    return { success: true };
  } catch {
    return {
      error:
        "Não foi possível provisionar o projeto Tropicalia agora. O cliente foi criado normalmente — tente novamente quando quiser.",
    };
  }
}
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|-------------------|---------------|--------|
| Ad-hoc `useState`/`FormData` forms (as in `/signup`) | `react-hook-form` + `zodResolver` + shadcn `Form` for multi-field forms | This phase — first form complex enough to justify it | Reduces hand-rolled per-field error state for the briefing form's 4 fields + dynamic chip list |
| Admin-only `clients`/no `pm_clients` self-service | Role-scoped RLS (`is_pm()` + `pm_assigned_clients()`) + privileged Server Action for the creation transaction | This phase | Unblocks CLI-01/CLI-02/CLI-04, which the Phase 5 stub intentionally left admin-only pending this phase |
| N/A (no external RAG integration existed before) | Server-only Tropicalia `fetch` wrapper, key never exposed to browser | This phase (CLI-03) | First external third-party API integration in the codebase — sets the pattern Phase 2 (`search`, `upload`) will reuse |

**Deprecated/outdated:** None specific to this phase — the codebase is greenfield as of Phase 5's 05-01 walking skeleton (2026-07-01 or later), so there is no legacy pattern being replaced here beyond the intentionally-temporary admin-only `clients` RLS from the stub.

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|----------------|
| A1 | A PM creating a client is allowed to assign PMs (including themselves) via the same multi-select picker, not just an Admin — inferred by combining CLI-01 ("Admin or PM can create") with D-13 ("multi-select PM picker directly on the client creation/edit form", no role restriction stated) | Architecture Patterns Pattern 2, Summary | If Juliano actually intends PM assignment (CLI-02's literal wording: "Admin can assign") to remain Admin-only, this recommendation over-permissions PMs to self-assign at creation time. Low security risk in practice (a PM can only assign PMs to a client they themselves are creating, not to arbitrary existing clients) but should be confirmed during planning/discuss-phase if not already implicitly accepted. |
| A2 | `content_pillars` should be stored as `text[]`, not `jsonb` | Standard Stack (Alternatives Considered) | Low risk — this is explicitly marked Claude's Discretion in CONTEXT.md; if the planner or a future phase needs per-pillar metadata, a migration to `jsonb` would be needed later. |
| A3 | Tropicalia's undocumented rate limits (100 req/mo free tier, 500 req/mo Pro, per the marketing/pricing page, not the API reference) are a monthly quota, not a per-request rate limit requiring backoff logic | Common Pitfalls, Don't Hand-Roll | At ~10 clients this phase's total call volume is negligible either way; risk is limited to confusion if Tropicalia later returns a 429 with no documented meaning — the existing D-08 catch-all handles this regardless of the exact cause. |
| A4 | `SUPABASE_SECRET_KEY` can be populated without external coordination (unlike `TROPICALIA_API_KEY`, which needs Juliano) since it's the project's own Supabase dashboard value | Common Pitfalls #4, Environment Availability | If access to the Supabase dashboard is restricted to a specific team member, this could still block a solo contributor — flag as a Wave 0 task regardless of who performs it. |

## Open Questions

1. **Should the creating PM always be auto-linked, even if they deselect themselves in the multi-select picker?**
   - What we know: D-13 says the picker is on the creation form; CLI-02 says "Admin can assign one or more PMs."
   - What's unclear: Whether a PM creating a client for someone else's portfolio (e.g., handing it directly to a colleague) should be forced into `pm_clients` or not.
   - Recommendation: Default to "always include the creating PM unless explicitly deselected" (Code Examples Pattern 2 currently auto-includes `user.id` only as a fallback when `pmIds` is empty) — but this is a UX nuance the planner should make an explicit task-level decision on, not leave implicit.

2. **Exact retry-button distinguishing logic (D-08 vs D-11) — derived at render time or stored?**
   - What we know: Both cases render identical "Pendente" badges; only the retry button's presence differs, and it depends on whether `TROPICALIA_API_KEY` currently exists in the environment.
   - What's unclear: Whether the retry-button visibility should be a pure function of `process.env.TROPICALIA_API_KEY` (evaluated at render time, in a Server Component) or the client should also track "was an attempt ever made and did it fail" for finer distinction (e.g., a client created 2 months ago before the key existed vs. one that failed yesterday with the key present).
   - Recommendation: Simplest correct behavior per D-11's literal wording ("if the key is absent, skip the call silently... no retry button needed for this case") is a pure `process.env.TROPICALIA_API_KEY ? <RetryButton /> : null` check at render time in the Server Component rendering the client list/detail — no new DB column needed to track "attempt history." Flag for planner confirmation.

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|--------------|-----------|---------|----------|
| Supabase project (hosted) | All data operations | Yes | — (URL + publishable key present in `.env.local`) | — |
| `SUPABASE_SECRET_KEY` | Pattern 2's privileged admin-client transaction (CLI-01, CLI-02) | **No — currently blank in `.env.local`** | — | None — must be populated from Supabase Dashboard before Pattern 2 can be implemented/tested. Low-friction fallback: it's the project's own Supabase project, not a third-party coordination like Tropicalia. Flag as a Wave 0 setup task. |
| `TROPICALIA_API_KEY` | CLI-03 provisioning | **No — does not exist in `.env.local` at all** | — | Per D-11, this has a designed fallback: absence is a first-class supported state (silent skip, "Pendente" badge, no retry button). Add as an empty placeholder line per D-11; feature activates automatically once Juliano supplies the real key. |
| `api.tropicalia.dev` reachability | CLI-03 | Assumed reachable (public HTTPS API) | — | If unreachable even with a key present, D-08's catch-all handles it identically to any other call failure. |
| Node/npm toolchain, existing `package.json` deps | All | Yes | See `package.json` (Next 16.2.9, React 19.2.4, etc.) | — |

**Missing dependencies with no fallback:**
- `SUPABASE_SECRET_KEY` (blank) — blocks Pattern 2 until populated. This is a quick, low-risk fix (fetch from own Supabase dashboard) but must happen before implementation of client creation.

**Missing dependencies with fallback:**
- `TROPICALIA_API_KEY` (absent) — by design (D-11), the phase is fully implementable and testable without it; the key can be added later with zero code changes.

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | None detected — same as Phase 5's finding, still no test config exists in the repo |
| Config file | none — see Wave 0 |
| Quick run command | To be established in Wave 0 (recommend `vitest` for the zod schemas in `lib/validation/clients.ts` if introduced) |
| Full suite command | To be established in Wave 0 |

### Phase Requirements → Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|---------------------|-------------|
| CLI-01 | Admin or PM can create a client record | integration (RLS + Server Action) / manual | manual-only for v1 — same justification as Phase 5 (RLS behavior is most reliably verified against a real local Postgres instance) | ❌ Wave 0 |
| CLI-02 | Admin assigns PM(s), PM gains access immediately | integration (RLS-level, `pm_clients` insert + `clients_select_scoped` read-back) | `supabase test db` (pgTAP) if Supabase CLI test infra is added, else manual verification: create client as PM A, confirm PM B (unassigned) cannot see it, assign PM B, confirm PM B can now see it | ❌ Wave 0 |
| CLI-03 | Client has isolated `tropicalia_project_id`, auto-provisioned | manual (requires real `TROPICALIA_API_KEY` to exercise the success path) + unit-testable failure/skip branches (D-08/D-11 logic is pure enough to unit test once `vitest` exists) | manual-only until key is supplied; recommend a `vitest` unit test for `createTropicaliaProject`'s error/timeout handling once a framework exists | ❌ Wave 0 |
| CLI-04 | PM fills/edits briefing, persists | integration (RLS-level) / manual | manual-only for v1 | ❌ Wave 0 |

**Rationale for manual-only classification:** Consistent with Phase 5's own conclusion — this phase is fundamentally RLS-policy-dependent (the two conflicts in Common Pitfalls #2/#3 are the highest-risk area), and the highest-fidelity verification is against a real Postgres instance with RLS enabled. No test framework exists yet project-wide; introducing one is out of this phase's explicit scope but flagged again here as a recurring Wave 0 gap across phases.

### Sampling Rate
- **Per task commit:** Manual click-through of the specific flow just built (e.g., after building client creation, manually create a client as the seeded PM and confirm it appears in that PM's own list).
- **Per wave merge:** Full manual pass through all 4 success criteria from ROADMAP.md §Phase 1, including the two RLS-conflict fixes (Pitfall 2 and 3) explicitly re-verified as PM (not just Admin).
- **Phase gate:** All 4 success criteria manually verified true, both D-08 (key-present-fails) and D-11 (key-absent) RAG-pendente cases visually distinguished correctly, before `/gsd:verify-work`.

### Wave 0 Gaps
- [ ] `SUPABASE_SECRET_KEY` populated in `.env.local` from the Supabase Dashboard (hard blocker for Pattern 2 — see Environment Availability)
- [ ] `TROPICALIA_API_KEY=` empty placeholder line added to `.env.local` per D-11 (not a blocker — supports the key-absent path being the default testable state)
- [ ] Seeded Admin + seeded PM rows created per D-02, explicitly setting `status='approved'`, `must_change_password=false` (see Common Pitfalls #6)
- [ ] `npx shadcn@latest add checkbox` run once, before the PM multi-select picker is built
- [ ] Decision (flag explicitly to user during planning, same as Phase 5) on whether to invest in `pgTAP` for the two corrected RLS policies given their criticality, or accept manual-only verification for v1

## Security Domain

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|----------------|---------|---------------------|
| V2 Authentication | Yes (minimal, D-01/02/03 only) | Reuses Supabase Auth `signInWithPassword()` — no new auth mechanism introduced |
| V3 Session Management | Yes (reused, unchanged) | `@supabase/ssr` cookie-based JWT sessions — no change from Phase 5's pattern |
| V4 Access Control | Yes — the core of this phase | Postgres RLS (`is_admin()`, new `is_pm()`, `pm_assigned_clients()`) + app-layer role check in the privileged Server Action (Pattern 2) as a second, independent gate |
| V5 Input Validation | Yes | `zod` schemas (`clientCreateSchema`, `briefingSchema`) validating name, PM ids (UUID format), briefing field lengths, before any Supabase or Tropicalia call |
| V6 Cryptography | Not directly applicable | No new cryptographic operations introduced this phase |
| V13 API and Web Service (secret handling) | Yes | `TROPICALIA_API_KEY` and `SUPABASE_SECRET_KEY` must never carry a `NEXT_PUBLIC_` prefix and must only be read inside server-only modules (`lib/tropicalia/client.ts`, `lib/supabase/admin.ts`), matching the codebase's existing discipline |

### Known Threat Patterns for This Phase

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|-----------------------|
| PM self-assigns to an arbitrary client via a loosened `pm_clients` RLS policy | Elevation of Privilege | Keep `pm_clients` RLS admin-only; route the one legitimate PM-initiated write (creation-time self-link) through the privileged admin client + app-layer role check (Pattern 2), never through a broadened RLS policy |
| `clients` insert/update RLS left admin-only (unfixed) silently blocking PM actions | Availability (functional breakage, not a security hole, but a hard blocker for CLI-01/CLI-04) | Apply Pattern 1's migration before building the Server Actions |
| `TROPICALIA_API_KEY` leaking to the browser bundle via a misplaced import | Information Disclosure | Server-only module (`lib/tropicalia/client.ts`), never imported from a `"use client"` file — same discipline as `lib/supabase/admin.ts` |
| Recursive/blocking RLS policy from a naive new helper function | Denial of Service (query failure) | New `is_pm()` helper must follow the exact `SECURITY DEFINER` `stable` `plpgsql` shape as `is_admin()` — never an inline cross-table subquery (established Pitfall 1 from 05-RESEARCH.md, still binding) |
| Unbounded/hanging Tropicalia `fetch` call | Availability (degraded UX, not a true DoS) | `AbortSignal.timeout()` — see Common Pitfalls #7 |

## Sources

### Primary (HIGH confidence)
- https://docs.tropicalia.dev/api-reference/projects/create-project.md — `POST /v1/projects` request/response schema, HTTP 201, auth header format
- https://docs.tropicalia.dev/openapi.json — confirmed schema fields (`public_id` not `project_id`), `BearerAuth` security scheme, `tr_`-prefixed key format, confirmed no documented error/rate-limit definitions in the spec
- https://docs.tropicalia.dev/api-reference/search.md — confirmed `generate_answer` field exists on the search endpoint (relevant to CLAUDE.md's `generate_answer: false` constraint, cross-phase context)
- `supabase/migrations/0001-0005*.sql` (this repo) — existing RLS/trigger conventions this phase must extend, not replace
- `lib/supabase/{client,server,middleware,admin}.ts`, `lib/validation/auth.ts`, `app/(auth)/signup/{page.tsx,actions.ts}` (this repo) — established codebase patterns
- `.planning/phases/05-access-roles/05-RESEARCH.md` (this repo) — prior-phase research establishing the `SECURITY DEFINER` helper-function pattern and RLS pitfalls this phase must remain consistent with

### Secondary (MEDIUM confidence)
- https://www.tropicalia.dev/ (WebFetch) — general platform description, pricing/quota figures (100/500 req per tier) used only as directional context for rate-limit assumptions, not an authoritative API reference
- `npm view @tropicalia/sdk` — confirmed package existence/maintainer/repo alignment for the "alternatives considered" row; SDK itself not adopted this phase

### Tertiary (LOW confidence)
- None — all findings were either verified against official Tropicalia docs/OpenAPI spec or grounded directly in this repo's existing code and prior research.

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — zero new dependencies, everything already installed and precedented in this exact codebase
- Architecture (RLS fix, privileged transaction pattern): HIGH for the CONTEXT.md-flagged `clients` RLS conflict (directly prescribed), MEDIUM for the new `pm_clients`/admin-client recommendation (A1 in Assumptions Log — sound reasoning, not user-confirmed)
- Tropicalia integration: HIGH for the request/response contract (official docs + OpenAPI), LOW-MEDIUM for error modes/rate limits (undocumented — defensive design compensates)

**Research date:** 2026-07-08
**Valid until:** 2026-08-08 (30 days — stable internal codebase patterns; re-verify Tropicalia's API contract sooner if `TROPICALIA_API_KEY` is still unavailable by then, since the endpoint has not been exercised against a live key)
