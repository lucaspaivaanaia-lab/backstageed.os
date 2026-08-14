# Project Retrospective

*A living document updated after each milestone. Lessons feed forward into future planning.*

## Milestone: v1.0 — MVP

**Shipped:** 2026-08-14
**Phases:** 6 | **Plans:** 32 | **Quick tasks:** 36 | **Commits:** 538

### What Was Built

- Client records with an isolated per-client RAG context (structural isolation via RLS, not a filter) and a strategic briefing.
- A client-scoped AI chat with manual knowledge curation — nothing saved automatically.
- A drag-and-drop content Kanban (single posts and multi-piece packages) gated by a per-client, admin-configurable checklist with an audited override path.
- Client-facing approval: approve or request adjustment with a comment, then PM-registered publish scheduling.
- Full role-based access (PM, Client, Admin, and a later Editor role) enforced end-to-end by Supabase RLS.
- A consolidated, real-time Admin oversight dashboard with staleness badges, drill-down, and a workload panel.

### What Worked

- **Live human checkpoints consistently caught real bugs before merge**, not just cosmetic ones — the Phase 3/4/6 phase-gate checkpoints and several quick-task checkpoints (260810-g3f, 260810-jl0, 260808-ci5) each found and fixed a genuine defect during the live walkthrough itself, not after. Treating the checkpoint as a real test, not a rubber stamp, paid for itself repeatedly.
- **The plan-checker caught security-relevant blockers before they shipped**, most notably in the Editor-role quick task (260811-oe0): widening `cards_update_scoped` for the Editor accidentally also authorized three existing PM/Admin Server Actions that had never had their own role check, only relying on RLS. Caught and closed in round 1 of review, before execution.
- **Mid-execution re-scoping was handled without derailing the phase.** Phase 3's 2026-07-31 re-scope (drag-and-drop, per-column creation, description/assignee fields) inserted three new plan waves mid-flight rather than replanning from scratch, and the original 03-04/03-05/03-06 simply moved later in the sequence.
- **A dormant seed (SEED-001) captured a deliberately-deferred architectural change** (RAG catalog/llms.txt indirection) with a clear trigger condition instead of either building it prematurely or losing the idea.

### What Was Inefficient

- **A recurring environment gap slowed several quick tasks**: executor worktrees consistently lacked `.env.local`/hosted Supabase credentials, so migrations had to be applied by the orchestrator after merge rather than by the executor inline (260722-hnm, 260805-kio, 03-05, 260808-ci5 all hit this). A per-worktree credential-provisioning step would have saved a round-trip each time.
- **Docker was never available in any execution environment**, so the Phase 5 pgTAP RLS suite (AUTH-06/07/08) went unexecuted through the entire planned phase (05-03) and only ran for the first time in a dedicated later plan (05-06) — which then immediately surfaced a missing `GRANT` that static review had no way to catch. The suite existed and was statically correct for weeks before anyone could prove it actually passed.
- **05-VERIFICATION.md was never re-run after its gaps were closed** (via quick tasks 260716-au8/b8w/bjk and plan 05-05), so the milestone-close audit still flagged it as `gaps_found` a month later — required manual cross-referencing against ROADMAP.md and STATE.md to confirm it was actually stale, not live. A verification doc should be re-run (or at minimum re-flagged) the moment its cited gaps are closed, not left for the next full audit to untangle.
- **The milestone-close audit tool (`gsd-sdk query audit-open`) produced a large number of false positives** — all 36 quick tasks were flagged "missing" despite every one having a `SUMMARY.md` with completion evidence, and one resolved debug session was flagged open because the audit matched the *index* file (`knowledge-base.md`) rather than an actual session file. Worth fixing the tool's status-parsing before the next milestone close, since it currently requires a manual spot-check to tell real gaps from noise.

### Patterns Established

- **"AI proposes, human confirms"** is the standing pattern for every AI-assisted write path in this codebase (briefing autofill, checklist generation, card validation, batch content proposals) — nothing the AI generates is persisted without an explicit human confirm step, confirmed repeatedly as the right call by the stakeholder across multiple features.
- **Structural isolation over filtering** — RLS scoping by `client_id`/`media_assignee_id` is the single multi-tenancy mechanism for every table, reused identically from Phase 1's `clients` table through the Editor role's cross-client card visibility in the final milestone stretch.
- **Soft delete over hard delete** for anything a real client's data could touch (`clients.archived_at`) — chosen live under time pressure once real production data was at stake, and never revisited.

### Key Lessons

1. When a verification doc's gaps are closed by follow-up work (quick task, later plan), re-run or re-flag that verification immediately — don't let the next full-project audit be the first thing to notice it's stale.
2. Confirm hosted/Docker credentials are available in every fresh executor worktree before planning a phase that touches migrations or pgTAP — this project hit the same "worktree lacks `.env.local`" gap at least five separate times across the milestone.
3. Treat live checkpoints as real tests worth the time, not a formality — every phase-gate checkpoint in this milestone found something the automated suite couldn't (an F5-reload redirect bug, an Admin route lockout, a stale-comparison save bug), consistently justifying the walkthrough.

### Cost Observations

- Sessions: not tracked precisely across this milestone (single long-running collaborative session interleaved with quick tasks over 44 days).
- Notable: most feature work after the initial 4 roadmap phases arrived as `/gsd-quick` tasks against a single 2026-08-05 stakeholder action plan rather than new roadmap phases — quick tasks proved to be the right granularity for fast-turnaround, stakeholder-driven iteration once the core architecture was in place.

---

## Cross-Milestone Trends

### Process Evolution

| Milestone | Sessions | Phases | Key Change |
|-----------|----------|--------|------------|
| v1.0 | 1 (44 days) | 6 | Established RLS-as-multi-tenancy, "AI proposes/human confirms," and quick-task-driven post-roadmap iteration as standing patterns |

### Cumulative Quality

| Milestone | Tests | Coverage | Zero-Dep Additions |
|-----------|-------|----------|---------------------|
| v1.0 | 185 JS + pgTAP suite (18 files) at close | Not formally measured | dnd-kit, unpdf, mammoth, @anthropic-ai/sdk |

### Top Lessons (Verified Across Milestones)

1. Live human checkpoints at phase gates consistently catch real defects automated suites miss — worth keeping mandatory for every phase gate going forward.
