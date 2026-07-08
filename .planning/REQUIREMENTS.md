# Requirements: BackstageEd.OS

**Defined:** 2026-07-01
**Core Value:** Um PM consegue produzir conteúdo para um cliente específico com IA que só conhece aquele cliente (RAG isolado, zero vazamento de contexto), levar esse conteúdo do briefing até a aprovação do cliente dentro da própria plataforma, e o Juliano consegue ver o status real de qualquer card, de qualquer cliente, a qualquer momento.

## v1 Requirements

Requirements for initial release. Each maps to roadmap phases.

### Authentication & Access (AUTH)

- [ ] **AUTH-01**: PM can sign up with email and password
- [ ] **AUTH-02**: New PM signup requires admin approval before gaining access to the platform
- [ ] **AUTH-03**: Admin can view, approve, or reject pending PM signups (rejected accounts are marked rejected, not deleted)
- [ ] **AUTH-04**: Admin can assign a role (PM or Admin) to an approved PM signup
- [ ] **AUTH-05**: User session persists across browser refresh
- [ ] **AUTH-06**: PM can only access clients they are assigned to (enforced via Supabase RLS)
- [ ] **AUTH-07**: Client can only access their own content (enforced via Supabase RLS)
- [ ] **AUTH-08**: Admin can access all clients, PMs, and content
- [ ] **AUTH-09**: PM can create a Client login (email + provisional password) linked to an existing client record — no self-signup or approval queue for Clients
- [ ] **AUTH-10**: Client is forced to change their provisional password on first login
- [ ] **AUTH-11**: PM (or Admin) can deactivate a Client's access

### Client Management (CLI)

- [ ] **CLI-01**: Admin or PM can create a new client record
- [ ] **CLI-02**: Admin can assign one or more PMs to a client
- [ ] **CLI-03**: Each client record stores a Tropicalia `project_id`, isolating that client's RAG context from all others
- [ ] **CLI-04**: PM can fill and edit a client's structured strategic briefing (objective, tone of voice, target audience, content pillars)

### Client-Isolated AI Context (CTX)

- [ ] **CTX-01**: PM can chat with AI about a specific client, with context limited to that client's Tropicalia project
- [ ] **CTX-02**: Switching the active client in the chat switches the entire knowledge base consulted — no context bleeds from one client to another
- [ ] **CTX-03**: PM can manually select a piece of a conversation to save as permanent knowledge for the client — nothing is saved automatically
- [ ] **CTX-04**: Saved knowledge is written as a curated `.md` file and uploaded to the client's Tropicalia project via its upload endpoint
- [ ] **CTX-05**: AI responses are generated via the Claude API using context retrieved from Tropicalia (`generate_answer: false`), with the prompt assembled server-side for tone/system-instruction control

### Content Production — Kanban (KAN)

- [ ] **KAN-01**: PM can create a content card for a client, representing either a single post or a package of related pieces (e.g. a multi-post campaign)
- [ ] **KAN-02**: Card moves through a defined flow: briefing → produção → revisão interna → aprovação do cliente → agendamento
- [ ] **KAN-03**: PM can view all cards for a client as a Kanban board, grouped by state
- [ ] **KAN-04**: When the client requests an adjustment on a card, it returns to the produção stage and must pass revisão interna again before returning to the client
- [ ] **KAN-05**: PM can attach Google Drive links (image, video, PDF) to a card without needing to open Drive directly

### Review Checklist (CHK)

- [ ] **CHK-01**: Admin can define a set of review checklist items required before a card can move to client approval
- [ ] **CHK-02**: Checklist items can be configured differently per client
- [ ] **CHK-03**: PM checks off checklist items on a card during revisão interna, and completion is tracked before the card can advance
- [ ] **CHK-04**: Admin can see, per card, which checklist items were completed and when (auditability — no silently skipped steps)

### Client Approval (APR)

- [ ] **APR-01**: Client can view their content organized as a board of cards ready for their review
- [ ] **APR-02**: Client can approve an individual content item
- [ ] **APR-03**: Client can request an adjustment on an individual content item, with a comment explaining what to change
- [ ] **APR-04**: Adjustment comments are attached to the original card and visible to the PM, not lost in a separate document

### Admin Oversight (ADM)

