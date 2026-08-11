# Quick Task 260811-nnw: Geração em lote de peças de Pacote via IA — Research

**Researched:** 2026-08-11
**Domain:** Extensão do padrão "IA propõe, humano confirma" já existente neste código (structured-extraction) para propor uma LISTA de itens (peças de um Pacote) a partir de texto colado ad-hoc, seguida de revisão editável e criação em lote via Server Actions já existentes.
**Confidence:** HIGH (tudo baseado em código já existente no próprio repositório, nenhuma lib nova, nenhum Context7/WebSearch necessário)

## Summary

Esta tarefa não precisa de nenhuma peça de infraestrutura nova. Os três blocos que ela precisa combinar já existem, prontos, no repositório: (1) `runStructuredExtraction`/`buildExtractionPrompt` já aceitam uma lista de "arquivos" (`{filename, content}`) e já têm um precedente EXATO de tratar um texto ad-hoc (não vindo de `client_files`) como mais um item dessa lista — `validateCardAgainstChecklist` já faz isso com o texto do próprio card (`cardContentFile`); (2) `generateChecklistFromFiles` (a variante SEM escrita intermediária no banco, distinta de `generateChecklistDraftFromFiles`) é o padrão exato pedido pelo usuário — proposta em memória, sem tabela intermediária, revisão no client component, confirmação explícita que só então persiste; (3) `createCard` (para o Pacote) + `createPiece` (uma vez por peça, em sequência, nunca em paralelo) já é o par de Server Actions que cria Pacote+peças hoje, e a peça já é criada apenas com `title` — sem `description` no insert atual, o que é uma lacuna real que a próxima seção detalha.

**Primary recommendation:** Nova Server Action `proposePackagePiecesFromText(clientId, text)` em `app/pm/board/actions.ts` (ou um novo arquivo `lib/actions/package-proposal.ts`), que trata o texto colado como um `ExtractionFile` sintético de um item só e chama `runStructuredExtraction` pedindo um array de `{title, description}` — SEM nenhuma escrita no banco. O `CreateCardDialog` ganha um estado `step: "form" | "reviewing"` (novo, local, não uma segunda Dialog): ao confirmar a geração, a lista proposta fica em `useState` no client component, o PM remove itens à vontade, e "Confirmar e criar pacote" dispara `createCard` (1x, cardType "package") seguido de `createPiece` (Nx, sequencial, `await` um de cada vez) — exigindo, porém, que `createPiece`/`createPieceSchema` ganhem um campo `description` opcional, que hoje não existe.

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Colar texto do documento de planejamento | Browser/Client | — | Textarea controlado, mesmo padrão de `pastedText` no `CreateCardDialog` |
| Propor N peças (título+descrição) via IA | API/Backend | — | Nova Server Action que chama `runStructuredExtraction` (Anthropic API), server-only |
| Revisão/edição/remoção da proposta antes de criar | Browser/Client | — | Estado React efêmero (`useState`) no `CreateCardDialog` — CONTEXT.md exige zero tabela intermediária |
| Criação real do Pacote + peças | API/Backend | Database/Storage | `createCard`+`createPiece`, RLS-scoped, sequencial |
| Persistência do Pacote/peças | Database/Storage | — | `public.cards` (schema já existente, `card_type` package/piece) — nenhuma migração necessária |

## Standard Stack

Nenhuma dependência nova. Reaproveita 100% do stack já instalado:

| Módulo | Papel nesta feature |
|--------|----------------------|
| `lib/ai/structured-extraction.ts` (`runStructuredExtraction`) | Chamada única, tool-forced, à Anthropic API |
| `lib/ai/extraction-prompt.ts` (`buildExtractionPrompt`) | Monta o prompt user, client_files + shared_knowledge_files + instrução |
| `lib/actions/checklist-templates.ts` (`generateChecklistFromFiles`/`proposeChecklistFromFiles`) | Padrão de referência mais próximo: proposta em memória, zero escrita, Zod re-valida a saída da IA |
| `app/pm/board/actions.ts` (`createCard`, `createPiece`) | Escrita real, reaproveitadas sem alteração de assinatura de `createCard` |
| `lib/validation/cards.ts` (`createCardSchema`, `createPieceSchema`) | `createPieceSchema` precisa de um campo novo opcional (`description`) — ver Pitfall 1 |

