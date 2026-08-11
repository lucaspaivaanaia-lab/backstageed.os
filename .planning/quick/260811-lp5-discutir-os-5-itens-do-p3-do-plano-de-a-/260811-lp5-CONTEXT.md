# Quick Task 260811-lp5: Discussão dos 5 itens do P3 (plano de ação 2026-08-05) - Context

**Gathered:** 2026-08-11
**Status:** Ready for planning (per-item — ver nota abaixo)

<domain>
## Task Boundary

Discussão exploratória dos 5 itens do P3 do plano de ação de 2026-08-05 (backlog, próxima sprint per Juliano, usuário pediu para discutir tudo antes de qualquer código): (1) dois canais por cliente, (2) geração de conteúdo em lote a partir de um documento de planejamento, (3) papel de acesso "Editor", (4) segundo campo de atribuição no card, (5) painel de carga de trabalho por pessoa no Admin.

**Esta CONTEXT.md não vira UM plano só.** Nenhum dos 5 itens mapeia limpo pra uma fase única do ROADMAP (itens 3/4 tocariam fases já fechadas — Fase 5 e Fase 3 respectivamente; item 5 é o próprio escopo da Fase 6, ainda TBD; itens 1/2 são capacidade nova). Por isso a discussão foi feita como quick task (`/gsd-quick --discuss`), não `/gsd-discuss-phase`. Planejamento/execução de cada item, quando chegar a vez, deve ser uma quick task separada referenciando esta CONTEXT.md — não uma única PLAN.md pros 4 itens que seguem adiante.

</domain>

<decisions>
## Implementation Decisions

### Item 1 — "Dois canais por cliente"
- **Não são dois boards Kanban separados.** É uma tag/tipo no board único já existente por cliente — cards ganham um rótulo "Planejamento" vs "Conteúdo" em vez de duplicar toda a estrutura de board/colunas/RLS por cliente. Mais leve, reaproveita a infraestrutura de `cards`/`board-panel.tsx` já construída.

### Item 2 — Geração de conteúdo em lote
- **Reaproveitar o card type "Pacote"** já existente (Fase 3, onda 9 — `card_type='package'`, `packageRollupLabel`, peças com checklist próprio cada uma, `createPiece`/`removePiece`). A IA lê o documento de planejamento único e propõe N peças dentro de um Pacote, em vez de um fluxo de geração em lote totalmente novo e desacoplado. Reduz drasticamente o escopo de implementação — é majoritariamente um novo ponto de entrada de IA (`runStructuredExtraction`-style) que popula peças de um Pacote existente/novo, não uma feature de infraestrutura nova.

### Item 3 — Papel de acesso "Editor"
- **Editor pode editar, não pode avançar estágio.** Vê e edita descrição/checklist dos cards atribuídos a ele, igual um PM — mas não pode mover o card entre estágios do Kanban, nem criar/atribuir cards. Precisa de investigação de como isso se encaixa no modelo de RLS existente (`pm_assigned_clients()`, `cards_update_scoped`, etc. — hoje só há papéis PM/Admin/Client) antes de qualquer plano.

### Item 4 — Segundo campo de atribuição no card
- **Puramente informativo.** Mais uma pessoa marcada no card (ex: Designer/Mídia), sem lógica de trava — igual o "Responsável" de hoje, só que um segundo campo. Não afeta checklist, não afeta avanço de estágio, não gera nenhuma nova regra de autorização.

### Item 5 — Painel de carga de trabalho por pessoa (Admin)
- **NÃO construir agora.** Fica registrado como escopo da Fase 6 (Admin Oversight Dashboard — "Juliano consegue ver o status real de qualquer card, qualquer cliente, a qualquer momento"), que ainda está `TBD` no ROADMAP.md. Não vira quick task nesta rodada — só fica capturado aqui para quando a Fase 6 for formalmente planejada (via `/gsd-plan-phase 6` ou `/gsd-discuss-phase 6`, quando chegar a vez).

### Claude's Discretion
- Item 1: exato nome/valores do campo de tipo/tag ("Planejamento"/"Conteúdo" vs outros termos), onde ele aparece na UI do card (badge? filtro no board?).
- Item 2: como a IA decide quantas peças criar a partir de um documento de planejamento, e se o Pacote resultante precisa de algum metadado novo (ex: origem = "gerado em lote") ou se um Pacote comum já é suficiente.
- Item 3: desenho exato do RLS/authz para o papel Editor — se é um valor novo em `profiles.role` (hoje provavelmente `pm`/`admin`/`client`) e como as policies existentes precisam se ramificar sem quebrar o modelo PM/Admin já testado por pgTAP.
- Item 4: nome exato do segundo campo (ex: `designer_id`, `media_assignee_id`), se é um único campo ou lista, se aparece no board/filtros.

</decisions>

<specifics>
## Specific Ideas

Nenhuma referência específica de UI/copy trazida além do já estabelecido no restante do app.

</specifics>

<canonical_refs>
## Canonical References

- `.claude/plans/parallel-prancing-map.md` — plano de ação original de 2026-08-05, seção P3
- `.planning/STATE.md` — Pending Todos, entrada P3
- `.planning/ROADMAP.md` — Fase 3 (Kanban, fechada — onde vive o card type "Pacote"), Fase 5 (Access & Roles, fechada — onde vivem os papéis hoje), Fase 6 (Admin Oversight Dashboard, TBD — onde o item 5 se encaixa)
- Card type "Pacote" (item 2): `lib/cards/package-rollup.ts` (`packageRollupLabel`), `createPiece`/`removePiece` em `app/pm/board/actions.ts`, `board-panel.tsx`'s seção "Pacotes"

</canonical_refs>
