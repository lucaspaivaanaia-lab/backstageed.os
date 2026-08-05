---
phase: quick-260805-fuu
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - lib/cards/chat-import.ts
  - lib/cards/chat-import.test.ts
  - components/ui/tabs.tsx
  - app/pm/board/board-panel.tsx
  - app/pm/chat/chat-panel.tsx
autonomous: false
requirements: [QUICK-260805-FUU]

must_haves:
  truths:
    - "O cabeçalho de /pm/board mostra UM único botão \"Criar card\" — o botão separado \"Importar do chat\" não existe mais"
    - "O modal \"Criar card\" tem duas abas: \"Escrever\" (formulário atual: Título + Conteúdo do post + Responsável) e \"Colar do chat\" (caixa única de colagem)"
    - "A aba \"Colar do chat\" cria o card com o MESMO comportamento de hoje: primeira linha do texto (limitada a 200 chars) vira o título, o texto completo (limitado a 5000 chars) vira o conteúdo, e uma colagem vazia cai no título-fallback \"Conteúdo importado do chat\""
    - "Os gatilhos \"+\" por coluna continuam abrindo esse mesmo modal já apontando para a etapa daquela coluna, nas duas abas"
    - "Em /pm/chat aparece um botão \"Enviar pro Kanban\" apenas ao lado da ÚLTIMA resposta da IA — nunca em mensagens do usuário, nunca em respostas anteriores, nunca enquanto a resposta ainda está streamando"
    - "Clicar em \"Enviar pro Kanban\" cria um card do cliente ativo na primeira coluna da Produção (Briefing) com a primeira linha da resposta como título e a resposta completa como conteúdo, e confirma com um toast que leva para a Produção"
    - "A regra de primeira-linha-vira-título vive em UM único módulo puro compartilhado pelo board e pelo chat, com testes automatizados"
  artifacts:
    - path: "lib/cards/chat-import.ts"
      provides: "Módulo puro que deriva {title, description} de um texto de chat colado ou gerado"
      exports: ["cardFieldsFromChatText", "IMPORTED_TITLE_FALLBACK"]
      contains: "export function cardFieldsFromChatText"
    - path: "lib/cards/chat-import.test.ts"
      provides: "Testes node:test que travam o comportamento exato herdado do ImportFromChatDialog"
      contains: "cardFieldsFromChatText"
    - path: "components/ui/tabs.tsx"
      provides: "Primitivo Tabs (Radix) no mesmo padrão de components/ui/dialog.tsx"
      exports: ["Tabs", "TabsList", "TabsTrigger", "TabsContent"]
      contains: "TabsPrimitive"
    - path: "app/pm/board/board-panel.tsx"
      provides: "Modal \"Criar card\" unificado com duas abas; ImportFromChatDialog removido"
      contains: "TabsTrigger"
    - path: "app/pm/chat/chat-panel.tsx"
      provides: "Botão \"Enviar pro Kanban\" na última resposta da IA"
      contains: "Enviar pro Kanban"
  key_links:
    - from: "components/ui/tabs.tsx"
      to: "radix-ui (Tabs)"
      via: "import { Tabs as TabsPrimitive } from \"radix-ui\" — dependência já instalada, igual a dialog.tsx"
      pattern: "from \"radix-ui\""
    - from: "app/pm/board/board-panel.tsx (CreateCardDialog)"
      to: "components/ui/tabs.tsx"
      via: "Tabs/TabsList/TabsTrigger/TabsContent dentro do DialogContent"
      pattern: "@/components/ui/tabs"
    - from: "app/pm/board/board-panel.tsx (aba Colar do chat)"
      to: "lib/cards/chat-import.ts"
      via: "cardFieldsFromChatText(pastedText) antes de chamar createCard"
      pattern: "cardFieldsFromChatText"
    - from: "app/pm/chat/chat-panel.tsx"
      to: "lib/cards/chat-import.ts"
      via: "cardFieldsFromChatText(message.content) antes de chamar createCard"
      pattern: "cardFieldsFromChatText"
    - from: "app/pm/chat/chat-panel.tsx"
      to: "app/pm/board/actions.ts (createCard)"
      via: "import da Server Action existente — assinatura inalterada"
      pattern: "createCard"
