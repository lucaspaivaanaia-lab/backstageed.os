---
phase: quick-260805-hbs
plan: 01
subsystem: infra
tags: [nextjs, seo, robots, middleware, metadata-routes]

requires: []
provides:
  - "app/robots.ts (Next.js Metadata Route) serving /robots.txt with total Disallow: /"
  - "robots: { index: false, follow: false } on the root layout's metadata, inherited by every route"
  - "middleware.ts matcher fix so /robots.txt is publicly reachable by anonymous crawlers"
affects: [deploy, seo]

tech-stack:
  added: []
  patterns:
    - "Next.js App Router Metadata Files convention (app/robots.ts default export typed MetadataRoute.Robots)"

key-files:
  created: [app/robots.ts]
  modified: [app/layout.tsx, middleware.ts]

key-decisions:
  - "No environment branching (NODE_ENV/VERCEL_ENV) — noindex/disallow applies identically in dev and production, per explicit product decision already closed in the plan."
  - "middleware.ts matcher extended to exclude robots.txt alongside favicon.ico/static assets — required for the feature to actually work, not a scope violation: without it, anonymous requests to /robots.txt were 307-redirected to /login, which per Google's spec causes crawlers to treat robots.txt as absent and default to full crawl permission (the exact opposite of the plan's goal)."

patterns-established:
  - "Public, unauthenticated Next.js Metadata Route files (robots.txt, and any future sitemap.xml) must be added to middleware.ts's matcher exclusion list alongside favicon.ico/static assets, or the app's auth gate will intercept and break them."

requirements-completed: [QUICK-260805-hbs]

duration: ~20min
completed: 2026-08-05
---

# Quick Task 260805-hbs: Adicionar noindex na build de produção Summary

**Bloqueio total de indexação/crawling via `app/robots.ts` (Disallow: /) + `robots: { index: false, follow: false }` no metadata do root layout — e correção de um bug real no `middleware.ts` que, sem o fix, invertia silenciosamente o efeito pretendido.**

## Performance

- **Duration:** ~20 min
- **Completed:** 2026-08-05T15:36:04Z
- **Tasks:** 1 (autonomous, no checkpoint)
- **Files modified:** 3 (1 created, 2 modified)

## Accomplishments
- `app/robots.ts` novo — Metadata Route retornando `{ rules: { userAgent: "*", disallow: "/" } }`, sem nenhuma leitura de `process.env`.
- `app/layout.tsx` — campo `robots: { index: false, follow: false }` adicionado ao `metadata` existente; `title`/`description` intactos.
- Bug real descoberto e corrigido em `middleware.ts`: o matcher da auth gate excluía `favicon.ico` e extensões de imagem estáticas do gate de autenticação, mas não `robots.txt` — uma requisição anônima a `/robots.txt` recebia `307` para `/login` em vez do arquivo. Isso é mais grave que "arquivo inacessível": por spec do Google, quando a busca por `robots.txt` é redirecionada e o destino final não é um `robots.txt` válido, o crawler trata como "robots.txt não encontrado" e assume permissão total de crawl — o oposto exato do que este plano pretende entregar.

## Task Commits

Each task was committed atomically:

1. **Task 1: Criar app/robots.ts e adicionar robots ao metadata do root layout (+ fix de escopo no middleware.ts)** - `96c767d` (feat)

_Nenhum commit de metadata separado foi feito para este quick task; este SUMMARY.md é commitado à parte, conforme instrução explícita do orquestrador para tarefas quick._

## Files Created/Modified
- `app/robots.ts` - Metadata Route do Next que gera `/robots.txt` com `Disallow: /` total, sem branching por ambiente.
- `app/layout.tsx` - campo `robots: { index: false, follow: false }` adicionado ao objeto `metadata` já existente.
- `middleware.ts` - matcher da auth gate ganhou `robots.txt` na mesma allowlist de assets públicos já usada para `favicon.ico`/extensões estáticas.

