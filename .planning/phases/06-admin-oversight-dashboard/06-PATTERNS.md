# Phase 6: Admin Oversight Dashboard - Pattern Map

**Mapped:** 2026-08-13
**Files analyzed:** 6 (2 new, 4 modified)
**Analogs found:** 6 / 6 (one is a partial/logic-only analog — staleness computation has no direct precedent)

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|--------------------|------|-----------|-----------------|----------------|
| `app/admin/page.tsx` (rewrite, replaces placeholder) | route (server component, data loader) | CRUD (cross-client read) | `app/admin/cards/page.tsx` | exact |
| `app/admin/oversight-panel.tsx` (new, client component — suggested name; planner may choose e.g. `dashboard-panel.tsx`) | component (client, table + filters) | request-response (filter via query param, row-click navigation) | `app/admin/cards/card-audit-panel.tsx` | exact (interaction model differs: no Dialog, whole-row `router.push` instead) |
| `app/admin/loading.tsx` (new) | component (skeleton) | — | `app/admin/clients/loading.tsx` | exact |
| `lib/cards/staleness.ts` (new, suggested location — pure module alongside `lib/cards/stages.ts` and `lib/cards/package-rollup.ts`) | utility (pure function) | transform | `lib/cards/stages.ts` (structural precedent only — no direct "days since" logic exists anywhere in the codebase) | role-match, no logic analog |
| `app/admin/layout.tsx` (modified — add one sidebar nav item) | config (nav shell) | — | itself (in-place edit) | exact |
| Workload panel section (inside the same `oversight-panel.tsx` — not a separate route) | component (client, secondary table) | CRUD (cross-client roster + count aggregation) | `app/pm/board/page.tsx` (roster-loading half: `pmRoster`/`editorRoster` via `listClientPmRoster`/`listEditorRoster`) | role-match |

Note: UI-SPEC explicitly locks this as **one page** (`/admin` root) with two `Table`s (main + workload) inside a single client component fed by a single server-component loader — mirroring the `page.tsx` (server, data) / `*-panel.tsx` (client, presentation) split already established by `app/admin/cards/page.tsx` + `card-audit-panel.tsx` and `app/pm/board/page.tsx` + `board-panel.tsx`. No separate route for the workload panel.

## Pattern Assignments

### `app/admin/page.tsx` (route, server component data loader)

**Analog:** `app/admin/cards/page.tsx` (full file read, 169 lines)

**Imports pattern** (lines 1-4):
```typescript
import { createClient } from "@/lib/supabase/server";
import { resolvePmNames } from "@/lib/actions/clients";
import type { CardStage } from "@/lib/cards/stages";
import { CardAuditPanel } from "./card-audit-panel";
```
For Phase 6, additionally import `listClientPmRoster`/`listEditorRoster` (see `app/pm/board/page.tsx` line 4) for the workload panel's roster, and the new `lib/cards/staleness.ts` helper.