**Instalação:** nenhuma — zero `npm install` necessário para esta tarefa.

## Don't Hand-Roll

| Problema | Não construa | Use em vez disso | Por quê |
|----------|-------------|-------------------|---------|
| Chamada à IA com saída estruturada | Um novo parser de JSON em texto livre, um novo cliente Anthropic | `runStructuredExtraction` (tool-forcing já validado, já com fallback de erro amigável) | É o único lugar do repo que chama a Anthropic API — duplicar quebra a garantia "um só ponto de chamada" documentada no próprio módulo |
| Validar a forma da proposta da IA | Checagens manuais de tipo (`typeof x === "string"`) espalhadas | Um novo `z.object({...}).array()` em `lib/validation/cards.ts`, mesmo padrão de `checklistTemplateSchema` | Security Domain V5 (input validation) — a saída da IA nunca é confiável como já formatada para escrita no banco, mesma disciplina de `proposeChecklistFromFiles` |
| Criação em lote de registros relacionados | `Promise.all(pieces.map(createPiece))` | Loop sequencial com `await` um de cada vez | Mesma razão documentada em `lib/client-files/multi-upload.ts` (quick task 260805-dkr): evitar race condition em checagens read-then-write; `createPiece` hoje não tem um limite de contagem, mas o PADRÃO do projeto para "N chamadas relacionadas da mesma Server Action" é sempre sequencial, nunca paralelo |

**Key insight:** Esta tarefa é 100% recombinação de peças já existentes e testadas. O único código genuinamente novo é: (a) a Server Action de proposta (que é uma cópia estrutural de `proposeChecklistFromFiles`, trocando o schema de saída), e (b) o estado de revisão no `CreateCardDialog` (que é um `useState` a mais, não uma nova Dialog).

## Architecture Patterns

### Pattern 1: Texto ad-hoc tratado como "arquivo" sintético de um item só

**O que:** `buildExtractionPrompt`/`runStructuredExtraction` só conhecem `ExtractionFile[]` (`{filename, content}`). Não existe (nem precisa existir) um segundo caminho de prompt para texto colado — o precedente exato já está em produção: `validateCardAgainstChecklist` empacota o texto do próprio card como um arquivo sintético e o antepõe à lista de `client_files` antes de chamar `runStructuredExtraction`.

**Quando usar:** Sempre que uma fonte de conteúdo não vier de `client_files` mas precisar entrar no mesmo prompt de extração.

**Exemplo (padrão já em produção, `app/pm/board/actions.ts`, `validateCardAgainstChecklist`):**
```typescript
// Fonte: app/pm/board/actions.ts (linhas 648-651, código já existente)
const cardContentFile = {
  filename: "Conteúdo do card (título + descrição)",
  content: `Título: ${card.title}\n\nDescrição: ${card.description ?? "(sem descrição)"}`,
};
// ...
const result = await runStructuredExtraction({
  clientName: client.name,
  clientTag: client.tag,
  files: [cardContentFile, ...(clientFiles ?? [])],
  sharedFiles,
  instruction: "...",
  // ...
});
```

**Como esta tarefa reaproveita:** trocar `cardContentFile` por um `planningDocFile` construído a partir do texto colado, e trocar a ORDEM se fizer sentido (o documento de planejamento é a fonte PRIMÁRIA aqui, não um complemento — considere `files: [planningDocFile, ...(clientFiles ?? [])]`, mantendo `client_files`/`sharedFiles` como contexto de apoio à marca/tom, exatamente como hoje). Recomenda-se extrair essa construção para uma função PURA e testável (mesmo padrão de `cardFieldsFromChatText` em `lib/cards/chat-import.ts`), por exemplo `lib/cards/package-proposal.ts` com `planningDocToExtractionFile(text: string): ExtractionFile`, permitindo teste unitário sem tocar em `runStructuredExtraction` (que é server-only e não testável via `node --test`).

