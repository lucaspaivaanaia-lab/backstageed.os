---
phase: quick-260805-fuu
plan: 01
subsystem: ui
tags: [nextjs, react-hook-form, radix-ui, board, chat, kanban]

# Dependency graph
requires:
  - phase: quick-260805-fku
    provides: "Conteúdo do post" label/placeholder + \"Importar do chat\" tooltip copy, migrated onto the new tab trigger here
provides:
  - Módulo puro lib/cards/chat-import.ts (cardFieldsFromChatText) com testes automatizados, única fonte da regra "primeira linha vira título"
  - Primitivo components/ui/tabs.tsx (Radix Tabs) no padrão dos outros primitivos do projeto
  - Modal "Criar card" unificado (abas "Escrever"/"Colar do chat") em app/pm/board/board-panel.tsx — ImportFromChatDialog removido
  - Botão "Enviar pro Kanban" na última resposta da IA em app/pm/chat/chat-panel.tsx
affects: [content-production-kanban]

# Tech tracking
tech-stack:
  added: []
  patterns: ["Regra de negócio compartilhada entre dois call sites (board + chat) extraída para um módulo puro testável em lib/cards/, no mesmo estilo de lib/cards/stages.ts"]

key-files:
  created:
    - lib/cards/chat-import.ts
    - lib/cards/chat-import.test.ts
    - components/ui/tabs.tsx
  modified:
    - app/pm/board/board-panel.tsx
    - app/pm/chat/chat-panel.tsx

key-decisions:
  - "D-A: nenhuma dependência nova instalada — radix-ui já reexporta Tabs, components/ui/tabs.tsx segue o mesmo padrão de dialog.tsx"
  - "D-B: a aba \"Colar do chat\" respeita o prop stage do modal (stage ?? \"briefing\"), deixando de ser fixa em Briefing — os gatilhos \"+\" por coluna agora criam corretamente naquela coluna pelas duas abas"
  - "D-D: a dica \"Cole aqui o texto gerado no Chat...\" da Parte 1 (260805-fku) migrou do botão removido para o TabsTrigger \"Colar do chat\""
  - "D-E: o botão do Chat usa STAGE_ORDER[0], nunca a string literal \"briefing\""
  - "D-F: zero mudança em createCard, createCardSchema, etapas/colunas, RLS ou migrations — confirmado pelo git diff --stat tocando exatamente os 5 arquivos do plano"

patterns-established:
  - "Regras de negócio puras e compartilhadas entre múltiplos client components vivem em lib/<domain>/ com testes node:test, nunca duplicadas inline"

requirements-completed: [QUICK-260805-FUU]

# Metrics
duration: ~55min
completed: 2026-08-05
---

# Quick Task 260805-fuu: Unificar "Criar card"/"Importar do chat" + atalho Chat→Kanban Summary

**Módulo puro `cardFieldsFromChatText` (testado) unificando a regra "primeira linha vira título" entre um novo modal "Criar card" de duas abas (Escrever/Colar do chat) e um novo botão "Enviar pro Kanban" na última resposta da IA em `/pm/chat`.**

## Performance

- **Duration:** ~55 min
- **Started:** 2026-08-05T13:57:00Z
- **Completed:** 2026-08-05T14:51:56Z
- **Tasks:** 3 of 4 completed (Task 4 is a `checkpoint:human-verify` gate, pending)
- **Files modified:** 5 (2 novos em `lib/cards/`, 1 novo em `components/ui/`, 2 editados em `app/pm/`)

## Accomplishments

