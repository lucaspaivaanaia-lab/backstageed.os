# Phase 3: Content Production Kanban - Research

**Researched:** 2026-07-29
**Domain:** Postgres/Supabase schema modeling (self-referencing hierarchy, template snapshotting, audit trail) + Next.js App Router Kanban UI without drag-and-drop
**Confidence:** HIGH (schema/RLS patterns verified against this codebase's own established migrations; Kanban UI approach is a direct extension of patterns already in production here) / MEDIUM (Google Drive URL shape — no official single spec, cross-referenced against multiple community sources)

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

**Package model (KAN-01)**
- **D-01:** A "pacote de conteúdo" is a parent card containing multiple sub-cards, one per piece. Each sub-card advances through stages independently — pieces in a campaign don't have to move in lockstep.
- **D-02:** The checklist for revisão interna applies per sub-card, not once for the whole package. Each piece gets its own review and its own audit trail; there is no package-level checklist state, only aggregated visibility (Claude's discretion on exact rollup).

**Checklist templates (CHK-01, CHK-02)**
- **D-03:** Checklists are reusable templates, not defined from scratch per client. Admin creates one or more templates (e.g., "Padrão", "Cliente Premium") and assigns one to each client.
- **D-04:** A card's checklist is snapshotted (copied) at the moment it enters revisão interna, not live-bound to the template. Editing a template afterward only affects cards that enter revisão interna after the edit — in-progress cards keep the item list they started with.

**Stage advancement (KAN-02, KAN-03, CHK-03)**
- **D-05:** Advancing a card to the next stage is an explicit "Avançar" button on the card, not drag-and-drop on the board. No new drag-and-drop dependency needed.
- **D-06:** Leaving revisão interna, the "Avançar" button is disabled (not clickable-then-erroring) while any checklist item on that card/sub-card is unchecked.

**Google Drive attachments (KAN-05)**
- **D-07:** Attachments are links, not uploaded files or an embedded picker — no Google Drive API/OAuth integration in this phase.
- **D-08:** Rendered as a simple list per card: icon by type (image/vídeo/PDF) + label + opens in a new tab. No thumbnail/preview fetched from Drive.
- **D-09:** No cap on the number of links per card. The app validates that a pasted URL matches the Google Drive link shape before accepting it.

**Board navigation**
- **D-10:** The Kanban board follows the same navigation pattern Phase 2 established for chat: a dedicated screen with a client switcher, not nested under `app/pm/clients/[id]/*`. Carried forward by precedent, not freshly re-decided — confirmed still fits below (Architecture Patterns).

**Admin checklist override (CHK-04)**
- **D-11:** Admin has a manual override to force-advance a card past a blocked checklist gate (unchecked items). The override itself is logged in the same audit trail as regular checklist checks — who triggered it, when, and which items were still unchecked at the time.

### Claude's Discretion
- Exact schema shape for cards/sub-cards (self-referencing `parent_card_id` vs. a separate `card_pieces` table) — D-01/D-02 lock the *behavior*, not the table design.
- How a package's aggregate status is rolled up and displayed on the board.
- Exact checklist template data model (copy rows vs. a frozen JSON blob).
- Regex/validation pattern for "looks like a Google Drive link."
- Exact Kanban column/board visual layout, card summary fields shown on board vs. detail view.
- Exact UI/wording for the admin override action, and whether override is scoped to Admin only or also PMs (default: Admin only, unless planner finds a reason otherwise).

### Deferred Ideas (OUT OF SCOPE)
- Real Google Drive API integration (OAuth, file picker, embedded previews/thumbnails) — explicitly deferred by D-07/D-08.
- Client-facing approval and the adjustment loop (KAN-04, APR-*) — that's Phase 4. This phase's board displays "aprovação do cliente" and "agendamento" as reachable stage labels only, no interaction UI for them.
- Phase 6's cross-client admin overview (ADM-*).
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| KAN-01 | PM can create a content card for a client (single post or package) | Schema section: `card_type` enum on self-referencing `cards` table; Code Examples: create-card action |
| KAN-02 | Card moves through briefing → produção → revisão interna → aprovação do cliente → agendamento | `stage` enum column + check constraint; Architecture: stage-advance Server Action |
| KAN-03 | PM can view all cards for a client as a Kanban board grouped by stage | Architecture: column-grouped Server Component render pattern, dedicated `/pm/board` route (D-10) |
| KAN-05 | PM can attach Google Drive links to a card without opening Drive | `card_attachments` table; Drive URL regex (Code Examples) |
| CHK-01 | Admin defines review checklist items required before client approval | `checklist_templates` + `checklist_template_items` tables |
| CHK-02 | Checklist items configured differently per client | `clients.checklist_template_id` FK (1:1 assignment) |
| CHK-03 | PM checks off checklist items during revisão interna; completion tracked before advance | `card_checklist_items` snapshot table with `completed_at`/`completed_by`; disabled-button pattern (D-06) |
| CHK-04 | Admin sees per card which checklist items completed and when (auditability) | `card_checklist_items` timestamps (regular flow) + `card_checklist_overrides` table (D-11 override event) |
</phase_requirements>

## Summary

This phase is schema-design-heavy, not library-heavy: there is no new npm package to evaluate (D-05 explicitly rules out drag-and-drop, D-07 rules out Google Drive API/OAuth), so the research effort concentrates on getting the Postgres/Supabase data model right the first time, since this is the first phase in the codebase that needs a self-referencing hierarchy (parent/child cards), a "snapshot at a point in time" pattern (checklist template → card), and a genuine audit-trail table (checklist completions + admin override). All three are new modeling territory for this codebase, but each has a well-established relational solution that fits the existing narrow-table, typed-column style already used in `messages` and `client_files` — no JSONB blobs, no polymorphic/generic event table, no ORM.

The single most consequential finding: **a self-referencing `cards` table with an RLS policy that infers the child's client through the parent row will hit Postgres's "infinite recursion detected in policy" error** — this is a documented, well-known limitation of RLS on self-referencing tables, not a design choice. The fix is to denormalize `client_id` onto every row (parent, single-post card, and every sub-card), populated at insert time, exactly as this codebase already does for `messages` and `client_files`. This keeps every RLS policy a simple `client_id in (select pm_assigned_clients())` check with zero subqueries back into `cards` itself.

For the checklist snapshot (D-04) and the audit trail (CHK-04/D-11), copy-tables with typed columns (`card_checklist_items` with `completed_at`/`completed_by`, plus a separate `card_checklist_overrides` event table) are recommended over a frozen JSONB blob — this fits the "which items were checked and when" query CHK-04 requires directly via a `WHERE card_id = ? ORDER BY sort_order` read, with zero JSON-path logic in application code, and matches the zero-JSONB-column precedent set by every existing table in this codebase.

For the Kanban board itself, D-05's explicit ban on drag-and-drop is a scope *reduction*, not a gap: the board is a Server Component that groups cards by `stage` into columns, each card renders inside the existing `DataCard` primitive, and "Avançar" is a plain `<form action={...}>` Server Action button whose `disabled` state is computed server-side by counting unchecked `card_checklist_items` rows for that card — no client-side state machine, no optimistic UI library needed.

**Primary recommendation:** Model cards as one self-referencing `cards` table (`card_type` enum: `single` | `package` | `piece`, nullable `parent_card_id`, denormalized `client_id` on every row), checklist templates as two normal tables snapshotted into a third `card_checklist_items` copy-table at the revisão-interna transition, and the admin override as its own narrow `card_checklist_overrides` event table — all four new tables following the exact RLS+GRANT-same-migration pattern from `0010_messages.sql`/`0011_client_files.sql`.

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Card/sub-card CRUD | API / Backend (Server Actions) | Database (RLS) | Business rules (stage transitions, checklist gate) belong in Server Actions, not the client; RLS is the last-line enforcement, not the primary business logic layer |
| Checklist template management | API / Backend (Admin Server Actions) | Database | Admin-only writes; template CRUD is simple relational data, no client-side complexity needed |
| Checklist snapshot-at-transition | API / Backend (Server Action triggered by "Avançar") | Database (insert) | Must happen atomically with the stage change — a DB trigger is tempting but the app already does all writes via Server Actions (no triggers exist anywhere in this codebase); keep the snapshot logic in the same Server Action that performs the stage UPDATE, wrapped so both succeed or neither does |
| Kanban board rendering (columns, cards) | Frontend Server (RSC) | Browser (Client Component only for interactive bits like checkbox toggles) | Data fetching + column grouping is pure Server Component work (matches `app/pm/chat/page.tsx`'s existing RSC-loads-then-hands-to-client-panel pattern) |
| "Avançar" button disabled state | Frontend Server (computed at render) | — | Disabled state is derived from checklist completion counts read server-side; no client-side derived state needed, avoids a stale-disabled-button bug class |
| Drive-link validation | Browser (Client Component, instant feedback) | API / Backend (Server Action re-validates, never trusts client) | Same "never trust client input" pattern already codified in `app/pm/chat/actions.ts` (T-2-01) |
| Admin override audit trail | API / Backend (Server Action) | Database (insert into `card_checklist_overrides`) | Point-in-time event record; must be written by the same privileged action that performs the override, not derived later |
| Package rollup display | Frontend Server (computed at render, not stored) | Database (aggregate query) | Avoid a stored/denormalized rollup column that can drift from its children — compute the "3/5 em revisão interna" summary via a `GROUP BY stage` query over `parent_card_id` at render time |

## Standard Stack

No new external libraries are required for this phase. Every listed capability is achievable with tools already in the codebase.

### Core (already present, verified in `package.json`)
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `zod` | ^4.4.3 [VERIFIED: package.json] | Server Action input validation | Established pattern in `lib/validation/*.ts` — new `lib/validation/cards.ts` and `lib/validation/checklist.ts` follow the same shape as `lib/validation/chat.ts` |
| `@supabase/ssr` | (existing, `lib/supabase/server.ts`) | RLS-scoped Postgres access from Server Components/Actions | Every table read/write in this phase goes through the same `createClient()` factory — no new client type needed |
| `lucide-react` | ^1.23.0 [VERIFIED: package.json] | Icons for Drive-link type (image/vídeo/PDF) and stage labels | Already the icon library used in `AppSidebar` (`LogOutIcon`) |
| `class-variance-authority` | ^0.7.1 [VERIFIED: package.json] | Stage/tone variants for `StatusBadge` reuse | Already how `StatusBadge` tones are defined |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| — | — | — | No supporting libraries needed. |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Explicit "Avançar" Server Action button (D-05) | `@dnd-kit/core` or `react-beautiful-dnd` for draggable columns | **Rejected per D-05.** Would add a new client-side state-management dependency and an entire class of accessibility/mobile-touch bugs for a board this phase's own decisions say doesn't need it. Do not introduce. |
| Copy-table snapshot (`card_checklist_items`) | Frozen JSONB column on the card row | JSONB would require `jsonb_set`-style partial updates to mark one item checked and in-app parsing to answer "which items, when" (CHK-04) — strictly worse ergonomics for a query this phase's own success criteria require, with zero benefit given Postgres/Supabase handles relational joins natively and no other table in this codebase uses JSONB |
| Self-referencing `cards.parent_card_id` | Separate `card_pieces` table | A separate table would need to duplicate nearly every column on `cards` (stage, checklist-state FK, client_id, timestamps) since sub-cards need full independent-card behavior per D-01 — this is a textbook adjacency-list case, not a case for two parallel schemas |

**Installation:**
No new packages to install this phase.

**Version verification:** All versions above were read directly from `package.json` in the working tree — not npm registry lookups, since no new package is being added.

## Package Legitimacy Audit

**Not applicable this phase.** No external packages are being introduced — schema and UI work uses only already-installed dependencies (`zod`, `@supabase/ssr`, `lucide-react`, `class-variance-authority`). The Package Legitimacy Gate protocol is skipped per its own trigger condition ("whenever this phase installs external packages").

## Architecture Patterns

### System Architecture Diagram

```
PM browser
   |
   |  1. GET /pm/board?client=<id>          2. POST (Server Action: createCard)
   v                                             |
+--------------------------------------------+   |
| Server Component (app/pm/board/page.tsx)    |<--+
| - loads client roster (RLS-scoped, mirrors  |
|   app/pm/chat/page.tsx pattern)             |
| - loads cards for active client              |
|   (RLS-scoped: client_id in                  |
|   pm_assigned_clients())                     |
| - groups cards by `stage` into 5 columns     |
| - for each card: reads card_checklist_items  |
|   (if any) to compute checked/total count    |
+--------------------------------------------+
   |
   |  hands data to
   v
+--------------------------------------------+
| Client Component (BoardPanel)               |
| - renders DataCard per card, grouped by      |
|   column (no DnD — static columns, D-05)     |
| - checklist checkbox UI (per item, inside    |
|   card detail / expanded view)               |
| - "Avançar" <form action={advanceStage}>     |
|   button; disabled=true if uncheckedCount>0  |
|   AND stage === 'revisão interna'            |
+--------------------------------------------+
   |
   |  3. checklist item toggled -> Server Action (toggleChecklistItem)
   |  4. "Avançar" clicked        -> Server Action (advanceStage)
   |  5. Drive link pasted        -> Server Action (addAttachment)
   v
+--------------------------------------------+
| Server Actions (app/pm/board/actions.ts)     |
| - toggleChecklistItem: re-validates card     |
|   ownership via RLS read, UPDATEs one row    |
|   in card_checklist_items (completed_at/by)  |
| - advanceStage:                              |
|     a. re-reads card + checklist state       |
|        server-side (never trusts client      |
|        "all checked" claim)                  |
|     b. IF entering revisão interna: snapshot |
|        template_items -> card_checklist_items|
|     c. IF leaving revisão interna: blocks     |
|        unless all card_checklist_items rows  |
|        have completed_at set (or admin        |
|        override path, D-11)                  |
|     d. UPDATE cards.stage                     |
| - forceAdvanceOverride (Admin only, D-11):    |
|     writes card_checklist_overrides row       |
|     (who/when/which items still unchecked)    |
|     THEN performs the same stage UPDATE       |
| - addAttachment: re-validates Drive URL shape |
|   server-side, INSERTs into card_attachments  |
+--------------------------------------------+
   |
   v
Postgres (Supabase) — RLS enforced on every table:
cards, card_checklist_items, card_attachments,
card_checklist_overrides, checklist_templates,
checklist_template_items
```

### Recommended Project Structure
```
app/
├── pm/
│   └── board/                      # dedicated screen, client switcher (D-10)
│       ├── page.tsx                # Server Component: loads roster + cards
│       ├── board-panel.tsx         # "use client": columns, card detail, checklist UI
│       └── actions.ts              # createCard, advanceStage, toggleChecklistItem,
│                                    #   addAttachment, forceAdvanceOverride (admin-gated)
├── admin/
│   └── checklist-templates/        # Admin-only template management (CHK-01/CHK-02)
│       ├── page.tsx
│       ├── template-form.tsx
│       └── actions.ts              # createTemplate, updateTemplate, assignToClient
lib/
├── validation/
│   ├── cards.ts                    # zod schemas: createCard, advanceStage input
│   └── checklist.ts                # zod schemas: template CRUD, item toggle
├── attachments/
│   └── drive-url.ts                # isLikelyDriveLink() regex + shared client/server validator
supabase/migrations/
├── 00XX_checklist_templates.sql    # checklist_templates + checklist_template_items + RLS/GRANT
├── 00XX_clients_checklist_template.sql  # ALTER clients ADD checklist_template_id
├── 00XX_cards.sql                  # cards (self-referencing) + RLS/GRANT
├── 00XX_card_checklist_items.sql   # snapshot table + RLS/GRANT
├── 00XX_card_checklist_overrides.sql   # audit event table + RLS/GRANT
└── 00XX_card_attachments.sql       # Drive links + RLS/GRANT
```

### Pattern 1: Self-referencing cards table with denormalized client_id (avoids RLS recursion)

**What:** One `cards` table serves single-post cards, package parents, and sub-cards ("pieces"), distinguished by `card_type`. `client_id` is stored on every row (not inferred from the parent via a join), so every RLS policy is a flat, non-recursive `client_id in (...)` check.

**When to use:** Any time a self-referencing hierarchy needs RLS scoping by a foreign attribute (here, the client). This is the single highest-risk schema decision in this phase — getting it wrong produces a Postgres error that only surfaces at query time ("infinite recursion detected in policy"), not at migration-apply time.

**Example:**
```sql
-- Source: pattern derived from Supabase community guidance on self-referencing
-- RLS (https://github.com/orgs/supabase/discussions/3328) + this codebase's
-- own established denormalization precedent (messages.client_id,
-- client_files.client_id both store client_id directly rather than joining).

create type public.card_type as enum ('single', 'package', 'piece');
create type public.card_stage as enum (
  'briefing', 'producao', 'revisao_interna', 'aprovacao_cliente', 'agendamento'
);

create table public.cards (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.clients(id) on delete cascade,
  parent_card_id uuid references public.cards(id) on delete cascade,
  card_type public.card_type not null default 'single',
  title text not null,
  -- package parents don't have their own stage (D-02: no package-level
  -- checklist gate, and by extension no package-level stage progression) --
  -- enforced by the check constraint below, not left to convention.
  stage public.card_stage,
  created_by uuid not null references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint cards_package_has_no_stage
    check (
      (card_type = 'package' and stage is null)
      or (card_type in ('single', 'piece') and stage is not null)
    ),
  constraint cards_piece_requires_parent
    check (
      (card_type = 'piece' and parent_card_id is not null)
      or (card_type in ('single', 'package'))
    )
);

alter table public.cards enable row level security;

-- Flat, non-recursive policy — client_id lives on THIS row, never a
-- subquery back into cards itself (Pitfall: self-referencing RLS recursion).
create policy "cards_select_scoped"
on public.cards
for select
to authenticated
using (
  (select public.is_admin())
  or client_id in (select public.pm_assigned_clients())
);

create policy "cards_insert_scoped"
on public.cards
for insert
to authenticated
with check (
  (select public.is_admin())
  or client_id in (select public.pm_assigned_clients())
);

create policy "cards_update_scoped"
on public.cards
for update
to authenticated
using (
  (select public.is_admin())
  or client_id in (select public.pm_assigned_clients())
)
with check (
  (select public.is_admin())
  or client_id in (select public.pm_assigned_clients())
);

grant select, insert, update on public.cards to authenticated;
```

**Application-level rule to enforce in the Server Action, not the DB:** when creating a sub-card (`card_type = 'piece'`), copy `client_id` from the parent row (re-read via RLS, never accept `client_id` as a raw client-supplied argument for the piece) — this keeps the denormalization consistent without a trigger.

### Pattern 2: Checklist template snapshot (copy-table, not JSONB)

**What:** `checklist_templates` + `checklist_template_items` are the live, admin-editable source. `card_checklist_items` is a **copy**, written once per card at the moment it enters `revisao_interna`, and never re-synced from the template afterward (D-04).

**Example:**
```sql
-- Source: pattern follows this codebase's existing typed-relational-table
-- convention (0010_messages.sql, 0011_client_files.sql) — no JSONB column
-- exists anywhere else in this schema, so this keeps the new tables
-- consistent with the rest of the codebase rather than introducing a new
-- data-shape idiom for one feature.

create table public.checklist_templates (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  created_at timestamptz not null default now()
);

create table public.checklist_template_items (
  id uuid primary key default gen_random_uuid(),
  template_id uuid not null references public.checklist_templates(id) on delete cascade,
  label text not null,
  sort_order int not null default 0
);

-- CHK-02: one template per client (simplest shape satisfying "assigns one
-- template to each client" — a nullable FK column, not a join table, since
-- this is a strict 1:1 assignment per D-03's wording).
alter table public.clients
  add column checklist_template_id uuid references public.checklist_templates(id);

-- The snapshot: written by the advanceStage Server Action at the instant a
-- card transitions INTO revisao_interna. completed_at/completed_by are
-- NULL until the PM checks the item — this is what answers CHK-04's
-- "which items were completed and when" directly, no JSON parsing.
create table public.card_checklist_items (
  id uuid primary key default gen_random_uuid(),
  card_id uuid not null references public.cards(id) on delete cascade,
  label text not null,
  sort_order int not null default 0,
  completed_at timestamptz,
  completed_by uuid references public.profiles(id),
  created_at timestamptz not null default now()
);

alter table public.checklist_templates enable row level security;
alter table public.checklist_template_items enable row level security;
alter table public.card_checklist_items enable row level security;

-- Templates: admin-managed, but PMs need read access to know what a client's
-- gate will require (e.g., to preview before a card reaches the stage).
create policy "checklist_templates_select_all_authenticated"
on public.checklist_templates for select to authenticated using (true);

create policy "checklist_templates_admin_write"
on public.checklist_templates for all to authenticated
using ((select public.is_admin())) with check ((select public.is_admin()));

create policy "checklist_template_items_select_all_authenticated"
on public.checklist_template_items for select to authenticated using (true);

create policy "checklist_template_items_admin_write"
on public.checklist_template_items for all to authenticated
using ((select public.is_admin())) with check ((select public.is_admin()));

-- card_checklist_items inherits scoping through cards.client_id — flat
-- subquery into cards (a DIFFERENT table, not self-referential), which is
-- exactly the pattern already proven safe by client_files -> clients.
create policy "card_checklist_items_select_scoped"
on public.card_checklist_items for select to authenticated
using (
  (select public.is_admin())
  or card_id in (
    select id from public.cards
    where client_id in (select public.pm_assigned_clients())
  )
);

create policy "card_checklist_items_write_scoped"
on public.card_checklist_items for all to authenticated
using (
  (select public.is_admin())
  or card_id in (
    select id from public.cards
    where client_id in (select public.pm_assigned_clients())
  )
)
with check (
  (select public.is_admin())
  or card_id in (
    select id from public.cards
    where client_id in (select public.pm_assigned_clients())
  )
);

grant select, insert, update, delete on public.checklist_templates to authenticated;
grant select, insert, update, delete on public.checklist_template_items to authenticated;
grant select, insert, update on public.card_checklist_items to authenticated;
```

**Note on the `card_checklist_items` RLS policy shape:** unlike `cards`, this table's policy subquery into `public.cards` is safe — it is a cross-table reference (card_checklist_items → cards), not self-referential (cards → cards), which is the specific case Postgres's RLS recursion detector rejects. This mirrors the exact shape already used by nothing-yet-in-this-codebase but is structurally identical to a `messages`-style child-of-`clients` scoping, just one hop further down (`card_checklist_items` → `cards` → `client_id`).

### Pattern 3: Admin override as its own narrow audit-event table (not a generic polymorphic log)

**What:** `card_checklist_overrides` records exactly the D-11 event: who forced the advance, when, and a frozen list of which item labels were still unchecked at that moment. This is intentionally a point-in-time snapshot (a `text[]` of labels), not a set of FKs into `card_checklist_items` — because those items might get checked later, and the audit record must preserve "what was true at override time," not "what's true now."

**Rationale for a narrow table over a generic `audit_events` table:** every existing table in this codebase (`messages`, `client_files`, `pm_clients`) is a single-purpose, typed-column table — there is no precedent anywhere in this schema for a generic/polymorphic event table, and introducing one here for a single event type (the override) would be premature generalization. If Phase 6 (Admin Oversight) later needs a broader activity feed across stage transitions, that is that phase's own schema decision to make with its own requirements in hand — don't speculatively build it now.

```sql
create table public.card_checklist_overrides (
  id uuid primary key default gen_random_uuid(),
  card_id uuid not null references public.cards(id) on delete cascade,
  overridden_by uuid not null references public.profiles(id),
  occurred_at timestamptz not null default now(),
  unchecked_item_labels text[] not null default '{}'
);

alter table public.card_checklist_overrides enable row level security;

create policy "card_checklist_overrides_select_scoped"
on public.card_checklist_overrides for select to authenticated
using (
  (select public.is_admin())
  or card_id in (
    select id from public.cards
    where client_id in (select public.pm_assigned_clients())
  )
);

-- Insert is admin-only: only an admin can perform (and thus log) an override,
-- per D-11 and the default "Admin only" stance from CONTEXT.md's discretion note.
create policy "card_checklist_overrides_admin_insert"
on public.card_checklist_overrides for insert to authenticated
with check ((select public.is_admin()));

grant select, insert on public.card_checklist_overrides to authenticated;
```

### Pattern 4: Kanban board without drag-and-drop — column-grouped RSC + disabled-button gate

**What:** The board Server Component fetches all cards for the active client in one RLS-scoped query, groups them in-memory by `stage` (5 fixed columns, in `card_stage` enum order), and passes the grouped data to a Client Component that renders static columns. No column reordering, no drop targets, no drag state.

**Example:**
```typescript
// Source: pattern extends app/pm/chat/page.tsx's existing
// "RSC loads scoped data, hands to a use-client panel" structure.

const STAGE_ORDER: CardStage[] = [
  "briefing", "producao", "revisao_interna", "aprovacao_cliente", "agendamento",
];

export default async function PmBoardPage({ searchParams }: { searchParams: Promise<{ client?: string }> }) {
  const { client: clientId } = await searchParams;
  const supabase = await createClient();

  const [{ data: clients }, { data: cards }] = await Promise.all([
    supabase.from("clients").select("id, name").order("name"),
    clientId
      ? supabase
          .from("cards")
          .select("id, title, card_type, stage, parent_card_id")
          .eq("client_id", clientId)
          .order("created_at", { ascending: true })
      : Promise.resolve({ data: [] }),
  ]);

  const cardIds = (cards ?? []).map((c) => c.id);
  const { data: checklistItems } = cardIds.length
    ? await supabase
        .from("card_checklist_items")
        .select("card_id, completed_at")
        .in("card_id", cardIds)
    : { data: [] };

  // Server-computed completion state — the ONLY source of truth for the
  // disabled attribute on "Avançar" (D-06). Never recomputed client-side.
  const completionByCard = new Map<string, { total: number; checked: number }>();
  for (const item of checklistItems ?? []) {
    const entry = completionByCard.get(item.card_id) ?? { total: 0, checked: 0 };
    entry.total += 1;
    if (item.completed_at) entry.checked += 1;
    completionByCard.set(item.card_id, entry);
  }

  const columns = STAGE_ORDER.map((stage) => ({
    stage,
    cards: (cards ?? []).filter((c) => c.stage === stage),
  }));

  return <BoardPanel clients={clients ?? []} columns={columns} completionByCard={...} />;
}
```

```typescript
// app/pm/board/actions.ts — advanceStage Server Action.
// Source: pattern extends app/admin/approvals/actions.ts's
// revalidatePath-after-write shape.

"use server";

const STAGE_ORDER: CardStage[] = [
  "briefing", "producao", "revisao_interna", "aprovacao_cliente", "agendamento",
];

export async function advanceStage(cardId: string): Promise<{ error?: string }> {
  const supabase = await createClient();

  const { data: card } = await supabase
    .from("cards")
    .select("id, client_id, stage, card_type")
    .eq("id", cardId)
    .single();

  if (!card || !card.stage) return { error: "Card não encontrado." };

  const currentIndex = STAGE_ORDER.indexOf(card.stage);
  const nextStage = STAGE_ORDER[currentIndex + 1];
  if (!nextStage) return { error: "Card já está na última etapa." };

  // The gate: re-check server-side, never trust a client claim that the
  // checklist is complete (T-2-01 pattern).
  if (card.stage === "revisao_interna") {
    const { data: items } = await supabase
      .from("card_checklist_items")
      .select("completed_at")
      .eq("card_id", cardId);

    const hasUnchecked = (items ?? []).some((i) => !i.completed_at);
    if (hasUnchecked) {
      return { error: "Existem itens do checklist não concluídos." };
      // Admin override path is a SEPARATE exported action
      // (forceAdvanceOverride), gated by is_admin() in its own RLS insert
      // policy on card_checklist_overrides — never silently bypassed here.
    }
  }

  // Snapshot: entering revisao_interna for the first time.
  if (nextStage === "revisao_interna") {
    const { data: client } = await supabase
      .from("clients")
      .select("checklist_template_id")
      .eq("id", card.client_id)
      .single();

    if (client?.checklist_template_id) {
      const { data: templateItems } = await supabase
        .from("checklist_template_items")
        .select("label, sort_order")
        .eq("template_id", client.checklist_template_id)
        .order("sort_order");

      if (templateItems?.length) {
        await supabase.from("card_checklist_items").insert(
          templateItems.map((t) => ({
            card_id: cardId,
            label: t.label,
            sort_order: t.sort_order,
          }))
        );
      }
    }
  }

  const { error } = await supabase
    .from("cards")
    .update({ stage: nextStage, updated_at: new Date().toISOString() })
    .eq("id", cardId);

  if (error) return { error: error.message };

  revalidatePath("/pm/board");
  return {};
}
```

### Anti-Patterns to Avoid
- **Trusting a client-side "all checked" flag to enable/disable "Avançar":** the disabled attribute must be computed from a server-side read of `card_checklist_items`, both for the button's initial render AND re-validated inside the Server Action itself before the stage UPDATE runs (D-06 + the codebase's established T-2-01 discipline).
- **Storing a package's rollup status as a column on the parent card:** this denormalized aggregate will drift out of sync the moment a child's stage changes without a matching parent update — compute it at render time via a grouped query instead (see Architectural Responsibility Map).
- **A generic `audit_log`/`events` polymorphic table:** no precedent in this codebase's schema style; adds indirection (a `table_name`/`event_type` discriminator column) for a need this phase can satisfy with two narrow, typed tables.
- **Introducing a drag-and-drop library:** explicitly rejected by D-05. If a future phase (post-MVP) wants DnD, that is a fresh decision for that phase, not something to build "while we're in here."
- **Live-binding a card's checklist to its template via a foreign key instead of copying rows:** this violates D-04 directly — editing the template would retroactively alter in-progress cards' checklists.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Draggable Kanban columns | Custom pointer-event drag logic or a DnD library | Explicit "Avançar" button (D-05) | Already decided against — a custom implementation would be pure wasted effort against a locked decision |
| Google Drive file preview/thumbnail | Scraping the Drive page or embedding an iframe | Icon + label + link, opens in new tab (D-08) | Deferred idea — real previews require OAuth/API integration explicitly out of scope (D-07) |
| Hierarchical query for parent+children | Recursive CTE / `WITH RECURSIVE` | Single-level `WHERE parent_card_id = ?` query | This phase's hierarchy is exactly two levels deep (package → pieces), never deeper — a recursive CTE solves a problem this schema doesn't have; adding one is unjustified complexity |
| Point-in-time audit snapshot | Reconstructing "what was unchecked" from current `card_checklist_items` state at read time | A frozen `text[]` column captured at the moment of the override (Pattern 3) | Current state can no longer answer "what was true when the override happened" once a PM checks items after the fact — must be captured, not derived |

**Key insight:** every "don't hand-roll" here is really a "don't reach for a generic/complex tool when this phase's actual shape is simple" — two-level hierarchy, one-time snapshot, single event type. Matching tool complexity to problem complexity is the load-bearing decision this phase's architecture rests on.

## Runtime State Inventory

> Not applicable — this is a greenfield feature phase (new tables, new routes), not a rename/refactor/migration phase. No existing runtime state (stored data, live service config, OS-registered state, secrets, build artifacts) references anything being renamed or restructured.

## Common Pitfalls

### Pitfall 1: Self-referencing RLS recursion on `cards`
**What goes wrong:** A policy on `cards` that tries to infer a sub-card's client via `parent_card_id in (select id from cards where client_id = ...)` throws `"infinite recursion detected in policy"` at query time — it passes migration `apply` silently and only fails the first time a query actually triggers the policy evaluation.
**Why it happens:** Postgres RLS forbids a policy from (directly or indirectly) querying the same table it's protecting.
**How to avoid:** Denormalize `client_id` onto every row of `cards` (see Pattern 1) — every policy becomes a flat, non-recursive check with zero subqueries into `cards` itself.
**Warning signs:** Any RLS policy definition on `cards` that contains `from public.cards` (or references `cards` via a view/function that itself queries `cards`) in its `USING`/`WITH CHECK` clause.

### Pitfall 2: Forgetting the GRANT in the same migration (repeated lesson, Phases 1/2/5)
**What goes wrong:** RLS policies are created, but hosted Supabase's default provisioning grant (which auto-applies on the hosted project) masks the gap — `supabase test db` / local `supabase start` does NOT auto-grant, so a missing `grant select, insert, update on public.cards to authenticated;` in the same migration file passes locally-untested and only surfaces as a silent 403/empty-result on a fresh local environment.
**Why it happens:** Hosted and local Supabase have different default-privilege behavior at table-creation time (documented repeatedly in this codebase's own STATE.md across quick tasks 260716-au8/b8w).
**How to avoid:** Every new-table migration in this phase ships its `GRANT` statement in the exact same migration file as its RLS policies (mirror `0010_messages.sql`/`0011_client_files.sql` line-for-line).
**Warning signs:** A migration file that creates a table + policies but has no `grant ... to authenticated;` line anywhere in it.

### Pitfall 3: Checklist snapshot and stage UPDATE as two separate, non-atomic writes
**What goes wrong:** If the `card_checklist_items` insert (snapshot) and the `cards.stage` UPDATE are executed as two independent Supabase client calls without a transaction, a mid-request failure (network blip, serverless timeout) can leave a card whose stage says `revisao_interna` but with zero checklist items — permanently un-gateable (nothing to check, so the "all checked" condition is vacuously true, silently defeating CHK-03/CHK-04's entire purpose).
**Why it happens:** The Supabase JS client does not provide a multi-statement transaction API for arbitrary sequences of `.from().insert()`/`.update()` calls the way a raw `BEGIN`/`COMMIT` would — each call is its own round-trip.
**How to avoid:** Either (a) wrap both writes in a single Postgres function (`security invoker` RPC) called via `supabase.rpc(...)`, so both succeed or fail together, or (b) perform the snapshot insert FIRST, verify it succeeded (non-empty response), and only THEN perform the stage UPDATE — accepting that a mid-request failure after the insert but before the update leaves an inert (but still checklist-complete, not-yet-advanced) row rather than an unguarded one. Option (b) requires no new Postgres function and fails safe (worse case: stuck in place, not falsely advanced) — recommended for this phase's small scale, matching PROJECT.md's "no job queues" constraint.
**Warning signs:** A card in `revisao_interna` with zero rows in `card_checklist_items` despite its client having a `checklist_template_id` assigned.

### Pitfall 4: `card_type = 'package'` rows leaking into board columns
**What goes wrong:** If the board's column-grouping query doesn't explicitly exclude (or specially handle) `card_type = 'package'` rows, a package parent (which has `stage = null` per the check constraint) either crashes the `.filter((c) => c.stage === stage)` grouping logic or silently vanishes from every column with no indication it exists.
**Why it happens:** The board's natural per-stage grouping assumes every card has a stage — package parents deliberately don't.
**How to avoid:** Render package parents as a separate visual element (e.g., a header row above their pieces, or a distinct summary card showing the rollup) rather than trying to fit them into one of the 5 stage columns — this is the "aggregate status rollup" the CONTEXT.md leaves to discretion; recommend a small summary badge component reusing `StatusBadge`, computed via `GROUP BY stage` over that parent's `piece` children.
**Warning signs:** A package's pieces render fine individually but the parent itself never appears anywhere on the board, or appears with a blank/undefined stage label.

### Pitfall 5: Trusting a pasted Drive URL without server-side re-validation
**What goes wrong:** If `isLikelyDriveLink()` only runs in the browser (Client Component `onChange`/`onBlur`), a modified request (bypassing the UI entirely) can insert an arbitrary URL into `card_attachments`, which is later rendered as a clickable "open in new tab" link — a potential open-redirect-adjacent / arbitrary-link-injection vector, echoing the open-redirect bug this codebase's own orchestrator caught and fixed in quick task 260722-eb7.
**Why it happens:** Client-side validation is a UX nicety, not a security boundary — Server Actions are directly callable.
**How to avoid:** Run the exact same regex check (extract into a single shared `lib/attachments/drive-url.ts` module imported by both the Client Component and the Server Action) server-side before the INSERT, rejecting anything that doesn't match.
**Warning signs:** A `card_attachments` row containing a URL that doesn't start with `https://drive.google.com/` or `https://docs.google.com/`.

## Code Examples

### Google Drive link validation (D-09)

```typescript
// lib/attachments/drive-url.ts
// Source: cross-referenced against multiple community references on Google
// Drive/Docs URL shapes (no single official Google spec for "all valid
// share link formats" was found — see Assumptions Log A1). D-09 explicitly
// scopes this as "a paste-mistake catcher," not a security boundary, so a
// permissive domain-prefix match is intentional, not a shortcut.

const DRIVE_LINK_PATTERN =
  /^https:\/\/(?:drive|docs)\.google\.com\//i;

export function isLikelyDriveLink(url: string): boolean {
  try {
    // Reject anything that isn't a well-formed absolute URL first —
    // avoids the regex matching a string that merely CONTAINS the
    // substring "drive.google.com" without being a real link (e.g.
    // "not-drive.google.com.evil.com" would still need the origin check
    // below, which the regex above already anchors with ^https://).
    new URL(url);
  } catch {
    return false;
  }
  return DRIVE_LINK_PATTERN.test(url);
}

// Icon-by-type inference for KAN-05/D-08's "icon by type" requirement —
// inferred from the URL path shape, not fetched from Drive (no API call).
export function driveLinkType(url: string): "image" | "video" | "pdf" | "other" {
  if (/\/(document|spreadsheets|presentation|forms)\//.test(url)) return "other";
  if (/\.(png|jpe?g|gif|webp)(\?|$)/i.test(url)) return "image";
  if (/\.(mp4|mov|avi|webm)(\?|$)/i.test(url)) return "video";
  if (/\.pdf(\?|$)/i.test(url)) return "pdf";
  return "other"; // Drive share links rarely carry a file extension in the
                   // URL itself (the FILE_ID is opaque) — most real-world
                   // links will fall here; the type is often better
                   // supplied by the PM as a manual field than inferred.
}
```

**Recommendation:** Given Drive share links (`drive.google.com/file/d/<FILE_ID>/view`) rarely expose the underlying file's MIME type in the URL itself (the ID is opaque), consider making "type" (image/vídeo/PDF) a PM-selected field at attach-time rather than purely inferred from the URL — this is a planner/UX discretion point worth flagging, not fully resolved by regex alone.

### Zod schema for card creation (KAN-01)

```typescript
// lib/validation/cards.ts
import { z } from "zod";

export const createCardSchema = z.object({
  clientId: z.string().uuid({ message: "Cliente inválido." }),
  title: z.string().trim().min(1, { message: "Título obrigatório." }).max(200),
  cardType: z.enum(["single", "package"]),
});

export const createPieceSchema = z.object({
  parentCardId: z.string().uuid(),
  title: z.string().trim().min(1, { message: "Título obrigatório." }).max(200),
});

export const attachDriveLinkSchema = z.object({
  cardId: z.string().uuid(),
  url: z.string().url({ message: "URL inválida." }),
  label: z.string().trim().max(200).optional(),
});
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|---------------|--------|
| n/a | n/a | — | This is a greenfield schema area for the codebase; there is no prior implementation being replaced. |

**Deprecated/outdated:** None applicable.

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | Google Drive share-link URL shapes (`drive.google.com/file/d/...`, `docs.google.com/document/d/...`, `/open?id=...`, `/uc?id=...`) as documented by community sources (Zapier Community, Automation Ace, labnol.org) — no single official Google reference enumerating all valid formats was found | Code Examples: Drive URL regex | If Google's actual current share-link formats differ (e.g., a newer format not covered), the paste-mistake catcher could reject a valid link or accept an invalid-looking one. Low severity per D-09 ("not a hard security boundary") — worst case is a UX annoyance, not a data-integrity or security failure. |
| A2 | A 1:1 `clients.checklist_template_id` FK is sufficient for CHK-02 ("checklist items can be configured differently per client") — assumes one template per client is the intended cardinality, not multiple simultaneous templates per client | Pattern 2 (schema) | If a client actually needs multiple concurrently-active checklists (e.g., one per content type), this FK shape under-serves that; would require a join table instead. D-03's wording ("assigns one template to each client") supports the 1:1 read, but this is an inference, not an explicit locked decision about cardinality. |
| A3 | Package parent cards (`card_type = 'package'`) never need their own Drive attachments or checklist — only their `piece` children do | Pattern 1 / Pitfall 4 | If the planner or a future discuss-phase decides a package itself needs top-level attachments (e.g., a shared brief document for the whole campaign), the schema would need `card_attachments.card_id` to also accept package-type card ids, which the current design permits structurally (no constraint blocks it) but the UI/UX wasn't designed around that case in this research. |

**If this table is empty:** N/A — see entries above.

## Open Questions (RESOLVED)

1. **Should the "Avançar" gate re-validation and checklist snapshot be one atomic RPC or two sequential client calls?**
   - What we know: Supabase JS client calls are independent round-trips; this codebase has zero precedent for a Postgres function/RPC anywhere (no triggers, no stored procedures exist in any migration reviewed).
   - What's unclear: Whether the added complexity of introducing the codebase's first Postgres function (for atomicity) is worth it at this phase's scale, versus accepting the fail-safe-but-imperfect sequential-writes approach (Pitfall 3, option b).
   - Recommendation: Start with sequential writes (option b) for MVP — it fails safe (stuck-in-place, not falsely-advanced) and needs no new schema patterns. Revisit only if the "stuck in revisão interna with a phantom empty checklist" edge case is observed in practice.
   - **RESOLVED (2026-07-31, /gsd:plan-phase 3):** Sequential writes (option b) implemented as recommended — see 03-03-PLAN.md.

2. **Is a single Kanban board screen with 5 fixed columns going to fit comfortably given `card_type = 'package'` parents need their own visual treatment (Pitfall 4)?**
   - What we know: D-10 confirms the dedicated-screen-with-client-switcher pattern from Phase 2. The 5 stages are fixed per KAN-02.
   - What's unclear: Exact visual treatment for package parents (a separate "campaigns" section above/beside the column board vs. inline per-column grouping of just that package's pieces) — left to planner/UX discretion per CONTEXT.md.
   - Recommendation: For the MVP slice, defer package visual treatment entirely — ship single-card flow first (see Validation Architecture "Sampling Rate" and the vertical-slice guidance below), then design the package rollup UI once the single-card mechanic is proven end-to-end.
   - **RESOLVED (2026-07-31, /gsd:plan-phase 3):** This research recommendation was superseded by D-01/D-02's locked behavior (independent per-piece advancement) — the planner delivered package/piece support this phase (03-06-PLAN.md) rather than deferring it, since the locked CONTEXT.md decision takes precedence over a non-binding research suggestion.

## Environment Availability

> Skipped — no new external tool/service/runtime dependency is introduced by this phase (no Google Drive API, no new database engine, no new CLI). All work happens against the already-provisioned Supabase project and existing Next.js/Vercel toolchain used by every prior phase.

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | pgTAP (`supabase test db`) for RLS/schema, no JS test runner detected in this codebase yet |
| Config file | `supabase/tests/` (existing pgTAP test files from Phases 1/5) |
| Quick run command | `npx supabase test db` |
| Full suite command | `npx supabase test db` (same — no separate "full" suite exists) |

### Phase Requirements → Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| KAN-01 | PM can create single/package card scoped to assigned client | pgTAP (RLS insert) | `npx supabase test db` | ❌ Wave 0 — new `cards` RLS test file needed |
| KAN-02 | Card stage transitions follow the 5-stage order | pgTAP (check constraint / manual) | `npx supabase test db` + manual click-through | ❌ Wave 0 — add stage-transition assertions |
| KAN-03 | PM sees only assigned-client cards on the board | pgTAP (RLS select, mirrors `clients_select_scoped` test pattern) | `npx supabase test db` | ❌ Wave 0 |
| KAN-05 | Drive link validated before insert | Unit test (regex) — no JS test runner present, so manual verification via Server Action error-path click-through is the fallback | manual | ❌ — flag: no JS unit test infra exists in this codebase yet (Wave 0 gap, but may be out of this phase's scope to introduce a whole new test runner) |
| CHK-01/02 | Admin-only template CRUD, per-client assignment scoped by RLS | pgTAP (RLS insert/update, admin vs. PM) | `npx supabase test db` | ❌ Wave 0 |
| CHK-03 | Checklist gate blocks stage advance until all items checked | pgTAP (constraint-level) is insufficient — this is Server Action business logic, not a DB constraint; requires either a Postgres function unit test or manual click-through | manual (documented in VERIFICATION.md checklist) | ❌ — recommend explicit manual verification step, no automated coverage without introducing a new test harness |
| CHK-04 | Admin can see completed_at/completed_by and override events per card | pgTAP (RLS select on `card_checklist_items`/`card_checklist_overrides`) | `npx supabase test db` | ❌ Wave 0 |

### Sampling Rate
- **Per task commit:** `npx supabase test db` (whenever a migration changes)
- **Per wave merge:** `npx supabase test db` + manual click-through of the full briefing→revisão interna→gate-block→checklist-check→advance flow
- **Phase gate:** Full pgTAP suite green + manual verification of the checklist-gate and admin-override paths (these are Server Action business logic, not expressible as pgTAP assertions) before `/gsd:verify-work`

### Wave 0 Gaps
- [ ] `supabase/tests/0XXX_cards_rls_test.sql` — covers KAN-01/KAN-03 (RLS select/insert scoping, self-referencing recursion regression test)
- [ ] `supabase/tests/0XXX_checklist_rls_test.sql` — covers CHK-01/CHK-02 (admin-only template writes, PM read-only)
- [ ] `supabase/tests/0XXX_card_checklist_items_rls_test.sql` — covers CHK-03/CHK-04 (scoped read/write through `cards.client_id`)
- [ ] No JS/TS unit test runner exists in this codebase for Server Action business logic (the checklist-gate and override logic) — this phase either introduces one (out of scope per CONTEXT.md's silence on this) or accepts manual click-through as the verification method for CHK-03/D-06/D-11's gate-and-override behavior. Recommend the latter for MVP scope; flag explicitly in VERIFICATION.md.

## Security Domain

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-------------------|
| V2 Authentication | No (unchanged this phase) | Handled by Phase 5 |
| V3 Session Management | No (unchanged this phase) | Handled by Phase 5 |
| V4 Access Control | Yes | Supabase RLS via `is_admin()`/`pm_assigned_clients()` on every new table (cards, card_checklist_items, card_checklist_overrides, card_attachments, checklist_templates, checklist_template_items) |
| V5 Input Validation | Yes | Zod schemas (`lib/validation/cards.ts`, `lib/validation/checklist.ts`) at every Server Action boundary; Drive-link regex re-validated server-side (never trust client) |
| V6 Cryptography | No | No new secrets/crypto surface introduced this phase |

### Known Threat Patterns for this stack

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|----------------------|
| RLS bypass via missing/incorrect policy on a new table (e.g., forgetting `card_checklist_overrides` insert policy) | Elevation of Privilege | Every new table gets explicit RLS policies + GRANT in the same migration, reusing `is_admin()`/`pm_assigned_clients()` — never a table left with RLS enabled but zero policies (which defaults to deny-all, a safer failure mode, but still worth an explicit test) |
| Client-side-only Drive-link validation bypassed via direct Server Action call | Tampering | Server-side re-validation with the same shared regex module (Pitfall 5) |
| Admin override silently bypassing the audit trail (a code path that force-advances without writing to `card_checklist_overrides`) | Repudiation | `forceAdvanceOverride` must be the ONLY code path capable of advancing a card out of `revisao_interna` with unchecked items, and must write the override row in the same action, before/atomically with the stage UPDATE — this directly IS the CHK-04 "no step silently skipped" guarantee, so treat any future refactor that adds a second bypass path as a regression |
| Cross-client data leakage via the self-referencing `cards` hierarchy (a PM assigned to Client A somehow reading Client B's sub-card through a shared `parent_card_id` join) | Information Disclosure | The denormalized `client_id` on every row (Pattern 1) is exactly what prevents this — a `piece` row's own `client_id` is independently checked by RLS regardless of what its parent's `client_id` is; enforce via the `cards_piece_requires_parent` constraint plus an application-level rule that a piece's `client_id` must equal its parent's `client_id` (worth a `check` constraint via a function, or at minimum an explicit Server Action assertion — flag for planner) |

## Sources

### Primary (HIGH confidence)
- This codebase's own migrations: `supabase/migrations/0004_rls_policies.sql`, `0006_clients_full_record.sql`, `0010_messages.sql`, `0011_client_files.sql` — verified by direct read, establishes the RLS+GRANT-same-migration pattern and the "denormalize the scoping column, never join back through a self-referencing/RLS-enabled table" precedent already in production use.
- This codebase's own components/routes: `components/ui/data-card.tsx`, `components/ui/status-badge.tsx`, `components/layout/page-shell.tsx`, `components/layout/app-sidebar.tsx`, `app/pm/chat/page.tsx`, `app/pm/chat/actions.ts`, `app/admin/approvals/actions.ts` — verified by direct read.
- `.planning/phases/03-content-production-kanban/03-CONTEXT.md`, `.planning/REQUIREMENTS.md`, `.planning/STATE.md` — verified by direct read.

### Secondary (MEDIUM confidence)
- [Supabase GitHub Discussion #3328 — "infinite recursion detected in policy"](https://github.com/orgs/supabase/discussions/3328) — cross-verified: this is a widely-documented, well-known Postgres RLS limitation (not a single-source claim), and the mitigation (avoid self-referencing subqueries, denormalize the scoping column) matches this codebase's own pre-existing pattern for `messages`/`client_files`.
- [PostgreSQL Row Level Security — Daniel Imfeld](https://imfeld.dev/notes/postgresql_row_level_security) — corroborates the recursion limitation and view/SECURITY DEFINER workarounds.

### Tertiary (LOW confidence — flagged in Assumptions Log A1)
- [GDrive File Link Formats (GSheets, GDocs, GSlides) — Zapier Community](https://community.zapier.com/show-tell-5/gdrive-file-link-formats-gsheets-gdocs-gslides-25077)
- [Google Drive File Link Formats: Docs, Sheets, and Slides URL Patterns — Automation Ace](https://automationace.com/blog/google-drive-file-link-formats-docs-sheets-slides)
- [Simple URL Tricks for Google Drive You Should Know — labnol.org](https://www.labnol.org/internet/direct-links-for-google-drive/28356)

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — no new libraries, every tool already verified present in `package.json`
- Architecture (schema/RLS): HIGH — self-referencing RLS recursion pitfall corroborated by multiple independent sources and directly matches this codebase's own existing denormalization precedent; snapshot/audit-table design follows this codebase's zero-JSONB, narrow-table convention exactly
- Kanban UI pattern: HIGH — directly extends `app/pm/chat/page.tsx`'s proven RSC-loads-then-hands-to-panel structure and `app/admin/approvals/actions.ts`'s Server Action shape, both already in production in this codebase
- Google Drive URL shape: MEDIUM — no single official Google specification found enumerating all valid share-link formats; cross-referenced against 3 independent community sources that agree on the core patterns, but D-09 itself confirms this doesn't need to be airtight ("not a hard security boundary, just a paste-mistake catcher")
- Pitfalls: HIGH — Pitfalls 1/2/3 are directly derived from this codebase's own documented history (STATE.md's repeated GRANT-gap lesson across 3 prior phases) plus a well-corroborated Postgres RLS limitation

**Research date:** 2026-07-29
**Valid until:** 30 days (stable domain — Postgres/RLS semantics and this codebase's own conventions do not shift quickly; the one MEDIUM-confidence item, Drive URL shapes, is inherently low-churn since Google has kept these formats stable for years)
