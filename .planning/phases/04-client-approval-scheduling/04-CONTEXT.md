# Phase 4: Client Approval & Scheduling - Context

**Gathered:** 2026-08-12
**Status:** Ready for planning

<domain>
## Phase Boundary

Client can log in and review their own content — a board of cards ready for their attention plus their full history — and approve an item with one action or send it back with an adjustment comment; the adjustment returns the card to produção, requiring revisão interna again before it reaches the client a second time. Once a card is client-approved, the PM registers the agreed publish date/time, and the card shows a "Pronto para publicar" badge. This phase does NOT touch Phase 3's PM-facing Kanban mechanics (stage advancement, checklist gate, drag-and-drop, Pacote/Peça creation) beyond adding the client-approval/adjustment/publish-date interactions at the two stages (`aprovacao_cliente`, `agendamento`) Phase 3 already reserved for it, and does NOT touch Phase 6's cross-client admin overview.

</domain>

<decisions>
## Implementation Decisions

### Client's board scope
- **D-01:** The Client's `/client` screen shows BOTH the queue of cards currently ready for their review (stage `aprovacao_cliente`) AND their full history — cards already approved/scheduled from past rounds, read-only. Not just an action queue.

### Adjustment comment model
- **D-02:** A single "latest comment" field on the card — overwritten each round, not a threaded history. When the Client requests an adjustment, the comment they write is what the PM sees; no new comments table, no multi-round thread. Matches APR-04's wording ("attached to the original card, visible to the PM") literally — a field on the card, not a separate log.

### Publish date field
- **D-03:** A NEW, separate field for the "agreed publish date/time" (SCH-01) — does NOT reuse `due_date` (added in P3 item 3, quick task 260811-oe0, for the Editor's queue-ordering "prazo"). The two concepts are kept structurally distinct: `due_date` is an internal prioritization/deadline signal a PM may set early and loosely; the SCH-01 field is the FORMAL date the PM registers only after the client has actually approved the card. Exact column name left to the planner (e.g. `publish_at`/`scheduled_at`), but it must be a genuinely new column, not an extension of `due_date`'s meaning.

### "Pronto para publicar" — badge, not a new stage
- **D-04:** No 6th value added to `card_stage` (today `briefing`/`producao`/`revisao_interna`/`aprovacao_cliente`/`agendamento`). "Pronto para publicar" is a visual badge/status shown once a card is in `agendamento` stage AND has the new publish-date field (D-03) set — computed at render time, not stored as a separate stage. Avoids the 2-migration enum-split ceremony the Editor role (P3 item 3) needed, since nothing here requires Postgres to treat it as a distinct enum value anywhere (no RLS/trigger branches on it).

### Claude's Discretion
- Exact RLS design for Client's `cards_select_scoped` branch — today the policy has zero Client-role branch at all (`client_files`/`messages`/`card_attachments`/`card_checklist_items` are similarly Client-inaccessible today). The natural shape mirrors the Editor branch's own precedent (`260811-oe0`, migration `0031`) — scoped by `client_id = (select client_id from profiles where id = auth.uid())`, never broader — but the planner/researcher should confirm the exact predicate against the current `clients_select_scoped`/`profiles.client_id` shape before writing it.
- Whether the Client can see checklist state/PM assignee/Designer-Mídia on a card they're reviewing, or only title/description/attachments — CONTEXT doesn't lock this; default to the MINIMAL surface (title, description, attachments, stage-relevant badges) unless the researcher finds a concrete reason the Client needs more, consistent with this project's "no internal PM coordination details leak to Client" instinct (mirrors why Editor doesn't see `messages`/`client_files` either).
- Exact approve/adjust UI (one-click approve vs. confirm dialog; comment field always visible vs. only shown when requesting adjustment) — implementation detail.
- Whether Pacote pieces are approved individually by the Client (matches Phase 3's D-01/D-02 "pieces advance independently, no package-level checklist gate") or as a whole Pacote — the discussion didn't surface this as needing a fresh decision; the planner should apply Phase 3's own established precedent (individual, per-piece) unless a concrete reason argues otherwise.
- Where PM registers the publish date/time from — likely the same card detail dialog `app/pm/board/board-panel.tsx` already uses for Canal/Responsável/Designer-Mídia/Prazo, gated to only be settable/visible once the card has reached `agendamento` (or been client-approved) — exact gating condition left to the planner.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Project-level context
- `.planning/PROJECT.md` — Core value, Active requirements (client approval/adjustment/publish-date bullets), Constraints (no email notifications in v1, no auto-publish integration)
- `.planning/REQUIREMENTS.md` §Client Approval (APR-01 through APR-04), §Scheduling (SCH-01/SCH-02), §Content Production (KAN-04 — the adjustment-returns-to-produção rule, technically filed under KAN but implemented by this phase per its own Traceability table note)
- `.planning/ROADMAP.md` §Phase 4 — goal, 6 success criteria, `Mode: mvp`, deadline `2026-08-07` (already past as of this discussion — flag during `/gsd:plan-phase 4` the same way Phase 3's own past-deadline was flagged, not something to silently ignore)

### Prior-phase context
- `.planning/phases/03-content-production-kanban/03-CONTEXT.md` — the stage enum this phase's two stages (`aprovacao_cliente`/`agendamento`) were already reserved inside (D-01/D-02 package/piece independence, D-06/D-13 checklist gate rules this phase must not disturb)
- `.planning/phases/05-access-roles/05-CONTEXT.md` — Client login provisioning model (D-01: PM-provisioned, not self-signup; D-09: forced password change) — this phase is the first to give that already-provisioned Client role actual content to see
- `.planning/quick/260811-oe0-item-3-do-p3-plano-de-a-o-2026-08-05-pap/260811-oe0-CONTEXT.md` and `-RESEARCH.md` — the Editor role's RLS-branch precedent (media_assignee_id-scoped `cards_select_scoped`/`clients_select_scoped` additions, the 2-migration enum-split mechanics, and the "RLS decides rows, a dedicated Server Action decides columns" pattern) — directly relevant precedent for designing the Client's own narrow RLS branch and any Client-facing write actions (approve/adjust), even though the Client's scoping predicate (`client_id`, not `media_assignee_id`) is different in shape

### Existing schema this phase builds on
- `supabase/migrations/0015_cards.sql` — `card_stage` enum, `cards` table, `cards_select_scoped`/`cards_update_scoped` (today zero Client-role branch)
- `supabase/migrations/0031_editor_role_rls_and_due_date.sql` — the most recent precedent for adding a role-scoped RLS branch + a new nullable timestamptz column with an index, to mirror for D-03's new publish-date field
- `supabase/migrations/0001_profiles.sql` — `profiles.client_id`, the FK this phase's Client-scoping predicate reads

No external specs/ADRs beyond the above — requirements fully captured in decisions above.

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `app/client/page.tsx` — currently a placeholder ("Em construção"), proven to be reachable via middleware's role-root redirect (AUTH-05) since Phase 5. This phase replaces its body with the real Client board.
- `app/pm/board/board-panel.tsx`'s `CardDetailDialogBody`, `StatusBadge`, `DataCard` — the existing card-detail/board-card rendering primitives this phase's Client-facing views and the PM's new publish-date field should reuse rather than reinvent.
- `lib/cards/stages.ts` (`STAGE_ORDER`/`STAGE_LABELS`/`nextStage`) — the single source of truth for stage progression; D-04 means this file needs NO new stage value, only a derived "Pronto para publicar" computation wherever the badge renders.

### Established Patterns
- RLS + GRANT in the same migration, reusing `is_admin()`/`pm_assigned_clients()` for PM/Admin branches — established since Phase 1, most recently extended for Editor (`0031`). This phase's Client branch should follow the exact same discipline.
- "RLS decides rows, a dedicated Server Action decides columns" — Editor role's `updateCardDescriptionAsEditor` precedent (`app/editor/actions.ts`) is the direct template for the Client's own approve/adjust actions, which will need the same column-restricted write boundary (a Client can only ever write "approve" or "adjustment comment + bounce to produção", never touch stage/assignee/channel/other fields directly).
- `app/pm/board/actions.ts`'s `assertPmOrAdminCaller` (added in `260811-oe0` specifically to close a gap where RLS alone wasn't a sufficient authorization boundary once a second row-scoped role existed) — this phase should audit whether any existing PM/Admin action's RLS scope needs a similar app-layer guard once a Client-scoped RLS branch is added to `cards_update_scoped` (if the planner's design touches that same policy).

