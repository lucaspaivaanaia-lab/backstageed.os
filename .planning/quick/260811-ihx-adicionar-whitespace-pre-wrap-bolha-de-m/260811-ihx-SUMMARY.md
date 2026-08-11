---
phase: quick
plan: 01
status: complete
completed: 2026-08-11
---

# Quick Task 260811-ihx: Paridade de formatação chat ↔ Kanban — Summary

**Item 7 do plano de ação 2026-08-05.** A bolha de mensagem do assistente em `app/pm/chat/chat-panel.tsx` renderizava `{message.content}` sem `whitespace-pre-wrap` — CSS padrão colapsava `\n\n` numa linha só, então respostas multi-parágrafo da IA apareciam grudadas na bolha do chat, mesmo que o mesmo texto já preservasse as quebras corretamente ao ser enviado pro Kanban (um `<Textarea>` nativo sempre respeita `\n`, independente de CSS).

## O que mudou

`app/pm/chat/chat-panel.tsx` — adicionado `whitespace-pre-wrap` à className existente do ramo assistente do ternário `isUser ? ... : ...` que constrói a bolha de mensagem. Nenhuma classe nova criada, nenhuma outra classe alterada, ramo `isUser` (mensagem do PM) intocado.

Mesmo padrão já usado em `app/admin/cards/card-audit-panel.tsx` (`className="text-body whitespace-pre-wrap"`).

## Verificação

- `npx tsc --noEmit` — limpo.
- `npx eslint app/pm/chat/chat-panel.tsx` — limpo.
- `grep -c "whitespace-pre-wrap" app/pm/chat/chat-panel.tsx` — 1 ocorrência.
- `git diff --stat` — 1 arquivo, 1 linha alterada.

Sem checkpoint ao vivo — mudança CSS pura, de baixo risco, totalmente verificável estaticamente.

## Commit

`5620a21` — feat(260811-ihx): preserve paragraph breaks in the chat message bubble
