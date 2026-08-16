# Roadmap: BackstageEd.OS

## Milestones

- ✅ **v1.0 MVP** — Phases 1-6 (shipped 2026-08-14) — see `.planning/milestones/v1.0-ROADMAP.md`
- 🚧 **v1.1 PM Operations & Content Automation** — Phases 7-12 (in progress)

## Phases

<details>
<summary>✅ v1.0 MVP (Phases 1-6) — SHIPPED 2026-08-14</summary>

- [x] Phase 1: Client Records & Isolated RAG Setup (4/4 plans) — completed 2026-07-13
- [x] Phase 2: Client-Isolated AI Chat (6/6 plans) — completed 2026-08-05
- [x] Phase 3: Content Production Kanban (9/9 plans) — completed 2026-08-08
- [x] Phase 4: Client Approval & Scheduling (4/4 plans) — completed 2026-08-13
- [x] Phase 5: Access & Roles (6/6 plans) — completed 2026-07-16
- [x] Phase 6: Admin Oversight Dashboard (3/3 plans) — completed 2026-08-14

Full phase details, success criteria, and milestone summary archived to `.planning/milestones/v1.0-ROADMAP.md`.

</details>

### 🚧 v1.1 PM Operations & Content Automation (In Progress)

**Milestone Goal:** Dar ao Admin visibilidade e controle sobre a operação dos PMs (substituindo a planilha manual da Laura), enquanto automatiza mais do pipeline de conteúdo (escolha de modelo de IA por área, geração de temas, reunião→briefing, exportação em PDF) e dá ao papel Editor seu próprio espaço de trabalho.

- [ ] **Phase 7: AI Model Selection** - Admin configures which Claude model powers each AI generation point, with safe fallback
- [ ] **Phase 8: Admin PM/PO Control Panel** - Admin sees clients-by-PM, workload, a progress chart, and can leave private comments on a PM; shared knowledge base write access confirmed admin-only
- [ ] **Phase 9: Editor Queue Closeout** - Editor's existing due-date-ordered queue verified/completed with checklist toggle and urgency indicator
- [ ] **Phase 10: Topic-Generation Pipeline** - Topics proposed automatically (on client creation + weekly cron), reviewed and approved into real cards
- [ ] **Phase 11: Meeting → Briefing Integration** - PM pastes meeting notes; AI proposes a delta-only briefing update the PM must confirm
- [ ] **Phase 12: Client Approval PDF Export** - PM/Admin generates an on-demand PDF of a client's approval-stage cards

## Phase Details

### Phase 7: AI Model Selection
**Goal**: Admin can configure which Claude model is used at each AI generation point in the platform (chat, checklist validation, briefing autofill, topic generation, meeting extraction), with a safe fallback to the current default when nothing is configured.
**Depends on**: Phase 6 (extends the centralized `AI_MODEL` constant in `lib/anthropic/client.ts`)
**Requirements**: MODEL-01, MODEL-02
**Success Criteria** (what must be TRUE):
  1. Admin sees a settings screen listing every AI generation point and can pick a model for each from a scoped allowlist (not one global dropdown).
  2. A generation point with no configured model falls back to the current default model without erroring.
  3. Every `runStructuredExtraction` call site (checklist validation, briefing autofill, etc.) still works correctly after wiring in per-area model resolution — forced tool-use is not silently broken by an allowed model choice.
**Plans**: TBD
**UI hint**: yes

