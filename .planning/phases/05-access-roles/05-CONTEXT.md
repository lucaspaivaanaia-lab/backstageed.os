# Phase 5: Access & Roles - Context

**Gathered:** 2026-07-01
**Status:** Ready for planning

<domain>
## Phase Boundary

Any user (PM or Admin) can get onto the platform with a role-scoped account, and the platform enforces those role boundaries end-to-end via Supabase RLS. This phase covers: PM self-signup with admin approval, admin-issued Client logins (tied to a client record from Phase 1), session persistence, and RLS enforcement — not the client-record CRUD itself (that's Phase 1) or any of the Kanban/chat/checklist features built on top of these roles.

</domain>

<decisions>
## Implementation Decisions

### Account creation model (deviates from initial project-level assumption)
- **D-01:** Clients do NOT self-signup. PM creates the Client's login directly (email + provisional password), and that login is created *linked to* an existing client record (the client record from Phase 1 must already exist before the login is created — one client record can have 0 or 1 logins in v1).
- **D-02:** PM (and Admin) can create as many Client logins as needed for the clients they manage, and can deactivate a Client's access later (e.g., end of contract).
- **D-03:** PM still self-signs up (email/password) and goes into a "pending approval" state until Admin approves.
- **D-04:** This supersedes the "self-signup with approval for both PM and Client" assumption captured in PROJECT.md/REQUIREMENTS.md during project init — REQUIREMENTS.md AUTH-01/02/03 need rewording to reflect this (PM signup+approval; Client account is admin/PM-issued, not self-signup). Flagged for correction after this discussion.

### Admin approval flow (PM signups only)
- **D-05:** If Admin rejects a pending PM signup, the account is marked "rejected" in the database (not deleted) — kept for audit/history, can be reactivated later if needed.
- **D-06:** While pending, a PM sees a static waiting screen ("Seu cadastro está pendente de aprovação. Você será avisado quando for liberado.") — no further actions available.
- **D-07:** No active notification when approved (v1 has no email). PM finds out by trying to log in again later — no additional notification channel needed to compensate.

### Authentication mechanism
- **D-08:** Supabase Auth with email + password (not magic link — magic link would need working email delivery, which is out of scope for v1).
- **D-09:** When PM creates a Client's provisional password, the Client is forced to change it on first login.

### Multi-user / client scope
- **D-10:** One login per client company in v1 (no multiple Client-side users per client). If a client needs more than one person with access, that's deferred to v2.

### Claude's Discretion
- Exact copy/wording of the pending-approval screen.
- Exact UI for Admin's approval queue (list vs table, batch actions vs one-by-one) — not discussed in depth; Admin needs to see pending PM signups and approve/reject each, that's the hard requirement.
- Exact mechanism for forcing password change on first Client login (Supabase Auth's own flow vs custom check) — implementation detail for planner/researcher.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Project-level context
- `.planning/PROJECT.md` — Core value, requirements, constraints (Supabase RLS multi-tenancy, timeline target 2026-09-30)
- `.planning/REQUIREMENTS.md` — AUTH-01 through AUTH-08 (note: AUTH-01/02/03 wording needs correction per D-04 above — Client is not self-signup)
- `.planning/ROADMAP.md` — Phase 5 goal and success criteria (Access & Roles)

No external specs/ADRs — requirements fully captured in decisions above.

</canonical_refs>

<code_context>
## Existing Code Insights

Greenfield project — no code exists yet (repo only has `.planning/`, `CLAUDE.md`, `README.md`). No reusable assets, established patterns, or prior integration points to reference. Stack is fixed by PROJECT.md: Next.js (App Router) + Supabase (Postgres/Auth/RLS/Storage).

</code_context>

<specifics>
## Specific Ideas

- The Client's login is provisioned the same way a PM would set up a work account for someone else: PM picks the email, sets a provisional password, and the client is forced to change it on first login.
- The "pending approval" screen is intentionally minimal (static message only) — no self-service actions while waiting.

</specifics>

<deferred>
## Deferred Ideas

- Multiple Client-side users per client company (v1 is 1 login per client) — reconsider if a client's team grows.
- Active notification (beyond in-app) when a PM's signup is approved — v1 relies on the PM retrying login.

### Reviewed Todos (not folded)
None — no pending todos matched this phase.

</deferred>

---

*Phase: 5-Access & Roles*
*Context gathered: 2026-07-01*