---

<objective>
Parte 2 de "Melhorias na criação de conteúdo — clareza + fluidez Chat→Kanban" (a Parte 1, quick task 260805-fku, já foi entregue). Duas mudanças estruturais e aditivas:

1. **Unificar** os dois modais do board (`CreateCardDialog` + `ImportFromChatDialog`) num único modal "Criar card" com as abas "Escrever" e "Colar do chat".
2. **Encurtar o caminho Chat→Kanban**: um botão "Enviar pro Kanban" ao lado da última resposta da IA em `/pm/chat`, que cria o card direto na primeira coluna da Produção do cliente ativo.

Purpose: hoje o PM que gera conteúdo no Chat precisa selecionar/copiar o texto, navegar até a Produção, lembrar que existe um segundo botão ("Importar do chat", separado e menos óbvio que "Criar card") e colar. As duas mudanças atacam os dois atritos: uma porta de entrada única e óbvia para criar card, e um atalho de um clique do Chat para o Kanban. A colagem manual continua existindo (aba "Colar do chat") porque é ela que atende conteúdo editado ou vindo de fora do Chat — o botão novo é um atalho aditivo, não um substituto.

Output: um módulo puro novo + testes, um primitivo `Tabs` novo, e edições cirúrgicas em `board-panel.tsx` e `chat-panel.tsx`. **Zero** mudança em `createCard`, em `createCardSchema`, em etapas/colunas, em RLS ou em migrations.
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
@$HOME/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/STATE.md
@app/pm/board/board-panel.tsx
@app/pm/chat/chat-panel.tsx
@lib/cards/stages.ts
@lib/validation/cards.ts

<interfaces>
<!-- Contratos já existentes que este plano CONSOME sem alterar. Não é preciso -->
<!-- explorar o codebase para descobri-los; estão reproduzidos aqui.          -->

De `lib/validation/cards.ts` (INALTERADO por este plano):
```typescript
export const createCardSchema = z.object({
  clientId: z.string().uuid({ message: "Cliente inválido." }),
  title: z.string().trim().min(1, { message: "Título obrigatório." }).max(200),
  cardType: z.enum(["single", "package"]),
  stage: z.enum(CARD_STAGE_VALUES).optional(),
  description: z.string().trim().max(5000).optional(),
  assigneeId: z.string().uuid().optional(),
});
export type CreateCardInput = z.infer<typeof createCardSchema>;
```

De `app/pm/board/actions.ts` (INALTERADO por este plano):
```typescript
export type CreateCardResult = { success: true; cardId: string } | { error: string };
export async function createCard(input: CreateCardInput): Promise<CreateCardResult>;
```
`createCard` já re-resolve o `clientId` via RLS antes de inserir, já faz
`revalidatePath("/pm/board")` no sucesso, e já defaulta `stage` para
`"briefing"` quando omitido. Nada disso muda.

De `lib/cards/stages.ts` (INALTERADO):
```typescript
export type CardStage = "briefing" | "producao" | "revisao_interna" | "aprovacao_cliente" | "agendamento";
export const STAGE_ORDER: readonly CardStage[]; // STAGE_ORDER[0] === "briefing"
export const STAGE_LABELS: Record<CardStage, string>;
```

Lógica ATUAL de `ImportFromChatDialog` (board-panel.tsx ~linhas 372-397) — é
esta, caractere por caractere, que o novo módulo puro precisa reproduzir:
```typescript
const trimmed = pastedText.trim();
const firstLine = trimmed.split("\n")[0]?.trim() ?? "";
const title = firstLine.length > 0 ? firstLine.slice(0, 200) : IMPORTED_TITLE_FALLBACK;
// e no createCard: description: trimmed.slice(0, 5000)
```
com `const IMPORTED_TITLE_FALLBACK = "Conteúdo importado do chat";`

