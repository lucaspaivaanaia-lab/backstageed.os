# Phase 1: Client Records & Isolated RAG Setup - Context

**Gathered:** 2026-07-08
**Status:** Ready for planning

<domain>
## Phase Boundary

Admin/PM can create and configure a client record — name, PM assignment, an auto-provisioned isolated Tropicalia RAG project, and an editable structured strategic briefing. This is the anchor record everything downstream (Phase 2 chat, Phase 3 cards, Phase 4 approval, Phase 6 dashboard) attaches to. This phase does NOT include the full login/approval-queue/PM-self-signup flow (that's Phase 5) — it only needs a minimal dev-only way to authenticate as a seeded Admin/PM to exercise this phase's UI in a real browser.

</domain>

<decisions>
## Implementation Decisions

### Dev-auth workaround (Phase 1 scope only — not an architecture change)
- **D-01:** Build a minimal `/login` page + Server Action now (`supabase.auth.signInWithPassword()`), styled to match the existing shadcn card/form pattern already used by `/signup`. `middleware.ts` already lists `/login` in `PUBLIC_PATHS` and already redirects unauthenticated users there — the page itself just doesn't exist yet (05-01 only built `/signup` and `/pending`).
- **D-02:** Seed both an Admin user AND a PM user directly via SQL in the Supabase dashboard (insert into `auth.users`, set `role`/`status='approved'` in `profiles`) — not Admin-only — so both role views in this phase's success criteria (Admin assigns PMs; PM creates clients, fills briefings) can be exercised. The new execution-focused collaborator uses the PM login.
- **D-03:** This `/login` is intentionally minimal/throwaway for Phase 1-4 dev testing: email+password → session, nothing else (no forgot-password, no approval-queue awareness beyond what `middleware.ts` already gates). The full login, admin approval queue, and PM self-signup flow stay exactly as planned in Phase 5 (05-02) — Phase 5 may extend or replace this page outright.

### Strategic briefing form (CLI-04)
- **D-04:** "Pilares de conteúdo" is a structured add/remove list (tags/chips), not free text — Phase 2's AI chat and Phase 3's content cards can reference individual pillars later.
- **D-05:** "Objetivo", "tom de voz", "público-alvo" are free text (one textarea each) — narrative fields, not good fits for structured/dropdown inputs.
- **D-06:** Single form, all four fields on one page — no multi-step wizard (too few fields to justify one).
- **D-07:** Briefing is optional at client creation, fillable/editable anytime after — matches Sub-phase 1A's own definition of done (client created, PM linked, Tropicalia provisioned — briefing isn't in that list).

