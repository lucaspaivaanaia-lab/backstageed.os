# Phase 1: Client Records & Isolated RAG Setup - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-07-08
**Phase:** 1-Client Records & Isolated RAG Setup
**Areas discussed:** Dev-auth workaround mechanics, Strategic briefing form shape, Tropicalia provisioning failure handling, Client list & PM assignment UI

---

## Dev-auth workaround mechanics

User arrived at this discussion having already decided on a workaround (seed a hardcoded admin via SQL in the Supabase dashboard) to avoid building Phase 5's full login/approval UI early. Codebase scouting found this workaround was incomplete: `middleware.ts` already redirects unauthenticated visitors to `/login`, but no `/login` page/action exists (only `/signup` and `/pending` were built in 05-01) — so the seeded admin would have no way to actually get a browser session.

| Question | Option | Description | Selected |
|---|---|---|---|
| How should the seeded admin get a browser session? | Build a minimal /login page now | Email+password form + Server Action, reuses shadcn pattern | ✓ |
| | Supabase Studio impersonate/session-per-session | Zero new code, awkward for repeated testing | |
| | One-off dev script minting a session cookie | Fastest, but no clickable UI for Juliano/collaborator | |
| Seed Admin only, or Admin + PM? | Seed both Admin and PM | Lets both role views in the success criteria be exercised | ✓ |
| | Admin-only | Simpler, but can't verify PM-scoped UI/RLS | |
| Throwaway login or pull forward Phase 5's real login? | Minimal/throwaway now | Matches "no architecture change" framing, keeps Phase 1 scope tight | ✓ |
| | Build Phase 5's actual login now | Avoids redoing work, but pulls paused-phase scope forward | |
| Match shadcn style or bare-bones? | Match existing shadcn style | Costs nothing extra, consistent with Phase 5's own UI-SPEC | ✓ |
| | Bare-bones unstyled | Slightly faster, looks broken for real testing | |

**User's choice:** Minimal `/login` page, shadcn-styled, seeding both Admin and PM users, scoped as throwaway for Phase 1-4 (Phase 5 formalizes later).
**Notes:** This resolves the gap the user's original workaround description didn't cover (no `/login` page existed).

---

## Strategic briefing form shape

| Question | Option | Description | Selected |
|---|---|---|---|
| Pilares de conteúdo shape? | Structured add/remove list | Reusable by later phases (chat, cards) | ✓ |
| | Free-text textarea | Faster, loses structure | |
| Other 3 fields (objetivo, tom de voz, público-alvo) shape? | Free text for all three | Narrative fields fit free text | ✓ |
| | Structured (e.g. dropdown presets) | Loses nuance for AI-context fields | |
| Single form or wizard? | Single form, all fields on one page | Only 4 fields, no wizard needed | ✓ |
| | Multi-step wizard | Unjustified complexity | |
| Briefing required at creation? | Optional, fillable later | Matches Sub-phase 1A's own scope | ✓ |
| | Required before client is "created" | Contradicts Sub-phase 1A scope | |

**User's choice:** Structured pillars list; free text for the other three fields; single-page form; briefing optional at creation.
**Notes:** None beyond the selections.

---

## Tropicalia provisioning failure handling

| Question | Option | Description | Selected |
|---|---|---|---|
| On provisioning-call failure, what happens to the client record? | Client still created, project_id null, retry available | Decouples client CRUD from external API reliability | ✓ |
| | Whole creation rolls back | Ties app reliability to Tropicalia uptime | |
| Retry mechanism? | Manual retry button | No job-queue infra needed for v1 scale | ✓ |
| | Automatic background retry | Disproportionate infra for this scale | |
| Can client be edited while RAG is pending/failed? | Yes, editing is decoupled from RAG status | Doesn't block legitimate work | ✓ |
| | No, client unusable until RAG ready | Blocks unrelated work | |

**User's choice (via free text after the third question):** Skip further structured questions — API key isn't available yet (Juliano needs to supply it). Directed: add `TROPICALIA_API_KEY` as an empty placeholder in `.env.local`; every Tropicalia call must null-check the key and skip silently (no error, no attempt) when absent, setting `tropicalia_project_id = null` and showing a "pending RAG setup" status; client creation works end-to-end without Tropicalia; integration activates automatically once the key is added, no code changes needed.
**Notes:** This is a distinct case from the three structured questions above, not a replacement — key-present-but-call-fails still gets the manual retry-button flow; key-absent gets a silent skip with no retry button (nothing to retry until the key exists). Both captured in CONTEXT.md as D-08 through D-11.

---

## Client list & PM assignment UI

| Question | Option | Description | Selected |
|---|---|---|---|
| Who sees the client list? | Admin sees all; PM sees only assigned clients | Matches existing RLS exactly, no new access logic | ✓ |
| | Everyone sees all clients | Contradicts existing RLS policy | |
| Where does PM assignment happen? | Multi-select picker on client create/edit form | One place to create and staff a client, fits small scale | ✓ |
| | Separate "manage assignments" screen | Extra navigation not justified at this scale | |
| What does each list row show? | Name, assigned PM(s), briefing status, RAG status | Surfaces the two incomplete-state signals that matter | ✓ |
| | Name only | Hides exactly the signals worth seeing at a glance | |

**User's choice:** RLS-matched visibility; multi-select PM picker on the client form; name + PMs + briefing status + RAG status as list columns.
**Notes:** None beyond the selections.

---

## Claude's Discretion

- Exact copy/wording of the "RAG setup pendente" status label and retry button.
- Client list layout (table vs. card grid) — column set is locked, visual layout is not.
- Briefing edit UX (inline edit vs. separate edit mode/page).
- Storage shape for "pilares de conteúdo" (`text[]` vs. `jsonb`) — structure is locked, schema shape is not.
- Exact `/login` page copy and error-message strings.

## Deferred Ideas

None — discussion stayed within phase scope. One implementation conflict was flagged (not deferred, just noted for research/planning): the existing `clients_insert_admin_only`/`clients_update_admin_only` RLS policies from `0004_rls_policies.sql` only allow admins to create/edit clients, but CLI-01/CLI-04 require PM access too — a new migration is needed to resolve this, captured in CONTEXT.md's canonical_refs section.
