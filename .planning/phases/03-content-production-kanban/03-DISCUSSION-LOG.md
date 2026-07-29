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
