# Phase 1: Client Records & Isolated RAG Setup - Pattern Map

**Mapped:** 2026-07-08
**Files analyzed:** 17 (new/modified)
**Analogs found:** 12 exact/role-match / 17 — codebase has grown since Phase 5's greenfield map; this phase is the **first** to build a data-list Server Component, a privileged multi-step transaction, an external third-party HTTP integration, and a react-hook-form-driven form. Where no in-repo analog exists, the RESEARCH.md verbatim code example is cited as the canonical source instead (same convention 05-PATTERNS.md used).

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|---|---|---|---|---|
| `app/(auth)/login/page.tsx` | component (form) | request-response | `app/(auth)/signup/page.tsx` | exact |
| `app/(auth)/login/actions.ts` | controller (Server Action) | request-response | `app/(auth)/signup/actions.ts` | exact |
| `lib/validation/auth.ts` (MODIFY — add `loginSchema`) | utility (validation) | — | same file's existing `signupSchema` | exact |
| `lib/validation/clients.ts` (NEW) | utility (validation) | — | `lib/validation/auth.ts` | role-match |
| `lib/tropicalia/client.ts` (NEW) | service (external API wrapper) | request-response (outbound REST) | `lib/supabase/admin.ts` (server-only privileged module discipline) | partial — new integration category, no in-repo HTTP-fetch analog |
| `supabase/migrations/0006_clients_full_record.sql` (NEW) | migration (ALTER TABLE) | CRUD (schema) | `supabase/migrations/0002_clients_stub.sql` | role-match (same table, CREATE not ALTER) |
| `supabase/migrations/0007_clients_rls_fix.sql` (NEW) | migration (RLS policy) | CRUD (schema) | `supabase/migrations/0004_rls_policies.sql` | exact |
| `.env.local.example` (MODIFY — add `TROPICALIA_API_KEY`) | config | — | same file's existing var blocks | exact |
| `app/admin/clients/page.tsx` + `app/pm/clients/page.tsx` (NEW) | component (Server Component, list/table) | CRUD (read) | none in-repo (first data-driven Server Component + `Table`/`Badge` usage) | no analog — compose from `components/ui/table.tsx` + `components/ui/badge.tsx` + RESEARCH.md D-12 query pattern |
| `app/admin/clients/new/page.tsx` + `app/pm/clients/new/page.tsx` (NEW) | component (Client Component, form) | CRUD (create) | `app/(auth)/signup/page.tsx` (Server Action submission shape) — but form-state approach diverges (see below) | role-match with explicit deviation flagged |
| `app/admin/clients/new/actions.ts` (or shared) — `createClientRecord()` (NEW) | controller (Server Action, privileged) | CRUD (create, multi-step transaction) | `app/(auth)/signup/actions.ts` (Server Action shape/zod-first validation) + `lib/supabase/admin.ts` (privileged client) | role-match — new "privileged multi-step transaction" pattern, RESEARCH.md Pattern 2 provides the verbatim composition |
| `app/admin/clients/[id]/page.tsx` + `app/pm/clients/[id]/page.tsx` (NEW) | component (Client Component, form) | CRUD (read + update) | `app/admin/clients/new/page.tsx` (once built, same react-hook-form shape) — no existing analog yet | no analog — first multi-field form + `useFieldArray` chip list |
| `app/.../clients/[id]/actions.ts` — `updateBriefing()`, `assignPms()` (NEW) | controller (Server Action, RLS-scoped) | CRUD (update) | `app/(auth)/signup/actions.ts` (Server Action shape) | role-match |
| `app/.../clients/[id]/actions.ts` — `retryTropicaliaProvisioning()` (NEW) | controller (Server Action, RLS-scoped) | request-response (outbound REST + DB update) | RESEARCH.md Code Examples (verbatim) | no in-repo analog — canonical doc/research pattern |
| `components/ui/checkbox.tsx` (NEW, via `npx shadcn add checkbox`) | component (shadcn primitive) | — | `components/ui/select.tsx` (radix-ui wrapper structure) | role-match — CLI-generated, not hand-authored |

## Pattern Assignments

### `app/(auth)/login/page.tsx` (component/form, request-response)

