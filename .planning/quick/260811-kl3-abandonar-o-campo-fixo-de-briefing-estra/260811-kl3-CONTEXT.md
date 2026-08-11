# Quick Task 260811-kl3: Briefing estratégico livre por IA - Context

**Gathered:** 2026-08-11
**Status:** Ready for planning

<domain>
## Task Boundary

Abandonar o campo fixo de briefing estratégico (`objective`/`tone_of_voice`/`target_audience`/`content_pillars`) e deixar a IA extrair a estrutura que fizer sentido pra cada arquivo/cliente, sem categorias pré-definidas — P2 do plano de ação de 2026-08-05 (reunião com Juliano), direção "b" escolhida pelo usuário.

Toca: `public.clients` (schema), `lib/validation/clients.ts` (`briefingSchema`), `lib/actions/clients.ts` (`updateBriefing`, `autofillBriefingFromFiles`), `components/clients/client-detail-form.tsx` (formulário), `lib/chat/assemble-prompt.ts` (`briefingBlock` injetado no prompt).

</domain>

<decisions>
## Implementation Decisions

### Formato de armazenamento
- Um único campo de texto livre (Markdown), não um JSON com chaves dinâmicas. A IA escreve o briefing como um documento com suas próprias seções (ex: `## Objetivo`, `## Tom de voz`) dentro do texto, sem schema fixo no banco.

### Migração dos clientes existentes
- **Todos os clientes reais/atuais no banco são dados de teste/fake, não produção real** (confirmado pelo usuário, 2026-08-11) — o usuário vai criar clientes novos pra testar daqui pra frente. Isso significa: **nenhuma lógica de backfill/conversão é necessária**. A migração pode simplesmente trocar o schema (dropar `objective`/`tone_of_voice`/`target_audience`/`content_pillars`, adicionar a nova coluna de texto livre) sem se preocupar em preservar o conteúdo antigo dessas colunas.
- **Importante — isso NÃO é uma instrução pra apagar os registros de cliente em si** (as linhas de `clients`), só uma permissão pra não se preocupar em migrar o CONTEÚDO do briefing antigo. As linhas de cliente continuam existindo, só ficam com o novo campo de briefing vazio até alguém preencher de novo.

### Como editar sem campos fixos
- Um textarea grande (Markdown) — mesmo padrão simples de "Salvar briefing" já existente, só que edita o documento inteiro como um texto único, não 4 campos separados.

### Claude's Discretion
- Nome exato da nova coluna/campo (ex: `briefing_text`, `strategic_briefing`) fica a critério do planner.
- Se o botão "Autofill" (`autofillBriefingFromFiles`) continua existindo como está (gera uma proposta que o PM revisa antes de salvar) ou se muda de alguma forma — deve seguir o MESMO padrão "IA propõe, humano confirma" já estabelecido no resto do projeto, aplicado ao novo formato de texto único em vez dos 4 campos.
- Se `content_pillars` (hoje um array, renderizado como badges removíveis na UI) precisa de algum tratamento especial na transição, ou se simplesmente vira parte do texto livre como qualquer outra seção — fica a critério do planner, mas a decisão de armazenamento (texto único) sugere que sim, vira só mais uma seção do documento.

</decisions>

<specifics>
## Specific Ideas

Nenhuma referência específica de UI/copy trazida além do já estabelecido no restante do app (mesmos primitivos: `Textarea`, `DataCard`, toast de sucesso "Salvo").

</specifics>

<canonical_refs>
## Canonical References

- `.claude/plans/parallel-prancing-map.md` — plano de ação original de 2026-08-05, seção P2
- `.planning/STATE.md` — Pending Todos, entrada P2 (decisão externa, agora resolvida pelo usuário assumindo a decisão)
- Padrão "IA propõe, humano confirma" já usado em `lib/actions/clients.ts` (`autofillBriefingFromFiles`), `lib/actions/checklist-templates.ts` (geração de checklist)

</canonical_refs>
