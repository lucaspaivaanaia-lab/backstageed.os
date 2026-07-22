---
phase: quick-260722-eb7
plan: 01
subsystem: auth
tags: [nextjs, supabase-auth, pkce, middleware, navigation]

# Dependency graph
requires:
  - phase: 05-access-roles (05-01)
    provides: middleware.ts session refresh + pending/rejected/must_change_password gate + role routing; lib/supabase/server.ts and client.ts; lib/validation/client-access.ts changePasswordSchema
provides:
  - Hrefs absolutos em /admin/clients e /pm/clients (fim dos 404s de navegação por clique)
  - Nav persistente (AppNav) para /pm/* e /admin/* com logout funcional e link para /pm/chat
  - Fluxo completo de "esqueci minha senha" via Supabase Auth PKCE (login -> /forgot-password -> e-mail -> /auth/callback -> /reset-password -> /login)
  - PUBLIC_PATHS do middleware ampliado para as 3 novas rotas públicas do fluxo de reset
affects: [05-access-roles, 02-client-isolated-ai-chat]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Server Action de logout (signOut) invocada via <form action={signOut}> a partir de Client Component (AppNav)"
    - "Origin do redirectTo de resetPasswordForEmail derivado exclusivamente de headers().get(\"origin\") — sem env var de site-URL, com short-circuit para sucesso genérico se ausente"
    - "PKCE recovery: /auth/callback troca code por sessão via exchangeCodeForSession, então /reset-password confirma via getUser() e encerra a sessão de recuperação com signOut() após updateUser bem-sucedido"

key-files:
  created:
    - lib/actions/auth.ts
    - components/layout/app-nav.tsx
    - app/pm/layout.tsx
    - app/admin/layout.tsx
    - app/(auth)/forgot-password/actions.ts
    - app/(auth)/forgot-password/page.tsx
    - app/auth/callback/route.ts
    - app/(auth)/reset-password/actions.ts
    - app/(auth)/reset-password/page.tsx
  modified:
    - app/admin/clients/page.tsx
    - app/pm/clients/page.tsx
    - app/(auth)/login/page.tsx
    - middleware.ts

key-decisions:
  - "Origin do link de reset vem apenas de headers().get(\"origin\"); nenhuma env var de site-URL foi introduzida, conforme restrição do plano"
  - "middleware.ts: apenas PUBLIC_PATHS foi editado, adicionando /forgot-password, /reset-password, /auth/callback; isPublicPath, gates e role-routing permaneceram intactos"

patterns-established:
  - "AppNav reutilizável (components/layout/app-nav.tsx) recebe links por prop e destaca a rota ativa via usePathname; reutilizado por /pm e /admin"

requirements-completed: [NAV-FIX, NAV-SHELL, AUTH-RESET]

# Metrics
duration: 8min
completed: 2026-07-22
---

# Phase quick-260722-eb7 Plan 01: Corrigir navegação quebrada e fluxo de reset de senha Summary

**Hrefs absolutos em admin/clients e pm/clients, nav persistente (AppNav) com logout e link para /pm/chat, e fluxo completo de "esqueci minha senha" via Supabase Auth PKCE (login -> /forgot-password -> /auth/callback -> /reset-password), com middleware.ts allowlist ampliado apenas nas 3 rotas necessárias.**

## Performance

- **Duration:** ~8 min (primeiro commit 10:39:18-03:00, último 10:44:12-03:00, mais Task 6 de verificação)
- **Started:** 2026-07-22T10:39:18-03:00
- **Completed:** 2026-07-22T10:44:12-03:00
- **Tasks:** 6/6
- **Files modified:** 13 (4 modificados, 9 criados)

## Accomplishments
- Corrigidos os 6 hrefs relativos em admin/clients e pm/clients que causavam 404s de rota errada (`./new` -> `/admin/clients/new` etc.)
- Nav persistente por clique nas áreas PM e Admin, incluindo o link antes ausente para /pm/chat, e logout funcional (Server Action signOut + redirect /login)
- Fluxo real de recuperação de senha: link no login, página /forgot-password com resposta anti-enumeração sempre genérica, route handler /auth/callback trocando o code PKCE por sessão, página /reset-password reutilizando changePasswordSchema e encerrando a sessão de recuperação após sucesso
- middleware.ts com allowlist ampliado apenas nas 3 rotas do novo fluxo, sem tocar nos gates de pending/rejected/must_change_password/role-routing

## Task Commits

Each task was committed atomically:

1. **Task 1: Corrigir os 6 hrefs relativos em admin/clients e pm/clients** - `903d077` (fix)
2. **Task 2: Server Action de logout + AppNav reutilizavel + layouts /pm e /admin** - `26f59c6` (feat)
3. **Task 3: Link no login + pagina/acao /forgot-password (anti-enumeracao)** - `fe502d5` (feat)
4. **Task 4: Route Handler de callback + pagina/acao /reset-password** - `2eb5b6c` (feat)
5. **Task 5: Adicionar novas rotas publicas ao middleware** - `460c5bb` (fix)
6. **Task 6: Scope gate — verificação, nenhum arquivo modificado** - verificação apenas, sem commit de código (ver seção abaixo)

**Plan metadata:** (commit de docs feito pelo orquestrador após merge)

## Files Created/Modified
- `app/admin/clients/page.tsx` - hrefs absolutos `/admin/clients/new` e `/admin/clients/${client.id}`
- `app/pm/clients/page.tsx` - hrefs absolutos `/pm/clients/new` e `/pm/clients/${client.id}`
- `lib/actions/auth.ts` - Server Action `signOut()` (signOut + redirect /login)
- `components/layout/app-nav.tsx` - Client Component de nav reutilizável, destaque de rota ativa, form de logout
- `app/pm/layout.tsx` - layout persistente da área PM com links Clientes + Chat
- `app/admin/layout.tsx` - layout persistente da área Admin com links Clientes + Aprovações
- `app/(auth)/login/page.tsx` - link "Esqueceu sua senha?" para /forgot-password
- `app/(auth)/forgot-password/actions.ts` - `requestPasswordReset` sempre retorna `{ success: true }`; origin só de `headers().get("origin")`
- `app/(auth)/forgot-password/page.tsx` - formulário + mensagem genérica anti-enumeração
- `app/auth/callback/route.ts` - troca `code` por sessão via `exchangeCodeForSession`, redireciona para `next`
- `app/(auth)/reset-password/actions.ts` - `updatePassword` valida com `changePasswordSchema`, `updateUser` + `signOut`
- `app/(auth)/reset-password/page.tsx` - formulário de nova senha, toast + `router.push("/login")`
- `middleware.ts` - `PUBLIC_PATHS` acrescido de `/forgot-password`, `/reset-password`, `/auth/callback`

## Decisions Made
- Origin do `redirectTo` de `resetPasswordForEmail` vem exclusivamente de `headers().get("origin")`; nenhuma `NEXT_PUBLIC_SITE_URL` ou outra env var foi introduzida — se o origin vier ausente, a action retorna sucesso genérico sem chamar o Supabase (conforme restrição explícita do plano).
- `middleware.ts` só teve o array `PUBLIC_PATHS` tocado — `isPublicPath`, o gate pending/rejected/deactivated, o gate `must_change_password`, o role-routing e `config.matcher` permaneceram exatamente como estavam.

## Deviations from Plan

None - plan executado exatamente como escrito. Um ajuste cosmético foi feito no comentário de `app/(auth)/forgot-password/actions.ts` (Task 3): o texto explicativo originalmente citava literalmente a string `NEXT_PUBLIC_SITE_URL` para explicar o que NÃO fazer, o que colidia com o próprio grep negativo do `<verify>` da task (`! grep -q 'NEXT_PUBLIC_SITE_URL'`). O comentário foi reescrito para não conter essa string literal, mantendo a mesma explicação em prosa. Nenhum código funcional foi alterado por isso — não conta como desvio de Regra 1-4, apenas correção de redação do comentário para não autocontradizer o próprio gate de verificação.

## Issues Encountered
None.

## Scope Gate (Task 6)

Rodado após o Task 5, com todo o trabalho já commitado: `git status --porcelain` retornou vazio (nenhum arquivo pendente). O grep negativo de escopo (`supabase/migrations/`, `lib/validation/`, `clients/[id]/access/actions`, `chat/actions`, `approvals/actions`, `client-detail-form`) não encontrou nenhuma correspondência — `SCOPE_OK`. Nenhum arquivo fora de `files_modified` foi tocado.

## User Setup Required

None - nenhuma configuração externa necessária. O fluxo de reset depende do template de e-mail "Reset Password" do Supabase Auth já configurado no projeto para apontar para `/auth/callback` (comportamento padrão do PKCE flow do Supabase, sem mudança de configuração necessária neste quick fix).

## Next Phase Readiness
- Navegação por clique nas áreas PM/Admin está funcional, incluindo logout.
- Fluxo de recuperação de senha está pronto ponta a ponta (login -> forgot-password -> e-mail -> callback -> reset-password -> login).
- Risco residual aceito e documentado no `<threat_model>` do plano (T-eb7-02): entre o redirect de `/auth/callback` e a conclusão do formulário de reset, a sessão de recuperação PKCE é uma sessão Supabase comum com acesso normal por papel — comportamento herdado do Supabase, não introduzido por este plano, fora de escopo deste quick fix.
- Nenhum bloqueio identificado para as próximas fases.

---
*Phase: quick-260722-eb7*
*Completed: 2026-07-22*

## Self-Check: PASSED

All 13 files listed in `key-files` confirmed present on disk (`FOUND`). All 5 task commit hashes (`903d077`, `26f59c6`, `fe502d5`, `2eb5b6c`, `460c5bb`) confirmed in `git log --oneline --all`. No missing items.