### Integration Points
- `middleware.ts`'s `roleRoot` map already has `client: "/client"` wired since Phase 5 — no routing change needed, only the page body.
- New Server Actions likely live in a new `app/client/actions.ts`, mirroring `app/editor/actions.ts`'s file-per-role-surface convention established in `260811-oe0`.

</code_context>

<specifics>
## Specific Ideas

- ROADMAP.md's Phase 4 deadline (`2026-08-07`) has already passed as of this discussion (2026-08-12) — worth flagging to the user during `/gsd:plan-phase 4` the same way Phase 3's own past deadline was flagged, not something to silently ignore.
- The adjustment flow's "back to produção, must pass revisão interna again" (APR-03/KAN-04) is a stage TRANSITION (`aprovacao_cliente` → `producao`), not a new stage — `lib/cards/stages.ts`'s `nextStage` only ever moves forward; this phase needs its own explicit "bounce back" transition, separate from `nextStage`'s forward-only contract, triggered by the Client's adjustment action specifically (not a generic "move to any stage" primitive).

</specifics>

<deferred>
## Deferred Ideas

- Multi-round adjustment history/threading (D-02 explicitly chose single-latest-comment over this) — revisit if the single-comment-per-round model proves insufficient once real usage shows frequent back-and-forth.
- Client-side notification (email or otherwise) when new content is ready for their review — v1 has no notification channel at all (PROJECT.md Constraints), Client finds out by visiting the platform, same as every other role.

### Reviewed Todos (not folded)
None — no pending todos matched this phase.

</deferred>

---

*Phase: 4-Client Approval & Scheduling*
*Context gathered: 2026-08-12*