**Analog:** `app/(auth)/signup/page.tsx` (exact — D-01 explicitly requires styling to match this file)

**Full structure to copy** (`app/(auth)/signup/page.tsx` lines 1-107, reproduced in relevant part):
```tsx
"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  Card, CardContent, CardDescription, CardHeader, CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { signUp } from "./actions"; // -> replace with `signIn` from "./actions"

export default function SignupPage() {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [emailError, setEmailError] = useState<string | null>(null);
  const [passwordError, setPasswordError] = useState<string | null>(null);
  const [serverError, setServerError] = useState<string | null>(null);

  function handleSubmit(formData: FormData) {
    // client-side pre-validation, then startTransition(async () => { ... })
  }

  return (
    <div className="flex flex-1 items-center justify-center p-4">
      <Card className="w-full max-w-sm">
        <CardHeader>
          <CardTitle>Criar conta</CardTitle>
          <CardDescription>...</CardDescription>
        </CardHeader>
        <CardContent>
          <form action={handleSubmit} className="flex flex-col gap-4">
            {/* Label + Input + inline error <p> per field, disabled={isPending} */}
            <Button type="submit" disabled={isPending} className="w-full">
              {isPending ? "Criando conta..." : "Criar conta"}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
```
**Copy for `/login`:** title "Entrar" (Claude's Discretion per D-01/CONTEXT.md), same two-field (email/password) layout, `router.push()` target depends on role (or just `/` and let `middleware.ts`'s role-redirect table take over). Layout container (`flex flex-1 items-center justify-center p-4` + `Card w-full max-w-sm`) must be copied verbatim — this is the "centered auth-card pattern" the UI-SPEC explicitly says list/briefing pages do NOT use, but `/login` (an auth screen) does.

---

### `app/(auth)/login/actions.ts` (controller, request-response)

**Analog:** `app/(auth)/signup/actions.ts` (exact structural match)

**Full pattern to copy** (`app/(auth)/signup/actions.ts` lines 1-55):
```typescript
"use server";

import { createClient } from "@/lib/supabase/server";
import { loginSchema } from "@/lib/validation/auth"; // new schema, same file as signupSchema

type SignInResult = { success: true } | { error: string };

const GENERIC_ERROR =
  "Não foi possível completar a ação. Tente novamente em instantes.";

export async function signIn(formData: FormData): Promise<SignInResult> {
  const parsed = loginSchema.safeParse({
    email: formData.get("email"),
    password: formData.get("password"),
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? GENERIC_ERROR };
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword({
    email: parsed.data.email,
    password: parsed.data.password,
  });

  if (error) {
    // D-03: minimal — no forgot-password, no approval-queue awareness beyond
    // what middleware.ts already gates post-login.
    return { error: "E-mail ou senha incorretos." };
  }

  return { success: true };
}
```
**Note:** zod-first validation BEFORE any Supabase Auth call is the established hard rule (same as signup) — never skip straight to `signInWithPassword()`.

---

### `lib/validation/auth.ts` (MODIFY — add `loginSchema`)

**Analog:** the file's own existing `signupSchema` (lines 8-13) and `clientLoginSchema` (lines 21-26)

**Pattern to extend, not replace** (full current file, `lib/validation/auth.ts` lines 1-27):
```typescript
import { z } from "zod";

export const signupSchema = z.object({
  email: z.string().trim().email({ message: "E-mail inválido." }),
  password: z.string().min(8, { message: "A senha deve ter no mínimo 8 caracteres." }),
});
export type SignupInput = z.infer<typeof signupSchema>;

export const clientLoginSchema = z.object({
  email: z.string().trim().email({ message: "E-mail inválido." }),
  client_id: z.string().uuid({ message: "Cliente inválido." }),
});
export type ClientLoginInput = z.infer<typeof clientLoginSchema>;

// NEW — add below, same convention:
export const loginSchema = z.object({
  email: z.string().trim().email({ message: "E-mail inválido." }),
  password: z.string().min(1, { message: "Senha é obrigatória." }),
});
export type LoginInput = z.infer<typeof loginSchema>;
```
**Rule:** trim + Portuguese `message` string on every field, `z.infer` exported type alongside every schema — apply identically to any new schema in this phase.

---

