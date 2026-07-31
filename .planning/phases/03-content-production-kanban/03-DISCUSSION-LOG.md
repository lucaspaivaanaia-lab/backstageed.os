# Phase 3: Content Production Kanban - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-07-29
**Phase:** 3-Content Production Kanban
**Areas discussed:** Pacote de conteúdo, Templates de checklist, Avanço de estágio, Anexos do Drive

---

## Pacote de conteúdo (package model)

| Option | Description | Selected |
|--------|-------------|----------|
| Card pai + sub-cards | Um card "pacote" contém vários sub-cards (uma peça cada), cada um com seu próprio estágio | ✓ |
| Card único com múltiplas peças anexadas | Uma unidade só, todas as peças avançam juntas pelo mesmo estágio | |

**User's choice:** Card pai + sub-cards (recommended option)
**Notes:** None beyond the initial choice.

---

## Checklist no pacote (follow-up)

| Option | Description | Selected |
|--------|-------------|----------|
| Por sub-card | Cada peça tem seu próprio checklist e avança independentemente | ✓ |
| Uma vez pro pacote inteiro | Só existe um checklist no card pai; sub-cards são só organização visual | |

**User's choice:** Por sub-card (recommended option)

---

## Templates de checklist

| Option | Description | Selected |
|--------|-------------|----------|
| Template reutilizável, aplicável a vários clientes | Admin cria templates (ex: "Padrão", "Cliente Premium") e atribui um a cada cliente | ✓ |
| Checklist independente por cliente, sem templates | Cada cliente configurado do zero, sem reuso | |

**User's choice:** Template reutilizável (recommended option)

---

## Edição de template (follow-up)

| Option | Description | Selected |
|--------|-------------|----------|
| Mudança vale só pra cards novos | Card "congela" a lista de itens no momento em que entra em revisão interna | ✓ |
| Muda pra todos, inclusive cards em andamento | Card sempre reflete a versão atual do template | |

**User's choice:** Mudança vale só pra cards novos (recommended option)

---

## Avanço de estágio (stage advancement mechanic)

| Option | Description | Selected |
|--------|-------------|----------|
| Botão explícito "Avançar" no card | PM clica um botão pra avançar; bloqueado se checklist incompleto | ✓ |
| Arrastar e soltar entre colunas | Drag-and-drop no board, precisa de lib nova | |

**User's choice:** Botão explícito "Avançar" (recommended option)

---

## Bloqueio do avanço (follow-up)

| Option | Description | Selected |
|--------|-------------|----------|
| Botão desabilitado até completar | "Avançar" fica inativo enquanto houver item pendente | ✓ |
| Botão clicável, mostra erro ao tentar | PM pode clicar a qualquer momento; erro aparece se algo pendente | |

**User's choice:** Botão desabilitado até completar (recommended option)

---

## Anexos do Drive

| Option | Description | Selected |
|--------|-------------|----------|
| Lista de links simples, com ícone por tipo | Sem preview/thumbnail, sem API do Drive | ✓ |
| Com preview/thumbnail incorporado | Precisa de integração real com a API do Google Drive | |

**User's choice:** Lista de links simples (recommended option)

---

## Validação de link (follow-up)

| Option | Description | Selected |
|--------|-------------|----------|
| Múltiplos links, validar formato de URL do Drive | Sem limite de quantidade; confirma padrão drive.google.com antes de aceitar | ✓ |
| Múltiplos links, sem validação de formato | Aceita qualquer URL colada, sem checagem | |

**User's choice:** Múltiplos links, validar formato (recommended option)

---

## Wrap-up check

Asked whether any other gray area needed discussion before writing CONTEXT.md. User selected "Pronto pro contexto" — no additional areas raised.

## Claude's Discretion

- Exact schema shape for cards/sub-cards (self-referencing FK vs. separate pieces table)
- How a package's aggregate status is rolled up/displayed on the board
- Exact checklist template data model (and how the D-04 snapshot is implemented — row copy vs. frozen JSON)
- Regex/validation pattern for "looks like a Google Drive link"
- Exact Kanban column/board visual layout and card summary fields
- Whether Admin gets a manual override to force-advance past a blocked checklist gate — explicitly flagged as an open question for planning, not silently decided either way, since it affects the CHK-04 audit-trail guarantee

## Deferred Ideas

- Real Google Drive API integration (OAuth, file picker, embedded previews/thumbnails) — explicitly out of scope per the Drive-attachment decisions; link-paste + format validation only for this phase.

---
---

# Re-discussion: 2026-07-31 (mid-execution re-scope)