Forma da mensagem de chat (`chat-panel.tsx` ~linha 45):
```typescript
type ChatMessage = {
  id?: string;            // só existe depois de persistida em public.messages
  role: "user" | "assistant";
  content: string;
  streaming?: boolean;    // true enquanto os chunks ainda estão chegando
};
```

Dependências já instaladas (nada a instalar): `radix-ui@^1.6.1` reexporta
`Tabs` (namespace `@radix-ui/react-tabs`, com `Root`/`List`/`Trigger`/`Content`);
`sonner@^2.0.7` já é usado nos dois arquivos via `import { toast } from "sonner"`.
</interfaces>
</context>

<decisions>
Decisões tomadas no planejamento, para o executor não precisar decidir sozinho:

- **D-A — Primitivo de abas:** não existe `components/ui/tabs.tsx` neste projeto, mas `radix-ui` (o pacote unificado já instalado, do qual `dialog.tsx` importa) já reexporta `Tabs`. Criar `components/ui/tabs.tsx` no mesmo padrão de `components/ui/dialog.tsx`. **Nenhuma dependência nova é instalada** — logo, nenhum gate de legitimidade de pacote se aplica a este plano.
- **D-B — Etapa alvo da aba "Colar do chat":** a aba respeita o prop `stage` do modal exatamente como a aba "Escrever" (`stage ?? "briefing"`). Consequência: pelos gatilhos que existem hoje para importar (o botão do cabeçalho, que não passa `stage`) o comportamento é **idêntico ao atual** — cria em Briefing. Pelos gatilhos "+" por coluna, a colagem passa a criar naquela coluna, que é o comportamento coerente com a aba vizinha do mesmo modal. A `DialogDescription` da aba deve nomear a etapa alvo via `STAGE_LABELS[...]`, nunca a string literal "Briefing".
- **D-C — Gatilhos por coluna:** continuam sendo `CreateCardDialog` com `stage={column.stage}`, sem mudança de call site além do que D-B implica.
- **D-D — Dica de uso da Parte 1:** o `title` ("Cole aqui o texto gerado no Chat para criar o card automaticamente.") que a quick task 260805-fku colocou no botão "Importar do chat" não pode simplesmente sumir junto com o botão — migra para o `TabsTrigger` da aba "Colar do chat".
- **D-E — Etapa do botão do Chat:** `STAGE_ORDER[0]` (primeira coluna da Produção), nunca a string literal `"briefing"` — `lib/cards/stages.ts` continua sendo a única fonte de ordem.
- **D-F — Escopo fechado:** nada de mudar assinatura/validação de `createCard`, etapas/colunas, RLS, migrations, nem de estender o botão do Chat para mensagens que não sejam a última resposta da IA.
</decisions>

<tasks>

<task type="auto" tdd="true">
  <name>Task 1: Extrair a regra "primeira linha vira título" para um módulo puro testado</name>
  <files>lib/cards/chat-import.ts, lib/cards/chat-import.test.ts</files>
  <behavior>
    `cardFieldsFromChatText(text: string): { title: string; description: string }`
    - Texto multilinha "Título do post\n\nCorpo do post" → title "Título do post", description "Título do post\n\nCorpo do post"
    - Espaços/linhas em branco nas pontas são removidos antes de tudo: "\n\n  Olá\nmundo  \n" → title "Olá", description "Olá\nmundo"
    - CRLF: "Título\r\nCorpo" → title "Título" (sem "\r" pendurado)
    - Texto vazio ou só espaços → title === IMPORTED_TITLE_FALLBACK ("Conteúdo importado do chat"), description ""
    - Primeira linha com mais de 200 chars → title tem exatamente 200 chars
    - Texto com mais de 5000 chars → description tem exatamente 5000 chars
    - Texto de uma linha só → title === description
  </behavior>
  <action>
Criar `lib/cards/chat-import.ts` como módulo PURO, no mesmo estilo de `lib/cards/stages.ts`: sem nenhum import de React, Supabase, Next ou I/O — é isso que permite testá-lo com o runner nativo do Node sem Docker nem DB.