### Pattern 2: Proposta em memória, sem tabela intermediária (o padrão exigido pelo CONTEXT.md)

**O que:** Existem DOIS padrões de "IA propõe, humano confirma" na base, e são DIFERENTES — a escolha certa aqui é a mais simples das duas:

1. `generateChecklistFromFiles` (botão manual do Admin) → chama `proposeChecklistFromFiles`, retorna a proposta **sem escrever nada no banco**, o client component (`TemplateForm`) segura a proposta em estado local, PM edita, e só `createTemplate`/`updateTemplate` persiste.
2. `generateChecklistDraftFromFiles` (gatilho automático no upload) → **escreve** uma linha `checklist_templates` com `status = 'draft'` no banco a cada geração, e só `confirmChecklistDraft` promove esse rascunho a "ativo".

O CONTEXT.md deste quick task é explícito: **"sem nenhuma tabela de banco intermediária (a proposta vive só em memória/estado React até a confirmação)"** — isso mapeia diretamente para o padrão (1), não o (2). Não crie uma tabela `package_proposals` ou similar.

**Exemplo do padrão certo (`lib/actions/checklist-templates.ts`, `generateChecklistFromFiles`/`proposeChecklistFromFiles`):**
```typescript
// Fonte: lib/actions/checklist-templates.ts (já existente) — retorna a
// proposta, NENHUMA escrita no banco acontece aqui.
export type GenerateChecklistResult =
  | { success: true; proposal: ChecklistTemplateInput }
  | { error: string };

async function proposeChecklistFromFiles(client: {...}): Promise<GenerateChecklistResult> {
  // ... runStructuredExtraction ...
  const parsed = checklistTemplateSchema.safeParse({ name: raw.templateName, items: ... });
  if (!parsed.success) return { error: GENERATE_INVALID_RESULT_ERROR };
  return { success: true, proposal: parsed.data };
}
```

**Adaptação para peças de Pacote:** uma nova Server Action `proposePackagePieces(clientId: string, text: string)` retornando `{ success: true; pieces: {title: string; description: string}[] } | { error: string }`. Precisa de um novo schema Zod (ex.: `packagePiecesProposalSchema` em `lib/validation/cards.ts`), espelhando `checklistTemplateSchema`'s convenção de `.min(1)`. O CONTEXT.md deixa a critério do planner o teto de peças ("provavelmente até 10") — expressar isso tanto na `inputSchema` do tool (`description: "1 a 10 peças..."`) quanto no Zod (`.min(1).max(10)`), mesmo padrão de `checklistTemplateSchema`'s `.min(3).max(10)`-por-instrução (o teto do checklist é só uma instrução em texto pro modelo, NÃO um `.max()` no Zod — vale decidir explicitamente no plano se o teto de peças deve ser reforçado no Zod ou só pedido na instrução, já que os dois precedentes do repo divergem entre si nesse ponto específico).

### Pattern 3: Criação sequencial Pacote → N peças

**O que:** `createCard` já cria um Pacote sozinho (`cardType: "package"`, sem `description`/`assignee`). `createPiece` adiciona UMA peça por vez a um pacote já existente, lendo `parentCardId`. Não existe (nem precisa existir) uma Server Action que crie um pacote com peças em uma única chamada.

**Sequência recomendada para o "Confirmar" da prévia:**
```typescript
// Client component (novo código nesta tarefa) — sequencial, nunca Promise.all,
// mesmo padrão de lib/client-files/multi-upload.ts (260805-dkr).
const packageResult = await createCard({
  clientId,
  title: packageTitle,
  cardType: "package",
  channel,           // já vem do Select "Canal" existente no formulário
  stage: targetStage,
});
if ("error" in packageResult) { /* mostra erro, PARA aqui — nenhuma peça é criada */ }

const failures: string[] = [];
for (const piece of reviewedPieces) {           // sequencial, um await por vez
  const result = await createPiece({
    parentCardId: packageResult.cardId,
    title: piece.title,
    description: piece.description,             // requer o novo campo, ver Pitfall 1
  });
  if ("error" in result) failures.push(piece.title);
}
// Falha parcial nunca é silenciosa (mesmo princípio de
// summarizeUploadOutcomes em multi-upload.ts) — se failures.length > 0,
// mostrar quais peças NÃO foram criadas, mas o Pacote e as peças que
// deram certo permanecem (sem rollback do pacote todo).
```

