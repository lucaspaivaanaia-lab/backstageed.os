# Quick Task 260811-nnw: Geração de conteúdo em lote via Pacote - Context

**Gathered:** 2026-08-11
**Status:** Ready for planning

<domain>
## Task Boundary

Item 2 do P3 do plano de ação de 2026-08-05: geração de conteúdo em lote a partir de um único documento de planejamento, reaproveitando o card type "Pacote" já existente (Fase 3, onda 9) — a IA lê o documento e propõe N peças dentro de um Pacote, em vez de um mecanismo novo e desacoplado (decisão já travada em `260811-lp5-CONTEXT.md`).

Toca: fluxo de criação de card no board (`components`/`app/pm/board/board-panel.tsx`'s `CreateCardDialog`), uma nova Server Action de extração via IA (padrão `runStructuredExtraction`), e a criação de Pacote+Peças (`createCard`/`createPiece` em `app/pm/board/actions.ts`).

</domain>

<decisions>
## Implementation Decisions

### Onde o PM fornece o documento
- **Dentro do fluxo de criar Pacote já existente** — não é um botão/dialog novo e separado. Ao escolher tipo "Pacote" no `CreateCardDialog` já existente, aparece uma opção adicional pra colar um documento de planejamento em vez de (ou além de) criar peças manualmente.

### Como o PM fornece o texto
- **Colar texto**, mesmo padrão simples já usado na aba "Colar do chat" (`handlePasteImport`) — um textarea, sem upload de arquivo. Sem extração de PDF/DOCX nesta rodada.

### Revisão antes de criar
- **Prévia antes de criar, mesmo padrão "IA propõe, humano confirma"** já usado em `autofillBriefingFromFiles`/`generateChecklistDraftFromFiles`. A IA propõe uma lista de peças (título + descrição cada uma), o PM revisa, pode remover alguma da lista, e só então confirma — o Pacote e as peças só são de fato criados no banco depois dessa confirmação explícita. Não cria nada direto no banco a partir da proposta da IA.

### Claude's Discretion
- Quantas peças a IA decide propor a partir de um documento — sem número fixo mínimo/máximo imposto pelo usuário; usar julgamento (provavelmente com um teto razoável tipo "até 10", a decidir no planejamento).
- Se o Pacote resultante precisa de algum metadado novo (ex: origem = "gerado em lote") ou se um Pacote comum, criado pelo fluxo normal de `createCard`, já é suficiente — a decisão de reaproveitar o mecanismo de Pacote (já travada) sugere que não precisa de metadado novo, mas fica a critério do planner confirmar.
- Formato exato do prompt/instrução pra IA (`instruction`/`toolDescription`/`inputSchema` do `runStructuredExtraction`) — usar o padrão já estabelecido de "array de peças, cada uma com título e descrição", análogo ao já usado em `generateChecklistDraftFromFiles`.
- Onde exatamente a UI de prévia/revisão aparece — inline no mesmo `CreateCardDialog` (expandindo o formulário) ou uma segunda etapa/dialog — fica a critério do planner, desde que preserve o padrão de review antes da criação real.

</decisions>

<specifics>
## Specific Ideas

Nenhuma referência específica de UI/copy trazida além do já estabelecido no restante do app (mesmos primitivos: textarea de colar texto, padrão de prévia editável).

</specifics>

<canonical_refs>
## Canonical References

- `.planning/quick/260811-lp5-discutir-os-5-itens-do-p3-do-plano-de-a-/260811-lp5-CONTEXT.md` — decisão macro do item 2 (reaproveitar Pacote)
- `.claude/plans/parallel-prancing-map.md` — plano de ação original de 2026-08-05, seção P3
- Card type "Pacote": `lib/cards/package-rollup.ts` (`packageRollupLabel`), `createPiece`/`removePiece` em `app/pm/board/actions.ts`, seção "Pacotes" em `board-panel.tsx`
- Padrão "IA propõe, humano confirma": `lib/actions/clients.ts` (`autofillBriefingFromFiles`), `lib/actions/checklist-templates.ts` (`generateChecklistDraftFromFiles`/`confirmChecklistDraft`)
- Motor de extração estruturada compartilhado: `lib/ai/structured-extraction.ts` (`runStructuredExtraction`), `lib/ai/extraction-prompt.ts` (`buildExtractionPrompt`)
- Padrão de colar texto já existente: `handlePasteImport`/`cardFieldsFromChatText` em `board-panel.tsx`/`lib/cards/chat-import.ts`

</canonical_refs>
