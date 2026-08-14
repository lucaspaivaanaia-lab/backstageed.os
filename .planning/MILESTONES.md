# Milestones

## v1.0 MVP (Shipped: 2026-08-14)

**Phases completed:** 6 phases, 32 plans, 72 tasks

**Timeline:** 44 days (2026-07-01 → 2026-08-14) · 538 commits · ~20.7k LOC TypeScript

**Key accomplishments:**

- **Client Records & Isolated RAG Setup** — PM/Admin creates a client record with a strategic briefing and PM assignment; each client gets an isolated RAG context (originally an auto-provisioned Tropicalia project, migrated mid-milestone to direct Supabase `client_files` storage — see Key Decisions), enforced structurally, not by a filter.
- **Client-Isolated AI Chat** — PM chats with Claude scoped to exactly one client at a time, with cross-client isolation live-verified end-to-end against production (not just automated tests); the PM manually curates which exchanges become permanent client knowledge — nothing saves automatically.
- **Content Production Kanban** — PM drives content from briefing through internal review on a drag-and-drop board (single posts and multi-piece "Pacote" packages), gated by a per-client, admin-configurable checklist with an append-only audit trail for any Admin override.
- **Client Approval & Scheduling** — Client reviews their own board and approves or requests an adjustment with a required comment (which routes the card back through internal review); once approved, the PM registers a publish date and the card shows "Pronto para publicar."
- **Access & Roles** — PM signup with admin approval; Client (and later Editor) accounts provisioned by PM/Admin with no self-signup; Supabase RLS enforces every role's data boundary — including a real IDOR gap (unscoped `createClientLogin`/`deactivateClientAccess`) found and closed before ship.
- **Admin Oversight Dashboard** — Juliano gets one consolidated, real-time table across all clients/PMs with staleness badges, drill-down into any client's board, and a per-person workload panel — closing the "someone has to tell him" gap the project was built to remove.

---