### `lib/validation/clients.ts` (NEW)

**Analog:** `lib/validation/auth.ts` (same file-level convention: trim, Portuguese messages, exported `z.infer` type per schema)

**Source:** RESEARCH.md Code Examples — reproduced verbatim, already matches the established convention:
```typescript
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

---

### `lib/tropicalia/client.ts` (NEW — server-only fetch wrapper)

**Analog:** No in-repo HTTP-client analog (first external third-party API integration). Structural discipline borrowed from `lib/supabase/admin.ts` (lines 1-23) — a server-only module, secret-key null-checked, never imported from a Client Component.

**`lib/supabase/admin.ts` discipline to mirror:**
```typescript
// SERVER-ONLY. Never import this file from a Client Component — the
// secret key must never reach the browser bundle. Only Server Actions
// ('use server') and Route Handlers (app/api/**) may import this.
```

**Core pattern** (RESEARCH.md Code Examples Pattern 3, verbatim, confirmed against official Tropicalia docs/OpenAPI):
```typescript
const TROPICALIA_BASE_URL = "https://api.tropicalia.dev";

type TropicaliaProject = {
  public_id: string; // NOT project_id — see Pitfall 1
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
    throw new Error("TROPICALIA_API_KEY is not set"); // defensive guard only
  }

  const res = await fetch(`${TROPICALIA_BASE_URL}/v1/projects`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ name }),
    signal: AbortSignal.timeout(10_000),
  });

  if (!res.ok) {
    throw new Error(`Tropicalia project creation failed: ${res.status}`);
  }

  return res.json(); // { public_id, name, description, created_at, modified_at }
}
```
**Hard rules:** (1) response field is `public_id`, never `project_id` (Pitfall 1); (2) `TROPICALIA_API_KEY` null-check happens in the CALLING Server Action (D-11), not solely inside this module — this module's own throw is a defensive backstop, not the primary skip path; (3) `AbortSignal.timeout(10_000)` mandatory (Pitfall 7 — no default fetch timeout).

---

### `supabase/migrations/0006_clients_full_record.sql` (NEW — ALTER, CRUD schema)

**Analog:** `supabase/migrations/0002_clients_stub.sql` (same `public.clients` table, CREATE not ALTER — this migration extends it)

**Existing stub to extend** (`0002_clients_stub.sql` lines 8-12):
```sql
create table public.clients (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  created_at timestamptz not null default now()
);
```
**New migration** (RESEARCH.md Code Examples, verbatim):
```sql
-- RLS was already enabled on public.clients in 0002_clients_stub.sql —
-- ALTER TABLE does not disable it, so no re-enable needed here.
alter table public.clients
  add column tropicalia_project_id text,
  add column objective text,
  add column tone_of_voice text,
  add column target_audience text,
  add column content_pillars text[] not null default '{}',
  add column updated_at timestamptz not null default now();
```
**Note:** unlike `0002`'s `CREATE TABLE`, this `ALTER TABLE` does NOT need its own `enable row level security` line — that CVE-2025-48757 discipline only applies to new `CREATE TABLE` statements, and RLS is already enabled on this table.

---

### `supabase/migrations/0007_clients_rls_fix.sql` (NEW — RLS policy, CRUD schema)

**Analog:** `supabase/migrations/0004_rls_policies.sql` (exact — same `SECURITY DEFINER` + `plpgsql` helper-function convention, same table)

**Existing helper pattern to mirror** (`0004_rls_policies.sql` lines 17-31, `is_admin()`):
```sql
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
```
**New `is_pm()` helper + corrected policies** (RESEARCH.md Architecture Patterns Pattern 1, verbatim):
```sql
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
**Existing policy being replaced** (`0004_rls_policies.sql` lines 129-140 — `clients_insert_admin_only` / `clients_update_admin_only`) — this migration must `drop policy if exists` both before creating the replacements, exactly as shown.

**`pm_clients_insert_admin_only` (0004_rls_policies.sql lines 101-105) is left UNCHANGED** — do not loosen it (Pitfall 3 / Anti-Patterns). The creating-PM's self-link write goes through the privileged admin client in Pattern 2 below, not through a broadened RLS policy.