Exportar: a constante `IMPORTED_TITLE_FALLBACK` com o valor atual e literal `"Conteúdo importado do chat"`; duas constantes de limite alinhadas a `createCardSchema` (200 para título, 5000 para descrição); o tipo do retorno; e a função `cardFieldsFromChatText`.

A implementação deve reproduzir a lógica atual de `ImportFromChatDialog` sem "melhorar" nada: trim do texto inteiro primeiro, depois `split("\n")[0]` com `?.trim() ?? ""` sobre esse texto já trimado, fallback quando a primeira linha ficar vazia, `slice` no limite de título e `slice` no limite de descrição. Os `slice` existem para que a entrada nunca estoure os `.max()` do `createCardSchema` e vire um erro genérico de validação na cara do PM — documentar isso num comentário de topo, junto com a nota de que este módulo é consumido por DOIS call sites (a aba "Colar do chat" do board e o botão "Enviar pro Kanban" do chat) e por isso é a única definição da regra.

Criar `lib/cards/chat-import.test.ts` cobrindo cada caso listado em `<behavior>`, usando `import { test } from "node:test"` + `import assert from "node:assert/strict"` e import relativo com extensão (`./chat-import.ts`), exatamente como `lib/cards/stages.test.ts` faz. O glob de `npm test` já inclui `lib/cards/*.test.ts`, então o arquivo é coletado sem tocar em `package.json`.
  </action>
  <verify>
    <automated>node --test lib/cards/chat-import.test.ts && npm test</automated>
  </verify>
  <done>`node --test lib/cards/chat-import.test.ts` passa com todos os casos de `<behavior>` cobertos, `npm test` continua verde no conjunto inteiro, e nenhum arquivo além dos dois novos foi tocado.</done>
</task>

<task type="auto">
  <name>Task 2: Criar o primitivo Tabs e unificar os dois modais do board num só</name>
  <files>components/ui/tabs.tsx, app/pm/board/board-panel.tsx</files>
  <action>
**2a. `components/ui/tabs.tsx` (novo, D-A).** Espelhar a estrutura de `components/ui/dialog.tsx`: diretiva `"use client"` no topo, `import * as React from "react"`, `import { Tabs as TabsPrimitive } from "radix-ui"`, `import { cn } from "@/lib/utils"`. Exportar quatro componentes finos — `Tabs`, `TabsList`, `TabsTrigger`, `TabsContent` — cada um encaminhando `React.ComponentProps<typeof TabsPrimitive.Root|List|Trigger|Content>` e carregando um `data-slot` (`"tabs"`, `"tabs-list"`, `"tabs-trigger"`, `"tabs-content"`), igual ao padrão dos outros primitivos. Estilo usando os tokens que já existem no projeto: a lista como uma faixa `inline-flex` com `bg-muted`, cantos arredondados e um pequeno padding; o trigger com `text-muted-foreground` no estado normal e `data-[state=active]:bg-background data-[state=active]:text-foreground` no ativo, mais o anel de foco visível já usado nos outros primitivos; o conteúdo sem decoração além do espaçamento. Não inventar variantes, tamanhos nem props extras — só o suficiente para duas abas dentro de um Dialog.