> Triggered after the developer used the shipped 03-01/03-02 board (Wave 1 and 2 executed and human-verified) and asked for drag-and-drop plus a more Trello-like card experience. This reverses D-05 above (kept in CONTEXT.md, marked superseded, not deleted) and adds new scope beyond the original KAN/CHK requirements.

**Date:** 2026-07-31
**Phase:** 3-Content Production Kanban
**Areas discussed:** Drag-and-drop mechanism, Card creation entry point, Card description field, Card assignees

---

## Drag-and-drop mechanism

| Option | Description | Selected |
|--------|-------------|----------|
| dnd-kit | Modern, maintained, accessible — current standard for React Kanban | ✓ |
| react-beautiful-dnd | Trello-like feel, but archived/unmaintained since 2022 | |
| You decide | Planner picks at plan time | |

**User's choice:** dnd-kit (recommended option)

| Option | Description | Selected |
|--------|-------------|----------|
| Keep both | Avançar button stays as accessible fallback; drag is additional | ✓ |
| Drag-and-drop only | Remove Avançar entirely | |

**User's choice:** Keep both (recommended option)

| Option | Description | Selected |
|--------|-------------|----------|
| Snap back, same error as Avançar | Gate applies identically regardless of trigger | ✓ |
| Drag disabled entirely while blocked | Card can't be picked up at all | |

**User's choice:** Snap back, same error as Avançar (recommended option)

---

## Card creation entry point

| Option | Description | Selected |
|--------|-------------|----------|
| Any column, no restriction | Per-column "+" on all 5 stages, matches Trello screenshot | ✓ |
| Only Briefing/Produção | Restricts per-column "+" to pre-gate stages | |
| Any column, gate applies retroactively | Flexible but consistent | |

**User's choice:** Any column, no restriction (matches the Trello reference screenshot)

| Option | Description | Selected |
|--------|-------------|----------|
| Yes, keep both | Top-level button (always Briefing) + per-column "+" | ✓ |
| No, replace it entirely | Only per-column "+" | |

**User's choice:** Yes, keep both (recommended option)

**Follow-up (not originally offered as a discrete option, asked to close a gap the "any column" answer opened):** If a card is created directly in revisão interna or later, does it get the checklist snapshot immediately?

| Option | Description | Selected |
|--------|-------------|----------|
| Yes, snapshot immediately | Same gating as a card arriving normally, preserves CHK-04 | ✓ |
| No, no checklist required | Faster but breaks the audit-trail guarantee | |

**User's choice:** Yes, snapshot taken immediately (recommended option)
**Notes:** This closes a gap the "any column, no restriction" choice would otherwise leave open — without it, a directly-created card in revisão interna could bypass the checklist entirely.

---

## Card description field

| Option | Description | Selected |
|--------|-------------|----------|
| Plain text, multi-line | No formatting, matches project's zero-rich-text convention | ✓ |
| Markdown-rendered | Needs a new markdown rendering dependency | |

**User's choice:** Plain text, multi-line (recommended option)

| Option | Description | Selected |
|--------|-------------|----------|
| Detail view only | Board face stays compact | ✓ |
| Preview on board face too | Needs a new DataCard text-preview slot | |

**User's choice:** Detail view only (recommended option)

| Option | Description | Selected |
|--------|-------------|----------|
| Optional | Can be added/edited later | ✓ |
| Required at creation | Must fill in before creating | |

**User's choice:** Optional (recommended option)

---

## Card assignees

| Option | Description | Selected |
|--------|-------------|----------|
| Yes — scoped to client's assigned PMs (pm_clients) | Can't assign to a PM outside that client's team | ✓ |
| Something else | Free-text alternative | |

**User's choice:** Yes — assignee = which of the client's assigned PMs owns this card

| Option | Description | Selected |
|--------|-------------|----------|
| Single assignee | One PM at a time, simpler UI (Select) | ✓ |
| Multiple assignees | Needs multi-select + join table | |

**User's choice:** Single assignee (recommended option)

| Option | Description | Selected |
|--------|-------------|----------|
| Optional | Can be unassigned, picked up later | ✓ |
| Required at creation | Must pick before creating | |

**User's choice:** Optional (recommended option)

---

## Wrap-up check

Asked whether anything else was unclear, referencing the user's earlier message which trailed off after "...informações que seja" — user confirmed "I'm ready for context," no additional areas raised.

## Superseded Decisions

- **D-05** ("Avançar button only, no drag-and-drop") — superseded by D-12/D-13. Kept in CONTEXT.md marked superseded rather than deleted, since 03-02 was already built and merged under the original decision.

## Deferred Ideas

- None this round — all four areas the developer raised were folded directly into CONTEXT.md as new locked decisions (D-12 through D-19), per their explicit choice to expand Phase 3's scope rather than defer to a future phase.
