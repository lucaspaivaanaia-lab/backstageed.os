# Phase 3: Content Production Kanban - Context

**Gathered:** 2026-07-29
**Re-discussed:** 2026-07-31 — mid-execution re-scope (see below)
**Status:** Ready for planning (re-plan required for waves 3-6 and a revision to already-merged 03-02)

<domain>
## Phase Boundary

PM can take a content idea from briefing through internal review: create a card for a client (single post or a package of related pieces), attach Google Drive links, move it through the stages briefing → produção → revisão interna, and be structurally blocked from advancing past revisão interna until that client's checklist is fully checked off — with a full audit trail of who checked what and when. This phase does NOT include client-facing approval or the adjustment loop (that's Phase 4 — aprovação do cliente and agendamento are terminal-looking stages this phase's board displays, but the interactions at those stages belong to Phase 4), and does NOT include Phase 6's cross-client admin overview.

**Added 2026-07-31 (mid-execution re-scope, after the developer used the shipped 03-01/03-02 board and asked for a more Trello-like experience):** the board also supports drag-and-drop stage advancement (alongside the existing Avançar button), per-column card creation, and two new card fields — a plain-text description and a single optional PM assignee. See the new decisions section below; D-05 is superseded, not deleted.

</domain>

<decisions>
## Implementation Decisions