**Hard rule (Pitfall 1 from 05-RESEARCH.md, still binding):** `language plpgsql`, never `language sql` — Postgres may inline SQL-language functions and lose the security-definer context.

---

### `.env.local.example` (MODIFY)

**Analog:** the file's own existing var blocks (each with a `# comment` + `Source:` line)

**Existing convention** (`.env.local.example` lines 9-12, `SUPABASE_SECRET_KEY` block):
```
# SERVER-ONLY. Never prefix with NEXT_PUBLIC_. Used only by lib/supabase/admin.ts
# for privileged operations (auth.admin.createUser, auth.admin.updateUserById).
# Source: Supabase Dashboard -> Project Settings -> API Keys -> service_role/secret key
SUPABASE_SECRET_KEY=
```
**New block to append** (D-11 — empty placeholder, same comment convention):
```
# SERVER-ONLY. Never prefix with NEXT_PUBLIC_. Used only by lib/tropicalia/client.ts.
# Absent = silent skip (D-11): no call attempted, tropicalia_project_id stays null,
# "RAG setup pendente" shown with no retry button. Populate once Juliano supplies it —
# zero code changes needed to activate.
# Source: Juliano / Tropicalia dashboard (tropicalia.dev)
TROPICALIA_API_KEY=
```

---

### `app/admin/clients/page.tsx` + `app/pm/clients/page.tsx` (NEW — Server Component, list)

**Analog:** No in-repo Server Component reads a scoped table into a `Table`/`Badge` UI yet. Compose from `components/ui/table.tsx` (already installed, full API below) + `components/ui/badge.tsx` (variant API) + D-12's "no additional filtering" rule + `lib/supabase/server.ts` (RLS-scoped read).

**`components/ui/table.tsx` primitives available** (`Table`, `TableHeader`, `TableBody`, `TableRow`, `TableHead`, `TableCell` — full file already read, standard shadcn composition, no wrapper logic needed beyond mapping rows).

**`components/ui/badge.tsx` variant API** (lines 7-27) — status badges per UI-SPEC D-14/Copywriting Contract:
```tsx
<Badge variant="secondary"><CheckCircle2 />Pronto</Badge>   {/* RAG pronto */}
<Badge variant="outline"><Clock />Pendente</Badge>            {/* RAG pendente, both D-08/D-11 */}
<Badge variant="outline">Vazio</Badge>                        {/* briefing empty */}
<Badge variant="secondary">Preenchido</Badge>                 {/* briefing filled */}
```
**Data-read pattern:** `const supabase = await createClient();` (from `lib/supabase/server.ts`) then a plain `.from("clients").select(...)` — D-12 requires **zero additional app-layer filtering**; the RLS policy (`clients_select_scoped`, unchanged by this phase) already scopes Admin-sees-all vs. PM-sees-`pm_assigned_clients()`. Render exactly what the query returns.

**Layout container** (UI-SPEC, not the auth-card pattern): `max-w-3xl`/`max-w-4xl mx-auto px-6 py-8` top-aligned — do NOT reuse `/signup`'s `flex flex-1 items-center justify-center` centered-card wrapper for this screen.

---

### `app/admin/clients/new/page.tsx` + `app/pm/clients/new/page.tsx` (NEW — Client Component, form)

**Analog:** `app/(auth)/signup/page.tsx` for the overall Server-Action-submission shape (`useTransition`, `startTransition`, disabled-while-pending Button) — **but RESEARCH.md's Anti-Patterns section explicitly flags NOT copying `/signup`'s hand-rolled `useState`-per-field approach** for this phase's forms. Use `react-hook-form` + `zodResolver` + `components/ui/form.tsx` (already installed, unused until now) instead.