### Phase 8: Admin PM/PO Control Panel
**Goal**: Admin has visibility and control over PM operations — clients per PM, workload, a progress chart, and a private comment channel — replacing the manual spreadsheet Laura maintains today; shared knowledge base write access is confirmed restricted to Admin.
**Depends on**: Phase 6 (extends the existing `/admin` oversight page and reuses `computeWorkload`)
**Requirements**: PMOP-01, PMOP-02, PMOP-03, PMOP-04, KNOW-01
**Success Criteria** (what must be TRUE):
  1. Admin sees clients grouped by PM in one view.
  2. Admin sees each PM's workload (card count per stage), reusing `computeWorkload` rather than a new aggregator.
  3. Admin sees a chart visualizing workload/progress across PMs, not just a table.
  4. Admin can leave a private comment about a specific PM's management; the PM being commented on can never read it (Admin-only visibility, live-verified — not just RLS inspection).
  5. `shared_knowledge_files` write access (INSERT/UPDATE/DELETE) is confirmed, live, to be restricted to `is_admin()` — fixed via migration if the confirmation finds a gap.
**Plans**: TBD
**UI hint**: yes

### Phase 9: Editor Queue Closeout
**Goal**: The Editor's own work queue — largely already built in v1.0 — is verified/completed as a simple, due-date-ordered, cross-client list with a working checklist toggle and a visual urgency cue.
**Depends on**: Phase 6 (Editor role, RLS scoping via `media_assignee_id` already shipped)
**Requirements**: EDIT-01, EDIT-02
**Success Criteria** (what must be TRUE):
  1. Editor sees one cross-client queue of every card assigned to them via `media_assignee_id`, ordered by `due_date`.
  2. Editor can toggle/complete checklist items on their assigned cards directly from the queue, using its own independently role-checked action (not a PM/Admin action reused without a guard).
  3. Queue visually flags cards with an approaching or already-past `due_date`.
  4. Flat due-date-ordered list is confirmed (with the user) as satisfying the "Kanban" requirement as originally intended — no stage-grouped columns needed.
**Plans**: TBD
**UI hint**: yes

### Phase 10: Topic-Generation Pipeline
**Goal**: Content topics are proposed automatically — both on client creation and on a weekly cadence — reviewed by PM/Admin, and only become real cards through explicit human approval; the cron job never writes directly to `cards`.
**Depends on**: Phase 7 (both new generation points route through per-area model resolution from day one)
**Requirements**: TOPIC-01, TOPIC-02, TOPIC-03, TOPIC-04, TOPIC-05
**Success Criteria** (what must be TRUE):
  1. Creating a new client automatically generates ~10 topic proposals in a distinct "proposed" state — not real cards.
  2. Admin/PM can configure posts-per-week volume per client.
  3. A weekly Vercel Cron job, authenticated via `CRON_SECRET`, proposes new topics automatically for existing clients without any user session.
  4. PM/Admin can review each proposed topic individually and approve or reject it.
  5. Approving a topic creates a real card through the existing, unmodified `createCard` action — the cron route itself never inserts into `cards`.
**Plans**: TBD
**UI hint**: yes

### Phase 11: Meeting → Briefing Integration
**Goal**: PM pastes Gemini-generated meeting notes on the client page; AI extracts only the new/relevant content and proposes a briefing update that the PM must explicitly confirm before it's persisted, with the original notes retained for audit.
**Depends on**: Phase 7 (new generation point routes through per-area model resolution from day one)
**Requirements**: MEET-01, MEET-02, MEET-03, MEET-04
**Success Criteria** (what must be TRUE):
  1. PM can paste meeting notes into a field on the client page.
  2. AI proposes a briefing update containing only new/relevant content extracted from the notes — not the full pasted transcript merged wholesale.
  3. The proposed update is never persisted automatically; it requires an explicit PM confirmation step first.
  4. The original pasted notes remain retained and queryable after confirmation, so a human can later audit what was extracted vs. discarded.
**Plans**: TBD
**UI hint**: yes

### Phase 12: Client Approval PDF Export
**Goal**: PM/Admin can generate, on demand, a single PDF per client containing every card currently in "Aprovação do cliente," with per-image failures degrading gracefully instead of breaking the whole export.
**Depends on**: Phase 6 (fully independent of Phases 7-11; reuses the existing approval-stage card query shape)
**Requirements**: PDF-01, PDF-02, PDF-03
**Success Criteria** (what must be TRUE):
  1. PM/Admin can trigger, on demand, generation of one PDF for a given client.
  2. The PDF includes every card in the "Aprovação do cliente" stage with date, title, piece text, and an image link (not an embedded image) per card.
  3. If an individual card's image link can't be resolved, that card's export degrades gracefully (e.g., omitted/placeholder image) without failing the entire PDF.
