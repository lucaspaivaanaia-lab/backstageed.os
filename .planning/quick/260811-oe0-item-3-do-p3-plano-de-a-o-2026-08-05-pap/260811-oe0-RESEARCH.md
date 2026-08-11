# Quick Task 260811-oe0: Papel de acesso "Editor" — Research

**Researched:** 2026-08-11
**Domain:** Postgres/Supabase RLS role model extension, enum migration mechanics, Next.js Server Actions authorization
**Confidence:** HIGH (enum migration mechanics, RLS surface inventory, provisioning pattern) / MEDIUM (column-level UPDATE restriction pattern — several valid approaches exist, see Pitfall 1)

## Summary

This task adds a fourth value (`'editor'`) to `public.user_role` (today `admin`/`pm`/`client`) and a `due_date` column to `public.cards`, then threads the new role through every RLS policy and helper function that currently branches on role. The two hardest technical risks are: (1) Postgres forbids using a newly added enum value in the same transaction that adds it, and Supabase's migration runner applies each `.sql` file as one transaction — so the `ALTER TYPE ... ADD VALUE` statement MUST live in its own migration file, strictly before any migration that references `'editor'` in SQL. (2) Postgres RLS has no native column-level policy — "Editor can edit description/checklist but never stage/assignee/channel/due_date" cannot be expressed as a single row-level UPDATE policy on `cards`. The codebase's own established pattern (five separate narrow Server Actions, `advanceStage`/`moveCard`/`updateCardDetails`/`addAttachment`/`toggleChecklistItem`, each re-reading through RLS and writing only its own fixed column set) is the precedent to extend, not a new trigger-based mechanism — a dedicated, Editor-only Server Action that hardcodes the update payload to `{description}` only (checklist item toggling already goes through a separate, narrower action) is both simpler and more consistent with this codebase than a BEFORE UPDATE trigger.

The codebase has a full exhaustive RLS surface today: 3 tables use two shared `SECURITY DEFINER` helpers (`is_admin()`, `pm_assigned_clients()`) and one PM-only helper (`is_pm()`), all in `plpgsql`/`security definer`/`set search_path = ''`. Every `cards`-family table (`cards`, `card_checklist_items`, `card_attachments`, `card_checklist_overrides`) is scoped by `client_id in pm_assigned_clients() OR is_admin()`. None of these policies naturally include an Editor — by design, an Editor must be added as an explicit third OR-branch, scoped by `media_assignee_id = auth.uid()`, never by `client_id`/`pm_assigned_clients()`, or the Editor would see every card of every client they happen to have one assignment on (a real vazamento risk, exactly the class of bug this project treats as non-negotiable per CLAUDE.md).

**Primary recommendation:** Add the enum value in its own migration (e.g. `0030_user_role_add_editor.sql`, containing only `alter type public.user_role add value 'editor';`), then a second migration for everything else (helper `is_editor()`, new/updated RLS policies, `due_date` column, `handle_new_user()` update). Give the Editor a brand-new, narrow Server Action (`updateCardDescriptionAsEditor` or similar) rather than trying to reuse `updateCardDetails` with role branching — this keeps the "can never touch stage/assignee/channel/due_date" guarantee visible in the type signature itself, not buried in a conditional.

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Editor role enum value | Database (Postgres enum) | — | `user_role` is a Postgres type; app code only ever reads/writes it as a string literal |
| Editor visibility scoping (which cards) | Database (RLS policy) | API/Server Action (defense in depth via explicit re-read) | RLS is this project's established multi-tenancy boundary (CLAUDE.md); every existing read path already relies on it exclusively |
| Editor write restriction (description/checklist only) | API/Backend (Server Action) | Database (RLS row-level, not column-level) | RLS cannot express column-level restrictions natively; the Server Action is the only tier that can bound the update payload to exactly `{description}` |
| `due_date` field + queue ordering | Database (column + index) | Frontend Server (query in the Editor's page loader) | New column with a plain `order by due_date` query, no RLS change needed (row-level policies already cover all columns) |
| Editor provisioning (create login) | API/Backend (Server Action, mirrors `createClientLogin`) | Database (`handle_new_user()` trigger) | Same split as today's Client provisioning: app-layer authorization + `auth.admin.createUser()`, DB trigger maps metadata to a `profiles` row |
| Post-login routing to Editor's queue | Frontend Server (`middleware.ts`) | — | `middleware.ts` already owns the `role -> root path` map; this is a pure data addition, no new mechanism |

## Standard Stack

No new external libraries. This task is 100% internal (Postgres DDL/RLS + existing Next.js/Supabase Server Action patterns already used throughout this codebase). Package Legitimacy Audit is therefore not applicable — skipped per the protocol's own scope ("whenever this phase installs external packages").

## 1. Enum migration — the correct pattern (HIGH confidence)

**The restriction is real and applies here.** Per official Postgres documentation:

> "If `ALTER TYPE ... ADD VALUE` (the form that adds a new value to an enum type) is executed inside a transaction block, the new value cannot be used until after the transaction has been committed." [CITED: postgresql.org/docs/current/sql-altertype.html]

Concretely: `alter type public.user_role add value 'editor';` followed **in the same transaction** by any statement that references the literal `'editor'` (a `create policy ... using (role = 'editor')`, a `case when role = 'editor' then ...` in a function body, an `insert ... values (..., 'editor', ...)`) raises Postgres error `55P04 unsafe_new_enum_value_usage` — *"unsafe use of new value 'editor' of enum type user_role"*, hint: *"New enum values must be committed before they can be used."*

**Does this project's migration runner wrap each file in one transaction?** This project applies migrations via Supabase CLI (`supabase migration up` locally, `supabase db push` against hosted — confirmed by this session's own STATE.md history, e.g. "Migração aplicada local e no hosted pelo orchestrator"). Community-confirmed behavior (multiple Supabase CLI GitHub issues, e.g. supabase/supabase#20118, supabase/cli#3554) is that **each migration file is applied as a single transaction** — this is exactly why "add enum value" migrations generated by Supabase's own `db diff` tooling have broken CI when a later statement in the same file used the new value. [CITED: github.com/supabase/supabase/issues/20118, github.com/orgs/supabase/discussions/20352] This is a MEDIUM-confidence claim (community/GitHub-issue sourced, not an official Supabase docs page — the official enums guide at supabase.com/docs/guides/database/postgres/enums shows only the bare `alter type ... add value` syntax with no transaction-scoping guidance, confirmed by direct fetch).

**Recommended pattern for this task (mirrors the fix multiple frameworks converged on):**

1. **Migration A** — enum value only, nothing else:
   ```sql
   -- 0030_user_role_add_editor.sql
   -- This migration does ONLY this. No policy, no function body, no CASE
   -- branch anywhere in this file may reference the literal 'editor' —
   -- Postgres forbids using a newly added enum value inside the same
   -- transaction that added it (55P04 unsafe_new_enum_value_usage), and
   -- Supabase's migration runner applies each file as one transaction.
   alter type public.user_role add value 'editor';
   ```
2. **Migration B** (next number, e.g. `0031_editor_role_rls.sql`) — everything that USES `'editor'`: the new `is_editor()` helper, every RLS policy touched, `handle_new_user()` CASE branch, etc. Since this runs as a separate transaction that starts strictly after Migration A committed, the value is fully usable.

This is not optional or "probably fine in this codebase's runner" — treat it as a hard constraint. Do not attempt to combine the two into one file "since Supabase's runner might not literally use `BEGIN`/`COMMIT`" — the GitHub issues above are Supabase-specific reports of exactly this failure, not generic Postgres advice.

**Naming/order rule:** the numbering must follow this project's own established discipline of "confirmed next free number" (see 0022's header comment: "the next genuinely free numbers, confirmed by listing supabase/migrations/ ... immediately before writing this file") — check the actual current max at plan/build time, not the numbers used in this document (29 is the highest existing file as of this research).