**Por que não há rollback completo:** o Supabase JS client não oferece transação multi-statement (o mesmo motivo documentado no comentário D-15 de `createCard`, sobre o card+snapshot). Um pacote parcialmente populado (algumas peças criadas, outras não) é um estado seguro e recuperável — o PM pode adicionar as peças que falharam manualmente pelo "Adicionar peça" já existente no `PackageRow`. Isso é diferente do caso D-15 (card sozinho entrando direto em revisão sem checklist), que É perigoso o suficiente para justificar rollback; aqui não há gate de segurança em jogo.

## Common Pitfalls

### Pitfall 1: `createPieceSchema`/`createPiece` não têm campo `description` hoje
**O que dá errado:** O card type "Pacote" existente foi desenhado para peças criadas manualmente uma a uma, com título apenas — descrição é preenchida DEPOIS, abrindo o detalhe da peça (`updateCardDetails`). Para geração em lote a partir de um documento de planejamento, cada peça proposta pela IA JÁ TEM um título e uma descrição — perder a descrição na criação obrigaria o PM a copiar/colar manualmente N vezes, destruindo o valor da feature.
**Por que acontece:** `createPieceSchema` (lib/validation/cards.ts) só tem `parentCardId`/`title`; `createPiece`'s insert (app/pm/board/actions.ts) hardcoda `description: null`.
**Como evitar:** Estender `createPieceSchema` com `description: z.string().trim().max(5000).optional()` (mesmo limite de `createCardSchema`) e `createPiece`'s insert para usar `parsed.data.description ?? null` em vez do `null` hardcoded. Isso é uma mudança pequena e aditiva (campo opcional, nenhum call-site existente de `createPiece` — o de `PackageRow.handleAddPiece`, que só envia título — quebra).
**Sinais de alerta:** Se o planner não notar isso, a tarefa "cria" as peças mas com descrição vazia, obrigando um passo manual extra que o CONTEXT.md não previu.

### Pitfall 2: Sem teto de tamanho para o texto colado ad-hoc
**O que dá errado:** `cardFieldsFromChatText`/`handlePasteImport` (o "Colar do chat" já existente) só cortam o resultado DEPOIS de gerado (`.slice(0, 5000)` na descrição) — não há nenhum limite de ENTRADA hoje em nenhum fluxo de colar texto deste projeto. Um "documento de planejamento" colado pode ser bem maior que uma mensagem de chat (múltiplas peças, múltiplas semanas de conteúdo), e não há precedente de cap de tamanho de INPUT em nenhum dos três consumidores de `runStructuredExtraction` — todos leem `client_files` (tipicamente pequenos, ~3 arquivos por cliente) ou o texto de um único card.
**Por que acontece:** Este é o primeiro fluxo do projeto a mandar texto ad-hoc arbitrariamente longo, digitado/colado na hora, para `runStructuredExtraction`.
**Como evitar:** Definir um teto explícito de caracteres no textarea/schema de entrada (ex.: `z.string().trim().min(1).max(20000)` — número exato é decisão do planner/discussão, não travada em nenhum lugar do CONTEXT.md ou código existente). **[ASSUMED]** — nenhum precedente exato no repo para o valor certo.
**Sinais de alerta:** Se não houver cap, um documento muito longo pode estourar `max_tokens: 2048` da resposta (não é o problema — isso é a RESPOSTA, não a entrada) ou aumentar custo/latência sem necessidade; o campo `description` de cada peça na saída da IA continua limitado a 5000 por `createCardSchema`/o novo campo de `createPieceSchema` (Pitfall 1), então o RISCO real é só de custo/latência de input, não de corrupção de dado.

