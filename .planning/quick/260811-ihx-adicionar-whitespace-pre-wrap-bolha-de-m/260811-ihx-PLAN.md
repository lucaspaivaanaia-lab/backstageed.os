---
phase: quick
plan: 01
type: execute
wave: 1
depends_on: []
files_modified: [app/pm/chat/chat-panel.tsx]
autonomous: true
requirements: []
---

<objective>
Preservar quebras de parágrafo (`\n\n`) na resposta da IA renderizada na bolha do chat de `/pm/chat`, igual já acontece no Kanban.

Purpose: `app/pm/chat/chat-panel.tsx` renderiza `{message.content}` (a resposta da IA) dentro de uma `<div>` sem `whitespace-pre-wrap` — CSS padrão colapsa `\n\n` numa linha só, então parágrafos ficam grudados visualmente na bolha do chat. O padrão de correção já existe em `app/admin/cards/card-audit-panel.tsx` (`className="text-body whitespace-pre-wrap"`), que este plano replica no contexto da bolha de mensagem do assistente.
Output: `chat-panel.tsx` com a classe `whitespace-pre-wrap` adicionada à className existente da bolha de mensagem do assistente — nenhuma classe nova criada, nenhuma outra classe alterada.
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
@$HOME/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@app/pm/chat/chat-panel.tsx
</context>

<interfaces>
Trecho exato a modificar (chat-panel.tsx, dentro do `.map((message, index) => {...})` que renderiza a lista de mensagens):

```
const bubble = (
  <div
    className={
      isUser
        ? "max-w-[80%] rounded-2xl bg-secondary px-4 py-2 text-body text-secondary-foreground"
        : "max-w-[80%] rounded-2xl border bg-card px-4 py-2 text-body text-card-foreground"
    }
  >
    {message.content}
    ...
```

A branch `isUser ? ... : ...` do operador ternário decide a className da bolha. O ramo `false` (após o `:`) é o da mensagem do assistente (`"max-w-[80%] rounded-2xl border bg-card px-4 py-2 text-body text-card-foreground"`) — é essa string que recebe `whitespace-pre-wrap`. O ramo `isUser` (mensagem do PM) permanece intocado.
</interfaces>

<tasks>

<task type="auto">
  <name>Task 1: Adicionar whitespace-pre-wrap à bolha de mensagem do assistente</name>
  <files>app/pm/chat/chat-panel.tsx</files>
  <action>
    No componente `ChatPanel`, dentro do bloco que constrói `bubble` (renderização da lista de mensagens, por volta da linha 466-472), localizar a className do ramo `false` do ternário `isUser ? ... : ...` — a string associada à mensagem do assistente: `"max-w-[80%] rounded-2xl border bg-card px-4 py-2 text-body text-card-foreground"`. Adicionar `whitespace-pre-wrap` a essa string existente (por exemplo, ao final, separada por espaço), sem criar uma classe Tailwind nova nem alterar/remover nenhuma classe já presente nela. Não tocar no ramo `isUser` (className da mensagem do usuário) nem em nenhuma outra parte do arquivo.
  </action>
  <verify>
    <automated>grep -n 'card-foreground.*whitespace-pre-wrap\|whitespace-pre-wrap.*card-foreground' app/pm/chat/chat-panel.tsx | grep -v '^#' | grep -c whitespace-pre-wrap</automated>
  </verify>
  <done>A className do ramo assistente do ternário em chat-panel.tsx contém `whitespace-pre-wrap` junto das classes já existentes; o ramo `isUser` permanece exatamente como antes (sem `whitespace-pre-wrap`); `npx tsc --noEmit` não introduz novos erros.</done>
</task>

</tasks>

<verification>
1. `grep -n "whitespace-pre-wrap" app/pm/chat/chat-panel.tsx` retorna exatamente 1 ocorrência, na linha da className do assistente.
2. `git diff app/pm/chat/chat-panel.tsx` mostra uma única linha alterada (a string da className do ramo `false` do ternário), nenhuma outra linha tocada.
3. `npx tsc --noEmit` passa sem novos erros.
</verification>

<success_criteria>
Uma resposta da IA com múltiplos parágrafos (separados por `\n\n`) renderiza com espaçamento visual entre parágrafos na bolha do chat de `/pm/chat`, igual ao comportamento já visto na descrição do card no Kanban (`card-audit-panel.tsx`). Nenhuma outra classe ou comportamento da bolha (usuário ou assistente) muda.
</success_criteria>

<output>
Create `.planning/quick/260811-ihx-adicionar-whitespace-pre-wrap-bolha-de-m/260811-ihx-SUMMARY.md` when done
</output>