## 2. Exhaustive RLS/role-branch inventory (HIGH confidence — every file in `supabase/migrations/` was read or grepped)

Two helper functions and one PM-only helper are the entire cross-table authorization surface. Every policy in this project routes through one of these three (never an inline subquery into a different RLS table, per this codebase's own hard rule against recursion):

| Function | File | Logic | Editor treatment needed? |
|----------|------|-------|---------------------------|
| `is_admin()` | `0004_rls_policies.sql` | `role = 'admin' and status = 'approved'` | No change — Editor is never admin |
| `pm_assigned_clients()` | `0004_rls_policies.sql`, hardened by `0021_pm_assigned_clients_status_check.sql` | returns `client_id`s from `pm_clients` where caller is `role='pm' and status='approved'` | No change — must NOT be loosened to include Editor (this is the client-wide scope function; Editor must never get client-wide access via this path) |
| `is_pm()` | `0007_clients_rls_fix.sql` | `role = 'pm' and status = 'approved'` | No change |
| **NEW: `is_editor()`** (to be added in Migration B) | — | `role = 'editor' and status = 'approved'`, mirrors `is_admin()`'s exact shape/plpgsql/security definer/search_path convention | New function |

**Every policy/table in the codebase that branches on role, file by file:**

| # | File | Table | Policy | Branch | Editor disposition |
|---|------|-------|--------|--------|---------------------|
| 1 | `0004_rls_policies.sql` | `profiles` | `profiles_select_own_or_admin` | `id = auth.uid() OR is_admin()` | **No change.** An Editor reading their own profile row already works via `id = auth.uid()`, same as every role. |
| 2 | `0004_rls_policies.sql` | `profiles` | `profiles_update_own_or_admin` | `id = auth.uid() OR is_admin()` | No change — same as above; column-level immutability (role/status) is enforced by the `prevent_profile_privilege_escalation` trigger (see #5), not this policy. |
| 3 | `0004_rls_policies.sql` | `profiles` | `profiles_admin_insert` | `is_admin()` | **No change**, but see Section 5 below — Editor provisioning uses `auth.admin.createUser()` (service role, bypasses RLS entirely, same as Client provisioning today), so this policy is irrelevant to the provisioning flow. |
| 4 | `0004_rls_policies.sql` | `profiles` | `profiles_admin_delete` | `is_admin()` | No change. |
| 5 | `0001_profiles.sql` | `profiles` (trigger, not RLS) | `prevent_profile_privilege_escalation_trg` | `if role/status changed and not is_admin() then raise` | **No change needed**, but re-verify: an Editor updating their own row (e.g. future self-service, not in this task's scope) still cannot self-promote — the trigger already blocks any role/status change by a non-admin, Editor included, for free. |
| 6 | `0004_rls_policies.sql` | `pm_clients` | `pm_clients_select_own_or_admin` | `is_admin() OR pm_id = auth.uid()` | **RESTRICTIVE by default — no change.** An Editor has no `pm_clients` row (they are not a PM) and must not be granted one; this table stays entirely invisible to Editor. |
| 7 | `0004_rls_policies.sql` | `pm_clients` | `pm_clients_insert_admin_only` / `pm_clients_delete_admin_only` | `is_admin()` | No change — Editor never touches PM-client assignment. |
| 8 | `0004_rls_policies.sql` | `clients` | `clients_select_scoped` | `is_admin() OR id in pm_assigned_clients() OR id = own client_id (Client role)` | **Decision needed, RESTRICTIVE recommended.** An Editor does not appear in this OR-chain at all today. Per CONTEXT.md's locked scope ("Editor só vê cards onde é `media_assignee_id`... não é uma visão do cliente inteiro"), the Editor should almost certainly NOT get a `clients` row-select at all — the Editor's queue never needs to render a client-switcher or a `clients.name` join the way the PM board does (client name can instead be denormalized into the queue query via a join the Editor's own `cards` visibility already permits, see Section 3). **Recommendation: do not add Editor to `clients_select_scoped`** unless the queue UI genuinely needs to show which client a card belongs to — if it does, the least-privilege fix is a NEW read path scoped through `cards.client_id` (i.e., "clients visible via cards I can see"), not a blanket grant. Flag this as an explicit planner decision, not a foregone conclusion. |
| 9 | `0007_clients_rls_fix.sql` | `clients` | `clients_insert_admin_or_pm` | `is_admin() OR is_pm()` | No change — Editor never creates clients (out of scope per CONTEXT.md: "não pode criar cards", by extension never creates clients). |
| 10 | `0007_clients_rls_fix.sql` | `clients` | `clients_update_scoped` | `is_admin() OR id in pm_assigned_clients()` | No change — Editor never edits client records. |
| 11 | `0010_messages.sql` | `messages` | `messages_select_scoped` / `messages_insert_scoped` | `is_admin() OR client_id in pm_assigned_clients()` | **No change — RESTRICTIVE.** Out of scope entirely; nothing in CONTEXT.md gives Editor access to chat/messages. |
| 12 | `0011_client_files.sql` + `0020_client_files_update_grant.sql` | `client_files` | select/insert/delete/update, all `is_admin() OR client_id in pm_assigned_clients()` | **No change — RESTRICTIVE.** Editor never needs the RAG source files; out of scope. |
| 13 | `0013_checklist_templates.sql` | `checklist_templates` / `checklist_template_items` | `..._select_all_authenticated` (`using (true)`) + `..._admin_write` (`is_admin()`) | **Read is already unrestricted for ANY authenticated role — Editor inherits SELECT for free, no change needed.** Write stays admin-only (plus the PM `owner_client_id`-scoped path from #16 below, which should NOT be extended to Editor — see below). |
| 14 | `0015_cards.sql` | `cards` | `cards_select_scoped` | `is_admin() OR client_id in pm_assigned_clients()` | **MUST add a new OR-branch: `OR media_assignee_id = auth.uid()`.** This is the core of the entire task — see Section 3 for the exact policy text and why it must be `media_assignee_id`, never `client_id`. |
| 15 | `0015_cards.sql` | `cards` | `cards_insert_scoped` | `is_admin() OR client_id in pm_assigned_clients()` | **No change — RESTRICTIVE.** Editor must never create cards (locked decision). Do not add an Editor branch here. |
| 16 | `0015_cards.sql` / `0017_cards_description_assignee.sql` | `cards` | `cards_update_scoped` | `is_admin() OR client_id in pm_assigned_clients()` | **Needs a new, narrower Editor branch — but NOT via this policy alone (see Pitfall 1, column-scoping problem).** RLS row-level `using`/`with check` can gate WHICH rows an Editor may update (their assigned cards) but cannot, by itself, gate WHICH COLUMNS. Two valid designs, see Section 3. |
| 17 | `0017_cards_description_assignee.sql` / `0029_cards_media_assignee.sql` | `cards` (trigger) | `enforce_card_assignee_membership()` (`cards_assignee_membership_trg`) | Validates `assignee_id`/`media_assignee_id` against `pm_clients` roster on INSERT/UPDATE | **No change needed** — this trigger only fires when `assignee_id`/`media_assignee_id` themselves are being set; an Editor-only Server Action that never touches those columns never triggers this path. If a future Editor-reassignment feature is ever added (explicitly OUT of scope per CONTEXT.md), this trigger would need revisiting then. |
| 18 | `0016_card_checklist_items.sql` | `card_checklist_items` | `card_checklist_items_select_scoped` | `is_admin() OR card_id in (select id from cards where client_id in pm_assigned_clients())` | **MUST add a new OR-branch scoped through the SAME `media_assignee_id` predicate** — see Section 3. |
| 19 | `0016_card_checklist_items.sql` | `card_checklist_items` | `card_checklist_items_write_scoped` (`for all`) | same predicate as #18 | **MUST add a new, SEPARATE Editor write policy** — do NOT widen this existing `for all` policy, because "all" includes DELETE and the checklist items themselves (`label`, `sort_order`) which an Editor must never touch (CONTEXT.md: Editor may only "marcar/desmarcar" — i.e. toggle `completed_at`/`completed_by`, never insert/delete/relabel items). See Pitfall 1 discussion — RLS alone cannot restrict this to two columns either; the existing `toggleChecklistItem` Server Action already only ever writes `completed_at`/`completed_by` regardless of caller, so a correctly-scoped RLS policy (Editor may `UPDATE` rows whose card is theirs) + reusing the EXISTING `toggleChecklistItem` action (unchanged) is sufficient — no new column-restriction mechanism is needed here specifically because the existing action already never exposes `label`/`sort_order` to any caller. Do not add Editor to any INSERT/DELETE policy on this table. |
| 20 | `0018_card_attachments.sql` | `card_attachments` | select/insert/delete, all scoped via `card_id in (select id from cards where client_id in pm_assigned_clients())` | **No change — RESTRICTIVE, out of scope.** CONTEXT.md's Editor permissions list is "descrição e itens de checklist" only; attachments are not mentioned. Recommend Editor gets NO attachment access (neither read nor write) unless the planner/discuss step explicitly decides otherwise — flag this as an open question (Editor cannot even SEE Drive links on their own assigned cards under a strict reading, which may be an unintended UX gap; see Open Questions). |
| 21 | `0022_card_checklist_overrides.sql` | `card_checklist_overrides` | select scoped via `pm_assigned_clients()`; insert admin-only | **No change — RESTRICTIVE, out of scope.** Editor cannot force-advance and this is Admin/PM audit visibility only. |
| 22 | `0023_checklist_templates_owner_scoping.sql` | `checklist_templates` / `checklist_template_items` | `..._owner_write`, `is_admin() OR owner_client_id in pm_assigned_clients()` | **No change — Editor must NOT get this write path.** CONTEXT.md scope never gives Editor checklist-template authoring rights (only per-card item completion toggling, which is a different table: `card_checklist_items`, not `checklist_template_items`). |
| 23 | `0026_shared_knowledge_files.sql` | `shared_knowledge_files` | `..._select_all_authenticated` (`using (true)`) + `..._admin_write` | **Read is already unrestricted for ANY authenticated role — Editor inherits SELECT for free, no change.** This only matters if a future Editor-facing AI feature reads it; not used by this task's scope (Editor has no AI/chat feature per CONTEXT.md). |

**Summary of the RESTRICTIVE-by-default rule applied:** of the 23 rows above, only rows #14 (`cards_select_scoped`), #16 (`cards_update_scoped`, narrow path only), #18/#19 (`card_checklist_items` select + a new narrow write policy) need an actual Editor-inclusive change. Everything else (`profiles` outside own-row, `pm_clients`, `clients`, `messages`, `client_files`, `card_attachments`, `card_checklist_overrides`, `checklist_template_items` owner-write) stays exactly as restrictive as it is today — Editor gets zero access by omission, which is the correct default per this codebase's own "structural, not filter" isolation principle (CLAUDE.md).

## 3. New SELECT/UPDATE policy design for the Editor scope (MEDIUM-HIGH confidence — pattern is sound Postgres RLS design, but represents a genuine shape change flagged explicitly for planner review)

### SELECT on `cards` — add media_assignee scoping

```sql
-- Migration B (after the enum value has committed in Migration A).
drop policy "cards_select_scoped" on public.cards;
create policy "cards_select_scoped"
on public.cards
for select
to authenticated
using (
  (select public.is_admin())
  or client_id in (select public.pm_assigned_clients())
  or media_assignee_id = (select auth.uid())
);
```

This is a flat, non-recursive check (no subquery into `public.cards`), matching this table's own established Pitfall-1 discipline. `media_assignee_id = auth.uid()` is the CORRECT scoping column per CONTEXT.md's explicit decision ("Não inclui cards onde ele é `assignee_id`/'Responsável'"). **Do not scope by `client_id` at all for the Editor branch** — that would leak every card of every client the Editor happens to have ONE assignment on, which is exactly the "vê TODOS os cards de um cliente" leak the task's own focus flags as the real risk.

`card_checklist_items_select_scoped` needs the mirrored addition:

```sql
drop policy "card_checklist_items_select_scoped" on public.card_checklist_items;
create policy "card_checklist_items_select_scoped"
on public.card_checklist_items for select to authenticated
using (
  (select public.is_admin())
  or card_id in (select id from public.cards where client_id in (select public.pm_assigned_clients()))
  or card_id in (select id from public.cards where media_assignee_id = (select auth.uid()))
);
```

(Two separate `card_id in (...)` clauses rather than one combined subquery — mirrors the existing style of every cross-table policy in this codebase, e.g. `card_checklist_overrides_select_scoped`, and keeps each clause independently readable/auditable.)

### UPDATE on `cards` (description only) and `card_checklist_items` (completion toggle only) — the column-scoping problem

**Postgres RLS has no native column-level policy for a single `UPDATE` command.** (There is `GRANT UPDATE (column) ON table` for column-level *grants*, but that is a coarser, all-or-nothing-per-column mechanism layered under GRANT, not RLS, and this codebase has never used column-level grants — every existing GRANT statement is table-level.) Three theoretically possible designs, evaluated:

| Design | How it works | Verdict for this codebase |
|--------|---------------|------------------------------|
| **A. Row-level RLS (broad) + Server Action payload restriction (narrow)** — recommended | `cards_update_scoped` gets an Editor OR-branch that permits UPDATE on rows where `media_assignee_id = auth.uid()`. A **new, Editor-only Server Action** (not `updateCardDetails`) is the ONLY code path that ever issues that UPDATE, and its `.update({...})` call hardcodes exactly `{ description, updated_at }` — no `stage`/`assignee_id`/`media_assignee_id`/`channel`/`due_date` key is ever constructed from Editor input, so there is nothing for a malicious payload to overwrite even if RLS's row-level check passes. | **Matches this codebase's own established pattern exactly.** Every existing Server Action in `app/pm/board/actions.ts` already follows "RLS decides WHICH rows, the Server Action's fixed `.update({...})` object decides WHICH columns" — e.g. `toggleChecklistItem` only ever writes `completed_at`/`completed_by` regardless of what `card_checklist_items_write_scoped` would technically allow. This is not a new mechanism, it is applying the existing one to a new, more restrictive caller. |
| **B. BEFORE UPDATE trigger rejecting forbidden-column changes for Editor callers** | A `plpgsql` trigger compares `OLD`/`NEW` and raises if `NEW.stage IS DISTINCT FROM OLD.stage` (etc.) while `is_editor()` is true. | Technically sound (this project already uses exactly this pattern for `prevent_profile_privilege_escalation_trg`) but **adds a second, redundant enforcement layer for a boundary the Server Action already enforces by never constructing the payload** — worth doing ONLY as defense-in-depth if the planner is worried about a future code path bypassing the dedicated Server Action (e.g. someone later "helpfully" reusing `updateCardDetails` for Editor). Given this project's threat model already treats the Server Action layer as authoritative everywhere else (see `updateCardDetails`'s own docstring: "cards_update_scoped is the real boundary" — i.e. RLS decides row access, the action decides column access, consistently, project-wide), Design A alone is consistent with precedent; Design B is a reasonable optional hardening the planner may choose to add given this is explicitly "the most sensitive item in the series." |
| **C. Widen `cards_update_scoped` generically and rely on `updateCardDetailsSchema`'s existing shape** | Reuse `updateCardDetails` as-is, just let Editor call it. | **Rejected.** `updateCardDetailsSchema` requires `assigneeId`/`mediaAssigneeId`/`channel` as part of its contract (nullable, but always present) and the existing action always writes all of them — an Editor caller would either be forced to pass the card's *current* values back (fragile, and a race between two Editors/PMs would silently clobber a concurrent PM edit to `channel`/assignee) or the action would need Editor-specific branching bolted onto a PM/Admin-facing action, mixing two different trust levels in one function. This directly contradicts the "never expose a generic action to a narrower caller" instinct the research brief itself flags. |

**Recommendation: Design A**, with Design B as an optional additional hardening layer the planner can add if they want defense-in-depth beyond "the Server Action is the only caller." Concretely:

```sql
-- cards_update_scoped gains a THIRD, Editor-specific branch. Row-level only
-- — column restriction is enforced by the NEW updateCardDescriptionAsEditor
-- Server Action's hardcoded .update({ description, updated_at }) payload,
-- never by this policy.
drop policy "cards_update_scoped" on public.cards;
create policy "cards_update_scoped"
on public.cards
for update
to authenticated
using (
  (select public.is_admin())
  or client_id in (select public.pm_assigned_clients())
  or media_assignee_id = (select auth.uid())
)
with check (
  (select public.is_admin())
  or client_id in (select public.pm_assigned_clients())
  or media_assignee_id = (select auth.uid())
);
```

`card_checklist_items_write_scoped` (the existing `for all` policy) should almost certainly stay untouched for INSERT/DELETE (Editor never creates/deletes checklist items), which means the current single `for all` policy is actually the wrong shape to extend — splitting it into `for update` (Editor-includable) and keeping a separate, unchanged `for insert`/`for delete` (PM/Admin-only, as today) is the cleaner fix rather than adding an Editor branch to a policy that also grants DELETE. This is a real, non-trivial migration-B change to `0016_card_checklist_items.sql`'s policy shape (splitting one `for all` into three `for select/update` + un-covered insert/delete falling back to needing their OWN explicit admin/pm policies) — flag this precisely to the planner as a concrete task, not an afterthought.

## 4. `due_date` column (HIGH confidence — precedent is unambiguous)

**Type: `timestamptz`, not `date`.** Confirmed by exhaustive grep: every single temporal column in this schema (`created_at`, `updated_at`, `completed_at`, `occurred_at`, `archived_at`) is `timestamptz`; the plain Postgres `date` type is used **zero times** anywhere in `supabase/migrations/`. `timestamptz` also keeps this column forward-compatible with Phase 4's still-TBD "data/hora combinada de publicação" (PROJECT.md Active requirements), which will need actual time-of-day precision, not just a day.

```sql
alter table public.cards
  add column due_date timestamptz;
```

- **Nullable** (not every card needs a deadline; CONTEXT.md doesn't mandate it as required).
- **Editable by PM/Admin only, never by Editor** — this means `due_date` belongs in `updateCardDetailsSchema`/`updateCardDetails` (the PM/Admin-facing action), exactly alongside `channel`/`assigneeId`/`mediaAssigneeId`, and must be explicitly ABSENT from the Editor's own narrow Server Action's accepted input (see Section 3).
- **RLS: no new policy needed** — `cards_select_scoped`/`cards_update_scoped` are row-level with no column list, so they automatically cover this new column exactly like every other column on `cards` (same precedent this codebase has repeated at every single-column addition since `0025_clients_tag.sql`: "ADD COLUMN does not disable RLS, existing row-level policies already cover reads/writes of this new column like every other column on this table"). This holds independent of the Section 3 Editor-branch discussion — a plain `alter table add column` is always covered by existing row policies with no extra step.
- **Index**: add `create index idx_cards_due_date on public.cards (due_date);` — the Editor's queue query will be `order by due_date` (nulls-last recommended, e.g. `order by due_date nulls last`) filtered to `media_assignee_id = auth.uid()`; this mirrors every prior card-family migration's own justification pattern ("the board batches a read... index the FK/predicate it filters on").
- **Naming**: `due_date` is the correct choice — no existing column collides with it, and it directly matches CONTEXT.md's own wording ("due_date (ou nome equivalente)"). No need for a synonym.

## 5. Provisioning — mirroring `createClientLogin` (HIGH confidence)

The exact pattern to mirror lives in `app/pm/clients/[id]/access/actions.ts`'s `createClientLogin` + `lib/security/client-access-authz.ts` + `lib/validation/client-access.ts`. Key structural facts an Editor-provisioning flow must replicate or diverge from deliberately:

1. **`createClientLogin` is role-agnostic authorization-wise** — it doesn't hardcode "PM-only" or "`/pm`-only"; a PM or Admin calling it is authorized via `assertCallerManagesClient()`, which checks `is_admin()` OR the target `clientId` is in the caller's `pm_assigned_clients()`. **This exact shape does NOT map cleanly to Editor provisioning**, because Editor accounts are not scoped to one `client_id` the way Client accounts are (`profiles.client_id` — an Editor works across whichever cards they get assigned to via `media_assignee_id`, potentially spanning multiple clients, never a single owning client). Concretely: `createClientLogin(clientId, email)` takes a `clientId` because a Client login IS scoped to exactly one client (enforced by the `uq_profiles_one_client_login_per_client` partial unique index in `0003_pm_clients.sql` and `profiles.client_id`). **An Editor login has no natural `clientId` to pass** — it should be a simpler `createEditorLogin(email)` with NO client-scoping parameter at all, authorized by "caller is `is_admin()` OR `is_pm()` (any approved PM, not scoped to a specific client)" rather than `assertCallerManagesClient(clientId)`.
2. **`profiles.client_id` stays `null` for an Editor** — this column exists specifically for the Client role's 1:1 relationship; an Editor's `profiles` row should leave it `null` (same as a `pm`/`admin` row does today), never repurposed.
3. **No `uq_profiles_one_client_login_per_client`-equivalent constraint needed for Editor** — that unique index enforces "one Client login per client company," a rule specific to the Client role. Nothing in CONTEXT.md suggests a similar 1:1 constraint for Editor (multiple Editors, and one Editor with cards across multiple clients, are both clearly intended). No new unique index needed.
4. **`generateProvisionalPassword()` (`lib/security/password.ts`) and the `must_change_password: true` metadata pattern reuse directly** — zero changes needed to that module.
5. **`handle_new_user()` (`0001_profiles.sql`) MUST be updated — this is a real gap, not optional:**
   ```sql
   -- current body (0001_profiles.sql):
   coalesce((new.raw_user_meta_data->>'role')::public.user_role, 'pm'),
   case when (new.raw_user_meta_data->>'role') = 'client' then 'approved' else 'pending' end,
   ```
   The `status` CASE branch only maps `'client'` to immediate `'approved'`; every other role (including a brand-new `'editor'`) falls into the `else 'pending'` branch, which means a freshly created Editor account would land in the `/pending` gate (per `middleware.ts`) and require a SEPARATE admin-approval step — defeating the CONTEXT.md decision that Editor provisioning mirrors Client's "PM ou Admin provisiona diretamente... sem autocadastro nem fila de aprovação." **This CASE branch must be extended to `when role in ('client', 'editor') then 'approved'`** (or equivalent), in the SAME migration B that adds the `is_editor()` helper/RLS (this statement references the literal `'editor'`, so it cannot be in Migration A alongside the bare `ADD VALUE`, per Section 1's hard rule — `handle_new_user()`'s `create or replace function` body is regular SQL text, not itself subject to the 55P04 restriction at CREATE time, but the enum value it references must already be committed, so it must live in Migration B, not A).
6. **The `createUser` metadata payload for Editor**: `{ role: "editor", must_change_password: true }` — no `client_id` key (per point 2 above), unlike Client's `{ role: "client", client_id, must_change_password: true }`.
7. **New validation schema**: mirror `createClientLoginSchema` (`lib/validation/client-access.ts`) minus the `client_id` field — `z.object({ email: z.string().trim().email(...) })`.

## 6. Post-login routing (HIGH confidence — trivial, single-file change)

`middleware.ts`'s `roleRoot` map is the entire mechanism:

```ts
const roleRoot: Record<string, string> = {
  admin: "/admin",
  pm: "/pm",
  client: "/client",
};
```

Adding `editor: "/editor"` (or whatever route name the planner picks per CONTEXT.md's Claude's Discretion) is the only change needed here — the existing redirect/gate logic (`ownRoot`/`otherRoots` cross-role redirect, `/pending`/`/rejected`/`/change-password` gates) is entirely role-agnostic and needs zero further changes. No other file in the auth/routing chain (`lib/supabase/middleware.ts`) references role at all.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Column-level UPDATE restriction | A generic "field-level ACL" system, or a Postgres extension for column security | The existing pattern: RLS row-level `using`/`with check` + a narrow Server Action whose `.update({...})` payload is hardcoded to the allowed columns | This codebase has zero precedent for column-level enforcement anywhere else — every single existing Server Action (`toggleChecklistItem`, `advanceStage`, `addAttachment`) already follows exactly this division of labor; introducing a new general mechanism for one role would be inconsistent with 22 other write paths |
| Enum value + immediate usage | A single migration file combining `ADD VALUE` and any policy/function referencing it | Two migration files, in strict order | Postgres 55P04 is not negotiable; Supabase's per-file-transaction runner makes the split structurally necessary, not stylistic |
| Editor client-scoping | Reusing `pm_assigned_clients()` or `clients_select_scoped` for Editor visibility | A new `media_assignee_id = auth.uid()` predicate, entirely separate from the client-wide helpers | `pm_assigned_clients()` grants access to EVERY card of a client; an Editor must only see cards where they are the specific assignee — conflating the two functions would be the exact vazamento class this project's isolation model exists to prevent |

**Key insight:** every mechanism this task needs already exists in this codebase in some form (role-scoped helper function, narrow Server Action, RLS row-level policy, `handle_new_user()` metadata mapping) — the work is disciplined *extension* of existing patterns to a new role value, not new architecture. The one area needing real design judgment (Section 3) is exactly where the research brief flagged the risk correctly: RLS's lack of column-level policies.

## Common Pitfalls

### Pitfall 1: Assuming RLS alone can restrict `cards.description` edits without also restricting `stage`/`assignee_id`
**What goes wrong:** A single, broadened `cards_update_scoped` policy that lets Editor `UPDATE` any row where `media_assignee_id = auth.uid()` — with NO Server Action–level payload restriction — would let a caller who bypasses the UI (a raw PostgREST `PATCH` request with a forged Auth token) set `stage`/`assignee_id`/`channel`/`due_date` freely, since RLS's `with check` only re-validates the ROW predicate, not which columns changed.
**Why it happens:** RLS is genuinely row-granular only; this is documented Postgres behavior, not a bug, but easy to reach for as "the" security boundary out of habit since it is the boundary for every other role in this project.
**How to avoid:** The Server Action must be the actual boundary for column restriction (Design A, Section 3) — the "RLS decides which rows, the Server Action decides which columns" split that every OTHER action in `app/pm/board/actions.ts` already follows for its own reasons (e.g. `toggleChecklistItem` never lets ANY caller — PM, Admin, or future Editor — write `label`/`sort_order`, precisely because that action's hardcoded `.update({completed_at, completed_by})` payload makes it structurally impossible, not because of any role check).
**Warning signs:** A plan or diff that adds Editor's UPDATE permission ONLY at the RLS layer, with no corresponding new/narrower Server Action — this is the single highest-risk shape this task could take.

### Pitfall 2: Loosening `card_checklist_items_write_scoped`'s existing `for all` policy to include Editor
**What goes wrong:** That policy currently governs INSERT/UPDATE/DELETE together. Adding an Editor branch there (even scoped correctly by `media_assignee_id`) would let an Editor `DELETE` checklist items or `INSERT` new ones with arbitrary `label` text — CONTEXT.md explicitly restricts Editor to "marcar/desmarcar" (toggle only).
**Why it happens:** `for all` is a convenient shorthand used everywhere else in this codebase for PM/Admin (who ARE trusted with insert/delete on that table), so it is easy to extend it without noticing the scope mismatch for a lower-trust role.
**How to avoid:** Split into `for select`/`for update` (Editor-includable) vs. the PM/Admin-only insert/delete paths, as detailed in Section 3.

### Pitfall 3: Forgetting `handle_new_user()`'s status-mapping CASE branch
**What goes wrong:** An Editor account gets created successfully but lands in `status='pending'`, triggering the `/pending` gate in `middleware.ts` — the account appears "broken" even though every other part of provisioning worked, and the failure mode (silently requiring a SEPARATE admin approval nobody built a UI for) is confusing to debug because it looks like an RLS/permission bug rather than a status-default bug.
**Why it happens:** `handle_new_user()`'s CASE only special-cases `'client'`; every other role, including the brand-new `'editor'`, silently falls into the `else 'pending'` catch-all — this is easy to miss because the enum/RLS work is the "interesting" part of the task and this one-line CASE branch is buried in a file this task otherwise doesn't need to touch for any other reason.
**How to avoid:** Explicitly grep `handle_new_user()` for every literal role string during planning (this research already found and documented the exact line, Section 5 point 5) and extend the CASE branch as part of Migration B.

### Pitfall 4: Splitting the enum-add and the enum-use migrations in the wrong order, or combining them
**What goes wrong:** `supabase db push`/`migration up` fails with `55P04 unsafe_new_enum_value_usage` mid-deploy, potentially against the HOSTED database (this project's established pattern is that migrations get applied to hosted by an orchestrator after local verification — a failure here is a live-database failure, not just a local dev inconvenience).
**Why it happens:** It is tempting to keep "the enum change" as one self-contained migration since conceptually it's "one feature" — the two-file split feels like unnecessary ceremony until the exact 55P04 error is hit.
**How to avoid:** Follow Section 1's two-migration split exactly; treat it as a hard, tested-by-the-Postgres-engine-itself constraint, not a style preference.

## Runtime State Inventory

N/A — this is not a rename/refactor/migration phase (it is additive: new enum value, new column, new policies, new Server Actions). Skipped per the protocol's own trigger condition.

## Code Examples

### Migration A (enum value only)
```sql
-- supabase/migrations/00XX_user_role_add_editor.sql
-- MUST contain ONLY this statement -- see 260811-oe0-RESEARCH.md Section 1.
-- No policy, function body, or literal reference to 'editor' may appear in
-- this file; Postgres forbids using a newly added enum value in the same
-- transaction that adds it (55P04), and Supabase applies each migration
-- file as one transaction.
alter type public.user_role add value 'editor';
```

### Migration B skeleton (everything that uses 'editor')
```sql
-- supabase/migrations/00XX_editor_role_rls.sql (next number after Migration A)

-- Mirrors is_admin()'s exact convention: plpgsql (never sql-language, to
-- avoid inlining and losing the security definer context / reintroducing
-- recursion risk), stable, security definer, empty search_path.
create or replace function public.is_editor()
returns boolean
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  return exists (
    select 1 from public.profiles
    where id = (select auth.uid()) and role = 'editor' and status = 'approved'
  );
end;
$$;

-- cards: add the media_assignee_id branch to SELECT and UPDATE (row-level
-- only -- column restriction is the new Editor Server Action's job, see
-- Section 3 Design A).
drop policy "cards_select_scoped" on public.cards;
create policy "cards_select_scoped"
on public.cards for select to authenticated
using (
  (select public.is_admin())
  or client_id in (select public.pm_assigned_clients())
  or media_assignee_id = (select auth.uid())
);

drop policy "cards_update_scoped" on public.cards;
create policy "cards_update_scoped"
on public.cards for update to authenticated
using (
  (select public.is_admin())
  or client_id in (select public.pm_assigned_clients())
  or media_assignee_id = (select auth.uid())
)
with check (
  (select public.is_admin())
  or client_id in (select public.pm_assigned_clients())
  or media_assignee_id = (select auth.uid())
);

-- card_checklist_items: split the existing `for all` write policy so
-- Editor can only reach UPDATE, never INSERT/DELETE.
drop policy "card_checklist_items_select_scoped" on public.card_checklist_items;
create policy "card_checklist_items_select_scoped"
on public.card_checklist_items for select to authenticated
using (
  (select public.is_admin())
  or card_id in (select id from public.cards where client_id in (select public.pm_assigned_clients()))
  or card_id in (select id from public.cards where media_assignee_id = (select auth.uid()))
);

drop policy "card_checklist_items_write_scoped" on public.card_checklist_items;

create policy "card_checklist_items_update_scoped"
on public.card_checklist_items for update to authenticated
using (
  (select public.is_admin())
  or card_id in (select id from public.cards where client_id in (select public.pm_assigned_clients()))
  or card_id in (select id from public.cards where media_assignee_id = (select auth.uid()))
)
with check (
  (select public.is_admin())
  or card_id in (select id from public.cards where client_id in (select public.pm_assigned_clients()))
  or card_id in (select id from public.cards where media_assignee_id = (select auth.uid()))
);

create policy "card_checklist_items_insert_scoped"
on public.card_checklist_items for insert to authenticated
with check (
  (select public.is_admin())
  or card_id in (select id from public.cards where client_id in (select public.pm_assigned_clients()))
);

create policy "card_checklist_items_delete_scoped"
on public.card_checklist_items for delete to authenticated
using (
  (select public.is_admin())
  or card_id in (select id from public.cards where client_id in (select public.pm_assigned_clients()))
);

-- handle_new_user(): extend the status CASE branch so Editor is
-- immediately 'approved' like Client, never 'pending'.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = ''
as $$
begin
  insert into public.profiles (id, email, role, status, must_change_password, client_id)
  values (
    new.id,
    new.email,
    coalesce((new.raw_user_meta_data->>'role')::public.user_role, 'pm'),
    case
      when (new.raw_user_meta_data->>'role') in ('client', 'editor') then 'approved'
      else 'pending'
    end,
    coalesce((new.raw_user_meta_data->>'must_change_password')::boolean, false),
    (new.raw_user_meta_data->>'client_id')::uuid
  );
  return new;
end;
$$;
```

### due_date column (can ship in Migration A alongside the enum ADD VALUE, since it references no enum literal — OR its own migration; either is safe since it never mentions 'editor')
```sql
alter table public.cards
  add column due_date timestamptz;

create index idx_cards_due_date on public.cards (due_date);
```

### Editor's queue query shape (for the planner's page loader — new, not extending `app/pm/board/page.tsx`'s client-scoped query)
```ts
// Unlike the PM board (app/pm/board/page.tsx), which is ALWAYS scoped to
// one active client via ?client=<id>, the Editor's queue is cross-client
// by nature (media_assignee_id has no client boundary) -- this is a
// genuinely different query shape, not a filtered variant of the board
// query.
const { data: cards } = await supabase
  .from("cards")
  .select("id, title, card_type, stage, description, client_id, due_date, channel")
  .order("due_date", { ascending: true, nullsFirst: false });
// cards_select_scoped's new media_assignee_id = auth.uid() branch is the
// entire filter -- no .eq("media_assignee_id", ...) needed client-side,
// RLS already returns only the caller's own assigned cards.
```

## State of the Art

Not applicable in the "library version drift" sense — this is pure first-party Postgres/Supabase RLS design work, not a third-party dependency. The one relevant "state of the art" fact is the Postgres 12+ enum semantics documented in Section 1, which have been stable since Postgres 12 (2019) and are not expected to change.

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|----------------|
| A1 | Supabase CLI (`migration up`/`db push`) applies each `.sql` migration file as a single transaction, making the two-migration split structurally necessary (not just best practice) | Section 1 | MEDIUM. Sourced from Supabase's own GitHub issues (community-reported, not an official docs page). If Supabase's runner does NOT actually wrap files in a transaction in this project's specific CLI version, combining Migration A+B into one file might work by accident — but splitting them costs nothing and is safe either way, so this assumption should be treated as a "do this regardless" recommendation rather than something requiring separate verification before acting on it. |
| A2 | The Editor's queue is best served by a route with NO `clientId` query-param scoping (cross-client by construction), unlike every other authenticated view in this app which is either single-client-scoped (`?client=`) or globally admin-scoped | Section 6 / Code Examples | LOW-MEDIUM. This follows directly from CONTEXT.md's locked scope ("todos os cards atribuídos ao Editor... ordenados por prazo") and the `media_assignee_id`-only visibility decision, but the exact page/route shape is explicitly left to Claude's Discretion in CONTEXT.md — flagging this so the planner treats it as a real architectural choice, not an assumption to skip discussing. |
| A3 | `createEditorLogin` should NOT take a `clientId` parameter at all (diverging from `createClientLogin`'s shape) | Section 5 | MEDIUM. This is a reasoned inference from Editor having no natural 1:1 client relationship, not something explicitly stated in CONTEXT.md. If the planner/user actually wants Editor provisioning initiated FROM a specific client's `/access` page (mirroring the UI entry point, even if the resulting account isn't client-scoped), the authorization check would need to be "caller is admin OR caller is an approved PM (any)" rather than "caller manages this specific client" — a UI/UX decision, not just a backend one. Worth confirming with the user/planner rather than assuming. |

## Open Questions

1. **Does the Editor need to SEE Drive attachments on their assigned cards?**
   - What we know: CONTEXT.md's permission list is exactly "descrição e itens de checklist" — attachments are not mentioned either way.
   - What's unclear: whether omitting attachment visibility is an intentional restriction or an oversight — an Editor doing actual design/media work on a card plausibly needs to see reference files/existing assets attached via `card_attachments`, even if they can't add/remove them.
   - Recommendation: surface this explicitly at planning/discuss time rather than defaulting either way. A read-only `card_attachments_select_scoped` branch for Editor (mirroring the `cards`/`card_checklist_items` select additions, zero write access) would be the low-risk addition if the answer is "yes."

2. **Does `clients_select_scoped` need an Editor branch at all, and if so, how narrow?**
   - What we know: the Editor's queue needs to display SOME client-identifying info per card (at minimum a name, per every other card-list view in this app).
   - What's unclear: whether that's better solved by denormalizing `clients.name`/`tag` onto the queue's own query (a join through `cards` the Editor can already read, which does NOT require `clients_select_scoped` to change at all — a `select` with an embedded Supabase relationship `cards(*, clients(name))` would still need the `clients` row to be RLS-visible for the join to return non-null, so this actually DOES require SOME `clients` visibility) vs. widening `clients_select_scoped` itself.
   - Recommendation: the cleanest fix is almost certainly extending `clients_select_scoped` with a narrow branch — `id in (select client_id from public.cards where media_assignee_id = auth.uid())` — rather than `media_assignee_id`-style client-wide access; this still respects "Editor only sees clients it has an actual assigned card for," which is a materially narrower grant than PM's `pm_assigned_clients()`. Flag this as a 24th row this research's Section 2 table did not originally include a fix for — the planner should treat `clients_select_scoped` as needing the same treatment as `cards_select_scoped`, scoped through the card relationship rather than direct client assignment.

3. **Exact numbering of the two required migrations.**
   - What we know: the highest existing migration file at research time is `0029_cards_media_assignee.sql`.
   - What's unclear: whether any other quick task lands migrations between now and when this task is planned/executed (this project's own established discipline, per `0022`'s header comment, is to re-check the actual max immediately before writing the file).
   - Recommendation: the planner/executor must re-run `ls supabase/migrations/` immediately before creating either file, per this codebase's own established numbering discipline — do not hardcode `0030`/`0031` from this document.

## Environment Availability

Skipped — this task has no new external tool/service dependency. All work is within the existing Next.js + Supabase local/hosted stack already in use.

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | pgTAP (`supabase test db` / `npx supabase test db`), Node's built-in test runner for pure TS logic (`node --test`, per `client-access-authz.test.ts`'s own docstring precedent) |
| Config file | `supabase/config.toml` ([db.test] / pgTAP setup); no separate JS test config found — this project's `npm run test` / `node --test` pattern is confirmed from prior quick tasks |
| Quick run command | `node --test` (JS/TS unit tests, e.g. any new pure predicate module) |
| Full suite command | `npx supabase test db` (pgTAP, requires local Docker-based Supabase stack) |

### Phase Requirements → Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| Editor cannot see cards outside their `media_assignee_id` | RLS row visibility | pgTAP | `npx supabase test db` | ❌ Wave 0 — new file needed, e.g. `supabase/tests/0016_rls_editor_visibility_test.sql`, mirroring the existing `rls_pm_scoping_test.sql`/`rls_client_scoping_test.sql` shape |
| Editor cannot UPDATE `stage`/`assignee_id`/`channel`/`due_date` even on their own assigned card | Server Action payload restriction (app-layer, not RLS) | unit (Node test runner) on the new Editor Server Action, asserting the exact `.update({...})` key set, OR pgTAP asserting a raw attempted column update via a simulated `editor` role fails/no-ops if the planner also adds Design B's trigger | `node --test` and/or `npx supabase test db` | ❌ Wave 0 |
| Editor account status is `approved` immediately on creation (not `pending`) | `handle_new_user()` CASE branch | pgTAP, extending the existing `handle_new_user`-adjacent fixture pattern (`rls_helpers.sql`) | `npx supabase test db` | ❌ Wave 0 |
| Enum migration applies cleanly in two steps with no 55P04 | Migration ordering | Manual/CI — `supabase migration up` locally then `supabase db push` to hosted, exactly the pattern every prior migration in this session used | `npx supabase migration up` (local) | N/A — this is inherently a manual/operator-run verification, matches this project's existing established pattern for every migration to date |

### Sampling Rate
- **Per task commit:** `node --test` (fast JS/TS checks) — no live DB needed for pure predicate/schema tests.
- **Per wave merge:** `npx supabase test db` (full pgTAP suite, requires Docker — this project's session history shows this is frequently run by the orchestrator/operator post-merge rather than inside an isolated executor worktree, since worktrees have repeatedly lacked `.env.local`/Docker in this session's own recorded history).
- **Phase gate:** Full pgTAP suite green + a live human-verify checkpoint (this task's own CONTEXT.md and the research brief both flag it as the highest-security-stakes item in the series — a live checkpoint walking through "log in as Editor, confirm cannot advance/create/reassign, confirm cannot see other clients' cards" is strongly warranted before closing this task, mirroring the rigor this project applied to `0022`'s force-advance-override checkpoint).

### Wave 0 Gaps
- [ ] `supabase/tests/00XX_rls_editor_visibility_test.sql` — covers Editor SELECT scoping on `cards`/`card_checklist_items` (positive: sees own `media_assignee_id` cards; negative: does NOT see other clients'/other assignees' cards, does NOT see `clients`/`messages`/`client_files`/`card_attachments` at all unless Open Question 1/2 above are resolved in favor of adding them)
- [ ] `supabase/tests/00XX_rls_editor_update_scope_test.sql` — covers Editor UPDATE row-scoping on `cards` (can update own-assigned row's `description`; RLS-level test cannot itself prove column restriction — that's the Server Action's job, see next line)
- [ ] A new unit test file for the Editor-only Server Action (mirrors `lib/security/client-access-authz.test.ts`'s pure-predicate, no-DB pattern) asserting its `.update()` payload never includes `stage`/`assignee_id`/`media_assignee_id`/`channel`/`due_date` keys
- [ ] `handle_new_user()` status-mapping regression coverage for `role='editor'` → `status='approved'` (extend whatever existing fixture/test currently covers the Client case, if one exists — grep `supabase/tests/` for `handle_new_user` at plan time to confirm exact file)

## Security Domain

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-------------------|
| V2 Authentication | Yes (indirectly) | No change to auth mechanism itself (Supabase Auth, unchanged) — Editor is provisioned via the same `admin.createUser()` + provisional-password + forced-change flow as Client |
| V3 Session Management | No | Unchanged — role is read fresh from `profiles` on every middleware invocation, no session-embedded role trust |
| V4 Access Control | **Yes — the core of this task** | Postgres RLS (`is_editor()`, scoped policies) as the row-level boundary; Server Action payload restriction as the column-level boundary (no ASVS-standard library applies here — this is bespoke authorization logic, which is the norm for RLS-based multi-tenancy, not a code smell) |
| V5 Input Validation | Yes | zod schemas (`lib/validation/cards.ts`, a new Editor-specific schema mirroring `updateCardDetailsSchema` but WITHOUT `assigneeId`/`mediaAssigneeId`/`channel`/`stage` fields at all — the schema itself should make the forbidden fields structurally absent, not merely ignored) |
| V6 Cryptography | No | Provisional password generation reuses `lib/security/password.ts` unchanged |

### Known Threat Patterns for this stack

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|------------------------|
| Editor sees cards belonging to a client via a stale/incorrect scoping predicate (e.g. accidentally OR'd with `client_id in pm_assigned_clients()`) | Information Disclosure | `media_assignee_id = auth.uid()`-only predicate, verified by a pgTAP negative test asserting an Editor query returns ZERO rows for a card where they are `assignee_id` but not `media_assignee_id` (the exact distinction CONTEXT.md draws) |
| Editor escalates a card's `stage`/reassigns via a forged direct PostgREST request bypassing the UI | Elevation of Privilege / Tampering | Server Action hardcoded update payload (Design A) — a raw PostgREST `PATCH` against `cards` with `media_assignee_id = auth.uid()` in RLS's row scope WOULD still be blocked from touching forbidden columns only if Design B's trigger is also added; without it, RLS alone permits the row-level write and a sufficiently sophisticated attacker bypassing the app entirely (not just the UI) could still modify other columns. **This is the one genuine residual risk of Design A alone** — flagged for the planner to weigh Design B's extra trigger against this specific threat model, since Design A's guarantee is "the app never DOES this," not "the database CANNOT be made to do this by a caller who skips the app." |
| Enum migration applied out of order against hosted (Migration B before Migration A finishes committing) | Denial of Service (deploy failure) | Strict two-file migration numbering + this project's own established "apply local, verify, then apply hosted" operator discipline |
| A newly-provisioned Editor account lands in `pending` and silently blocks the developer's live-verification checkpoint | (not STRIDE — an availability/UX bug, not a security threat) | `handle_new_user()` CASE branch fix (Section 5 point 5), tested explicitly |

## Sources

### Primary (HIGH confidence)
- `supabase/migrations/0001_profiles.sql` through `0029_cards_media_assignee.sql` — every migration file in this repository, read or grepped in full
- `postgresql.org/docs/current/sql-altertype.html` — official Postgres documentation on `ALTER TYPE ... ADD VALUE` transaction restriction
- `app/pm/clients/[id]/access/actions.ts`, `lib/security/client-access-authz.ts`, `lib/validation/client-access.ts` — the exact `createClientLogin` pattern to mirror
- `app/pm/board/actions.ts`, `lib/validation/cards.ts`, `app/pm/board/page.tsx` — existing Server Action / RLS-boundary conventions
- `middleware.ts`, `lib/supabase/middleware.ts` — role-routing mechanism
- `.planning/quick/260811-oe0-item-3-do-p3-plano-de-a-o-2026-08-05-pap/260811-oe0-CONTEXT.md` — locked task-scope decisions

### Secondary (MEDIUM confidence)
- `supabase.com/docs/guides/database/postgres/enums` — official Supabase enums guide (confirmed via direct fetch: shows only bare `ALTER TYPE ... ADD VALUE` syntax, no transaction-scoping guidance — absence of guidance here is itself informative, not contradictory)
- `github.com/supabase/supabase/issues/20118`, `github.com/orgs/supabase/discussions/20352` — community reports confirming Supabase CLI applies each migration file as one transaction, causing 55P04 when enum-add and enum-use are combined
- `github.com/typeorm/typeorm/issues/1169`, `github.com/prisma/prisma/issues/8424` — cross-framework confirmation that the 55P04 restriction and the "split into two migrations" fix are Postgres-generic, not Supabase-specific quirks

### Tertiary (LOW confidence)
- None — every claim above was either read directly from this codebase's own source files or corroborated by at least one official-docs or multi-source community confirmation.

## Metadata

**Confidence breakdown:**
- Enum migration mechanics: HIGH — official Postgres docs are unambiguous; Supabase-specific transaction-wrapping behavior is MEDIUM (community-sourced) but the recommended mitigation (split into two files) is safe regardless of whether the underlying assumption is exactly right.
- RLS surface inventory (Section 2): HIGH — every migration file was read directly, not inferred.
- Column-level UPDATE restriction design (Section 3): MEDIUM-HIGH — the recommended design (A) is a direct, disciplined extension of this codebase's own existing, repeatedly-used pattern, not a novel invention; the residual-risk analysis (raw PostgREST bypass) is an honest architectural tradeoff, not a gap in the research.
- Provisioning/routing (Sections 5-6): HIGH — both are small, mechanical extensions of code read in full.

**Research date:** 2026-08-11
**Valid until:** Stable — no fast-moving dependency involved; the only expiry risk is if a future migration changes the `is_admin()`/`pm_assigned_clients()` helper shapes before this task is planned/executed (re-grep `supabase/migrations/` for anything newer than `0029` immediately before planning, per Open Question 3).