- [ ] **ADM-01**: Admin can view a consolidated status overview across all clients and PMs
- [ ] **ADM-02**: Admin can identify which cards are stalled/overdue versus on track
- [ ] **ADM-03**: Admin can drill into any specific client's or PM's cards for detail

### Scheduling (SCH)

- [ ] **SCH-01**: Once a card is approved by the client, PM can register the agreed publish date/time on the card
- [ ] **SCH-02**: A card with a registered publish date/time is marked with final status "Pronto para publicar"

## v2 Requirements

Deferred to future release. Tracked but not in current roadmap.

### Integrations

- **INTG-01**: Automatic capture of meeting transcripts via Google Calendar/Meet, feeding client context
- **INTG-02**: WhatsApp channel per PM to feed client context
- **INTG-03**: Automatic publishing via social network APIs (replacing the manual Mlabs step)

### Notifications

- **NOTF-01**: Email notification when a card is approved by the client
- **NOTF-02**: Email notification when a client requests an adjustment
- **NOTF-03**: User can configure notification preferences

## Out of Scope

Explicitly excluded. Documented to prevent scope creep.

| Feature | Reason |
|---------|--------|
| Automatic meeting transcript capture (Calendar/Meet) | Mapped as future integration — not part of the core process v1 solves |
| WhatsApp channel per PM | Mapped as future integration — deferred |
| Automatic publishing via social APIs | v1 only registers date/time and marks "ready to publish"; PM still posts manually via Mlabs |
| Email notifications | v1 is in-app only; PM and client see status changes when they access the platform |
| Self-signup without approval | Every signup (PM or Client) requires admin approval before access — no open registration |

## Traceability

Which phases cover which requirements. Updated during roadmap creation.

| Requirement | Phase | Status |
|-------------|-------|--------|
| AUTH-01 | Phase 5 | Partially done (05-01) |
| AUTH-02 | Phase 5 | Partially done (05-01) |
| AUTH-03 | Phase 5 | Pending (05-02) |
| AUTH-04 | Phase 5 | Pending (05-02) |
| AUTH-05 | Phase 5 | Pending (05-02) |
| AUTH-06 | Phase 5 | Pending (05-03) |
| AUTH-07 | Phase 5 | Pending (05-03) |
| AUTH-08 | Phase 5 | Pending (05-03) |
| AUTH-09 | Phase 5 | Pending (05-04) |
| AUTH-10 | Phase 5 | Pending (05-04) |
| AUTH-11 | Phase 5 | Pending (05-04) |
| CLI-01 | Phase 1 | Pending |
| CLI-02 | Phase 1 | Pending |
| CLI-03 | Phase 1 | Pending |
| CLI-04 | Phase 1 | Pending |
| CTX-01 | Phase 2 | Pending |
| CTX-02 | Phase 2 | Pending |
| CTX-03 | Phase 2 | Pending |
| CTX-04 | Phase 2 | Pending |
| CTX-05 | Phase 2 | Pending |
| KAN-01 | Phase 3 | Pending |
| KAN-02 | Phase 3 | Pending |
| KAN-03 | Phase 3 | Pending |
| KAN-04 | Phase 4 | Pending |
| KAN-05 | Phase 3 | Pending |
| CHK-01 | Phase 3 | Pending |
| CHK-02 | Phase 3 | Pending |
| CHK-03 | Phase 3 | Pending |
| CHK-04 | Phase 3 | Pending |
| APR-01 | Phase 4 | Pending |
| APR-02 | Phase 4 | Pending |
| APR-03 | Phase 4 | Pending |
| APR-04 | Phase 4 | Pending |
| ADM-01 | Phase 6 | Pending |
| ADM-02 | Phase 6 | Pending |
| ADM-03 | Phase 6 | Pending |
| SCH-01 | Phase 4 | Pending |
| SCH-02 | Phase 4 | Pending |

**Coverage:**
- v1 requirements: 38 total
- Mapped to phases: 38
- Unmapped: 0

---
*Requirements defined: 2026-07-01*
*Last updated: 2026-07-08 after stakeholder reprioritization — phase order changed (Access & Roles moved from Phase 1 to Phase 5; Client Records moved from Phase 2 to Phase 1). AUTH-01..03 reworded, AUTH-09..11 added on 2026-07-01 (Client accounts are PM-issued, not self-signup).*