- **Task 1 — módulo puro:** `lib/cards/chat-import.ts` exporta `cardFieldsFromChatText`, `IMPORTED_TITLE_FALLBACK`, `CHAT_IMPORT_TITLE_MAX` (200) e `CHAT_IMPORT_DESCRIPTION_MAX` (5000), reproduzindo caractere por caractere a lógica original de `ImportFromChatDialog`. `lib/cards/chat-import.test.ts` cobre os 7 casos do `<behavior>` do plano (multilinha, trim de espaços/linhas em branco, CRLF sem `\r` pendurado, texto vazio → fallback, truncamento de título em 200, truncamento de descrição em 5000, linha única → title === description). Todos os 7 testes passam; `npm test` completo permanece verde (78/78).
- **Task 2 — modal unificado:** `components/ui/tabs.tsx` criado espelhando `dialog.tsx` (mesmo padrão `"use client"` + `data-slot`, sem props/variantes extras). Dentro de `CreateCardDialog` (`board-panel.tsx`), a mesma assinatura de props (`clientId`, `stage?`, `pmRoster`, `trigger`) e os três call sites existentes permanecem intocados; por dentro, o `DialogContent` agora envolve um `Tabs` controlado com duas abas — "Escrever" (formulário inalterado) e "Colar do chat" (o corpo do antigo `ImportFromChatDialog`, agora chamando `cardFieldsFromChatText` e respeitando `stage ?? "briefing"` em vez de fixar `"briefing"`). `ImportFromChatDialog` foi removida por completo, junto com a constante local `IMPORTED_TITLE_FALLBACK` (agora vive só no módulo da Task 1). O cabeçalho de `/pm/board` mostra um único botão "Criar card".
- **Task 3 — atalho Chat→Kanban:** `app/pm/chat/chat-panel.tsx` ganhou o botão "Enviar pro Kanban", calculado via `reduce` (não `findLastIndex`) sobre `messages` para achar o índice da última mensagem `role === "assistant"`. O botão só renderiza quando `index === lastAssistantIndex && role === "assistant" && !streaming && content.trim().length > 0 && activeClientId !== null` — nunca desabilitado, apenas ausente fora dessas condições. O handler deriva `{title, description}` via `cardFieldsFromChatText(message.content)` e chama `createCard({..., stage: STAGE_ORDER[0], ...})` dentro de um `useTransition` próprio (`isSendingToKanban`, separado do de curadoria de conhecimento). Sucesso: toast com ação "Ver na Produção" que navega para `/pm/board?client=<id>`. Erro do servidor mostrado verbatim; um `try/catch` cobre falha inesperada de rede com uma mensagem genérica em português (Rule 2 — tratamento de erro ausente no plano original para essa chamada de Server Action a partir do client).

## Task Commits

Each task was committed atomically:

1. **Task 1: Extrair a regra "primeira linha vira título" para um módulo puro testado** - `bd04f02` (feat)
2. **Task 2: Criar o primitivo Tabs e unificar os dois modais do board num só** - `54c58f4` (feat)
3. **Task 3: Botão "Enviar pro Kanban" na última resposta da IA em /pm/chat** - `6d60d1d` (feat)

Task 4 (`checkpoint:human-verify`, `gate="blocking"`) is pending — see "Next Phase Readiness" below. No commit for Task 4 yet; it will be signed off after live browser verification.

## Files Created/Modified

- `lib/cards/chat-import.ts` - Módulo puro `cardFieldsFromChatText`, única fonte da regra primeira-linha-vira-título
- `lib/cards/chat-import.test.ts` - 7 testes `node:test` travando o comportamento herdado de `ImportFromChatDialog`
- `components/ui/tabs.tsx` - Primitivo `Tabs`/`TabsList`/`TabsTrigger`/`TabsContent` (Radix), padrão `dialog.tsx`
- `app/pm/board/board-panel.tsx` - `CreateCardDialog` ganhou abas "Escrever"/"Colar do chat"; `ImportFromChatDialog` removida; único botão "Criar card" no cabeçalho
- `app/pm/chat/chat-panel.tsx` - Botão "Enviar pro Kanban" na última resposta da IA, reutilizando `cardFieldsFromChatText` e `createCard`

## Decisions Made