**Plans**: TBD
**UI hint**: yes

## Progress

| Phase | Milestone | Plans Complete | Status | Completed |
|-------|-----------|-----------------|--------|-----------|
| 1. Client Records & Isolated RAG Setup | v1.0 | 4/4 | Complete | 2026-07-13 |
| 2. Client-Isolated AI Chat | v1.0 | 6/6 | Complete | 2026-08-05 |
| 3. Content Production Kanban | v1.0 | 9/9 | Complete | 2026-08-08 |
| 4. Client Approval & Scheduling | v1.0 | 4/4 | Complete | 2026-08-13 |
| 5. Access & Roles | v1.0 | 6/6 | Complete | 2026-07-16 |
| 6. Admin Oversight Dashboard | v1.0 | 3/3 | Complete | 2026-08-14 |
| 7. AI Model Selection | v1.1 | 0/? | Not started | - |
| 8. Admin PM/PO Control Panel | v1.1 | 0/? | Not started | - |
| 9. Editor Queue Closeout | v1.1 | 0/? | Not started | - |
| 10. Topic-Generation Pipeline | v1.1 | 0/? | Not started | - |
| 11. Meeting → Briefing Integration | v1.1 | 0/? | Not started | - |
| 12. Client Approval PDF Export | v1.1 | 0/? | Not started | - |

## Backlog

Captured 2026-08-16 from two conversations with Juliano. Items 999.1, 999.3, 999.4, 999.6, 999.7, 999.8, 999.9 were promoted into v1.1 (Phases 7-12 above, see `.planning/REQUIREMENTS.md` for the resulting MODEL/PMOP/EDIT/TOPIC/MEET/PDF/KNOW requirement IDs). The two remaining items stay cost-blocked in the backlog until a cost check is done — promote with `/gsd:review-backlog` when ready.

### Phase 999.2: Upload de áudio com transcrição automática no chat (BACKLOG)

**Goal:** [Captured for future planning] Permitir subir áudio no chat com transcrição automática. **Bloqueado:** depende de checagem de custo (transcrição) antes de ser priorizado — não iniciar sem essa checagem.
**Requirements:** TBD
**Plans:** 0 plans

Plans:
- [ ] TBD (promote with /gsd:review-backlog when ready)

### Phase 999.5: Verificação ortográfica via OCR em imagens (BACKLOG)

**Goal:** [Captured for future planning] Check acontece na etapa de Aprovação interna, e verifica só texto em imagem — legendas ficam de fora, porque já são geradas por IA e consideradas confiáveis. Motivado por um caso real de erro de digitação em imagem que já gerou atrito com cliente. **Baixa prioridade / mapeado** — não travar outras entregas por causa disso, especialmente se o custo de OCR for alto.
**Requirements:** TBD
**Plans:** 0 plans

Plans:
- [ ] TBD (promote with /gsd:review-backlog when ready)

---
*Roadmap created: 2026-07-01*
*v1.0 archived: 2026-08-14 — see `.planning/milestones/v1.0-ROADMAP.md` and `.planning/milestones/v1.0-REQUIREMENTS.md`*
*v1.1 roadmap created: 2026-08-16 — 6 phases (7-12) derived from 21 v1.1 requirements (MODEL/PMOP/EDIT/TOPIC/MEET/PDF/KNOW), sequenced per research (.planning/research/SUMMARY.md): model selection first (foundational for TOPIC/MEET's new call sites), then near-zero-risk closeout (PMOP, EDIT), then the two genuinely novel-infrastructure features (TOPIC's cron, MEET's delta extraction), then PDF export last (fully independent)*
*Next: `/gsd:plan-phase 7`*