### Tropicalia provisioning (CLI-03)
- **D-08:** If `POST /v1/projects` is attempted (key present) but fails (network/quota/etc.), the client record is still created; `tropicalia_project_id` stays null; a visible "RAG setup pendente" status is shown with a manual retry action. Client creation never rolls back because of an external API failure.
- **D-09:** Retry is a manual button ("tentar novamente"), not automatic background retry — no job queue/cron infrastructure exists or is justified at this scale (few PMs, ~10 clients) for v1.
- **D-10:** A client whose Tropicalia project failed or is pending can still be edited (briefing, PM assignment) — client-record CRUD is fully decoupled from RAG readiness.
- **D-11 (follow-up, supersedes nothing in D-08/09, adds a distinct case):** `TROPICALIA_API_KEY` does not exist yet — Juliano needs to provide it. Add it to `.env.local` as an empty placeholder now. Every Tropicalia call (client-creation provisioning now; the search endpoint in Phase 2 later) MUST null-check the key first: **if the key is absent, skip the call silently** — no attempt, no error — set `tropicalia_project_id = null`, and show the same "RAG setup pendente" status as D-08 (no retry button needed for this case, since there's nothing to retry until the key exists). Once the key is dropped into `.env.local`, the integration activates automatically with zero code changes. Distinguish this from D-08/D-09: **key present + call fails** → retry-button flow; **key absent** → silent skip, no retry button.

### Client list & PM assignment (CLI-01, CLI-02)
- **D-12:** Client list visibility follows the RLS policy that already exists in `0004_rls_policies.sql` exactly: Admin sees all clients (`is_admin()`), PM sees only clients linked via `pm_clients` (`pm_assigned_clients()`). The UI does no additional filtering — it renders whatever the scoped query returns.
- **D-13:** PM-to-client assignment happens via a multi-select PM picker directly on the client creation/edit form — no separate "manage assignments" admin screen (not justified at this scale).
- **D-14:** Each client-list row shows: name, assigned PM(s), briefing status (empty/filled), RAG status (pendente/pronto) — surfaces exactly the two incomplete-state signals (D-07, D-08/D-11) that matter without opening the record.

### Claude's Discretion
- Exact copy/wording of the "RAG setup pendente" status label and retry button.
- Client list layout (table vs. card grid) — column set is locked (D-14), visual layout is not.
- Briefing edit UX (inline edit vs. separate edit mode/page).
- Storage shape for "pilares de conteúdo" (e.g. `text[]` column vs. `jsonb`) — D-04 only locks that it's structured, not the exact schema.
- Exact `/login` page copy and error-message strings.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Project-level context
- `.planning/PROJECT.md` — Core value, constraints (Tropicalia isolation is structural and non-negotiable), Key Decisions log including the 2026-07-08 reprioritization entry
- `.planning/REQUIREMENTS.md` — CLI-01 through CLI-04
- `.planning/ROADMAP.md` §Phase 1 — goal, success criteria, and the "Architecture decisions already made" block (tropicalia_project_id auto-provisioning via `POST /v1/projects`, isolation structural not filter, `clients` table already exists as a stub to `ALTER`, RLS already configured via `pm_clients`, Tropicalia base URL `https://api.tropicalia.dev`)

### Prior-phase context (Access & Roles, now Phase 5)
- `.planning/phases/05-access-roles/05-CONTEXT.md` — D-01 there: a Client login is provisioned *linked to* an existing client record, meaning the client record (this phase) must exist before Phase 5's Client-login provisioning (05-04) can work. Confirms Phase 1 → Phase 5 data dependency even though Phase 5 executes later in the new order.

### Existing code this phase builds on
- `middleware.ts` — session/role gate already redirects unauthenticated users to `/login` and already lists it in `PUBLIC_PATHS`; the page itself doesn't exist yet (D-01/D-02/D-03 above).
- `lib/supabase/{client,server,middleware,admin}.ts` — the four canonical Supabase client factories from 05-01; reuse, never hand-roll new client construction.
- `lib/validation/auth.ts` — existing zod schema pattern (`signupSchema`) to follow for a new `loginSchema` and any client-creation/briefing validation schemas.
- `supabase/migrations/0002_clients_stub.sql` — existing `clients` stub (`id`, `name`, `created_at`) — this phase `ALTER`s it to add briefing fields + `tropicalia_project_id`.
- `supabase/migrations/0003_pm_clients.sql` — existing `pm_clients` join table (already has the schema this phase's PM-assignment UI writes to).
- `supabase/migrations/0004_rls_policies.sql` — `is_admin()`, `pm_assigned_clients()` helpers (reuse, never inline cross-table subqueries per the established Pitfall-1 rule); existing `clients_select_scoped` policy already matches D-12.

**⚠ Flagged for research/planning — not decided in this discussion:** `0004_rls_policies.sql`'s current `clients_insert_admin_only` / `clients_update_admin_only` policies restrict client-record insert/update to admins only. CLI-01 requires **"Admin or PM"** can create a client, and CLI-04 requires PM can edit the briefing. This is a real conflict between existing RLS and this phase's requirements — a new migration loosening these policies for PMs (scoped appropriately — e.g., PM insert allowed generally, PM update scoped via `pm_assigned_clients()`) is needed. Surface this explicitly during research/planning rather than assuming the existing policy already covers it.

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- Four Supabase client factories (`lib/supabase/*.ts`) — use directly, no new instantiation patterns.
- shadcn components already installed (button, input, label, form, card, table, badge, select, dialog, alert-dialog, sonner, separator, skeleton) — sufficient for the login form, client list (table), briefing form, and PM multi-select (select/dialog).
- `lib/validation/auth.ts` zod pattern — extend with new schemas rather than inventing a new validation approach.

### Established Patterns
- Server Actions co-located with each route (`app/(auth)/signup/actions.ts` pattern) — follow for `/login` and new client-management routes.
- Every migration that creates/alters a table touching RLS must enable/preserve RLS in the same migration (CVE-2025-48757 discipline, already established).
- RLS helper functions (`is_admin()`, `pm_assigned_clients()`) are the only sanctioned way to do cross-table checks in policies — never inline subqueries.

### Integration Points
- New routes likely live under `app/admin/clients/*` and/or `app/pm/clients/*` per the existing role-scoped route-group convention (`app/admin/*`, `app/pm/*`, `app/client/*` established in 05-01).
- `middleware.ts`'s role-redirect table already exists and doesn't need modification for this phase — new routes just need to fall under the correct role root.

</code_context>

<specifics>
## Specific Ideas

- Juliano will use the platform as an official test client himself, alongside a new execution-focused collaborator (who would use the seeded PM login per D-02).
- Weekly check-ins Wednesdays 14h.
- Sub-phase 1A (first partial delivery, target 2026-07-11 per deadline): client created, PM linked, Tropicalia project auto-provisioned. Briefing (D-07) is explicitly not required for this first delivery.
- The Tropicalia workaround (D-11) is meant to let development proceed today without blocking on Juliano supplying `TROPICALIA_API_KEY` — the key can arrive at any point and the feature activates with zero code changes.

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope.

### Reviewed Todos (not folded)
None — no pending todos matched this phase (`todo.match-phase` returned 0 matches).

</deferred>

---

*Phase: 1-Client Records & Isolated RAG Setup*
*Context gathered: 2026-07-08*