**Cross-client RLS read pattern — no service-role client needed** (lines 61-90):
```typescript
export default async function AdminCardsPage({
  searchParams,
}: {
  searchParams: Promise<{ client?: string }>;
}) {
  const { client: clientFilter } = await searchParams;
  const supabase = await createClient();

  const [{ data: clients }, { data: cards }] = await Promise.all([
    supabase
      .from("clients")
      .select("id, name")
      .is("archived_at", null)
      .order("name", { ascending: true }),
    (() => {
      let query = supabase
        .from("cards")
        .select(
          "id, client_id, title, card_type, stage, description, assignee_id, created_at"
        )
        .order("created_at", { ascending: false });
      if (clientFilter) {
        query = query.eq("client_id", clientFilter);
      }
      return query;
    })(),
  ]);
```
For Phase 6: `searchParams` gains a second key, `pm?: string` (UI-SPEC's `?pm=` filter), applied as an additional `.eq("assignee_id", pmFilter)` OR `.eq("media_assignee_id", pmFilter)` branch (needs an `.or()` filter since a person can be either PM or Editor assignee — see Supabase `.or("assignee_id.eq.X,media_assignee_id.eq.X")` syntax). Select list needs `updated_at` added (for staleness) and `card_type` filtered to exclude `package` (UI-SPEC: `card_type in (single, piece)` only) — either via `.in("card_type", ["single", "piece"])` in the query or a post-fetch `.filter()`, matching the exclusion `app/pm/board/page.tsx` lines 240-243 already performs client-side (`packages = allCards.filter(...)`, `pieces = allCards.filter(...)`).

**Id-resolution → display-name pattern** (lines 121-131):
```typescript
const completedByIds = (checklistItems ?? [])
  .map((item) => item.completed_by)
  .filter((id): id is string => Boolean(id));
const assigneeIds = (cards ?? [])
  .map((card) => card.assignee_id)
  .filter((id): id is string => Boolean(id));
const overriddenByIds = (overrides ?? []).map((o) => o.overridden_by);
const idsToResolve = Array.from(
  new Set([...completedByIds, ...assigneeIds, ...overriddenByIds])
);
const pmNames = await resolvePmNames(idsToResolve);
```
For Phase 6, the id set is simpler (no checklist/override tables involved) — just `assignee_id` + `media_assignee_id` across all fetched cards, same `Array.from(new Set([...]))` dedup shape as `app/pm/board/page.tsx` lines 186-203.

**Default export return — passes fully-shaped data to the client panel** (lines 161-168):
```typescript
return (
  <CardAuditPanel
    clients={(clients ?? []) as AuditClient[]}
    activeClientId={clientFilter ?? null}
    cards={auditCards}
    pmNames={pmNames}
  />
);
```

---

### Workload roster loading (part of `app/admin/page.tsx`)

**Analog:** `app/pm/board/page.tsx` lines 4, 114, 139-142, 150 (roster-loading half only — not the whole file)

**Combined PM + Editor roster, cross-client** (lines 139-150):
```typescript
clientId
  ? listClientPmRoster(clientId)
  : Promise.resolve([] as BoardPmRosterEntry[]),
listEditorRoster(),
```
```typescript
const mediaAssigneeRoster: BoardPmRosterEntry[] = [...pmRoster, ...editorRoster];
```
For Phase 6 this is **cross-client by construction** (Admin-only screen, per UI-SPEC line 67), so `listClientPmRoster(clientId)` (client-scoped, RLS-gated to one client) is the WRONG helper here. Confirmed by direct read: `lib/actions/clients.ts` lines 86-100 already has the correct cross-client helper, `listPmRoster()`:
```typescript
/**
 * Read-only roster of approved PMs, used to populate the D-13 multi-select
 * picker for BOTH Admin and PM callers. Closes the `profiles_select_own_or_admin`
 * RLS gap (a PM can only read their OWN profile row) via a privileged,
 * display-only `createAdminClient()` read — never used for a write.
 */
export async function listPmRoster(): Promise<{ id: string; email: string }[]> {
  const admin = createAdminClient();
  const { data } = await admin
    .from("profiles")
    .select("id, email")
    .eq("role", "pm")
    .eq("status", "approved");
  return (data ?? []).map((row) => ({ id: row.id, email: row.email ?? "" }));
}
```
Use `listPmRoster()` + `listEditorRoster()` together for Phase 6's workload roster — same combine shape as `app/pm/board/page.tsx` line 150 (`[...pmRoster, ...editorRoster]`), just swap `listClientPmRoster(clientId)` for the unscoped `listPmRoster()`.

---

### `app/admin/oversight-panel.tsx` (client component — main table + filters + workload panel)

**Analog:** `app/admin/cards/card-audit-panel.tsx` (full file read, 410 lines) — use lines 1-170 (imports, filter Select, main Table shell) as the direct template; ignore the Dialog-based lines 172-409, since Phase 6 has no Dialog (whole-row navigation instead per UI-SPEC).

**Imports pattern** (lines 1-54, trimmed to what Phase 6 needs):
```typescript
"use client";

import { useRouter } from "next/navigation";

import { STAGE_LABELS } from "@/lib/cards/stages";
import type { AuditCard, AuditClient } from "./page"; // adjust type names for Phase 6
import { StatusBadge } from "@/components/ui/status-badge";
import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
} from "@/components/ui/table";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  PageShell,
  PageTitle,
  SectionTitle,
  EmptyState,
} from "@/components/layout/page-shell";
```
No `Dialog`/`AlertDialog`/`Badge`/`ErrorBox` imports needed (UI-SPEC line 27: "No `Dialog`/`AlertDialog` needed... unlike `/admin/cards`, this screen has no row-level detail modal").

**Query-param filter Select pattern** (lines 56, 103-109, 118-133):
```typescript
const ALL_CLIENTS_VALUE = "all";
```
```typescript
function handleClientFilterChange(value: string) {
  if (value === ALL_CLIENTS_VALUE) {
    router.push("/admin/cards");
    return;
  }
  router.push(`/admin/cards?client=${value}`);
}
```
```typescript
<Select
  value={activeClientId ?? ALL_CLIENTS_VALUE}
  onValueChange={handleClientFilterChange}
>
  <SelectTrigger className="w-full max-w-sm">
    <SelectValue placeholder="Todos os clientes" />
  </SelectTrigger>
  <SelectContent>
    <SelectItem value={ALL_CLIENTS_VALUE}>Todos os clientes</SelectItem>
    {clients.map((client) => (
      <SelectItem key={client.id} value={client.id}>
        {client.name}
      </SelectItem>
    ))}
  </SelectContent>
</Select>
```
For Phase 6, this pattern is duplicated for the second `Select` (PM filter, `?pm=`, placeholder "Todos os responsáveis") — both filters need to combine into the same URL (`?client=X&pm=Y`), so `handleClientFilterChange`/`handlePmFilterChange` must build the query string additively (read both current values, set the changed one, `router.push` with both params present when non-default) rather than the single-param `router.push` shown above. UI-SPEC line 53 places both `Select`s in one `flex items-center gap-md` row.

**Table shell + EmptyState pattern** (lines 136-170):
```typescript
{cards.length === 0 ? (
  <EmptyState
    title="Nenhum card ainda"
    description="Nenhum card foi criado para os clientes selecionados."
  />
) : (
  <Table>
    <TableHeader>
      <TableRow>
        <TableHead>Cliente</TableHead>
        <TableHead>Título</TableHead>
        <TableHead>Responsável</TableHead>
        <TableHead>Etapa</TableHead>
        {/* ...Phase 6 columns per UI-SPEC: Cliente · Título · Responsável · Etapa · Atualizado */}
      </TableRow>
    </TableHeader>
    <TableBody>
      {cards.map((card) => (
        <CardAuditRow key={card.id} card={card} clientName={...} pmNames={pmNames} />
      ))}
    </TableBody>
  </Table>
)}
```
Two distinct empty states needed for Phase 6 (UI-SPEC lines 152-153: "no cards anywhere" vs "filtered to zero results") — `card-audit-panel.tsx` only has one empty-state branch; Phase 6 must branch on whether any filter is active to pick the right copy.

**Whole-row click/keyboard navigation pattern (interaction-model precedent — copy the row/keyboard handlers, but replace Dialog-open with `router.push`)** (lines 193-206):
```typescript
const [open, setOpen] = useState(false);
// ...
<TableRow
  className="cursor-pointer"
  role="button"
  tabIndex={0}
  onClick={() => setOpen(true)}
  onKeyDown={(event) => {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      setOpen(true);
    }
  }}
>
```
For Phase 6, replace `setOpen(true)` in both `onClick` and `onKeyDown` with `router.push('/pm/board?client=' + card.client_id)` (D-03) — no `useState`/`Dialog` wrapper needed at all, since there is no modal on this screen (UI-SPEC line 62: "a full page navigation, not a Dialog"). The `role="button"` / `tabIndex={0}` / `Enter`/`Space` keyboard-activation shape is otherwise identical.

**Etapa column rendering (STAGE_LABELS + StatusBadge, identical reuse)** (lines 210-215):
```typescript
<TableCell>
  {card.stage ? (
    <StatusBadge tone="neutral">{STAGE_LABELS[card.stage]}</StatusBadge>
  ) : (
    <StatusBadge tone="neutral">Pacote</StatusBadge>
  )}
</TableCell>
```
Phase 6 never has a null-stage row (packages excluded, UI-SPEC line 57), so the `card.stage ? ... : "Pacote"` ternary's else-branch is dead code here — can be simplified to just `<StatusBadge tone="neutral">{STAGE_LABELS[card.stage]}</StatusBadge>` (with `card.stage` typed non-null after the `card_type in (single, piece)` filter).

---

### `lib/cards/staleness.ts` (new — pure utility, no direct analog)

**Structural analog (module shape only, not logic):** `lib/cards/stages.ts` (full file read, 47 lines)

**Pure-module convention to follow** (lines 1-12):
```typescript
/**
 * Pure stage-progression module for content cards (KAN-02, KAN-03, D-05).
 * Intentionally free of any Supabase/React import or I/O so this module can
 * be imported by its sibling `stages.test.ts` via a relative path and
 * exercised with Node's built-in test runner -- no live DB, no Docker
 * (mirrors lib/chat/stale-response-guard.ts's convention).
 */
```
Phase 6's `lib/cards/staleness.ts` should follow the same convention: pure function(s), zero I/O, testable in isolation with Node's built-in test runner (a sibling `staleness.test.ts`, mirroring `stages.test.ts`).

**No existing "days since" / relative-time logic found anywhere in the codebase** (`grep` across `lib/` and `app/` for `daysSince`, `86400000`, relative-date formatting turned up nothing beyond `formatAuditDate` in `card-audit-panel.tsx` lines 69-74, which is an absolute-date `Intl.DateTimeFormat` formatter, not a relative/staleness one):
```typescript
function formatAuditDate(iso: string): string {
  return new Intl.DateTimeFormat("pt-BR", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(iso));
}
```
This confirms UI-SPEC's exact formula (line 72) — `daysSinceUpdate = floor((now - cards.updated_at) / 86400000)` — must be implemented fresh, with no precedent to copy. Suggested shape based on the `stages.ts` pure-function convention:
```typescript
export type StalenessTier = "fresh" | "stalled" | "overdue";

export function daysSinceUpdate(updatedAt: string, now: Date = new Date()): number {
  return Math.floor((now.getTime() - new Date(updatedAt).getTime()) / 86400000);
}

export function stalenessTier(days: number): StalenessTier {
  if (days < 3) return "fresh";
  if (days < 7) return "stalled";
  return "overdue";
}

export function stalenessBadgeCopy(days: number): string {
  if (days === 0) return "Atualizado hoje";
  if (days === 1) return "Atualizado ontem";
  if (days < 3) return `Atualizado há ${days} dias`;
  return `Parado há ${days} dias`;
}
```
`now: Date = new Date()` as an injectable default parameter (rather than calling `new Date()` inline in the body) is what makes this testable per the pure-module convention above — the `staleness.test.ts` sibling can pass a fixed `now` and assert exact tier boundaries (2 vs 3 days, 6 vs 7 days) without mocking global time.

**Tone mapping** (StatusBadge tone prop, from `components/ui/status-badge.tsx` lines 6, 12-18):
```typescript
export type StatusTone = "neutral" | "success" | "warning" | "danger" | "info";
```
Map `stalenessTier` → `StatusBadge` tone: `fresh` → `"neutral"`, `stalled` → `"warning"`, `overdue` → `"danger"` (UI-SPEC table, lines 74-78).

---

### `app/admin/loading.tsx` (new — skeleton)

**Analog:** `app/admin/clients/loading.tsx` (full file read, 17 lines)

```typescript
import { Skeleton } from "@/components/ui/skeleton";
import { TableRowsSkeleton } from "@/components/ui/skeletons";
import { PageShell } from "@/components/layout/page-shell";

export default function AdminClientsLoading() {
  return (
    <PageShell width="wide">
      <Skeleton className="mb-section h-8 w-40" />
      <TableRowsSkeleton rows={5} columns={3} />
    </PageShell>
  );
}
```
For Phase 6: `PageShell width="wide"` matches (UI-SPEC line 51). Needs **two** `TableRowsSkeleton` blocks (main table + workload panel table) since this page has two tables, e.g. `columns={5}` for the main table (Cliente/Título/Responsável/Etapa/Atualizado) and `columns={3}` for the workload panel (Pessoa/Cards ativos/Distribuição por etapa). `TableRowsSkeleton` itself (`components/ui/skeletons.tsx` lines 17-52) needs no changes — reuse as-is.

---

### `app/admin/layout.tsx` (modified — sidebar nav)

**Self-analog (in-place edit), full relevant block** (lines 1-46):
```typescript
import {
  UsersIcon,
  UserCogIcon,
  ClipboardCheckIcon,
  ListChecksIcon,
  KanbanIcon,
  BookOpenIcon,
  LayoutDashboardIcon,
} from "lucide-react";

import { AppSidebar } from "@/components/layout/app-sidebar";

export default function AdminLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <div className="flex h-screen">
      <AppSidebar
        items={[
          { href: "/admin/clients", label: "Clientes", icon: <UsersIcon /> },
          { href: "/pm/board", label: "Produção", icon: <LayoutDashboardIcon /> },
          { href: "/admin/editors", label: "Editores", icon: <UserCogIcon /> },
          {
            href: "/admin/approvals",
            label: "Aprovações",
            icon: <ClipboardCheckIcon />,
          },
          {
            href: "/admin/checklist-templates",
            label: "Checklists",
            icon: <ListChecksIcon />,
          },
          { href: "/admin/cards", label: "Cards", icon: <KanbanIcon /> },
          {
            href: "/admin/shared-knowledge",
            label: "Base de conhecimento",
            icon: <BookOpenIcon />,
          },
        ]}
      />
      <main className="flex min-w-0 flex-1 flex-col overflow-y-auto">
        {children}
      </main>
    </div>
  );
}
```
Change required (UI-SPEC line 25): add `GaugeIcon` to the `lucide-react` import list, and insert `{ href: "/admin", label: "Visão geral", icon: <GaugeIcon /> }` as the **first** element of the `items` array (before `/admin/clients`) — since `/admin` becomes Admin's landing page this phase.

---

## Shared Patterns

### Cross-client RLS read (no service-role client)
**Source:** `app/admin/cards/page.tsx` lines 61-90 (see also docstring lines 52-60)
**Apply to:** `app/admin/page.tsx`'s main `cards` query and `clients` query. `is_admin()` already grants unrestricted cross-client reads via the regular RLS-scoped `createClient()` — never reach for a service-role/admin Supabase client for the `cards`/`clients` tables themselves (only `resolvePmNames`/`listEditorRoster`/`listClientPmRoster` internally use `createAdminClient()`, to close an RLS gap on the `profiles`/`pm_clients` tables specifically — see `lib/actions/clients.ts`).

### Id → display-name resolution
**Source:** `lib/actions/clients.ts` — `resolvePmNames` (lines 129-145), `listEditorRoster` (lines 112-121), `listClientPmRoster` (lines 158-184)
**Apply to:** `app/admin/page.tsx` — resolve `assignee_id`/`media_assignee_id` across all fetched cards into display emails via `resolvePmNames`, and (pending confirmation of a cross-client `listPmRoster()` helper's existence) load the full PM+Editor roster for the workload panel the same way `app/pm/board/page.tsx` combines `pmRoster`/`editorRoster` (lines 139-150).

### Query-param filter Select
**Source:** `app/admin/cards/card-audit-panel.tsx` lines 56, 103-109, 118-133
**Apply to:** Both the Client filter (`?client=`, identical copy/placement) and the new PM filter (`?pm=`) in `oversight-panel.tsx`.

### Page shell / title / empty-state primitives
**Source:** `components/layout/page-shell.tsx` (full file, 126 lines) — `PageShell`, `PageTitle`, `SectionTitle`, `EmptyState`
**Apply to:** All of `app/admin/page.tsx`'s rendered output and `app/admin/loading.tsx`. `SectionTitle` specifically for the "Carga de trabalho" workload panel heading (UI-SPEC line 63).

### Table primitives
**Source:** `components/ui/table.tsx` (imported identically in `card-audit-panel.tsx` lines 16-23) — `Table`, `TableHeader`, `TableBody`, `TableRow`, `TableHead`, `TableCell`
**Apply to:** Both tables in `oversight-panel.tsx` (main cross-client table + workload panel table).

### StatusBadge tone system
**Source:** `components/ui/status-badge.tsx` (full file, 53 lines)
**Apply to:** Etapa column (`tone="neutral"`, reusing `STAGE_LABELS`), staleness column (`tone` driven by `stalenessTier`), and workload panel's per-stage count chips (`tone="neutral"`, per UI-SPEC line 68).

## No Analog Found

| File | Role | Data Flow | Reason |
|------|------|-----------|--------|
| `lib/cards/staleness.ts` (computation logic body, not module shape) | utility | transform | No relative-time/"days since" logic exists anywhere in the codebase today — `formatAuditDate` in `card-audit-panel.tsx` is an absolute-date formatter only. Must be written fresh per UI-SPEC's exact formula and tier table (lines 70-80). Module *shape* (pure, I/O-free, sibling `.test.ts`) follows `lib/cards/stages.ts`'s established convention. |

## Metadata

**Analog search scope:** `app/admin/**`, `app/pm/board/**`, `lib/cards/**`, `lib/actions/clients.ts`, `components/ui/**`, `components/layout/page-shell.tsx`
**Files scanned:** `app/admin/cards/page.tsx`, `app/admin/cards/card-audit-panel.tsx`, `app/admin/layout.tsx`, `app/admin/page.tsx` (current placeholder), `app/admin/clients/loading.tsx`, `app/pm/board/page.tsx`, `lib/cards/stages.ts`, `lib/actions/clients.ts`, `components/ui/status-badge.tsx`, `components/ui/skeletons.tsx`, `components/layout/page-shell.tsx`
**Pattern extraction date:** 2026-08-13