## Decisions Made
- Nenhuma ramificação por `NODE_ENV`/`VERCEL_ENV` foi introduzida — decisão já fechada pelo usuário no próprio plano, implementada como está.
- O fix em `middleware.ts` foi tratado como Rule 1 (auto-fix de bug) e não como decisão arquitetural: é uma adição de um segmento a uma allowlist regex já existente, seguindo exatamente o padrão já usado para `favicon.ico` — nenhuma tabela nova, nenhuma troca de biblioteca, nenhuma mudança na abordagem de auth.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] middleware.ts bloqueava /robots.txt atrás do auth gate, invertendo o efeito pretendido**
- **Found during:** Task 1, Gate 5 (verificação de comportamento real com `npm run start` numa porta local)
- **Issue:** O `matcher` do `middleware.ts` excluía apenas `_next/static`, `_next/image`, `favicon.ico` e extensões de imagem estáticas do gate de autenticação. `/robots.txt` não estava na lista, então uma requisição anônima recebia `307 Temporary Redirect` para `/login` em vez do conteúdo do `robots.txt`. Verificado com `curl -sv`: `< HTTP/1.1 307` + `< location: /login`. Isso não é apenas "a feature não funciona" — por spec do Google Search Console, quando a busca por `robots.txt` é redirecionada para uma página que não é um `robots.txt` válido, o crawler trata a ausência como "sem restrições" e assume permissão total de indexação, o oposto exato do objetivo desta tarefa.
- **Fix:** Adicionado `robots.txt` à mesma allowlist regex do `matcher` que já excluía `favicon.ico`, junto com um comentário explicando o porquê (evitar recorrência do mesmo erro em `app/sitemap.ts`, se algum dia for criado).
- **Files modified:** `middleware.ts`
- **Verification:** Rebuild (`tsc --noEmit`, `npm run build`) verde; servidor de produção reiniciado na porta 3100; `curl -s -o /dev/null -w "%{http_code}"` para `/robots.txt` retornou `200` (antes: `307`); corpo de `/robots.txt` contém `User-Agent: *` e `Disallow: /`; `/login` continua servindo `<meta name="robots" content="noindex, nofollow"/>` normalmente.
- **Committed in:** `96c767d` (parte do commit único da Task 1)

---

**Total deviations:** 1 auto-fixed (1 bug crítico de escopo funcional)
**Impact on plan:** O fix era estritamente necessário para que o próprio objetivo do plano (bloquear indexação) funcionasse de fato — sem ele, o `/robots.txt` entregue seria contraproducente. O diff toca 3 arquivos em vez dos 2 originalmente escopados no plano (`app/robots.ts`, `app/layout.tsx`, `middleware.ts`), mas a mudança em `middleware.ts` é de uma linha (mais comentário), segue um padrão já existente no próprio arquivo, e não introduz nenhuma nova superfície de risco — pelo contrário, fecha uma. Nenhum scope creep além disso.

## Issues Encountered
- O worktree de execução não tinha `.env.local` (arquivo gitignorado, não copiado na criação do worktree) — sem ele, `npm run start` falhava com "Your project's URL and Key are required to create a Supabase client!" antes mesmo de chegar nas rotas. Copiado de `/Users/lucaspaiva/projects/backstageed.OS/.env.local` (repo principal) para o worktree apenas para permitir a verificação local de produção na porta 3100; é um arquivo local/gitignorado, nunca staged nem commitado, sem impacto no diff do código.

## User Setup Required
None - nenhuma configuração de serviço externo necessária. Nenhuma variável de ambiente nova foi introduzida.

## Next Phase Readiness
- Task totalmente autônoma (sem checkpoint) — todos os gates automatizados (tsc/lint/build + verificação de comportamento real em produção local) passaram. Não é necessário nenhum passo de human-verify adicional para este quick task.
- `/robots.txt` e o `noindex` do layout estão prontos para o primeiro deploy de produção na Vercel; nenhuma ação adicional pendente relacionada a este item.

---
*Phase: quick-260805-hbs*
*Completed: 2026-08-05*

## Self-Check: PASSED

- FOUND: app/robots.ts
- FOUND: .planning/quick/260805-hbs-adicionar-noindex-na-build-de-producao-r/260805-hbs-SUMMARY.md
- FOUND: 96c767d (git log --oneline --all)
