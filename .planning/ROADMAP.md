# Roadmap: BackstageEd.OS

**Mode:** MVP (vertical slices)
**Granularity:** Standard
**Created:** 2026-07-01
**Reordered:** 2026-07-08 — stakeholder (Juliano) reprioritization; see note below

## Reprioritization Note (2026-07-08)

Juliano reviewed priorities in a stakeholder meeting and reordered the phase sequence. The original Phase 1 (Access & Roles) is now Phase 5 — its already-completed walking-skeleton plan (05-01, formerly 01-01: Next.js/Supabase scaffold, migrations, RLS foundations, PM signup → pending gate) remains valid and stays the technical foundation everything else builds on. Plans 05-02/05-03/05-04 (login, admin approval queue, RLS test suite, Client login provisioning — formerly 01-02/01-03/01-04) are paused and resume when Phase 5's slot is reached.

**Open dependency risk, not yet resolved:** No login flow or admin-approval queue exists yet (that work is paused in Phase 5). Without it, no PM can get past the `/pending` gate to actually use the new Phase 1 (Client Records) in a live browser session. Flagged for `/gsd:discuss-phase` to resolve — likely a minimal login slipped into Phase 1's own scope, not the full paused approval-queue UI.

Juliano will use the platform as an official test client alongside a new execution-focused collaborator. He wants sub-phases with partial deliverables to test mid-flight. Weekly check-ins Wednesdays 14h. First partial delivery (Sub-phase 1A) target: client created, PM linked, Tropicalia project auto-provisioned.

## Core Value

Um PM consegue produzir conteúdo para um cliente específico com IA que só conhece aquele cliente (RAG isolado, zero vazamento de contexto), levar esse conteúdo do briefing até a aprovação do cliente dentro da própria plataforma, e o Juliano consegue ver o status real de qualquer card, de qualquer cliente, a qualquer momento — sem depender de alguém avisar.

## Phases

- [x] **Phase 1: Client Records & Isolated RAG Setup** *(deadline: 2026-07-11)* - PM/Admin can create a client, attach it to an isolated Tropicalia project, and fill its strategic briefing (completed 2026-07-13)
- [ ] **Phase 2: Client-Isolated AI Chat** *(deadline: 2026-07-18)* - PM can chat with AI about one client at a time, with zero context bleed, and curate what becomes permanent knowledge
- [ ] **Phase 3: Content Production Kanban** *(deadline: 2026-07-28)* - PM can create a content card, attach Drive media, and move it through briefing → produção → revisão interna, gated by a per-client checklist
- [ ] **Phase 4: Client Approval & Scheduling** *(deadline: 2026-08-07)* - Client can review, approve, or request adjustments on their content board, and once approved the PM registers the publish date
- [ ] **Phase 5: Access & Roles** *(deadline: 2026-08-12)* - PM signs up and gets approved by admin; Client accounts are provisioned by PM (no self-signup); both land in a role-scoped platform where PM/Client/Admin each see only what they're allowed to
- [ ] **Phase 6: Admin Oversight Dashboard** *(deadline: 2026-08-15)* - Admin can see a consolidated, real-time status view across all clients, PMs, and cards, and drill into any of them

## Phase Details

### Phase 1: Client Records & Isolated RAG Setup