**`components/ui/form.tsx` primitives to use** (full file already read — `Form`, `FormField`, `FormItem`, `FormLabel`, `FormControl`, `FormDescription`, `FormMessage`):
```tsx
"use client";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { clientCreateSchema, type ClientCreateInput } from "@/lib/validation/clients";
import { Form, FormField, FormItem, FormLabel, FormControl, FormMessage } from "@/components/ui/form";

const form = useForm<ClientCreateInput>({
  resolver: zodResolver(clientCreateSchema),
  defaultValues: { name: "", pmIds: [] },
});
// <Form {...form}><form onSubmit={form.handleSubmit(onSubmit)}>
//   <FormField control={form.control} name="name" render={({ field }) => (
//     <FormItem><FormLabel>Nome</FormLabel><FormControl><Input {...field} /></FormControl><FormMessage /></FormItem>
//   )} />
```
**PM multi-select picker (D-13):** `components/ui/dialog.tsx` (`Dialog`, `DialogTrigger`, `DialogContent`, `DialogHeader`, `DialogTitle`, `DialogFooter` — full API already read) + new `checkbox` component — Dialog + checkbox list, per UI-SPEC's locked "Dialog + checkbox list" contract, no custom multi-select dropdown.

**`onSubmit` wiring to the Server Action:** still uses `useTransition`/`startTransition` calling `createClientRecord(formData)` from `./actions.ts`, matching `/signup`'s async-submit-then-`router.push()` shape — only the field-level state management (react-hook-form vs. `useState`) diverges from the `/signup` analog.

---

### `createClientRecord()` Server Action (NEW — privileged multi-step transaction)

**Analog:** `app/(auth)/signup/actions.ts` (Server Action shape, zod-first validation) + `lib/supabase/admin.ts` (privileged client, established discipline). This exact combination — auth check via `createClient()`, then privileged writes via `createAdminClient()` — has no full prior in-repo precedent; RESEARCH.md Architecture Patterns Pattern 2 provides the verbatim composition, confirmed consistent with this repo's `lib/supabase/{server,admin}.ts` factories.

