# Roadmap: BackstageEd.OS

## Milestones

- ✅ **v1.0 MVP** — Phases 1-6 (shipped 2026-08-14) — see `.planning/milestones/v1.0-ROADMAP.md`

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

## Progress

| Phase | Milestone | Plans Complete | Status | Completed |
|-------|-----------|-----------------|--------|-----------|
| 1. Client Records & Isolated RAG Setup | v1.0 | 4/4 | Complete | 2026-07-13 |
| 2. Client-Isolated AI Chat | v1.0 | 6/6 | Complete | 2026-08-05 |
| 3. Content Production Kanban | v1.0 | 9/9 | Complete | 2026-08-08 |
| 4. Client Approval & Scheduling | v1.0 | 4/4 | Complete | 2026-08-13 |
| 5. Access & Roles | v1.0 | 6/6 | Complete | 2026-07-16 |
| 6. Admin Oversight Dashboard | v1.0 | 3/3 | Complete | 2026-08-14 |

## Backlog

Captured 2026-08-16 from two conversations with Juliano (original scope discussion + a later refinement pass). Not sequenced into an active milestone yet — none of these start `execute-phase` until Phase 999.6 (Admin's PM/PO control panel) is discussed, planned, and verified. Promote items to the active milestone with `/gsd:review-backlog`; explore any one further with `/gsd:discuss-phase 999.N`.

### Phase 999.1: Seleção de modelo de IA por área da plataforma (BACKLOG)

**Goal:** [Captured for future planning] Permitir escolher/configurar qual modelo de IA é usado em cada ponto de geração (chat de conteúdo, validação de checklist, autofill de briefing, etc.), em vez de um único modelo fixo pra tudo (hoje centralizado em `lib/anthropic/client.ts`, ver quick task 260811-p2c).
**Requirements:** TBD
**Plans:** 0 plans

Plans:
- [ ] TBD (promote with /gsd:review-backlog when ready)

### Phase 999.2: Upload de áudio com transcrição automática no chat (BACKLOG)

**Goal:** [Captured for future planning] Permitir subir áudio no chat com transcrição automática. **Bloqueado:** depende de checagem de custo (transcrição) antes de ser priorizado — não iniciar sem essa checagem.
**Requirements:** TBD
**Plans:** 0 plans

Plans:
- [ ] TBD (promote with /gsd:review-backlog when ready)

### Phase 999.3: Área/Kanban própria do Editor (BACKLOG)

**Goal:** [Captured for future planning] Board dedicado pro papel de Editor, com fila ordenada por `due_date`, mostrando todos os cards atribuídos a ele via `media_assignee_id` — não filtrado por estágio (papel Editor já existe desde 2026-08-12, quick task 260811-oe0; hoje sem uma área própria dedicada).
**Requirements:** TBD
**Plans:** 0 plans

Plans:
- [ ] TBD (promote with /gsd:review-backlog when ready)

### Phase 999.4: Pipeline automático de geração de temas (BACKLOG)

**Goal:** [Captured for future planning] Ao criar um cliente, gerar automaticamente ~10 temas de pauta. Volume de posts/semana configurável por cliente. Gatilho semanal (tipo webhook) para propor novos temas. Fluxo aprovar/rejeitar tema → aprovado gera o post automaticamente. Mantém o padrão já usado no resto do projeto: IA propõe, humano confirma.
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

### Phase 999.6: Painel de controle do Admin sobre POs/PMs (BACKLOG)

**Goal:** [Captured for future planning] Clientes por PM, carga de trabalho, visão gráfica de progresso, e espaço pro Admin comentar na gestão de um PM. Substitui a planilha manual que a Laura mantém hoje. Distinto do Admin Oversight Dashboard já shipped em v1.0 (Phase 6, que é sobre status de cards/clientes, não sobre gestão de PMs). **Nenhum outro item deste backlog entra em execução antes deste fechar e ser verificado** — ver nota no topo desta seção.
**Requirements:** TBD
**Plans:** 0 plans

Plans:
- [ ] TBD (promote with /gsd:review-backlog when ready)

### Phase 999.7: Integração de calendário/reunião → briefing do cliente (BACKLOG)

**Goal:** [Captured for future planning] Puxar automaticamente transcrições de reunião (ferramenta: Gemini, não Granola) pro briefing do cliente, extraindo apenas o que for novo ou interessante por reunião — nunca o transcript inteiro, pra não inchar o campo de briefing. Ideia de usar grupo de WhatsApp como fonte de sinal foi levantada e explicitamente despriorizada pelo Juliano por enquanto.
**Requirements:** TBD
**Plans:** 0 plans

Plans:
- [ ] TBD (promote with /gsd:review-backlog when ready)

### Phase 999.8: Exportação automática em PDF de conteúdos aprovados (BACKLOG)

**Goal:** [Captured for future planning] Gerar um documento único por cliente, puxando todos os cards no estágio "Aprovação do cliente" (data, título, texto da peça, imagem), com um template revisável. Para a v1 deste item, o cliente não precisa necessariamente ter acesso à plataforma — pode ser um artefato que o PM/Juliano gera e envia manualmente por fora. Substituto direto do que hoje provavelmente é feito manualmente em doc/PDF avulso.
**Requirements:** TBD
**Plans:** 0 plans

Plans:
- [ ] TBD (promote with /gsd:review-backlog when ready)

### Phase 999.9: Base de conhecimento comum — escrita restrita a Admin (BACKLOG)

**Goal:** [Captured for future planning] Confirmado pelo Juliano: `shared_knowledge_files` deve ser editável apenas pelo Admin — ele não quer que uma sugestão de PM vire padrão da empresa sem passar por revisão dele. Ação concreta necessária antes de qualquer outra coisa: verificar se a RLS atual de `shared_knowledge_files` já restringe INSERT/UPDATE/DELETE a `is_admin()`, ou se PM ainda tem escrita liberada (implementado em 2026-08-11, quick task 260811-imw, como admin-only por design — a verificação é para confirmar que a RLS reflete isso de fato, não assumir). Se PM tiver escrita liberada, é um ajuste de RLS a fazer, não só uma regra de UI. Naturalmente parte do mesmo trabalho do painel Admin (999.6) — considerar entrar junto.
**Requirements:** TBD
**Plans:** 0 plans

Plans:
- [ ] TBD (promote with /gsd:review-backlog when ready)

---
*Roadmap created: 2026-07-01*
*v1.0 archived: 2026-08-14 — see `.planning/milestones/v1.0-ROADMAP.md` and `.planning/milestones/v1.0-REQUIREMENTS.md`*
*Next: `/gsd:new-milestone` to start v1.1 questioning → research → requirements → roadmap*