**2b. Unificar dentro de `CreateCardDialog` (board-panel.tsx).** O componente mantém a MESMA assinatura de props (`clientId`, `stage?`, `pmRoster`, `trigger`) e os mesmos três call sites. Por dentro:
  - Acrescentar estado da aba ativa (valores `"escrever"` e `"colar"`, começando em `"escrever"`) e o estado `pastedText` que hoje vive no `ImportFromChatDialog`.
  - `handleOpenChange`: ao abrir, além do que já faz (limpar `serverError`, `form.reset(defaultValues)`, `setAssigneeValue(NONE_VALUE)`), voltar a aba para `"escrever"` e limpar `pastedText`. Trocar de aba também limpa `serverError`, para um erro da aba anterior não aparecer sob a aba nova.
  - Dentro do `DialogContent`, entre o `DialogHeader` e o conteúdo, envolver tudo num `Tabs` controlado com uma `TabsList` de dois `TabsTrigger`: "Escrever" e "Colar do chat". No trigger "Colar do chat", manter o `ClipboardPasteIcon` (o ícone já importado, hoje usado pelo botão que vai sumir) e o atributo `title` com a string exata da Parte 1: "Cole aqui o texto gerado no Chat para criar o card automaticamente." (D-D).
  - `TabsContent value="escrever"`: exatamente o `<Form>...</Form>` que já existe hoje, sem nenhuma alteração de campos, rótulos, placeholders, validação ou submit. O rótulo "Conteúdo do post" e seu placeholder, entregues na Parte 1, continuam idênticos.
  - `TabsContent value="colar"`: o corpo do antigo `ImportFromChatDialog` (Textarea de colagem com `rows={10}` e o mesmo placeholder, `ErrorBox` de erro do servidor, botão "Importar e criar card" com o mesmo label de pending e a mesma condição de desabilitado). O handler chama `cardFieldsFromChatText(pastedText)` do módulo da Task 1 em vez de recalcular a regra inline, e passa ao `createCard` `{ clientId, title, cardType: "single", stage: stage ?? "briefing", description }` — nota D-B: a etapa vem do prop do modal, não é mais fixa. Sucesso continua sendo `toast.success(CARD_CREATED_TOAST)` + fechar o modal; erro continua caindo verbatim no `ErrorBox`. Reaproveitar o `isPending`/`startTransition` que o componente já tem, sem criar um segundo `useTransition`.
  - `DialogHeader`: o título continua "Criar card". A `DialogDescription` que hoje só aparece quando `stage && stage !== "briefing"` deve continuar valendo para as duas abas; na aba de colagem, acrescentar a explicação de que a primeira linha vira o título, nomeando a etapa alvo por `STAGE_LABELS[stage ?? "briefing"]` e nunca pela string literal "Briefing".

**2c. Remover o que ficou órfão.** Apagar a função `ImportFromChatDialog` inteira e o comentário de bloco que a documenta; mover a constante `IMPORTED_TITLE_FALLBACK` para o módulo da Task 1 (importar de lá se ainda for referenciada aqui, ou simplesmente deixar de referenciá-la); remover o `<ImportFromChatDialog clientId={activeClientId} />` do `action` do `PageTitle`, deixando ali só o `CreateCardDialog` (se o wrapper `<div className="flex items-center gap-2">` ficar com um filho só, pode ser mantido ou removido — o que gerar o diff menor). Conferir que nenhum import ficou sem uso (`ClipboardPasteIcon` continua em uso pelo TabsTrigger; qualquer outro que tenha ficado órfão deve sair, porque o lint deste projeto reprova import não utilizado).

Não tocar em `BoardCardItem`, `AttachDriveLinkForm`, drag-and-drop, `useOptimistic`, no switcher de cliente nem nos efeitos de restauração de cliente.
  </action>
  <verify>
    <automated>npx tsc --noEmit && npm run lint && grep -vE '^\s*(//|\*|/\*)' app/pm/board/board-panel.tsx > /tmp/bp.txt && test "$(grep -c 'ImportFromChatDialog' /tmp/bp.txt)" -eq 0 && test "$(grep -c 'TabsTrigger' /tmp/bp.txt)" -ge 2 && test "$(grep -c 'cardFieldsFromChatText' /tmp/bp.txt)" -ge 1 && test "$(grep -c '@/components/ui/tabs' /tmp/bp.txt)" -ge 1 && grep -q 'TabsPrimitive' components/ui/tabs.tsx && echo GATES_OK</automated>
  </verify>
  <done>`npx tsc --noEmit` e `npm run lint` limpos; o gate imprime `GATES_OK`, provando que (em linhas que não são comentário) `ImportFromChatDialog` sumiu do arquivo, existem pelo menos dois `TabsTrigger`, a aba de colagem usa o módulo compartilhado e o primitivo novo está importado.</done>