**Full pattern (RESEARCH.md Pattern 2, verbatim — already cites this repo's own files):**
```typescript
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

  const pmIds = parsed.data.pmIds.length > 0 ? parsed.data.pmIds : [user.id];
  await admin
    .from("pm_clients")
    .insert(pmIds.map((pm_id) => ({ pm_id, client_id: client.id })));

  if (process.env.TROPICALIA_API_KEY) {
    try {
      const project = await createTropicaliaProject(client.name);
      await admin
        .from("clients")
        .update({ tropicalia_project_id: project.public_id })
        .eq("id", client.id);
    } catch {
      // D-08: client creation never rolls back on Tropicalia failure.
    }
  }

  return { success: true, clientId: client.id };
}
```
**Why the admin client, not the RLS-scoped one:** the creating PM is not yet in `pm_clients` at the moment of creation, so it can't pass `clients_update_scoped` or the intentionally-admin-only `pm_clients_insert_admin_only` policy (Pitfall 3). This mirrors the exact precedent Phase 5 set for `auth.admin.createUser()` in the (deferred) Client-login-provisioning flow (`05-CONTEXT.md`) — app-layer role check + privileged client, RLS as defense-in-depth, never a broadened self-insert policy.

---

### `app/.../clients/[id]/page.tsx` (NEW — briefing form + PM assignment + RAG status)

**Analog:** No existing in-repo analog for a multi-field form with a dynamic chip list. Same `react-hook-form` + `zodResolver` + `components/ui/form.tsx` foundation as the client-creation form above; the new element is the content-pillars chip list.

**Content-pillars chip list (D-04) — `useFieldArray`, per RESEARCH.md Don't Hand-Roll table:**
```tsx
import { useFieldArray, useForm } from "react-hook-form";

const { fields, append, remove } = useFieldArray({
  control: form.control,
  name: "contentPillars" as never, // react-hook-form requires an object-array shape;
  // a common adaptation is a hidden array-of-{value} objects synced to the flat
  // string[] the zod schema expects on submit.
});
```
**Chip rendering — `Badge` + icon-only remove button, `aria-label` REQUIRED** (UI-SPEC Spacing Contract, non-negotiable):
```tsx
<Badge variant="secondary" className="gap-1">
  {pillar}
  <button type="button" onClick={() => remove(index)} aria-label={`Remover ${pillar}`}>
    <XIcon className="size-3" />
  </button>
</Badge>
```
This exact `aria-label="Remover {tag}"` pattern applies identically to PM-assignment chips on this same page.

**Objective/tone/audience fields:** plain `Textarea` per field (D-05 — free text, not structured) wired through the same `FormField`/`FormItem`/`FormControl`/`FormMessage` composition as the client-creation form's `name` field. Note: `textarea` is not yet in `components/ui/` — confirm with planner whether to add it via `npx shadcn add textarea` or compose from a plain `<textarea>` styled to match `Input`'s classes; UI-SPEC assumes a textarea exists but the component isn't in the "already installed" list.

**Display heading hierarchy (UI-SPEC Visual Focal Points):** `{client name}` as page-level `Display` heading first, then "Briefing estratégico" as a `Heading`-level section title directly beneath — this ordering is locked, not discretionary.

---

### `updateBriefing()` / `assignPms()` Server Actions (NEW — RLS-scoped update)

**Analog:** `app/(auth)/signup/actions.ts` shape (zod-first validation, `createClient()` from `lib/supabase/server.ts`) — but uses the **normal RLS-scoped client**, not `createAdminClient()`, since the corrected `clients_update_scoped` policy (migration `0007`) now grants PM access via `pm_assigned_clients()` for any client the PM is already linked to.

```typescript
"use server";
import { createClient } from "@/lib/supabase/server";
import { briefingSchema } from "@/lib/validation/clients";

export async function updateBriefing(clientId: string, formData: FormData) {
  const supabase = await createClient(); // RLS-scoped — relies on clients_update_scoped
  const parsed = briefingSchema.safeParse({ /* ... */ });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message };

  const { error } = await supabase
    .from("clients")
    .update({ ...parsed.data, updated_at: new Date().toISOString() })
    .eq("id", clientId);
  if (error) {
    return { error: "Não foi possível salvar as alterações. Verifique sua conexão e tente novamente." };
  }
  return { success: true };
}
```
D-10 confirms this must work regardless of RAG readiness — client CRUD is fully decoupled from Tropicalia status.

---

### `retryTropicaliaProvisioning()` Server Action (NEW)

**Analog:** No in-repo analog. Canonical source: RESEARCH.md Code Examples (verbatim, already composed against this repo's own `lib/supabase/server.ts` and `lib/tropicalia/client.ts`):
```typescript
"use server";
import { createClient } from "@/lib/supabase/server";
import { createTropicaliaProject } from "@/lib/tropicalia/client";

export async function retryTropicaliaProvisioning(clientId: string) {
  const supabase = await createClient();

  const { data: client, error: fetchError } = await supabase
    .from("clients")
    .select("id, name")
    .eq("id", clientId)
    .single();
  if (fetchError || !client) return { error: "Cliente não encontrado." };

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
      error: "Não foi possível provisionar o projeto Tropicalia agora. O cliente foi criado normalmente — tente novamente quando quiser.",
    };
  }
}
```
Per D-09, this is invoked ONLY by a manual "Tentar novamente" button, never automatically. Per Copywriting Contract, this button is rendered ONLY for the D-08 case (key present, prior attempt failed) — never for D-11 (key absent, "RAG setup pendente." label only, no button).

---

## Shared Patterns

### Supabase Client Construction (unchanged from Phase 5, reused verbatim)
**Source:** `lib/supabase/{client,server,middleware,admin}.ts` (all four already exist, already read in full)
**Apply to:** every new file that touches Supabase this phase — `createClient()` (server) for RLS-scoped reads/updates (list page, briefing update, retry), `createAdminClient()` (privileged) ONLY inside `createClientRecord()`'s multi-step transaction. Never instantiate `supabase-js` directly.

### Zod-First Validation Before Any External Call
**Source:** `lib/validation/auth.ts` established convention + RESEARCH.md Pitfall 5
**Apply to:** `login/actions.ts`, `clients/new/actions.ts`, `clients/[id]/actions.ts` — validate with a `safeParse` at the top of every Server Action, before any Supabase or Tropicalia call. Error message shape: `parsed.error.issues[0]?.message ?? GENERIC_ERROR`, matching `signup/actions.ts` lines 25-28 exactly.

### RLS via SECURITY DEFINER Helper Functions (established Phase 5, extended this phase)
**Source:** `supabase/migrations/0004_rls_policies.sql` (`is_admin()`, `pm_assigned_clients()`), extended by this phase's `is_pm()`
**Apply to:** `0007_clients_rls_fix.sql` — the new `is_pm()` helper MUST be `language plpgsql stable security definer set search_path = ''`, never an inline subquery in a policy body (hard rule, Pitfall 1 from 05-RESEARCH.md, restated in 01-RESEARCH.md Anti-Patterns).

### Privileged-Client Escape Hatch for Creation-Time Self-Linking
**Source:** RESEARCH.md Architecture Patterns Pattern 2 (new this phase, no prior in-repo instance since Phase 5's analogous `auth.admin.createUser()` flow is deferred to 05-04)
**Apply to:** `createClientRecord()` only. Never generalize this into a broadened RLS self-insert policy on `pm_clients` (Pitfall 3 / Anti-Patterns) — the admin client + app-layer role check is the sanctioned pattern, not a precedent for loosening RLS elsewhere.

### Server-Only Secret Isolation
**Source:** `lib/supabase/admin.ts` discipline (non-`NEXT_PUBLIC_` env var, server-only import boundary)
**Apply to:** `lib/tropicalia/client.ts` — `TROPICALIA_API_KEY` must never carry a `NEXT_PUBLIC_` prefix and must only be read inside this file and the Server Actions that call it (never a Client Component).

### Status Badge Rendering (RAG + briefing)
**Source:** 01-UI-SPEC.md Copywriting Contract + Color contract (locked, not discretionary)
**Apply to:** client-list page and client-detail page — `Badge variant="secondary"` + `CheckCircle2` = "Pronto"; `Badge variant="outline"` + `Clock` = "Pendente" (covers both D-08 and D-11, visually identical — only retry-button presence differs); briefing "Vazio"/"Preenchido" analogous outline/secondary split, no color-coded status hues anywhere in this phase.

### react-hook-form + zodResolver + shadcn Form (first use in this codebase)
**Source:** `components/ui/form.tsx` (already installed, unused until this phase) + `react-hook-form`/`@hookform/resolvers` (already in `package.json`, unused until this phase)
**Apply to:** client-creation form, briefing form — explicitly NOT the `/signup` hand-rolled `useState`-per-field pattern (RESEARCH.md Anti-Patterns, explicit deviation from the otherwise-close `/signup` analog).

## No Analog Found

| File | Role | Data Flow | Reason |
|---|---|---|---|
| `app/admin/clients/page.tsx` / `app/pm/clients/page.tsx` | component (Server Component list) | CRUD (read) | First Server Component in the repo that reads a table into a rendered list — `/pending` is the only prior Server Component and it's fully static |
| `app/.../clients/[id]/page.tsx` | component (form, `useFieldArray` chip list) | CRUD (read+update) | First multi-field form and first dynamic add/remove list in the repo |
| `lib/tropicalia/client.ts` | service (external HTTP) | request-response (outbound) | First third-party REST integration in the repo — no prior `fetch()`-based service module exists to copy from |
| `app/admin/*` and `app/pm/*` route roots themselves | route (directory structure) | — | Neither directory exists yet — `middleware.ts`'s role-redirect table already references `/admin`, `/pm`, `/client` as targets, but no page files under those roots have been built by any prior phase; this phase is the first to populate them |

## Metadata

**Analog search scope:** Entire repository (`app/`, `lib/`, `components/`, `supabase/migrations/`, excluding `node_modules/` and `.git/`) — 8 existing source files/dirs read in full (`signup/{page,actions}.tsx`, `pending/page.tsx`, `lib/validation/auth.ts`, `lib/supabase/{client,server,middleware,admin}.ts`, `middleware.ts`, all 5 existing migrations, `components/ui/{form,table,badge,dialog,select,card,input,button}.tsx`), plus `05-PATTERNS.md`/`05-01-SUMMARY.md` for cross-phase convention confirmation.
**Files scanned:** Full repo tree via `find` (37 tracked files outside `.git`/`.planning`/`node_modules`).
**Pattern extraction date:** 2026-07-08
**Extraction source:** ~70% direct in-repo file reads (exact/role-match analogs), ~30% RESEARCH.md verbatim Code Examples (used only where 05-RESEARCH.md's own precedent — citing this repo's files — already backs the composition, per RESEARCH.md's own Architecture Patterns section).