**Goal**: Admin/PM can create and configure a client record that is the anchor for everything downstream — assignment, RAG isolation, and strategic context
**Mode:** mvp
**Deadline:** 2026-07-11
**Depends on**: Nothing structurally — but see the open dependency risk above (no login/approval flow exists yet; the walking-skeleton scaffold, migrations, and middleware gate from Phase 5's 05-01 plan are already built and available to build on)
**Requirements**: CLI-01, CLI-02, CLI-03, CLI-04
**Success Criteria** (what must be TRUE):

  1. Admin or PM can create a new client record from the platform
  2. Admin can assign one or more PMs to that client, and those PMs immediately gain access to it (per Phase 5 RLS rules)
  3. Every client record has its own Tropicalia `project_id` — created automatically via `POST /v1/projects` against the Tropicalia API when the client is created — stored and visibly tied to that client only
  4. PM can fill in and later edit a client's structured strategic briefing (objective, tone of voice, target audience, content pillars) and see it persist

**Architecture decisions already made:**

- Each client has a `tropicalia_project_id` column, populated automatically via `POST /v1/projects` on client creation
- Isolation is structural — a separate Tropicalia project per client, not a filter
- The `clients` table already exists (stub, from Phase 5's 05-01 migrations) — this phase `ALTER`s it into the full record
- RLS is already configured: a PM only accesses clients they're linked to via `pm_clients`
- Tropicalia API base URL: `https://api.tropicalia.dev`; key lives in `.env.local` as `TROPICALIA_API_KEY`

**Sub-phase 1A (first partial delivery):** client created, PM linked, Tropicalia project auto-provisioned.

**Plans**: 4 plans
Plans:
**Wave 1**

- [x] 01-01-PLAN.md — Dev login (D-01/02/03) + Supabase/Tropicalia env unblock, seeded Admin+PM

**Wave 2** *(blocked on Wave 1)*

- [x] 01-02-PLAN.md — ALTER clients (briefing fields + tropicalia_project_id) + RLS fix (is_pm(), clients_insert_admin_or_pm, clients_update_scoped) + db push (CLI-01, CLI-03, CLI-04)

**Wave 3** *(blocked on Wave 2)*

- [x] 01-03-PLAN.md — Client creation, list, PM linking, Tropicalia auto-provisioning — Sub-phase 1A (CLI-01, CLI-02, CLI-03)

**Wave 4** *(blocked on Wave 3)*

- [x] 01-04-PLAN.md — Strategic briefing form, PM reassignment, RAG retry, phase-gate verification (CLI-04)

### Phase 2: Client-Isolated AI Chat

**Goal**: PM can have a working AI conversation about a specific client that is structurally incapable of leaking another client's context, and can curate what becomes permanent memory
**Mode:** mvp
**Deadline:** 2026-07-18
**Depends on**: Phase 1
**Requirements**: CTX-01, CTX-02, CTX-03, CTX-04, CTX-05
**Success Criteria** (what must be TRUE):

  1. PM can open a chat scoped to one client and get AI responses informed only by that client's Tropicalia project and strategic briefing
  2. Switching the active client in the chat UI switches the entire knowledge base consulted — a question about Client A never surfaces Client B's information
  3. AI responses read as generated by Claude using retrieved context (not raw Tropicalia output), with tone/instructions controlled server-side
  4. PM can select a specific piece of the conversation and explicitly save it as permanent client knowledge — nothing is saved automatically
  5. Content the PM chooses to save is written as a curated `.md` file and uploaded to that client's Tropicalia project via its upload endpoint, and is retrievable in a later chat

**Plans**: TBD

### Phase 3: Content Production Kanban

**Goal**: PM can take a content idea from briefing through internal review, with a client-configurable checklist enforcing that no step is silently skipped before it's ready for the client
**Mode:** mvp
**Deadline:** 2026-07-28
**Depends on**: Phase 1 (client records exist to attach cards to); Phase 2 not required but typically used alongside it
**Requirements**: KAN-01, KAN-02, KAN-03, KAN-05, CHK-01, CHK-02, CHK-03, CHK-04
**Success Criteria** (what must be TRUE):

  1. PM can create a content card for a client representing either a single post or a package of related pieces, and see it appear on that client's Kanban board
  2. PM can view all of a client's cards as a Kanban board grouped by stage (briefing, produção, revisão interna, aprovação do cliente, agendamento)
  3. PM can attach one or more Google Drive links (image, video, PDF) to a card directly from the card, without leaving the platform
  4. Admin can define a checklist of review items for revisão interna, and configure a different checklist per client
  5. PM must check off that client's checklist items on a card during revisão interna before the card can advance to aprovação do cliente
  6. Admin can open any card and see exactly which checklist items were completed and when — no step can be silently skipped

**Plans**: TBD

### Phase 4: Client Approval & Scheduling

**Goal**: Client can review their own content board and approve or send it back for adjustment, and once approved the PM locks in a publish date — closing the loop from production to "ready to publish"
**Mode:** mvp
**Deadline:** 2026-08-07
**Depends on**: Phase 3
**Requirements**: KAN-04, APR-01, APR-02, APR-03, APR-04, SCH-01, SCH-02
**Success Criteria** (what must be TRUE):

  1. Client logs in and sees only their own content, organized as a board of cards ready for review
  2. Client can approve an individual content item with one action
  3. Client can instead request an adjustment on an item, attaching a comment explaining what needs to change
  4. That adjustment comment is visible to the PM directly on the original card (not a separate document), and the card automatically returns to produção, requiring revisão interna again before it can come back to the client
  5. Once a card is approved by the client, PM can register the agreed publish date/time on the card
  6. A card with a registered publish date/time shows a final status of "Pronto para publicar"

**Plans**: TBD

### Phase 5: Access & Roles

**Goal**: A PM can sign up and get approved by admin; a Client account is provisioned directly by a PM (no self-signup); both land in a platform that enforces their role's boundaries end-to-end via Supabase RLS
**Mode:** mvp
**Deadline:** 2026-08-12
**Depends on**: Nothing (originally Phase 1 — first phase planned/executed, no dependencies). Its foundation (05-01: Next.js/Supabase scaffold, migrations + RLS foundations, PM signup → pending gate) is already built and committed; Phases 1-4 above build on top of it despite executing first.
**Requirements**: AUTH-01, AUTH-02, AUTH-03, AUTH-04, AUTH-05, AUTH-06, AUTH-07, AUTH-08, AUTH-09, AUTH-10, AUTH-11
**Success Criteria** (what must be TRUE):

  1. A new PM can sign up with email/password and lands in a "pending approval" state with no platform access
  2. Admin can see pending PM signups and approve or reject each one (rejected accounts are marked rejected, not deleted)
  3. Admin can assign a role (PM or Admin) to an approved PM signup, and that role determines what the user sees on next login
  4. A logged-in user's session persists across a browser refresh without re-authenticating
  5. A PM can create a Client login (email + provisional password) linked to an existing client record, and the Client is forced to change that password on first login — no self-signup or approval queue for Clients
  6. A PM attempting to access a client they are not assigned to is blocked at the data layer (RLS), not just hidden in the UI — same for a Client attempting another client's content

**Plans**: 4 plans
Plans:
**Wave 1**

- [x] 05-01-PLAN.md — Walking Skeleton: Next.js/Supabase scaffold, migrations + RLS foundations, PM signup → pending gate (AUTH-01, AUTH-02) — **complete**
- [x] 05-02-PLAN.md — Login, session persistence, admin approval queue, role assignment, role-scoped landing pages (AUTH-03, AUTH-04, AUTH-05) — **paused**
- [x] 05-03-PLAN.md — pgTAP RLS test suite proving PM/Client scoping and admin-unrestricted enforcement at the data layer (AUTH-06, AUTH-07, AUTH-08) — **paused**

**Wave 2** *(blocked on Wave 1 completion)*

- [ ] 05-04-PLAN.md — Client login provisioning, forced first-login password change, and Client-access deactivation (AUTH-09, AUTH-10, AUTH-11) — **paused**

### Phase 6: Admin Oversight Dashboard

**Goal**: Juliano can see the real status of any card, any client, any PM, at any moment, without anyone needing to tell him
**Mode:** mvp
**Deadline:** 2026-08-15
**Depends on**: Phase 3, Phase 4
**Requirements**: ADM-01, ADM-02, ADM-03
**Success Criteria** (what must be TRUE):

  1. Admin can open a single view showing consolidated status across all clients and all PMs simultaneously
  2. Admin can visually distinguish cards that are stalled/overdue from cards that are on track, without opening each one individually
  3. Admin can drill from the consolidated view into any specific client's or PM's cards to see full detail

**Plans**: TBD

## Progress

| Phase | Deadline | Plans Complete | Status | Completed |
|-------|----------|----------------|--------|-----------|
| 1. Client Records & Isolated RAG Setup | 2026-07-11 | 4/4 | Complete   | 2026-07-13 |
| 2. Client-Isolated AI Chat | 2026-07-18 | 0/? | Not started | - |
| 3. Content Production Kanban | 2026-07-28 | 0/? | Not started | - |
| 4. Client Approval & Scheduling | 2026-08-07 | 0/? | Not started | - |
| 5. Access & Roles | 2026-08-12 | 3/4 | In Progress|  |
| 6. Admin Oversight Dashboard | 2026-08-15 | 0/? | Not started | - |

---
*Roadmap created: 2026-07-01*
*Reordered: 2026-07-08 (stakeholder reprioritization)*