### Pitfall 3: Erro da IA deve ser mostrado verbatim, nunca reformulado
**O que dá errado:** `runStructuredExtraction` já centraliza a mensagem amigável (`EXTRACTION_FAILED_ERROR = "Não foi possível gerar a sugestão da IA agora. Tente novamente em instantes."`) para falha de chamada à Anthropic API ou ausência de bloco `tool_use`. Todo call site existente (`proposeChecklistFromFiles`, `autofillBriefingFromFiles`, `validateCardAgainstChecklist`) simplesmente repassa `result.error` sem reescrever.
**Como evitar:** A nova Server Action de proposta deve fazer o mesmo — `if (!result.ok) return { error: result.error };` — e o client component deve renderizar esse erro dentro de `<ErrorBox>`, exatamente como `CreateCardDialog` já faz com `serverError`.
**Sinal adicional:** Se a saída da IA passar no `tool_use` mas falhar a validação Zod (`packagePiecesProposalSchema.safeParse`), seguir o padrão de `GENERATE_INVALID_RESULT_ERROR`/`VALIDATE_INVALID_RESULT_ERROR` — uma mensagem NOVA e específica desta feature (ex.: "A IA retornou um resultado inesperado. Tente novamente ou crie as peças manualmente."), nunca genérica ao ponto de confundir com falha de rede.

### Pitfall 4: "Colar do chat" hoje ignora completamente o seletor "Tipo"
**O que dá errado:** `handlePasteImport` (a tab "Colar do chat" já existente) cria SEMPRE `cardType: "single"`, hardcoded — mesmo que o Select "Tipo" no formulário "Escrever" esteja em "Pacote". As duas tabs são hoje independentes; a Tab não reage a `isPackageType`.
**Por que importa para esta tarefa:** reforça que a nova UI de geração em lote não pode ser "mais uma opção dentro da tab Colar do chat" sem trabalho extra — ela precisa estar condicionada a `isPackageType` de forma explícita e nova, não reaproveitando a tab existente que já tem esse comportamento hardcoded para "single".
**Como evitar:** Tratar a nova superfície como um bloco/seção condicional renderizado DENTRO da tab "Escrever" quando `isPackageType` é `true` (mesma área onde hoje Descrição/Responsável somem), OU uma nova aba própria da Dialog visível só quando `cardType === "package"`. De qualquer forma, não misturar com `handlePasteImport`.

## Code Examples

### Estado de revisão no `CreateCardDialog` (novo, não existe hoje)
```typescript
// app/pm/board/board-panel.tsx, dentro de CreateCardDialog — novo estado,
// convivendo com activeTab/pastedText já existentes.
type PackagePieceProposal = { title: string; description: string };

const [step, setStep] = useState<"form" | "reviewing">("form");
const [planningDocText, setPlanningDocText] = useState("");
const [proposedPieces, setProposedPieces] = useState<PackagePieceProposal[]>([]);

function handleGeneratePieces() {
  if (!clientId) return;
  setServerError(null);
  startTransition(async () => {
    const result = await proposePackagePieces(clientId, planningDocText);
    if ("error" in result) {
      setServerError(result.error);
      return;
    }
    setProposedPieces(result.pieces);
    setStep("reviewing");
  });
}

function handleRemoveProposedPiece(index: number) {
  setProposedPieces((prev) => prev.filter((_, i) => i !== index));
}
```
`handleOpenChange` (já existente) precisa resetar `step`/`planningDocText`/`proposedPieces` junto com os demais campos, mesmo padrão que já reseta `pastedText`/`activeTab` hoje.

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | Teto de caracteres do texto colado ad-hoc (nenhum precedente exato no repo) | Common Pitfalls, Pitfall 2 | Baixo — se o teto escolhido for muito baixo, PM não consegue colar documentos maiores; se muito alto, custo/latência de chamada à IA sobe sem quebrar nada funcionalmente |
| A2 | Se o teto de peças (CONTEXT.md: "provavelmente até 10") deve ser reforçado no Zod (`.max(10)`) ou só pedido na instrução do prompt (os dois precedentes do repo — checklist de 3-10 itens vs. resultados de validação — divergem nesse ponto) | Architecture Patterns, Pattern 2 | Baixo — se só na instrução, a IA pode ocasionalmente propor mais de 10 e a revisão manual do PM (remover itens) absorve o excesso de qualquer forma |

