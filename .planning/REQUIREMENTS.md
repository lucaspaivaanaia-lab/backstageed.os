# Requirements: BackstageEd.OS

**Defined:** 2026-08-16
**Core Value:** Um PM consegue produzir conteúdo para um cliente específico com IA que só conhece aquele cliente (RAG isolado, zero vazamento de contexto), levar esse conteúdo do briefing até a aprovação do cliente dentro da própria plataforma, e o Juliano consegue ver o status real de qualquer card, de qualquer cliente, a qualquer momento.

## v1.1 Requirements

Requirements for the "PM Operations & Content Automation" milestone. Each maps to roadmap phases. Sourced from 9 backlog items (999.1-999.9) captured 2026-08-16 from two stakeholder conversations with Juliano, scoped down to 7 non-blocked items via research + 4 confirmed product decisions (see Key Decisions in PROJECT.md).

### AI Model Selection (MODEL)

- [ ] **MODEL-01**: Admin configura qual modelo de IA é usado em cada ponto de geração (chat, validação de checklist, autofill de briefing, geração de temas, extração de reunião), com fallback pro modelo padrão atual se não configurado
- [ ] **MODEL-02**: Escolha de modelo é um allowlist por área, não um dropdown global — evita quebrar o contrato de forced tool-use que nem todo modelo suporta identicamente

### Admin PM/PO Control Panel (PMOP)

- [ ] **PMOP-01**: Admin vê clientes agrupados por PM
- [ ] **PMOP-02**: Admin vê a carga de trabalho de cada PM (contagem de cards por estágio), reaproveitando `computeWorkload`
- [ ] **PMOP-03**: Admin vê uma visão gráfica (chart) de carga de trabalho/progresso
- [ ] **PMOP-04**: Admin pode deixar comentários privados sobre a gestão de um PM — visíveis só pro Admin, nunca pro PM comentado

### Editor Queue Closeout (EDIT)

- [ ] **EDIT-01**: Fila própria do Editor (cross-client, ordenada por `due_date`, via `media_assignee_id`) confirmada como atendendo a necessidade em formato de lista simples
- [ ] **EDIT-02**: Fila mostra indicador visual de urgência pra prazos próximos/vencidos

### Topic-Generation Pipeline (TOPIC)

- [ ] **TOPIC-01**: ~10 propostas de tema geradas automaticamente ao criar um cliente (estado "proposto", não card real)
- [ ] **TOPIC-02**: Volume de posts/semana configurável por cliente
- [ ] **TOPIC-03**: Gatilho semanal (Vercel Cron) propõe novos temas automaticamente
- [ ] **TOPIC-04**: PM/Admin revisa e aprova ou rejeita cada tema proposto
- [ ] **TOPIC-05**: Aprovar um tema cria um card real via o `createCard` já existente — o cron nunca escreve direto em `cards`

### Meeting → Briefing Integration (MEET)

- [ ] **MEET-01**: PM cola notas de reunião (geradas pelo Gemini) na página do cliente
- [ ] **MEET-02**: IA extrai apenas o conteúdo novo/relevante das notas coladas e propõe uma atualização do briefing
- [ ] **MEET-03**: PM confirma explicitamente a atualização antes de ser persistida
- [ ] **MEET-04**: Notas originais coladas ficam retidas (não descartadas) pra auditoria do que foi extraído vs. descartado

### Client Approval PDF Export (PDF)

- [ ] **PDF-01**: PM/Admin gera sob demanda um PDF por cliente com todos os cards no estágio "Aprovação do cliente"
- [ ] **PDF-02**: PDF inclui data, título, texto da peça e um link de imagem por card (não imagem embutida)
- [ ] **PDF-03**: Falha numa imagem/card individual degrada graciosamente, não derruba a exportação inteira

### Shared Knowledge Base Access (KNOW)

- [ ] **KNOW-01**: RLS de `shared_knowledge_files` confirmada (ou corrigida) pra restringir INSERT/UPDATE/DELETE só a `is_admin()`

## v2 Requirements

Deferred to future release. Tracked but not in current roadmap.

### Cost-Blocked (still in backlog, awaiting a cost check)

- **AUDIO-01**: Upload de áudio com transcrição automática no chat (backlog 999.2)
- **OCR-01**: Verificação ortográfica via OCR em texto de imagem, na etapa de Aprovação interna (backlog 999.5)

### Deferred by this milestone's research

- **MEET-05**: Captura automática de transcrição de reunião via Google Calendar/Meet API real (OAuth) — v1.1 usa colar de texto; auto-capture real fica pra quando/se justificar o investimento em infra OAuth nova
- **PDF-04**: Imagens embutidas de verdade no PDF (via Google Drive API/OAuth) — v1.1 usa link de imagem, não embed
- **PMOP-05**: Comentários do Admin visíveis também pro PM comentado (feedback semi-transparente) — v1.1 é Admin-only
- **PDF-05**: Entrega agendada/por email do PDF — decisão de "sem notificação por email" do projeto continua valendo
- **PMOP-06**: Forecasting de capacidade, horas faturáveis, tendências históricas de carga por PM

## Out of Scope

Explicitly excluded. Documented to prevent scope creep.

| Feature | Reason |
|---------|--------|
| Multi-provider AI routing (não só Claude) | Constraint do projeto fixa geração em Claude; abstração de múltiplos provedores seria over-engineering nessa escala |
| Seletor de modelo por PM/por request | MODEL-01/02 são configuração Admin-only por área, não escolha do PM a cada uso |
| Template/branding múltiplo pro PDF | Um template fixo revisável (React component) é suficiente pra escala atual |
| Dashboard de custo/uso por modelo | Já coberto pelo Anthropic Console |
| Kanban com colunas por estágio pro Editor | Confirmado com o usuário: fila simples ordenada por `due_date` atende (EDIT-01) |

## Traceability

Which phases cover which requirements. Updated during roadmap creation.

| Requirement | Phase | Status |
|-------------|-------|--------|
| MODEL-01 | TBD | Pending |
| MODEL-02 | TBD | Pending |
| PMOP-01 | TBD | Pending |
| PMOP-02 | TBD | Pending |
| PMOP-03 | TBD | Pending |
| PMOP-04 | TBD | Pending |
| EDIT-01 | TBD | Pending |
| EDIT-02 | TBD | Pending |
| TOPIC-01 | TBD | Pending |
| TOPIC-02 | TBD | Pending |
| TOPIC-03 | TBD | Pending |
| TOPIC-04 | TBD | Pending |
| TOPIC-05 | TBD | Pending |
| MEET-01 | TBD | Pending |
| MEET-02 | TBD | Pending |
| MEET-03 | TBD | Pending |
| MEET-04 | TBD | Pending |
| PDF-01 | TBD | Pending |
| PDF-02 | TBD | Pending |
| PDF-03 | TBD | Pending |
| KNOW-01 | TBD | Pending |

**Coverage:**
- v1.1 requirements: 21 total
- Mapped to phases: 0 (populated by roadmapper)
- Unmapped: 21 ⚠️ (expected — roadmap not yet created)

---
*Requirements defined: 2026-08-16*
*Last updated: 2026-08-16 after milestone v1.1 requirements definition, informed by 4-agent research (STACK/FEATURES/ARCHITECTURE/PITFALLS, see .planning/research/SUMMARY.md) and 4 confirmed product decisions*
