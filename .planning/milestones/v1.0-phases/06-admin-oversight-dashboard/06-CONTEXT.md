# Phase 6: Admin Oversight Dashboard - Context

**Gathered:** 2026-08-13
**Status:** Ready for planning

<domain>
## Phase Boundary

Admin (Juliano) gets a single consolidated view showing the real status of any card, any client, any PM, at any moment, without needing to ask anyone: a cross-client table of cards (client, PM, stage, time-since-update), a visual flag on stalled/overdue cards, drill-down into any specific client's board for full detail, and a workload panel showing how many cards each PM/Editor currently has. This phase does NOT touch PM-facing Kanban mechanics (already complete, Phase 3) or Client-facing approval (already complete, Phase 4) — it is a read-oriented oversight layer on top of data that already exists.

</domain>

<decisions>
## Implementation Decisions

### Format of the consolidated view
- **D-01:** A single cross-client table — one row per card, columns for client, PM (Responsável), stage, and time-since-last-update — filterable/sortable. NOT a merged Kanban across all clients (would get cluttered with many clients/cards at once), NOT a per-client summary-card dashboard. This extends the existing pattern already established in `/admin/cards` (Phase 3 wave 8's cross-client audit screen — `is_admin()`-unrestricted RLS read across every client's cards, no service-role client needed) rather than replacing it with something new.

### "Stalled/overdue" signal
- **D-02:** Computed from `cards.updated_at` — days since last update, no new schema/column. Accepted tradeoff (explicitly acknowledged by the user): any edit resets the clock, not just a stage transition, so this is an approximation of "stalled," not a precise "time in current stage" measure. Exact threshold for the visual flag (e.g. 3 days) is left to the planner.

### Drill-down destination
- **D-03:** Clicking into a specific client/card from the consolidated view navigates to `/pm/board?client={id}` — the same full Kanban+detail+actions experience the PM already uses. This leverages quick task `260812-k6c` (Admin just gained access to `/pm/board`/`/pm/chat`) — no new detail screen needs to be built inside `/admin`.

### Workload panel per PM/Editor
- **D-04:** In scope for this phase (already agreed during the P3 discussion, `260811-lp5-CONTEXT.md`) — a panel showing how many cards each PM/Editor currently has assigned. Exact metrics (total count only, vs. broken down by stage) left to the planner.

### Claude's Discretion
- Exact staleness threshold (days) that triggers the visual "stalled" flag on a card row.
- Exact table columns beyond the four locked (client, PM, stage, time-since-update) — e.g. whether card title/channel/card_type also render inline, and default sort order (likely staleness descending, oldest-stalled-first, but confirm against what's most useful for a daily glance).
- Exact workload panel metrics/layout — total card count per person is the minimum bar; a stage breakdown is a reasonable enhancement if it fits the same page without clutter.
- Whether the drill-down for a specific PM's cards (as opposed to a specific client's) is served by filtering the SAME consolidated table by the PM column (client-side filter, no navigation), or also routes somewhere — ROADMAP's ADM-03 says "drill into any specific client's OR PM's cards," and D-03 only locked the client case (`/pm/board?client=`, which is client-scoped, not PM-scoped) — the planner should design the PM case explicitly, most likely as an in-page filter on the consolidated table rather than a second navigation target, since no PM-scoped equivalent of `/pm/board` exists or is being proposed.
- Whether this lives as a new `/admin` route (e.g. `/admin` root itself, currently just an "Em construção" placeholder — a natural fit) or extends `/admin/cards` in place. Given D-01 explicitly frames this as an extension of `/admin/cards`'s existing pattern, the planner should decide whether that means literally adding columns/sorting/staleness to the existing screen, or a new screen reusing the same query/RLS approach — either is compatible with the locked decisions, but should not duplicate the existing `/admin/cards` screen's purpose (cross-client checklist/override audit trail) without a clear reason.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Project-level context
- `.planning/PROJECT.md` — Core value ("...e o Juliano consegue ver o status real de qualquer card, de qualquer cliente, a qualquer momento — sem depender de alguém avisar" — this phase is literally that core-value bullet)
- `.planning/REQUIREMENTS.md` §Admin Oversight (ADM-01, ADM-02, ADM-03)
- `.planning/ROADMAP.md` §Phase 6 — goal, 3 success criteria, `Depends on: Phase 3, Phase 4` (both now complete), deadline `2026-08-15`

### Prior-phase / prior-session context
- `.planning/quick/260811-lp5-discutir-os-5-itens-do-p3-do-plano-de-a-/260811-lp5-CONTEXT.md` — the P3 discussion that originally deferred the workload panel (item 5) to this phase (D-04 above)
- `.planning/quick/260812-k6c-dar-ao-papel-admin-acesso-s-mesmas-telas/260812-k6c-CONTEXT.md` (and its PLAN/RESEARCH) — Admin's access to `/pm/board`/`/pm/chat`, the direct precedent D-03's drill-down decision leverages
- `.planning/phases/03-content-production-kanban/03-CONTEXT.md` — D-11 (admin checklist override), the origin of `/admin/cards`'s own cross-client audit pattern this phase extends

### Existing code this phase builds on
- `app/admin/cards/page.tsx` + `app/admin/cards/card-audit-panel.tsx` — the exact existing precedent for an `is_admin()`-unrestricted, cross-client `cards` read (no service-role client needed), including the `?client=` filter pattern and `resolvePmNames` usage for displaying PM names instead of raw ids
- `app/pm/board/page.tsx` — the drill-down target (D-03), already Admin-accessible per `260812-k6c`
- `lib/cards/stages.ts` (`STAGE_LABELS`) — stage display labels to reuse for the table's stage column

No external specs/ADRs beyond the above — requirements fully captured in decisions above.

</canonical_refs>

<specifics>
## Specific Ideas

No specific UI/copy references brought beyond what's already established in the rest of the app (same primitives: `Table`, `StatusBadge` for the stalled flag, `resolvePmNames`).

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope. (The workload panel, previously deferred FROM the P3 discussion INTO this phase, is now explicitly in scope per D-04, not deferred further.)

### Reviewed Todos (not folded)
None — no pending todos matched this phase beyond the already-folded workload panel.

</deferred>

---

*Phase: 6-Admin Oversight Dashboard*
*Context gathered: 2026-08-13*
