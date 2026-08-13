---
status: complete
---

# Quick Task 260812-k6c — Summary

Deu ao papel Admin acesso às mesmas telas de Produção (`/pm/board`) e Chat (`/pm/chat`) que o PM já tem — sem duplicar rotas — destravando o fluxo criar-cliente → briefing → produção quando quem está logado é Admin.

## Causa raiz descoberta ao vivo

O Admin nunca teve acesso a `/pm/board`/`/pm/chat`: o middleware bloqueia qualquer rota fora da raiz própria de cada papel. O redirect pós-"Salvar briefing" (`router.push("/pm/board?client=...")`) sempre existiu e é role-agnóstico, mas sempre bateu nesse bloqueio pra Admin, devolvendo-o em silêncio pra `/admin` (placeholder "Em construção").

## O que mudou

- `middleware.ts`: allow-list aditivo (`extraAllowedPrefixes`) — só `/pm/board` e `/pm/chat` liberados pro Admin; `/pm/clients`/`/pm/editors` continuam bloqueados (Admin já tem `/admin/clients`/`/admin/editors` próprios). `pm`/`client`/`editor` ficam byte-idênticos.
- `app/pm/board/page.tsx` e `app/pm/chat/page.tsx`: `viewerIsAdmin` resolvido server-side via `profiles.role`, passado como prop.
- `app/pm/board/board-panel.tsx` e `app/pm/chat/chat-panel.tsx`: 3 links hardcoded pra `/pm/clients` (fallback sem cliente ativo no board, botão "Editar briefing", fallback sem cliente ativo no chat) viraram role-aware — achado real da pesquisa (Finding 2a), sem essa correção o Admin seria bounced de volta na primeira visita mesmo com o middleware liberado.
- `app/admin/layout.tsx`: 1 item novo no sidebar, "Produção" → `/pm/board`.

## Segurança

Nenhuma mudança de RLS/Server Action — toda a superfície de dados de board/chat já tratava Admin corretamente (`assertPmOrAdminCaller`/`isBoardWriteAuthorized`/RLS admin-unrestricted). O único boundary alterado foi o middleware.

## Verificação

- `tsc --noEmit`, `eslint`, `npm test` (147/147), `npm run build` limpos.
- Checkpoint ao vivo aprovado pelo desenvolvedor, cobrindo sessão nova sem cliente ativo, fluxo completo criar→briefing→produção, bloqueio mantido de `/pm/clients`/`/pm/editors`, e zero regressão pro PM.

## Commits

- `fb82b02` — plan(260812-k6c)
- `ab2934f` — feat(260812-k6c): middleware
- `00a5e11` — feat(260812-k6c): navegação role-aware + nav do Admin