Todas as decisões D-A a D-F do plano foram seguidas literalmente (ver `key-decisions` acima). Nenhuma decisão nova foi tomada fora do que o plano já especificava.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Materializado `node_modules` no worktree via `npm ci`**
- **Found during:** Setup, antes da Task 1
- **Issue:** O worktree deste executor não tinha `node_modules` (mesmo quirk documentado em `260805-fao-SUMMARY.md` e `260805-fku-SUMMARY.md`) — `npm test`/`node --test` e `npm run build` exigem os pacotes instalados localmente no worktree.
- **Fix:** Rodei `npm ci`, que instala exatamente o que `package-lock.json` já fixa — nenhuma dependência nova, nenhum pacote diferente do que já está em uso no repo principal.
- **Files modified:** nenhum arquivo rastreado (`node_modules/` é gitignored)
- **Verification:** `npm test`, `npx tsc --noEmit`, `npm run lint` e `npm run build` todos passaram após o `npm ci`
- **Committed in:** n/a — gitignored, nada para commitar

**2. [Rule 2 - Missing Critical] `try/catch` ao redor da chamada de `createCard` no botão "Enviar pro Kanban"**
- **Found during:** Task 3
- **Issue:** O plano especifica apenas o branch `"error" in result` (erro de validação/servidor). Uma falha de rede/exceção na chamada da Server Action a partir do client ficaria sem tratamento, deixando o `useTransition` pendurado sem feedback ao PM.
- **Fix:** Envolvido o `await createCard(...)` num `try/catch`; o `catch` mostra `toast.error(SEND_TO_KANBAN_ERROR)`, a constante genérica que o próprio plano já pedia para criar ("uma de erro genérica, seguindo o tom em português já usado ali") mas cujo uso não estava explícito no texto do handler.
- **Files modified:** `app/pm/chat/chat-panel.tsx`
- **Verification:** `npx tsc --noEmit`, `npm run lint`, `npm run build` verdes; nenhum teste automatizado cobre este caminho (é um catch defensivo de rede, fora do escopo dos testes `node:test` deste módulo)
- **Committed in:** `6d60d1d` (parte do commit da Task 3)

---

**Total deviations:** 2 auto-fixed (1 bloqueante de ambiente, 1 funcionalidade crítica ausente)
**Impact on plan:** Nenhum desvio de escopo — `git diff --stat` contra o commit pré-dispatch (`496febd`) toca exatamente os 5 arquivos declarados no `files_modified` do plano. O `try/catch` é uma correção defensiva estritamente dentro do escopo da Task 3 (mesma função, mesmo arquivo), não uma mudança arquitetural.

## Issues Encountered

- O merge-base do worktree inicialmente divergia da base esperada do plano (`496febd0026d5a0c0388b850f212ca98cb960bca`) — corrigido com `git reset --hard` para a base correta antes de iniciar qualquer edição (passo de setup padrão do executor, HEAD já estava confirmado num branch `worktree-agent-*` próprio, não uma issue de código).

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

Tasks 1-3 completas, commitadas e verificadas via gates automatizados (`node --test`, `npm test` completo, `npx tsc --noEmit`, `npm run lint`, `npm run build`, e os greps de escopo das Tasks 2/3, todos `GATES_OK`). `git diff --stat` contra a base confirma exatamente os 5 arquivos do plano tocados.

**Task 4 (checkpoint:human-verify, gate="blocking") está pendente** — requer verificação ao vivo do fluxo real (Chat→Kanban, modal de duas abas, gatilhos por coluna, não-regressão), que os gates automáticos não cobrem. Ver o roteiro completo (`<how-to-verify>`, passos A1-C) no próprio `260805-fuu-PLAN.md`. Este executor não tentou essa verificação — controle retorna ao orquestrador para spawnar um agente de continuação (ou a própria sessão orquestradora) que rode a verificação via browser real e recolha o "aprovado" antes do merge.

---
*Phase: quick-260805-fuu*
*Completed: 2026-08-05 (Tasks 1-3; Task 4 pending)*

## Self-Check: PASSED

- FOUND: lib/cards/chat-import.ts
- FOUND: lib/cards/chat-import.test.ts
- FOUND: components/ui/tabs.tsx
- FOUND: bd04f02 (Task 1 commit)
- FOUND: 54c58f4 (Task 2 commit)
- FOUND: 6d60d1d (Task 3 commit)