</task>

<task type="auto">
  <name>Task 3: Botão "Enviar pro Kanban" na última resposta da IA em /pm/chat</name>
  <files>app/pm/chat/chat-panel.tsx</files>
  <action>
Acrescentar em `ChatPanel` (arquivo já é `"use client"`, já usa `useRouter`, `useTransition` e `toast`):

  - Importar `createCard` de `@/app/pm/board/actions` (Server Action existente, assinatura intocada), `cardFieldsFromChatText` de `@/lib/cards/chat-import`, `STAGE_ORDER` de `@/lib/cards/stages`, e um ícone do `lucide-react` coerente com o resto (o board usa `LayoutDashboardIcon` para "Produção" — reutilizar esse mesmo ícone aqui mantém a leitura consistente).
  - Duas constantes de copy no topo do arquivo, junto das outras (`SEND_ERROR`, `SAVE_SUCCESS`, ...): uma de sucesso ("Card criado na Produção.") e uma de erro genérica, seguindo o tom em português já usado ali.
  - Um `useTransition` próprio para esta ação (não reaproveitar `isSavingKnowledge`, que pertence à curadoria de conhecimento) e um estado com o índice/marcador de qual mensagem está sendo enviada, se necessário para desabilitar só aquele botão.
  - Calcular, na render, o índice da ÚLTIMA mensagem com `role === "assistant"` percorrendo `messages` uma vez (por exemplo com um `reduce` que guarda o último índice encontrado, valor inicial `-1`). Não usar `findLastIndex` sem antes confirmar suporte no target de build; o `reduce` é seguro.
  - Dentro do `messages.map(...)` já existente, renderizar o botão apenas quando TODAS estas condições valerem: `index === lastAssistantIndex`, `message.role === "assistant"`, `!message.streaming`, `message.content.trim().length > 0` e `activeClientId` não nulo. Em qualquer outro caso, não renderizar nada (não renderizar desabilitado — o pedido é que ele apareça só ali). Posicionar junto da bolha da IA, na mesma linha do checkbox de curadoria que já existe para mensagens persistidas, como `Button` `variant="outline"` `size="sm"` com o rótulo "Enviar pro Kanban" e um `aria-label` equivalente; enquanto a transição estiver pendente, mostrar "Enviando..." e desabilitar.
  - Handler: derivar `{ title, description }` com `cardFieldsFromChatText(message.content)` — a MESMA regra da aba "Colar do chat", sem reimplementar nada — e chamar `createCard({ clientId: activeClientId, title, cardType: "single", stage: STAGE_ORDER[0], description })` dentro da transição. `STAGE_ORDER[0]`, nunca a literal `"briefing"` (D-E). Em `"error" in result`, mostrar `toast.error(result.error)` (mensagem do servidor verbatim, como o board já faz). No sucesso, `toast.success` com a constante nova e uma `action` do sonner rotulada "Ver na Produção" que faz `router.push(\`/pm/board?client=${activeClientId}\`)` — o mesmo destino do link "Produção" que já existe no cabeçalho do chat.
  - Guardar o `activeClientId` numa const local no início do handler antes do `await`, para o TypeScript estreitar o `string | null` e para o clique não ficar dependente de o cliente ativo mudar no meio do voo.

