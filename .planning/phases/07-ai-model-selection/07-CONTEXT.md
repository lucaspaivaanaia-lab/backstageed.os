# Phase 7: AI Model Selection - Context

**Gathered:** 2026-08-16
**Status:** Ready for planning

<domain>
## Phase Boundary

Admin can configure which Claude model powers each individual AI generation point in the platform, replacing the single hardcoded `AI_MODEL` constant. A generation point with no explicit configuration falls back to the current default model. Requirements: MODEL-01, MODEL-02.

</domain>

<decisions>
## Implementation Decisions

### Area granularity
- **D-01:** One configurable row per generation point, not a coarser bucket. Today that's 6 real call sites: `chat` (streaming, `app/api/chat/route.ts`), `propose_briefing` (briefing autofill, `lib/actions/clients.ts`), `propose_checklist` (checklist generation, `lib/actions/checklist-templates.ts`), `report_validation` ("Revalidar com IA", `app/pm/board/actions.ts`), `propose_package_pieces` (batch content from pasted planning doc, `app/pm/board/actions.ts`), `report_transcript_update` (meeting-transcript merge, `lib/actions/client-files.ts`). The settings shape must leave room for 2 more rows Phases 10 (topic generation) and 11 (meeting extraction) will add later — don't hardcode "6 areas" anywhere, derive the list so new areas can register themselves.
- Rejected: a 2-bucket "Chat vs. Structured Extraction" split — a bad model choice would silently affect all 7 structured-extraction areas at once instead of being isolated to one.

### Model allowlist
- **D-02:** Curated 3-tier allowlist only: Haiku 4.5, Sonnet 5, Opus 5. No Fable 5 or other experimental tiers in this phase.
- **D-03:** Each allowlisted model must be smoke-tested against `runStructuredExtraction`'s forced tool-use (`tool_choice: { type: "tool", name }`) contract before the picker ships — research flagged this as not guaranteed identical across models. This is a phase gate, not optional polish.

### Settings UI placement
- **D-04:** New `/admin/settings` page with its own sidebar entry ("Configurações"), not folded into an existing admin screen (oversight page, checklist templates, etc.). Admin-only, same access-control pattern as the rest of `/admin/*`.

### Change visibility/audit
- **D-05:** A model change takes effect on the very next request after save — same immediate-effect pattern already used for role changes (`middleware.ts` re-reads `profiles.role` fresh every request). No audit log/history table for this phase — if a bad choice degrades output, the Admin reverts the dropdown. (Deferred: an audit trail if this ever becomes a real support need — see Deferred Ideas.)

### Claude's Discretion
None — all four areas got explicit user decisions, no "you decide" picks.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Existing model/extraction seam
- `lib/anthropic/client.ts` — current single `AI_MODEL` constant (`process.env.ANTHROPIC_CHAT_MODEL ?? "claude-sonnet-4-5"`) and its own code comment anticipating this exact phase: "no user-facing selector — that's a future decision." `getAnthropicClient()` singleton factory to extend, not replace.
- `lib/ai/structured-extraction.ts` — the shared `runStructuredExtraction()` engine every non-chat generation point calls through; uses forced tool-use (`tool_choice: { type: "tool", name: params.toolName }`), the exact place per-area model resolution must plug in.
- `.planning/research/SUMMARY.md` §"Recommended Stack" and §"Critical Pitfalls" #4 — full rationale for the settings-table + allowlist approach and the forced-tool-use compatibility risk.
- `.planning/research/STACK.md` — verified current Claude model IDs against the installed `@anthropic-ai/sdk@0.112.4` type definitions.

No other external specs — requirements fully captured in decisions above.

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `lib/anthropic/client.ts`'s `getAnthropicClient()` singleton — extend with a `getModelForArea(area)` lookup sitting in front of it, don't replace the factory pattern.
- `components/ui/select.tsx` (shadcn) — existing Select primitive, already used elsewhere in admin forms (e.g. role assignment), reusable for the per-area model dropdown.
- The existing Admin-only route-gating pattern (`middleware.ts` path-prefix check + `is_admin()` RLS) — the exact precedent to follow for `/admin/settings`.

### Established Patterns
- "AI proposes, human confirms" is NOT directly relevant here (this phase is config, not generation) — but MODEL-01/02 must not break that invariant for the 7 areas that already implement it.
- Server-only module discipline: `lib/anthropic/client.ts` is explicitly server-only (never imported into a Client Component) — any new settings-lookup module must follow the same boundary.

### Integration Points
- 6 existing call sites needing to switch from the bare `AI_MODEL` import to an area-aware lookup: `app/api/chat/route.ts`, `lib/actions/clients.ts`, `lib/actions/checklist-templates.ts`, `app/pm/board/actions.ts` (2 call sites), `lib/actions/client-files.ts`.
- New `/admin/settings` route + sidebar entry in `app/admin/layout.tsx` (same file that already added the "Produção" entry for Admin access in quick task 260812-k6c).

</code_context>

<specifics>
## Specific Ideas

No specific UI mockup or reference given — standard shadcn admin-form conventions apply (matches the existing checklist-template and client-detail forms).

</specifics>

<deferred>
## Deferred Ideas

- **Audit trail for model changes** (who changed which area to which model, when) — explicitly deferred in the Change visibility/audit discussion. Not needed now; revisit only if it becomes a real support/debugging need.
- **Fable 5 (or other newer/experimental Claude tiers) in the allowlist** — deferred until separately verified against `runStructuredExtraction`'s forced tool-use contract.

### Reviewed Todos (not folded)
None — no pending todos matched this phase (`todo.match-phase` returned 0 matches).

</deferred>

---

*Phase: 7-ai-model-selection*
*Context gathered: 2026-08-16*