## Open Questions

1. **`createPieceSchema` deve ganhar `description` agora, ou a peça de lote deveria continuar sem descrição na criação e o PM preenche depois?**
   - O que sabemos: CONTEXT.md diz que a IA propõe "título + descrição cada uma" e que a confirmação cria "o Pacote e as peças" — implica que a descrição faz parte da criação.
   - O que é incerto: se o planner prefere um caminho mais conservador (criar peças só-título, depois um segundo loop de `updateCardDetails` por peça) para não tocar em `createPieceSchema`/`createPiece`.
   - Recomendação: estender `createPieceSchema` (Pitfall 1) — é a rota mais direta e não quebra nenhum call site existente, evitando um segundo round-trip por peça.

2. **A nova Server Action de proposta deve viver em `app/pm/board/actions.ts` (junto de `createCard`/`createPiece`) ou em um novo arquivo `lib/actions/package-proposal.ts`?**
   - O que sabemos: `checklist-templates.ts` mantém proposta+confirmação no mesmo arquivo de domínio; `board/actions.ts` já é o arquivo de domínio de cards/pacotes/peças.
   - O que é incerto: preferência de organização de arquivo — não afeta comportamento.
   - Recomendação: `app/pm/board/actions.ts`, para ficar ao lado de `createCard`/`createPiece`/`removePiece`, mesmo critério de coesão por domínio já usado no repo.

## Sources

### Primary (HIGH confidence — leitura direta do código deste repositório)
- `app/pm/board/board-panel.tsx` — `CreateCardDialog`, `handlePasteImport`, `PackageRow`, `PieceRow`
- `app/pm/board/actions.ts` — `createCard`, `createPiece`, `removePiece`, `validateCardAgainstChecklist` (padrão de "arquivo sintético")
- `lib/cards/chat-import.ts` + `lib/cards/chat-import.test.ts` — padrão de módulo puro testável
- `lib/actions/checklist-templates.ts` — `proposeChecklistFromFiles`/`generateChecklistFromFiles` (padrão de proposta sem escrita) vs. `generateChecklistDraftFromFiles`/`confirmChecklistDraft` (padrão COM rascunho em banco — descartado para esta tarefa por decisão do CONTEXT.md)
- `lib/ai/structured-extraction.ts`, `lib/ai/extraction-prompt.ts` — motor compartilhado
- `lib/validation/cards.ts` — `createCardSchema`, `createPieceSchema`
- `lib/anthropic/client.ts` — `AI_MODEL`/`getAnthropicClient` (server-only)
- `lib/cards/package-rollup.ts` + `.test.ts` — convenção de módulo puro/testável do domínio de pacotes
- `.planning/quick/260811-nnw-.../260811-nnw-CONTEXT.md` — decisões travadas do usuário

### Secondary (MEDIUM confidence)
- `.planning/STATE.md` (entrada de 260805-dkr) — padrão sequencial-nunca-paralelo, aplicado por analogia (não é o mesmo domínio, mas é o único precedente explícito de "N chamadas relacionadas da mesma Server Action" no projeto)

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — zero dependência nova, tudo já em uso
- Architecture: HIGH — os três padrões recomendados (arquivo sintético, proposta sem escrita, criação sequencial) têm precedente EXATO e recente no próprio repositório
- Pitfalls: MEDIUM-HIGH — Pitfalls 1/3/4 são HIGH (lidos diretamente do código); Pitfall 2 (teto de tamanho de texto) é ASSUMED, sem precedente no repo

**Research date:** 2026-08-11
**Valid until:** Estável — válido enquanto `runStructuredExtraction`/`createPiece`/`createCard` não mudarem de assinatura (~30 dias, código interno estável, sem dependência de API externa versionada)