Não alterar `streamResponse`, `loadHistory`, `handleSwitchClient`, a curadoria de conhecimento, os efeitos de navegação, nem a derivação de `activeClientId` via `useSyncExternalStore` — esta última em particular é sensível (a regra de lint `react-hooks/set-state-in-effect` deste projeto proíbe o padrão que ela substituiu).
  </action>
  <verify>
    <automated>npx tsc --noEmit && npm run lint && npm run build && grep -vE '^\s*(//|\*|/\*)' app/pm/chat/chat-panel.tsx > /tmp/cp.txt && test "$(grep -c 'Enviar pro Kanban' /tmp/cp.txt)" -ge 1 && test "$(grep -c 'cardFieldsFromChatText' /tmp/cp.txt)" -ge 1 && test "$(grep -c 'createCard' /tmp/cp.txt)" -ge 1 && test "$(grep -c 'STAGE_ORDER\[0\]' /tmp/cp.txt)" -ge 1 && echo GATES_OK</automated>
  </verify>
  <done>`npx tsc --noEmit`, `npm run lint` e `npm run build` passam; o gate imprime `GATES_OK`, provando que o botão existe, reusa o módulo compartilhado, chama a Server Action existente e usa `STAGE_ORDER[0]` em vez da string literal.</done>
</task>

<task type="checkpoint:human-verify" gate="blocking">
  <what-built>
    Modal "Criar card" unificado (abas "Escrever" e "Colar do chat", botão "Importar do chat" removido) e botão "Enviar pro Kanban" na última resposta da IA em /pm/chat. `tsc`, `lint`, `build` e `npm test` já estão verdes; falta a verificação do fluxo real, que é a parte que os gates automáticos não cobrem.
  </what-built>
  <how-to-verify>
    Com `npm run dev` rodando e logado como PM de um cliente que tenha arquivos de referência:

    **A. Fluxo Chat → Kanban (o principal):**
    1. Abrir `/pm/chat`, selecionar um cliente e pedir um post à IA. Esperar a resposta terminar de streamar.
    2. Durante o streaming: confirmar que o botão "Enviar pro Kanban" NÃO aparece.
    3. Terminado o streaming: confirmar que o botão aparece ao lado da última resposta da IA — e SÓ dela (nem nas mensagens do usuário, nem em respostas anteriores da conversa).
    4. Clicar em "Enviar pro Kanban". Confirmar o toast de sucesso e clicar na ação "Ver na Produção".
    5. Na Produção: confirmar que o card apareceu na PRIMEIRA coluna (Briefing), com a primeira linha da resposta como título. Abrir o card e confirmar que o campo de conteúdo tem a resposta COMPLETA, não só a primeira linha.
    6. Mandar uma segunda pergunta no chat e confirmar que o botão migrou para a nova última resposta (não ficou duplicado na anterior).

    **B. Modal unificado:**
    7. Em `/pm/board`, confirmar que existe UM botão "Criar card" no cabeçalho e que o botão "Importar do chat" sumiu.
    8. Abrir "Criar card": confirmar as duas abas, com "Escrever" aberta por padrão. Passar o mouse na aba "Colar do chat" e confirmar a dica ("Cole aqui o texto gerado no Chat...").
    9. Aba "Escrever": criar um card com Título + Conteúdo do post + Responsável. Confirmar que o rótulo é "Conteúdo do post" (Parte 1 preservada) e que o card foi criado com os três valores corretos.
    10. Aba "Colar do chat": colar um texto multilinha, criar, e confirmar que a primeira linha virou o título e que o texto inteiro está no conteúdo — comportamento idêntico ao antigo "Importar do chat".
    11. Fechar e reabrir o modal: confirmar que ele volta na aba "Escrever" com os campos e a caixa de colagem limpos.
    12. Clicar no "+" de uma coluna do meio (ex.: "Revisão interna"): confirmar que abre o mesmo modal, que a descrição indica a etapa correta, e criar um card por CADA aba conferindo que os dois caem naquela coluna (e não em Briefing).

    **C. Não-regressão:** arrastar um card entre colunas, abrir o detalhe de um card, salvar alterações e usar "Revalidar com IA" — tudo deve continuar funcionando como antes.

    Limpar os cards e conversas de teste depois da verificação.
  </how-to-verify>
  <resume-signal>Responda "approved" para liberar o merge, ou descreva o que divergiu (indicando o passo A1–C).</resume-signal>
</task>

</tasks>

<threat_model>
## Trust Boundaries