### Package model (KAN-01)
- **D-01:** A "pacote de conteúdo" is a parent card containing multiple sub-cards, one per piece. Each sub-card advances through stages independently — pieces in a campaign don't have to move in lockstep.
- **D-02:** The checklist for revisão interna applies per sub-card, not once for the whole package. Each piece gets its own review and its own audit trail; there is no package-level checklist state, only aggregated visibility (Claude's discretion on exact rollup — see below).

### Checklist templates (CHK-01, CHK-02)
- **D-03:** Checklists are reusable templates, not defined from scratch per client. Admin creates one or more templates (e.g., "Padrão", "Cliente Premium") and assigns one to each client — avoids recreating the same list when multiple clients share a review process.
- **D-04:** A card's checklist is snapshotted (copied) at the moment it enters revisão interna, not live-bound to the template. Editing a template afterward only affects cards that enter revisão interna after the edit — in-progress cards keep the item list they started with. This prevents a template edit from silently un-checking or adding items to a card mid-review.

### Stage advancement (KAN-02, KAN-03, CHK-03)
- **D-05 (SUPERSEDED 2026-07-31 — see D-12/D-13):** ~~Advancing a card to the next stage is an explicit "Avançar" button on the board, not drag-and-drop. No new drag-and-drop dependency needed.~~ Kept for history — 03-02 was built and merged under this decision before the reversal. See D-12 for the current rule.
- **D-06:** Leaving revisão interna, the "Avançar" button is disabled (not clickable-then-erroring) while any checklist item on that card/sub-card is unchecked — the PM sees at a glance what's blocking, never gets a rejected click. **Still in force** — D-13 extends this same rule to drag-and-drop.

### Google Drive attachments (KAN-05)
- **D-07:** Attachments are links, not uploaded files or an embedded picker — no Google Drive API/OAuth integration in this phase (ROADMAP.md's own success criterion says "links", not files; this also matches PROJECT.md's split of Drive-for-heavy-media / Supabase-for-structured-data without requiring live Drive API access).
- **D-08:** Rendered as a simple list per card: icon by type (image/vídeo/PDF) + label + opens in a new tab. No thumbnail/preview fetched from Drive — that would require real API integration, out of scope here.
- **D-09:** No cap on the number of links per card. The app validates that a pasted URL matches the Google Drive link shape (e.g. `drive.google.com/...`) before accepting it — catches an obviously wrong paste without needing OAuth to actually query Drive.

### Board navigation (carried forward from Phase 2 precedent)
- **D-10:** The Kanban board follows the same navigation pattern Phase 2 established for chat (02-CONTEXT.md D-01): a dedicated screen with a client switcher, not nested under `app/pm/clients/[id]/*`. Not re-discussed in depth this session — flagged here as an assumption carried forward by precedent, not a fresh decision; researcher/planner should confirm it still fits once the sidebar/nav (from the 260728-uab design-system quick task) is accounted for.

### Admin checklist override (CHK-04)
- **D-11:** Admin has a manual override to force-advance a card past a blocked checklist gate (unchecked items). The override itself is logged in the same audit trail as regular checklist checks — who triggered it, when, and which items were still unchecked at the time — so CHK-04's "no step can be silently skipped" guarantee holds even when the gate is bypassed. Resolved 2026-07-29 via `/gsd:plan-phase 3` (was flagged as a genuine open question, not decided silently).

### Drag-and-drop stage advancement (added 2026-07-31 — supersedes D-05)
- **D-12:** The board adds drag-and-drop card movement using **dnd-kit** (modern, maintained, keyboard/screen-reader accessible — no DnD library existed in the codebase before this). The explicit "Avançar" button from D-05 **stays** as an accessible fallback; dragging is an additional way to advance a card, not a replacement.
- **D-13:** The checklist gate applies identically regardless of trigger. Dragging a card out of revisão interna with unchecked items is rejected client-side (the card snaps back to its column) with the same blocked-checklist message the Avançar button already shows (D-06) — there is no separate DnD-only gate bypass.

### Card creation entry point (added 2026-07-31)
- **D-14:** Each of the 5 stage columns gets its own "+" create-card trigger (Trello-style), in addition to the existing top-level "Criar card" button (which always creates in Briefing). A card can be created directly in ANY column, including revisão interna or later — no restriction to Briefing/Produção.
- **D-15:** A card created directly in revisão interna (or later) gets its checklist snapshot taken immediately, exactly as if it had just arrived there via Avançar or drag — CHK-04's audit-trail guarantee applies to directly-created cards too, not just cards that transitioned normally.

### Card description field (added 2026-07-31)
- **D-16:** Cards get a new plain-text, multi-line description field (no markdown/rich-text — matches the project's existing zero-rich-text-editor convention for briefing fields and chat).
- **D-17:** The description is shown only in the card detail view, not on the board face — the board card stays compact (title + badges), matching the already-built `DataCard` primitive.
- **D-18:** The description is optional at card creation — can be added or edited later from the card detail view, same as the current title-only creation flow.

### Card assignee field (added 2026-07-31)
- **D-19:** Cards get a new single, optional assignee field — one PM "owns" the card at a time. The assignee picker is scoped to that client's already-assigned PMs (`pm_clients`), not all PMs in the system — you can't assign a card to a PM who isn't on that client's team. Optional at creation, matches description's optional pattern.

### Claude's Discretion
- Exact schema shape for cards/sub-cards (e.g. self-referencing `parent_card_id` vs. a separate `card_pieces` table) — D-01/D-02 lock the *behavior* (independent sub-card advancement, per-sub-card checklist), not the table design.
- How a package's aggregate status is rolled up and displayed on the board (e.g., "3/5 pieces em revisão interna" summary badge on the parent) — D-02 only locks that there's no package-level checklist gate, not how the parent visually summarizes its children.
- Exact checklist template data model (e.g., template + template_items tables, and how the "snapshot at entry" from D-04 is implemented — copy rows vs. a frozen JSON blob on the card).
- Regex/validation pattern for "looks like a Google Drive link" (D-09) — any reasonable match against known Drive URL shapes (`drive.google.com`, `docs.google.com`) is acceptable; not a hard security boundary, just a paste-mistake catcher.
- Exact Kanban column/board visual layout, card summary fields shown on the board vs. only on the card detail view.
- Exact UI/wording for the admin override action (D-11) — e.g. a confirmation modal requiring a reason string vs. a plain confirm — and whether override is scoped to Admin only or also available to PMs (default: Admin only, per CHK-01/CHK-02's admin-configures-checklists precedent, unless planner finds a reason otherwise).

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Project-level context
- `.planning/PROJECT.md` — Core value, constraints (Drive for heavy media / Supabase for structured data split; small-scale v1 — no job queues/cron justified), Key Decisions log
- `.planning/REQUIREMENTS.md` §Content Production — Kanban (KAN) and §Review Checklist (CHK) — KAN-01/02/03/05, CHK-01/02/03/04, the full requirement set this phase implements. Note KAN-04 (client adjustment loop) is explicitly Phase 4's, not this phase's, per the Traceability table.
- `.planning/ROADMAP.md` §Phase 3 — goal, the 6 success criteria, deadline 2026-07-28 (already past as of this discussion — flag to the user during planning that the roadmap deadline needs updating or the phase needs re-dating)

### Prior-phase context
- `.planning/phases/02-client-isolated-ai-chat/02-CONTEXT.md` — D-01: dedicated-screen-with-client-switcher navigation pattern (D-10 above carries this forward for the Kanban board)
- `.planning/phases/01-client-records-isolated-rag-setup/01-CONTEXT.md` — D-04: "pilares de conteúdo" as a structured tag list on the client record — Phase 3 cards may reference individual pillars; D-13: multi-select picker pattern already used for PM-to-client assignment, a similar pattern likely fits checklist-template-to-client assignment (D-03)
- `.planning/phases/05-access-roles/05-CONTEXT.md` — role model (PM/Admin/Client) this phase's RLS must follow (PM sees/edits cards for clients they're assigned to; Admin sees/configures everything; Client has no access to Kanban internals in this phase — that's Phase 4's board)

### Design-system foundation (quick task 260728-uab, 2026-07-29)
- `.planning/quick/260728-uab-upgrade-de-ui-ux-sistema-de-design-de-ve/` — the reusable component layer this phase is meant to build on top of, not reinvent: `components/ui/data-card.tsx` (DataCard — generic card primitive, explicitly designed with the Kanban in mind but with zero Kanban-specific logic yet), `components/ui/status-badge.tsx` (StatusBadge — for stage/checklist-status pills), `components/ui/error-box.tsx`, `components/layout/app-sidebar.tsx` (persistent nav shell), `components/layout/page-shell.tsx` (PageShell/PageTitle/SectionTitle/EmptyState + the formalized typography/spacing token scale in `app/globals.css`).

### Existing schema this phase builds on
- `supabase/migrations/0002_clients_stub.sql` + `0006_clients_full_record.sql` — the `clients` table (including `content_pillars text[]`) new card tables will foreign-key into.
- `supabase/migrations/0004_rls_policies.sql` — `is_admin()`, `pm_assigned_clients()` helpers. Every new table this phase adds (cards, sub-cards, checklist templates, checklist items, card checklist state, Drive links) must reuse these in its RLS policies and ship its `GRANT` in the same migration as its RLS policies (repeated lesson across Phases 1, 2, 5 — local `supabase start` does not mirror hosted default privileges).
- `supabase/migrations/0010_messages.sql` and `0011_client_files.sql` — the two most recent examples of the established RLS+GRANT-same-migration pattern to mirror exactly for new card-related tables.

No external specs/ADRs beyond the above — requirements fully captured in decisions above.

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `components/ui/data-card.tsx` (`DataCard`) — generic card with slots for title/badge/meta/actions, built in the 260728-uab design-system task as a Kanban-ready primitive. **Update 2026-07-31:** now needs a dnd-kit `useSortable`/draggable wrapper per D-12 — the underlying DataCard visual/slot structure stays, only the interaction layer around it changes.
- `components/ui/status-badge.tsx` (`StatusBadge`) — tone-based badge (success/warning/danger/neutral/info) already used for briefing/RAG-file/access status elsewhere; a natural fit for stage labels and checklist-complete indicators.
- `components/layout/app-sidebar.tsx` — persistent nav; a new "Cards"/"Board" entry needs to be added to the PM (and possibly Admin) nav item list.
- `components/ui/table.tsx` (refined in 260728-uab) — if any Kanban-adjacent list view (e.g., admin's checklist template management) ends up tabular rather than card-based.
- Four Supabase client factories (`lib/supabase/*.ts`) — use directly for any new card/checklist routes/actions, same as every prior phase.

### Established Patterns
- Server Actions co-located with each route (`app/(auth)/signup/actions.ts`, `app/pm/chat/actions.ts` pattern) — follow for new card-creation, stage-advance, checklist-check, and Drive-link actions.
- RLS + GRANT in the same migration, reusing `is_admin()`/`pm_assigned_clients()` — established since Phase 1, reinforced in Phases 2 and the 260722-hnm RAG migration.
- Multi-select picker pattern (PM assignment on client create/edit form) — likely reusable for checklist-template assignment to a client.
- `PageShell`/`PageTitle`/`SectionTitle`/`EmptyState` + the sidebar shell (260728-uab) — every new screen in this phase should be built on these from the start, not styled ad-hoc and migrated later like `admin/clients` had to be.

### Integration Points
- New routes likely live under `app/pm/*` for the board/card creation/checklist-check UI (PM-facing, per existing role-scoped route-group convention), and `app/admin/*` for checklist-template management (Admin-configured, per CHK-01/CHK-02).
- `app/pm/layout.tsx` and `app/admin/layout.tsx` (from 260728-uab) need a new sidebar nav item added for the Kanban board / checklist templates respectively.
- No Google Drive API code exists anywhere in the codebase yet — confirms D-07 (link-only, no real API integration) keeps this phase from needing net-new OAuth/API-key infrastructure.

</code_context>

<specifics>
## Specific Ideas

- ROADMAP.md's Phase 3 deadline (2026-07-28) has already passed as of this discussion (2026-07-29) — worth flagging to the user during `/gsd:plan-phase` so the roadmap can be updated, not something to silently ignore.
- The success criteria explicitly list stages through "agendamento" as board columns/states the card can reach, but the actual PM-facing interactions at "aprovação do cliente" and "agendamento" belong to Phase 4 (client approval) — this phase just needs the card's stage field to be able to reach and display those states, not build UI for what happens there.
- **Added 2026-07-31:** the developer referenced a Trello board screenshot (columns per goal/category, cards with title + labels + assignee avatars, "+ Add another card" per column) as the visual/interaction model to match for D-12/D-14 — column-per-stage layout with per-column card creation and drag-and-drop, not the current button-only flow.

</specifics>

<deferred>
## Deferred Ideas

- Real Google Drive API integration (OAuth, file picker, embedded previews/thumbnails) — explicitly deferred by D-07/D-08; the current phase only needs link-paste + format validation. Revisit if the "no preview" experience proves insufficient in practice.

### Reviewed Todos (not folded)
None — no pending todos matched this phase (`todo.match-phase` returned 0 matches).

</deferred>

---

*Phase: 3-Content Production Kanban*
*Context gathered: 2026-07-29*
*Re-discussed: 2026-07-31 (mid-execution re-scope — D-12 through D-19)*
