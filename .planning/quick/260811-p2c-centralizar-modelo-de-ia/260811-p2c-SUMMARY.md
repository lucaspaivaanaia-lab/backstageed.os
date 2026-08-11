---
phase: quick
plan: 01
status: complete
completed: 2026-08-11
---

# Quick Task 260811-p2c: Centralizar e fixar o modelo de IA — Summary

**Item 8 do plano de ação 2026-08-05.** Decisão: manter `claude-sonnet-4-5` (não trocar pra Opus) — só eliminar a duplicação. O literal `process.env.ANTHROPIC_CHAT_MODEL ?? "claude-sonnet-4-5"` estava duplicado em `app/api/chat/route.ts` (chat streaming) e `lib/ai/structured-extraction.ts` (motor compartilhado de checklist/briefing/validação).

## O que mudou

- `lib/anthropic/client.ts` — nova constante exportada `AI_MODEL = process.env.ANTHROPIC_CHAT_MODEL ?? "claude-sonnet-4-5"`, junto da fábrica `getAnthropicClient()` já existente (módulo já importado pelos dois call-sites).
- `app/api/chat/route.ts` — importa `AI_MODEL`, usa em vez do literal duplicado.
- `lib/ai/structured-extraction.ts` — mesma coisa.

Zero mudança de comportamento — puro refactor de duplicação, sem seletor de usuário (fica pra decisão futura).

## Verificação

- `npx tsc --noEmit` — limpo.
- `npx eslint` nos 3 arquivos — limpo.
- `grep -rn "ANTHROPIC_CHAT_MODEL\|claude-sonnet-4-5"` — só uma ocorrência de cada, dentro de `lib/anthropic/client.ts`.
- `npm test` — 92/92.
- `npm run build` — sucesso.

Sem checkpoint ao vivo — refactor puro, sem mudança de comportamento, aplicado direto (sem worktree).

## Commit

Ver commit único junto com este SUMMARY.
