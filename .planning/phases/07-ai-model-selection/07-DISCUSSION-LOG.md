# Phase 7: AI Model Selection - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-08-16
**Phase:** 7-ai-model-selection
**Areas discussed:** Area granularity, Model allowlist, Settings UI placement, Change visibility/audit

---

## Area granularity

| Option | Description | Selected |
|--------|-------------|----------|
| One row per generation point | 8 independently configurable rows total (6 now + 2 later). Matches research's "per-area allowlist, not global dropdown" finding. | ✓ |
| Two buckets: Chat vs. Structured Extraction | Just 2 settings — simpler UI, but a bad pick affects all 7 structured-extraction areas at once. | |
| You decide | Let the planner pick based on implementation simplicity. | |

**User's choice:** One row per generation point
**Notes:** Confirmed against the 6 real call sites found via codebase scout (chat, propose_briefing, propose_checklist, report_validation, propose_package_pieces, report_transcript_update); must leave room for 2 more from Phases 10/11.

---

## Model allowlist

| Option | Description | Selected |
|--------|-------------|----------|
| Curated 3-tier list | Haiku 4.5, Sonnet 5, Opus 5 only — well-established, broadly-available tiers. Smoke-test each against runStructuredExtraction before shipping. | ✓ |
| Include Fable 5 too | Same 3 tiers plus Fable 5 — would need its own forced-tool-use verification during planning. | |
| You decide | Let the planner pick the exact allowlist based on what's verified to work. | |

**User's choice:** Curated 3-tier list
**Notes:** Forced tool-use compatibility must be smoke-tested per model before the picker ships — treated as a phase gate, not optional polish.

---

## Settings UI placement

| Option | Description | Selected |
|--------|-------------|----------|
| New /admin/settings page | Dedicated settings screen with a new sidebar entry ("Configurações"). | ✓ |
| Fold into an existing admin screen | Add a section to an existing page (e.g. oversight/"Visão geral") — fewer clicks, but crowds an unrelated screen. | |

**User's choice:** New /admin/settings page
**Notes:** No settings page exists today; this is the first one for the project.

---

## Change visibility/audit

| Option | Description | Selected |
|--------|-------------|----------|
| Immediate, no audit trail | Next request after save uses the new model — matches existing role-change pattern. | ✓ |
| Immediate + simple audit log | Same immediate effect, plus a record of who changed which area to which model and when. | |

**User's choice:** Immediate, no audit trail
**Notes:** If a bad choice degrades output, Admin reverts the dropdown manually. Audit trail deferred, not rejected outright.

---

## Claude's Discretion

None — all four areas received explicit user decisions.

## Deferred Ideas

- Audit trail for model changes — revisit only if it becomes a real support/debugging need.
- Fable 5 (or other newer/experimental Claude tiers) in the allowlist — deferred until separately verified against the forced tool-use contract.
