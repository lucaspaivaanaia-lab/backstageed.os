# Phase 3: Content Production Kanban - Pattern Map

**Mapped:** 2026-07-31
**Files analyzed:** 22 (6 migrations, 3 pgTAP tests, 6 app routes/actions, 3 lib modules, 2 admin routes/actions/form, 2 layout edits)
**Analogs found:** 22 / 22 (all have at least a role-match analog; three schema files are flagged as genuinely new modeling territory for this codebase — see "No Analog Found / New Territory")

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|---|---|---|---|---|
| `supabase/migrations/00XX_cards.sql` | migration | CRUD (schema) | `supabase/migrations/0010_messages.sql` | role-match (self-referencing shape is new — see below) |
| `supabase/migrations/00XX_checklist_templates.sql` | migration | CRUD (schema) | `supabase/migrations/0011_client_files.sql` + `0004_rls_policies.sql` (admin-only write policy) | role-match |
| `supabase/migrations/00XX_clients_checklist_template.sql` | migration | CRUD (schema, ALTER) | `supabase/migrations/0006_clients_full_record.sql` | exact |
| `supabase/migrations/00XX_card_checklist_items.sql` | migration | CRUD (schema, snapshot) | `supabase/migrations/0011_client_files.sql` | role-match (two-hop RLS subquery is new — see below) |
| `supabase/migrations/00XX_card_checklist_overrides.sql` | migration | event-driven (audit insert) | `supabase/migrations/0010_messages.sql` (table shape) + `0004_rls_policies.sql` (`profiles_admin_insert`, admin-only insert policy) | partial (no audit-log precedent exists) |
| `supabase/migrations/00XX_card_attachments.sql` | migration | CRUD (schema) | `supabase/migrations/0011_client_files.sql` | exact |
| `supabase/tests/0XXX_cards_rls_test.sql` | test (pgTAP) | request-response (RLS assertions) | `supabase/tests/0004_rls_messages_scoping_test.sql` | exact |
| `supabase/tests/0XXX_checklist_rls_test.sql` | test (pgTAP) | request-response | `supabase/tests/0004_rls_messages_scoping_test.sql` | exact |
| `supabase/tests/0XXX_card_checklist_items_rls_test.sql` | test (pgTAP) | request-response | `supabase/tests/0005_rls_client_files_scoping_test.sql` | exact |
| `app/pm/board/page.tsx` | route (Server Component) | request-response | `app/pm/chat/page.tsx` | exact |
| `app/pm/board/board-panel.tsx` | component (Client Component) | request-response | `app/pm/chat/chat-panel.tsx` (client-switcher shell) + `components/clients/client-detail-form.tsx` (DataCard-wrapped sections, add/remove chip list) | role-match |
| `app/pm/board/actions.ts` | controller (Server Actions) | CRUD + event-driven (stage gate) | `app/pm/chat/actions.ts` (re-validate ownership before write) + `lib/actions/clients.ts` (multi-step transaction, app-layer authorization) | role-match |
| `app/admin/checklist-templates/page.tsx` | route (Server Component) | request-response | `app/admin/approvals/page.tsx` (admin RSC fetch) + `app/pm/clients/page.tsx` (PageShell/Table/EmptyState list) | role-match |
| `app/admin/checklist-templates/template-form.tsx` | component (Client Component, form) | request-response | `components/clients/client-detail-form.tsx` (`useFieldArray` add/remove list, exact CHK-01 item-list shape) | exact |
| `app/admin/checklist-templates/actions.ts` | controller (Server Actions) | CRUD | `lib/actions/clients.ts` (`createClientRecord`, `assignPms` — admin-authorized multi-row writes) | exact |
| `lib/validation/cards.ts` | utility (zod schema) | transform | `lib/validation/chat.ts` | exact |
| `lib/validation/checklist.ts` | utility (zod schema) | transform | `lib/validation/clients.ts` (`briefingSchema`'s array-of-strings shape) | exact |
| `lib/attachments/drive-url.ts` | utility (pure function, shared client+server) | transform | `lib/client-files/limit.ts` + `lib/chat/stale-response-guard.ts` (pure module, sibling `.test.ts`) | exact |
| `app/pm/layout.tsx` (modified) | config (nav) | — | itself (add one `SidebarNavItem`) | exact |
| `app/admin/layout.tsx` (modified) | config (nav) | — | itself (add one `SidebarNavItem`) | exact |

## Pattern Assignments

### `supabase/migrations/00XX_cards.sql` (migration, CRUD schema)

**Analog:** `supabase/migrations/0010_messages.sql` (RLS+GRANT-same-migration shape) — **note:** the self-referencing `parent_card_id` + denormalized `client_id` shape has **no existing precedent** in this codebase; RESEARCH.md Pattern 1 is the authoritative source for the actual DDL. Use the analog below only for the RLS/GRANT *boilerplate shape*, not the table's structural design.

**Header comment convention** (lines 1-17 of `0010_messages.sql`):
```sql
-- Phase 2: Client-Isolated AI Chat -- CTX-01, CTX-02.
--
-- Persists a single ongoing chat history per client (D-03) -- ...
--
-- RLS scoping reuses the existing is_admin()/pm_assigned_clients() helper
-- functions from 0004_rls_policies.sql (Pitfall 1: never inline a
-- cross-table subquery against pm_clients directly in a policy).
--
-- Pitfall #4: the GRANT to `authenticated` ships in THIS SAME migration --
-- hosted Supabase auto-grants base table privileges at provisioning while
-- local `supabase start` does NOT, ...
```
Every new migration this phase adds must open with an equivalent comment block: which requirement IDs it implements, which decision IDs shaped its shape, and an explicit restatement of the GRANT-same-migration rule (Pitfall 2 in 03-RESEARCH.md).

**Flat RLS policy shape to copy** (lines 27-47 of `0010_messages.sql`):
```sql
alter table public.messages enable row level security;

create policy "messages_select_scoped"
on public.messages
for select
to authenticated
using (
  (select public.is_admin())
  or client_id in (select public.pm_assigned_clients())
);

create policy "messages_insert_scoped"
on public.messages
for insert
to authenticated
with check (
  (select public.is_admin())
  or client_id in (select public.pm_assigned_clients())
);

grant select, insert on public.messages to authenticated;
```
For `cards`, this exact 4-line `using`/`with check` body applies to `select`/`insert`/`update` — do NOT write a policy that queries `public.cards` from within a `cards` policy (self-referencing RLS recursion, Pitfall 1 of 03-RESEARCH.md). The full recommended DDL (enum types, check constraints, denormalized `client_id`) is in 03-RESEARCH.md Pattern 1 (lines 227-301) — copy that structure verbatim, then apply this analog's RLS/GRANT boilerplate around it.

---

### `supabase/migrations/00XX_checklist_templates.sql` (migration, CRUD schema — 2 tables: `checklist_templates`, `checklist_template_items`)

**Analog:** `supabase/migrations/0011_client_files.sql` (table shape, header-comment convention) + `supabase/migrations/0004_rls_policies.sql` (admin-only write policy pattern).

**Admin-only write policy pattern** (lines 76-86 of `0004_rls_policies.sql`):
```sql
create policy "profiles_admin_insert"
on public.profiles
for insert
to authenticated
with check ((select public.is_admin()));

create policy "profiles_admin_delete"
on public.profiles
for delete
to authenticated
using ((select public.is_admin()));
```
Apply this shape for `checklist_templates`/`checklist_template_items` writes (CHK-01: admin-only), but allow `select` to all `authenticated` (PMs need read access to preview a client's gate) — see RESEARCH.md Pattern 2 (lines 354-366) for the exact combined policy set (`for all` with `is_admin()` for writes, `using (true)` for select).

**GRANT line convention** (line 47 of `0010_messages.sql` / line 61 of `0011_client_files.sql`):
```sql
grant select, insert on public.messages to authenticated;
grant select, insert, delete on public.client_files to authenticated;
```
Ship one `grant select, insert, update, delete on public.checklist_templates to authenticated;` (and same for `checklist_template_items`) in the same migration file — never a follow-up migration (the repeated Pitfall 2 lesson).

---

### `supabase/migrations/00XX_clients_checklist_template.sql` (migration, ALTER TABLE)

**Analog:** `supabase/migrations/0006_clients_full_record.sql` (exact match — same table, same "extend clients with a new column" shape).

**Full pattern to copy** (0006_clients_full_record.sql, entire file):
```sql
-- Phase 1: Client Records & Isolated RAG Setup
-- Extends the Phase 5 stub (id, name, created_at) with the strategic
-- briefing fields (CLI-04) and the Tropicalia project link (CLI-03).
-- RLS was already enabled on public.clients in 0002_clients_stub.sql --
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
For `checklist_template_id`: `alter table public.clients add column checklist_template_id uuid references public.checklist_templates(id);` — note the explicit comment that RLS is already enabled on `clients` and does NOT need re-enabling for an `ALTER TABLE`, only for a brand-new `CREATE TABLE`. No new RLS policy needed here — `clients_select_scoped`/`clients_update_admin_only` from `0004_rls_policies.sql` already cover the new column.

---

### `supabase/migrations/00XX_card_checklist_items.sql` (migration, snapshot copy-table)

**Analog:** `supabase/migrations/0011_client_files.sql` for table/RLS/GRANT shape. **New territory:** the RLS policy subquery is two-hop (`card_checklist_items` → `cards` → `client_id`), which has no existing precedent in this codebase (every current RLS-scoped table subqueries `pm_clients` or `clients` directly, one hop). RESEARCH.md Pattern 2 (lines 371-401) is authoritative for the exact policy text — copy it verbatim:
```sql
create policy "card_checklist_items_select_scoped"
on public.card_checklist_items for select to authenticated
using (
  (select public.is_admin())
  or card_id in (
    select id from public.cards
    where client_id in (select public.pm_assigned_clients())
  )
);
```
This is safe (not the Pitfall-1 self-referencing case) because the subquery targets `public.cards`, a *different* table from `card_checklist_items` — confirmed in RESEARCH.md's note directly under Pattern 2.

---

### `supabase/migrations/00XX_card_checklist_overrides.sql` (migration, audit event table)

**Analog:** No existing audit/event table in this codebase — `0010_messages.sql` supplies the narrow single-purpose-table shape; `0004_rls_policies.sql`'s `profiles_admin_insert` supplies the admin-only insert policy shape (reproduced above). RESEARCH.md Pattern 3 (lines 411-439) is authoritative for the full DDL — copy verbatim, including the `text[]` frozen-labels column (deliberately NOT a set of FKs back into `card_checklist_items`, since those rows may be checked later and the audit record must preserve point-in-time state).

---

### `supabase/migrations/00XX_card_attachments.sql` (migration, CRUD schema)

**Analog:** `supabase/migrations/0011_client_files.sql` (exact match — same three-policy shape: select/insert/delete scoped, all sharing one GRANT line). Reuse this file's full structure, swapping `client_id`-direct scoping for the same two-hop `card_id in (select id from cards where client_id in (select pm_assigned_clients()))` subquery used in `card_checklist_items` above (Drive links belong to a card, not directly to a client).

---

### `supabase/tests/0XXX_cards_rls_test.sql` / `checklist_rls_test.sql` / `card_checklist_items_rls_test.sql` (pgTAP tests)

**Analog:** `supabase/tests/0004_rls_messages_scoping_test.sql` (exact structural match) and `supabase/tests/0005_rls_client_files_scoping_test.sql`.

**Full pattern to copy** (`0004_rls_messages_scoping_test.sql`, entire file):
```sql
begin;
select plan(3);

\ir rls_helpers.sql

insert into public.messages (client_id, role, content)
values ('11111111-1111-1111-1111-111111111111', 'user', 'Fixture message for client_a');

select tests.set_auth('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa');

select results_eq(
  $$ select count(*) from public.messages where client_id = '11111111-1111-1111-1111-111111111111' $$,
  $$ values (1::bigint) $$,
  'pm_a sees exactly 1 message for assigned client_a'
);

select results_eq(
  $$ select count(*) from public.messages where client_id = '22222222-2222-2222-2222-222222222222' $$,
  $$ values (0::bigint) $$,
  'pm_a is blocked from unassigned client_b messages'
);

select throws_like(
  $$ insert into public.messages (client_id, role, content) values ('22222222-2222-2222-2222-222222222222', 'user', 'Should be rejected') $$,
  '%row-level security%',
  'pm_a cannot insert a message for unassigned client_b'
);

reset role;
select set_config('request.jwt.claims', '', true);

select * from finish();
rollback;
```
Copy this exact `begin; select plan(N); \ir rls_helpers.sql; ... select tests.set_auth(...); ... reset role; select * from finish(); rollback;` skeleton for all three new test files. For `0XXX_cards_rls_test.sql`, add an explicit self-referencing-recursion regression case (RESEARCH.md's Wave 0 Gaps): insert a `piece` row under a `package` parent and assert the same `pm_a`/`client_b` isolation holds on the child row, proving the flat `client_id`-on-every-row denormalization actually blocks cross-client leakage through the hierarchy (RESEARCH.md's Known Threat Patterns table, "Cross-client data leakage via the self-referencing `cards` hierarchy").

---

### `app/pm/board/page.tsx` (route, Server Component, request-response)

**Analog:** `app/pm/chat/page.tsx` (exact match — RSC loads RLS-scoped roster + data, hands to a `"use client"` panel).

**Full pattern to copy** (`app/pm/chat/page.tsx`, entire file, lines 1-37):
```typescript
import { createClient } from "@/lib/supabase/server";
import { ChatPanel } from "./chat-panel";

export default async function PmChatPage() {
  const supabase = await createClient();

  const [{ data: clients }, { data: fileRows }] = await Promise.all([
    supabase
      .from("clients")
      .select("id, name")
      .order("name", { ascending: true }),
    supabase.from("client_files").select("client_id"),
  ]);

  const clientIdsWithFiles = new Set((fileRows ?? []).map((f) => f.client_id));

  const roster = (clients ?? []).map((c) => ({
    id: c.id,
    name: c.name,
    hasRag: clientIdsWithFiles.has(c.id),
  }));

  return <ChatPanel clients={roster} />;
}
```
For `PmBoardPage`: same `Promise.all` parallel-fetch shape, but resolve `searchParams` for the active `client` id (D-10 client-switcher-via-URL pattern), fetch `cards` scoped to that client, then fetch `card_checklist_items` for those card ids and pre-compute the `checked/total` map server-side (never client-side — this IS the D-06 disabled-button source of truth). RESEARCH.md's Pattern 4 code example (lines 446-493) has the exact query shape for this page — copy that directly, it already follows this analog's structure.

---

### `app/pm/board/board-panel.tsx` (component, Client Component, request-response)

**Analog:** `app/pm/chat/chat-panel.tsx` for the client-switcher shell (`Select` + `activeClientId` state + `EmptyState` when nothing selected) — **and** `components/clients/client-detail-form.tsx` for the DataCard-wrapped-section + `useFieldArray` add/remove-chip-list pattern (directly reusable for rendering checklist items with checkboxes inside a card detail view).

**Client-switcher header pattern** (`chat-panel.tsx` lines 274-292):
```typescript
<header className="sticky top-0 z-10 border-b bg-background px-6 py-4">
  <Select value={activeClientId ?? undefined} onValueChange={handleSwitchClient}>
    <SelectTrigger className="w-full">
      <SelectValue placeholder="Selecionar cliente" />
    </SelectTrigger>
    <SelectContent>
      {clients.map((client) => (
        <SelectItem key={client.id} value={client.id}>{client.name}</SelectItem>
      ))}
    </SelectContent>
  </Select>
</header>
```

**Empty-state pattern** (`chat-panel.tsx` lines 295-300):
```typescript
{!activeClient ? (
  <EmptyState
    icon={<MessageSquareIcon className="size-5" />}
    title="Nenhum cliente selecionado"
    description="Selecione um cliente acima para começar a conversar."
  />
) : ( ... )}
```

**DataCard-wrapped section + form pattern for card detail / checklist** (`client-detail-form.tsx` lines 161-288, structure only):
```typescript
<DataCard title="Briefing estratégico" description="...">
  <Form {...form}>
    <form onSubmit={form.handleSubmit(onSubmitBriefing)} className="flex flex-col gap-4">
      {/* fields */}
      {serverError ? <ErrorBox>{serverError}</ErrorBox> : null}
      <Button type="submit" disabled={isPending}>...</Button>
    </form>
  </Form>
</DataCard>
```
Use `DataCard` (badge slot = `StatusBadge` for stage; meta slot = checklist checked/total count) for each Kanban card, and reuse this same "DataCard wraps a form with its own `useTransition`/`serverError` state" shape for the card-detail checklist-check UI and the "Avançar" button. `StatusBadge` (`components/ui/status-badge.tsx` lines 8-24) supplies the tone variants (`neutral`/`success`/`warning`/`danger`/`info`) for stage labels and the checklist-complete indicator — reuse the `tone` prop, do not invent new colors.

---

### `app/pm/board/actions.ts` (controller, Server Actions, CRUD + event-driven gate)

**Analog:** `app/pm/chat/actions.ts` (`saveKnowledge`) for the "re-validate everything server-side, never trust client-supplied content/ownership" discipline, plus `lib/actions/clients.ts` (`createClientRecord`) for the multi-step-transaction + app-layer-authorization-before-privileged-write shape.

**Re-validation discipline to copy** (`app/pm/chat/actions.ts` lines 41-64):
```typescript
const supabase = await createClient();

// Re-resolve the client via RLS — never trust anything about ownership
// from the browser (T-2-01).
const { data: client } = await supabase
  .from("clients")
  .select("id, name")
  .eq("id", parsed.data.clientId)
  .single();

if (!client) {
  return { error: CLIENT_NOT_FOUND_ERROR };
}

// Re-fetch the checked rows via RLS — content is ALWAYS re-read
// server-side, never accepted from the caller (Anti-Pattern).
const { data: messages } = await supabase
  .from("messages")
  .select("id, role, content, created_at")
  .eq("client_id", parsed.data.clientId)
  .in("id", parsed.data.messageIds)
  .order("created_at", { ascending: true });
```
Apply this exact discipline in `advanceStage`: never trust a client-supplied "all checked" flag — re-read `card_checklist_items` server-side before evaluating the gate (RESEARCH.md's Anti-Pattern list, first bullet). The full `advanceStage` implementation (stage-order lookup, gate check, snapshot-on-entry, sequential-writes-not-a-transaction per Pitfall 3) is in RESEARCH.md Pattern 4 (lines 496-576) — copy that directly; it already follows this analog's re-validation shape.

**App-layer authorization-before-privileged-write pattern** (`lib/actions/clients.ts` lines 22-41, for `forceAdvanceOverride`'s Admin-only gate):
```typescript
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
```
For `forceAdvanceOverride` (D-11, Admin-only per CONTEXT.md's default), swap the `isAuthorized` check to `profile.role === "admin"` only (mirrors `assignPms`'s stricter Admin-only check in the same file, lines 192-196) — write the `card_checklist_overrides` row in the SAME action, before/atomically with the stage UPDATE (never a separate code path, per RESEARCH.md's Repudiation threat-pattern row).

**revalidatePath-after-write pattern** (`app/admin/approvals/actions.ts` lines 30-41):
```typescript
const { error } = await supabase
  .from("profiles")
  .update({ status: 'approved', role })
  .eq("id", profileId);

if (error) {
  return { error: error.message };
}

revalidatePath("/admin/approvals");
return {};
```
Every write action in `app/pm/board/actions.ts` (`advanceStage`, `toggleChecklistItem`, `addAttachment`, `forceAdvanceOverride`) ends with `revalidatePath("/pm/board")` on success, same shape.

---

### `app/admin/checklist-templates/page.tsx` (route, Server Component, request-response)

**Analog:** `app/admin/approvals/page.tsx` (admin RSC fetch + pass to Client Component) + `app/pm/clients/page.tsx` (`PageShell`/`PageTitle`/`Table`/`EmptyState` list-screen shape, since template management is more tabular than card-based).

**Full pattern to copy** (`app/admin/approvals/page.tsx`, entire file, lines 1-40):
```typescript
import { createClient } from "@/lib/supabase/server";
import { ApprovalQueue } from "@/components/approvals/approval-queue";

export default async function AdminApprovalsPage() {
  const supabase = await createClient();
  await supabase.auth.getUser();

  const { data } = await supabase
    .from("profiles")
    .select("id, email, created_at")
    .eq("status", 'pending')
    .order("created_at", { ascending: true });

  const signups = (data ?? []) as { id: string; email: string | null; created_at: string }[];

  return (
    <div className="max-w-4xl mx-auto px-6 py-8">
      <h1 className="text-[28px] font-semibold leading-[1.2] mb-8">Aprovações pendentes</h1>
      <ApprovalQueue signups={signups} />
    </div>
  );
}
```
**Note:** this file predates the `PageShell`/`PageTitle` primitives (raw `<div className="max-w-4xl...">`/`<h1>`) — do NOT copy the raw header markup, use `app/pm/clients/page.tsx`'s `PageShell width="wide"` + `PageTitle action={...}` shape instead (lines 54-67 of that file) for the new screen, per CONTEXT.md's explicit instruction that every new screen this phase builds on `PageShell`/`PageTitle` "from the start, not styled ad-hoc and migrated later like `admin/clients` had to be."

---

### `app/admin/checklist-templates/template-form.tsx` (component, Client Component, form)

**Analog:** `components/clients/client-detail-form.tsx`'s `useFieldArray` add/remove list (lines 90-102, 224-273 — the "Pilares de conteúdo" chip-list editor) — this is a near-exact structural match for CHK-01's "admin adds/removes checklist items" requirement, just swapping free-text chips for ordered `{label, sort_order}` rows.

**Pattern to copy** (`client-detail-form.tsx` lines 90-102):
```typescript
const { fields, append, remove } = useFieldArray({
  control: form.control,
  name: "contentPillars" as never,
});

const contentPillars = form.watch("contentPillars");

function addPillar() {
  const value = pillarInput.trim();
  if (!value) return;
  append(value as never);
  setPillarInput("");
}
```
For `template-form.tsx`, replace the flat `string[]` field with an array of `{ label: string }` objects (still `useFieldArray`), and add a numeric `sort_order` derived from array index at submit time rather than a stored per-row field (simplest shape matching D-04's "snapshot copies rows" requirement — the template's own `sort_order` only needs to reflect display order, not be independently editable).

---

### `app/admin/checklist-templates/actions.ts` (controller, Server Actions, CRUD)

**Analog:** `lib/actions/clients.ts` (`createClientRecord`, `assignPms`) — exact match for "admin-authorized multi-row transaction."

**Multi-row insert pattern for `createTemplate`** (`lib/actions/clients.ts` lines 65-71, the `pm_clients` bulk insert after the parent `clients` insert):
```typescript
const pmIds =
  parsed.data.pmIds.length > 0
    ? Array.from(new Set([...parsed.data.pmIds, user.id]))
    : [user.id];
await admin
  .from("pm_clients")
  .insert(pmIds.map((pm_id) => ({ pm_id, client_id: client.id })));
```
For `createTemplate`: insert the parent `checklist_templates` row, then bulk-insert `checklist_template_items` rows (`items.map((item, i) => ({ template_id: template.id, label: item.label, sort_order: i }))`) — same "insert parent, then bulk-insert children referencing the parent's new id" shape.

**Replace-full-set pattern for `assignToClient`** (`lib/actions/clients.ts` lines 176-224, `assignPms` — delete-then-insert):
```typescript
const { error: deleteError } = await admin.from("pm_clients").delete().eq("client_id", clientId);
if (deleteError) { return { error: "..." }; }

if (pmIds.length > 0) {
  const { error: insertError } = await admin
    .from("pm_clients")
    .insert(pmIds.map((pm_id) => ({ pm_id, client_id: clientId })));
  if (insertError) { return { error: "..." }; }
}
```
`assignToClient` (CHK-02, 1:1 assignment) is actually simpler than this — a plain `update({ checklist_template_id: templateId }).eq("id", clientId)` on `clients`, since it's a single nullable FK column, not a join table. Use `assignPms`'s Admin-only authorization check (lines 186-196) as the analog for the *auth* shape, not the delete-then-insert body.

---

### `lib/validation/cards.ts` (utility, zod schema)

**Analog:** `lib/validation/chat.ts` (exact — same file purpose: new validation file scoped to this phase's own actions, never added to `lib/validation/clients.ts`, to avoid a file-ownership conflict between plans).

RESEARCH.md's Code Examples section (lines 679-699) already has the exact recommended schemas (`createCardSchema`, `createPieceSchema`, `attachDriveLinkSchema`) in this file's target shape — copy those directly. Match `chat.ts`'s doc-comment convention (lines 1-9) crediting which requirement IDs the schema serves and citing the Security Domain rationale for enforcement-before-privileged-call.

---

### `lib/validation/checklist.ts` (utility, zod schema)

**Analog:** `lib/validation/clients.ts`'s `briefingSchema` (lines 30-45) for the array-of-strings-without-`.default([])` convention (needed for `zodResolver`/`useForm` type-identity — see that file's inline comment explaining why `.default([])` breaks the typed Resolver).

```typescript
export const briefingSchema = z.object({
  // ...
  contentPillars: z.array(z.string().trim().min(1)),
});
```
Template item labels follow the identical shape: `items: z.array(z.object({ label: z.string().trim().min(1).max(200) })).min(1, { message: "Adicione ao menos um item." })`.

---

### `lib/attachments/drive-url.ts` (utility, pure function, shared client+server)

**Analog:** `lib/chat/stale-response-guard.ts` (exact — pure function module, zero I/O, imported by both a Client Component and re-validated server-side; ships a sibling `.test.ts` per this codebase's established convention: `lib/chat/stale-response-guard.test.ts`, `lib/chat/assemble-prompt.test.ts`, `lib/extract/extract-text.test.ts`).

**Doc-comment convention to copy** (`stale-response-guard.ts` lines 1-16):
```typescript
/**
 * Pure client-switch stale-response guard for the chat panel
 * (app/pm/chat/chat-panel.tsx, 02-03/02-04). Intentionally free of any
 * Supabase/Anthropic client import or I/O so this module can be
 * imported by its sibling `stale-response-guard.test.ts` via a relative
 * path and exercised with Node's built-in test runner — no live DB, no
 * Docker (02-RESEARCH.md Pattern 4, Pitfall #3, CTX-02).
 */
export function shouldAppendChunk(requestClientId: string, activeClientId: string): boolean {
  return requestClientId === activeClientId;
}
```
The exact target implementation (`isLikelyDriveLink`, `driveLinkType`) is in RESEARCH.md's Code Examples (lines 636-673) — copy it directly; write `lib/attachments/drive-url.test.ts` alongside it using Node's built-in test runner (same `node --test` convention as `lib/chat/stale-response-guard.test.ts`), and import this exact module from BOTH the Client Component (`onBlur` instant feedback) and the Server Action (`addAttachment`, never-trust-client re-validation — Pitfall 5 of 03-RESEARCH.md).

---

### `app/pm/layout.tsx` / `app/admin/layout.tsx` (modified — add one nav item each)

**Analog:** the file itself; this is a pure additive edit, not a new pattern.

**Current PM layout** (`app/pm/layout.tsx` lines 9-27):
```typescript
<AppSidebar
  items={[
    { href: "/pm/clients", label: "Clientes", icon: <UsersIcon /> },
    { href: "/pm/chat", label: "Chat", icon: <MessageSquareIcon /> },
  ]}
/>
```
Add `{ href: "/pm/board", label: "Board", icon: <LayoutDashboardIcon /> }` (or similar `lucide-react` icon already a project dependency) to this array.

**Current Admin layout** (`app/admin/layout.tsx` lines 9-25):
```typescript
<AppSidebar
  items={[
    { href: "/admin/clients", label: "Clientes", icon: <UsersIcon /> },
    { href: "/admin/approvals", label: "Aprovações", icon: <ClipboardCheckIcon /> },
  ]}
/>
```
Add `{ href: "/admin/checklist-templates", label: "Checklists", icon: <ListChecksIcon /> }` (or similar) to this array. `AppSidebar`'s active-route highlighting (`components/layout/app-sidebar.tsx` lines 40-58) needs no changes — it already derives `isActive` from `pathname.startsWith(item.href)`.

## Shared Patterns

### RLS + GRANT in the same migration
**Source:** `supabase/migrations/0010_messages.sql`, `0011_client_files.sql` (and `0004_rls_policies.sql` for the `is_admin()`/`pm_assigned_clients()` helper functions themselves — never redefine these, only call them)
**Apply to:** All 6 new migrations this phase adds.
```sql
alter table public.<new_table> enable row level security;

create policy "<table>_select_scoped" on public.<new_table>
for select to authenticated
using ((select public.is_admin()) or <scoping_expression>);

grant select, insert, update, delete on public.<new_table> to authenticated;  -- same file, always
```

### Never trust client-supplied ownership/completion claims — always re-read server-side
**Source:** `app/pm/chat/actions.ts` (`saveKnowledge` re-reads `client`/`messages` via RLS before any write)
**Apply to:** `app/pm/board/actions.ts` (`advanceStage`'s checklist-gate check, `addAttachment`'s Drive-URL re-validation)

### App-layer authorization check before a privileged write, using the RLS-scoped client's own `auth.getUser()` + `profiles` read
**Source:** `lib/actions/clients.ts` (`createClientRecord`, `assignPms`)
**Apply to:** `app/pm/board/actions.ts` (`forceAdvanceOverride`, Admin-only per D-11) and `app/admin/checklist-templates/actions.ts` (all writes, Admin-only per CHK-01)

### `revalidatePath` after every successful write, plain `{ error?: string }` return shape
**Source:** `app/admin/approvals/actions.ts`
**Apply to:** every Server Action in `app/pm/board/actions.ts` and `app/admin/checklist-templates/actions.ts`

### `DataCard` + `StatusBadge` as the visual primitives for any card/pill UI
**Source:** `components/ui/data-card.tsx`, `components/ui/status-badge.tsx`; first real consumer is `components/clients/client-detail-form.tsx` (DataCard-wrapped form sections)
**Apply to:** `app/pm/board/board-panel.tsx` (Kanban cards, stage badges), `app/admin/checklist-templates/template-form.tsx` (template editor sections)

### `PageShell` / `PageTitle` / `EmptyState` on every new screen from the start
**Source:** `components/layout/page-shell.tsx`; best current consumer `app/pm/clients/page.tsx`
**Apply to:** `app/pm/board/page.tsx`, `app/admin/checklist-templates/page.tsx` — explicitly called out in CONTEXT.md to avoid the ad-hoc-then-migrated pattern `admin/clients` had to go through

### `useFieldArray` add/remove chip-list editor
**Source:** `components/clients/client-detail-form.tsx` lines 90-102, 224-273 (content pillars)
**Apply to:** `app/admin/checklist-templates/template-form.tsx` (checklist item list)

## No Analog Found / New Territory

These schema files follow RESEARCH.md's authoritative DDL (not an existing codebase file) because the specific modeling problem is new to this codebase. Listed here so the planner does not go looking for a closer existing analog that doesn't exist:

| File | Role | Data Flow | Reason |
|---|---|---|---|
| `supabase/migrations/00XX_cards.sql` | migration | CRUD | First self-referencing table in this codebase (`parent_card_id`); RLS-recursion-safe denormalized-`client_id` shape has no prior instance — RESEARCH.md Pattern 1 is authoritative |
| `supabase/migrations/00XX_card_checklist_items.sql` | migration | CRUD (snapshot) | First two-hop RLS subquery (`card_checklist_items` → `cards` → `client_id`) — every existing scoped table subqueries `pm_clients`/`clients` directly, one hop |
| `supabase/migrations/00XX_card_checklist_overrides.sql` | migration | event-driven | First narrow audit-event table in this codebase — no polymorphic/generic event table exists to imitate, and none should be introduced (RESEARCH.md Anti-Patterns) |

## Metadata

**Analog search scope:** `app/`, `components/`, `lib/`, `supabase/migrations/`, `supabase/tests/` (full read of every `.ts`/`.tsx`/`.sql` file directly relevant to Phase 3's file list; confirmed via `find` that no other Kanban/checklist/card-related code exists anywhere in the tree yet)
**Files scanned:** 24 read in full (6 migrations, 4 tests/RLS-helper files, 10 app routes/actions/components, 4 lib modules)
**Pattern extraction date:** 2026-07-31

---

# Amendment: 2026-07-31 mid-execution re-scope (D-12 through D-19)

> Added after plans 03-01 and 03-02 shipped and `03-CONTEXT.md` was re-discussed. D-05 (no drag-and-drop) is superseded by D-12/D-13; D-14 through D-19 add per-column creation, a description field, and an assignee field. Everything above this line remains valid — this amendment only covers files the original map did not anticipate. The `## Metadata` block above is superseded by the one at the end of this amendment.

## Concrete file numbering (supersedes the `00XX` placeholders above)

Migrations must be numbered in EXECUTION order, because `supabase db push` applies them in filename order and rejects an out-of-order push against remote history.

| Migration | pgTAP test | Plan | Wave |
|---|---|---|---|
| `0013_checklist_templates.sql`, `0014_clients_checklist_template.sql` | `0006_rls_checklist_templates_scoping_test.sql` | 03-01 | 1 (shipped) |
| `0015_cards.sql` | `0007_rls_cards_scoping_test.sql` | 03-02 | 2 (shipped) |
| `0016_card_checklist_items.sql` | `0008_rls_card_checklist_items_scoping_test.sql` | 03-03 | 3 |
| `0017_cards_description_assignee.sql` | `0009_cards_assignee_membership_test.sql` | 03-07 | 4 |
| — (no migration) | — | 03-08, 03-09 | 5, 6 |
| `0018_card_attachments.sql` | `0010_rls_card_attachments_scoping_test.sql` | 03-04 | 7 |
| `0019_card_checklist_overrides.sql` | `0011_rls_card_checklist_overrides_scoping_test.sql` | 03-05 | 8 |
| — (no migration) | — | 03-06 | 9 |

## New file classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|---|---|---|---|---|
| `supabase/migrations/0017_cards_description_assignee.sql` | migration | CRUD (ALTER + trigger) | `supabase/migrations/0006_clients_full_record.sql` (ALTER shape) + `0004_rls_policies.sql` (`security definer` + `set search_path = ''` function convention) | role-match (a constraint-enforcing trigger is new territory — see below) |
| `lib/cards/checklist-snapshot.ts` | utility (server-side routine, RLS client injected) | CRUD (multi-row copy) | `lib/actions/clients.ts` (`createClientRecord`'s insert-parent-then-bulk-insert-children shape) | partial (a non-`"use server"` module that RECEIVES a Supabase client is new — see below) |
| `lib/cards/move-rules.ts` | utility (pure function, shared client+server) | transform | `lib/cards/checklist-gate.ts` / `lib/chat/stale-response-guard.ts` | exact |
| `lib/cards/package-rollup.ts` | utility (pure function) | transform | `lib/chat/stale-response-guard.ts` | exact |
| `app/pm/board/draggable-card.tsx` | component (Client Component, interaction wrapper) | — | none in this codebase (first DnD surface) | new territory — see below |
| `app/pm/board/droppable-column.tsx` | component (Client Component, drop target) | — | none in this codebase | new territory — see below |
| `app/admin/cards/page.tsx` | route (Server Component) | request-response | `app/pm/clients/page.tsx` (`PageShell width="wide"` + `Table` + `EmptyState`) | exact |
| `app/admin/cards/card-audit-panel.tsx` | component (Client Component) | request-response | `app/admin/checklist-templates/template-list.tsx` (Table + per-row dialog) + `app/pm/board/board-panel.tsx` (audit-line rendering) | role-match |
| `lib/actions/card-overrides.ts` | controller (Server Action, Admin-only) | event-driven (audit insert) | `lib/actions/clients.ts` (`assignPms`'s Admin-only authorization block) | role-match |

## `components/ui/data-card.tsx` — DO NOT MODIFY

`03-CONTEXT.md`'s Existing Code Insights says `DataCard` "now needs a dnd-kit `useSortable`/draggable wrapper per D-12 — the underlying DataCard visual/slot structure stays, only the interaction layer around it changes." Resolved concretely:

**`components/ui/data-card.tsx` gains nothing.** It stays the generic, board-agnostic primitive the 260728-uab design-system task shipped (its own doc-comment says so explicitly, citing that task's D-02), and it is also rendered by `/pm/clients`, `/admin/clients`, and `components/clients/client-detail-form.tsx` — coupling it to dnd-kit would put a drag library in the bundle of three unrelated screens.

The interaction layer lives in `app/pm/board/draggable-card.tsx`, which wraps `DataCard` from the outside:

```tsx
// app/pm/board/draggable-card.tsx  — board-local, never components/ui/
const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({ id: `card:${cardId}` });

<div ref={setNodeRef} style={{ transform: CSS.Translate.toString(transform) }}
     className={cn("relative touch-none", isDragging && "opacity-40")}>
  {children}                                {/* the existing Dialog-wrapped DataCard, untouched */}
  <CardDragHandle title={title} attributes={attributes} listeners={listeners} />
</div>
```

Three structural rules the plans enforce with grep gates:
- The drag handle is a **sibling** of `children`, never nested inside the `DialogTrigger`'s `role="button"` wrapper — that is what keeps click-to-open-dialog and keyboard-drag from fighting over the same key events.
- `useDraggable` (not `useSortable`) is correct here: cards move BETWEEN columns, and no within-column ordering exists anywhere in this phase (columns are ordered server-side by `created_at`). Only `@dnd-kit/core@6.3.1` and `@dnd-kit/utilities@3.2.2` are installed; `@dnd-kit/sortable` is deliberately absent.
- Package parent rows (`stage = null`) are rendered OUTSIDE `DndContext` and are never wrapped in `DraggableCard` — there is no legal drop target for a stageless row.

## New territory (no analog in this codebase)

| File | Role | Reason |
|---|---|---|
| `app/pm/board/draggable-card.tsx` / `droppable-column.tsx` | component | First drag-and-drop surface in the project — no DnD library existed before D-12. dnd-kit's own `useDraggable`/`useDroppable` docs are the reference, not an internal file. Pattern to establish: namespaced ids (`card:<uuid>` / `column:<stage>`) with parser helpers that return `null` on a non-matching prefix, so a malformed drag event no-ops instead of writing garbage. |
| `supabase/migrations/0017_cards_description_assignee.sql` (trigger half) | migration | First constraint-enforcing TRIGGER in this schema — every prior rule is a `check` constraint or an RLS policy. Needed because D-19's rule ("assignee must be in this client's `pm_clients`") requires a subquery, which a `check` cannot do, and because `pm_clients_select_own_or_admin` hides other PMs' rows from an invoking PM, which forces `security definer`. Follow `is_admin()`'s exact convention: `security definer` + `set search_path = ''` + every reference schema-qualified. Inline the membership `exists(...)` inside the trigger function rather than exposing a callable helper — a standalone "is this PM on this client" function would be an authenticated-callable membership oracle. |
| `lib/cards/checklist-snapshot.ts` | utility | First module that performs Supabase writes without being a Server Action itself — it takes an already-constructed RLS-scoped client as its first argument. That shape exists so `advanceStage` (03-03), `moveCard` (03-07), and `createCard` (03-07) share ONE snapshot implementation; a second copy would be a CHK-04 regression. Type the parameter as `Awaited<ReturnType<typeof import("@/lib/supabase/server").createClient>>` so no runtime import is introduced. |

## Additional shared patterns established by the re-scope

### Shared predicate module imported by BOTH the Client Component and the Server Action
**Source:** `lib/attachments/drive-url.ts` (the original instance) — now also `lib/cards/checklist-gate.ts` and `lib/cards/move-rules.ts`.
**Apply to:** every rule the browser needs for instant feedback AND the server needs as a boundary. The browser copy is always the affordance; the server copy is always the boundary. Grep gates in the plans assert the Client Component never retypes the message string, only imports the constant.

### `listClientPmRoster` — a scoped privileged read
**Source:** `lib/actions/clients.ts` (`listPmRoster`, `resolvePmNames`) established the privileged display-only `createAdminClient()` read that closes an RLS visibility gap.
**Apply to:** `listClientPmRoster(clientId)` (03-07), with one hardening the predecessors lack: an RLS-scoped `clients` visibility check runs BEFORE the privileged read and returns `[]` on failure, so the helper cannot be used as a cross-client membership oracle.

### Board card `meta` built as a segments array
**Source:** introduced in 03-09, extended by 03-04 and 03-06.
**Apply to:** `app/pm/board/board-panel.tsx`. Push optional segments (`Responsável: …`, `N anexos`, `Pacote: …`) into an array and `join(" · ")` rather than nesting ternaries — three separate plans append to this same line.

## Metadata (amended)

**Analog search scope:** unchanged from the original map, plus a re-read of `components/ui/data-card.tsx`, `lib/actions/clients.ts`, `supabase/migrations/0003_pm_clients.sql`, and `supabase/migrations/0004_rls_policies.sql` against the merged `main` branch as it stands after 03-01/03-02.
**Pattern extraction date:** 2026-07-31
**Amended:** 2026-07-31 (mid-execution re-scope — dnd-kit wrapper placement, migration renumbering, three new-territory files)