| Boundary | Description |
|----------|-------------|
| browser (chat-panel/board-panel) → `createCard` Server Action | Entrada controlada pelo cliente (clientId, title, description, stage) atravessa para o Postgres |
| browser → `components/ui/tabs.tsx` (Radix) | Nova dependência de UI — mas transitiva já instalada, nenhuma instalação de pacote acontece |

## STRIDE Threat Register

| Threat ID | Category | Component | Disposition | Mitigation Plan |
|-----------|----------|-----------|-------------|-----------------|
| T-FUU-01 | Elevation of Privilege | `createCard` chamado a partir de `/pm/chat` com `clientId` do cliente ativo | mitigate | Nenhuma mudança na action: ela já re-resolve o `clientId` via RLS (`supabase.from("clients").select("id").eq("id", ...)`) e só insere se o PM estiver atribuído àquele cliente. O novo call site é apenas mais um consumidor da mesma fronteira já auditada em 03-02. |
| T-FUU-02 | Tampering | `title`/`description` derivados de texto gerado pela IA ou colado pelo PM | mitigate | `cardFieldsFromChatText` corta em 200/5000 chars ANTES da chamada, e `createCardSchema` (`.trim().max()`) revalida no servidor — o corte do cliente é conveniência de UX, o schema continua sendo a fronteira. |
| T-FUU-03 | Information Disclosure | Vazamento de conteúdo entre clientes ao enviar do Chat para o Kanban | mitigate | O `clientId` usado é o `activeClientId` do próprio chat, capturado em const local antes do `await`; `createCard` re-resolve via RLS. Nenhum caminho novo lê `client_files` nem mensagens de outro cliente. |
| T-FUU-04 | Denial of Service | Cliques repetidos em "Enviar pro Kanban" criando cards duplicados | accept | Impacto baixo (card duplicado, deletável); mitigado parcialmente pelo botão desabilitar durante o `useTransition`. Não justifica idempotência server-side neste escopo. |
| T-FUU-SC | Tampering | instalações npm/pip/cargo | mitigate | **Não aplicável: este plano não instala nenhum pacote.** `radix-ui` e `@radix-ui/react-tabs` já estão em `node_modules` como dependência declarada/transitiva; `package.json` não é modificado. Nenhum gate de legitimidade de pacote é necessário. |
</threat_model>

<verification>
- `npm test` verde (inclui os novos `lib/cards/chat-import.test.ts`)
- `npx tsc --noEmit` sem erros
- `npm run lint` sem erros (atenção a imports órfãos após a remoção do `ImportFromChatDialog`)
- `npm run build` sem erros
- Gates de grep das Tasks 2 e 3 imprimindo `GATES_OK`
- Escopo: `git diff --stat` deve tocar exatamente 5 arquivos (2 novos em `lib/cards/`, 1 novo em `components/ui/`, 2 editados em `app/pm/`) — qualquer alteração em `app/pm/board/actions.ts`, `lib/validation/cards.ts`, `lib/cards/stages.ts`, `package.json` ou `supabase/` é violação de escopo (D-F)
- Checkpoint humano aprovado (fluxo Chat→Kanban ao vivo + as duas abas + gatilhos por coluna + não-regressão)
</verification>

<success_criteria>
- Um único botão "Criar card" no board, abrindo um modal de duas abas
- A aba "Colar do chat" produz exatamente os mesmos títulos/conteúdos que o antigo "Importar do chat" produzia (travado por teste automatizado)
- Os gatilhos "+" por coluna criam na etapa da coluna nas duas abas
- "Enviar pro Kanban" aparece só na última resposta da IA, já finalizada, com cliente ativo — e cria o card na primeira coluna da Produção com o conteúdo completo
- A regra primeira-linha-vira-título existe em um só lugar (`lib/cards/chat-import.ts`), consumida pelos dois call sites
- Zero mudança em Server Action, schema, etapas, RLS, migrations ou dependências
</success_criteria>

<output>
Criar `.planning/quick/260805-fuu-unificar-criar-card-e-importar-do-chat-n/260805-fuu-SUMMARY.md` ao concluir.
</output>
