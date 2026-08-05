---
phase: quick-260805-fku
plan: 01
subsystem: ui
tags: [nextjs, react-hook-form, board, copy]

# Dependency graph
requires: []
provides:
  - Modal "Criar card" no board de Produção com rótulo "Conteúdo do post" (antes "Descrição") e placeholder explicando que ali vai o texto do post
  - Botão "Importar do chat" com dica nativa (title) explicando seu propósito
affects: [content-production-kanban]

# Tech tracking
tech-stack:
  added: []
  patterns: []

key-files:
  created: []
  modified:
    - app/pm/board/board-panel.tsx

key-decisions:
  - "Manteve name=\"description\" (key do form/schema/banco) intacto — apenas o rótulo visível (FormLabel) e o placeholder mudaram, sem tocar em createCardSchema/CreateCardInput"
  - "Dica do botão \"Importar do chat\" implementada via atributo HTML nativo title (não existe componente Tooltip/Radix Tooltip no projeto e não deve ser introduzido para esta mudança de risco zero)"

patterns-established: []

requirements-completed: [QUICK-260805-FKU]

# Metrics
duration: ~20min
completed: 2026-08-05
---

# Quick Task 260805-fku: Renomear campo "Descrição" para "Conteúdo do post" no modal Criar card Summary

**Copy-only: rótulo/placeholder do textarea em `CreateCardDialog` trocados para deixar explícito que ali vai o texto do post, e o botão "Importar do chat" ganhou uma dica em hover — zero mudança de lógica, schema ou Server Actions.**

## Performance

- **Duration:** ~20 min
- **Completed:** 2026-08-05T14:20:14Z
- **Tasks:** 1 of 2 completed (Task 2 is a `checkpoint:human-verify` gate, pending)
- **Files modified:** 1

## Accomplishments
- `FormLabel` do campo de texto em `CreateCardDialog` (modal "Criar card") trocado de "Descrição" para "Conteúdo do post"
- Placeholder do mesmo campo trocado de "Opcional — contexto, briefing rápido, referências." para "O texto do post que será revisado e publicado."
- Botão "Importar do chat" (`ImportFromChatDialog`) ganhou o atributo `title="Cole aqui o texto gerado no Chat para criar o card automaticamente."`
- `name="description"` do `FormField` permanece intacto — nenhuma mudança em `createCardSchema`, `CreateCardInput`, `createCard` Server Action ou na validação com IA
- `<SectionTitle>Descrição</SectionTitle>` do detalhe do card (tela diferente, fora do escopo) permanece inalterado

## Task Commits

Each task was committed atomically:

1. **Task 1: Atualizar rótulo, placeholder e dica de importação** - `bbdb060` (feat)

Task 2 (`checkpoint:human-verify`, gate="blocking") is pending — see "Next Phase Readiness" below. No commit for Task 2 yet; it will be signed off after live browser verification.

## Files Created/Modified
- `app/pm/board/board-panel.tsx` - `FormLabel` e `placeholder` do campo de conteúdo em `CreateCardDialog` atualizados; `title` de dica adicionado ao botão "Importar do chat" em `ImportFromChatDialog`

## Decisions Made
- Manteve a key `description` do form/schema/banco intacta — apenas texto visível mudou (ver `key-decisions` acima)
- Dica do botão via atributo HTML `title` nativo, sem introduzir componente/lib de tooltip (nenhum existe no projeto; ver `<interfaces>` do plano)

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Materializado `node_modules` no worktree via `npm ci` para rodar `npm run build`**
- **Found during:** Task 1 verification (o gate de verificação exige `npm run build` verde)
- **Issue:** O worktree deste executor não tinha `node_modules` (diretório ausente desde a criação do worktree) — `npx tsc --noEmit` e `npm run lint` funcionaram porque resolveram módulos subindo diretórios até o repo principal, mas o Turbopack do `next build` se recusa a compilar/resolver pacotes fora do diretório do projeto (erro "we couldn't find the Next.js package... files outside of the project directory will not be compiled"). Uma tentativa de symlink `node_modules -> <repo principal>/node_modules` também falhou (Turbopack rejeita symlinks que apontam para fora do filesystem root do projeto).
- **Fix:** Rodei `npm ci` dentro do worktree — instala exatamente o que `package-lock.json` já fixa (nenhuma dependência nova, nenhum pacote diferente do que já está em uso no repo principal). Este é o mesmo padrão já usado por um executor anterior no mesmo ambiente (ver `.planning/quick/260805-fao-.../260805-fao-SUMMARY.md`, linha 99). O diretório é gitignored/untracked, não aparece no diff.
- **Files modified:** nenhum arquivo rastreado (apenas `node_modules/` local, gitignored)
- **Verification:** `npm run build` passou após o `npm ci` (24 rotas geradas, sem erros)
- **Committed in:** n/a — `node_modules` é gitignored, nada para commitar

---

**Total deviations:** 1 auto-fixed (1 blocking, ambiente/infra do worktree — não relacionado ao código da task)
**Impact on plan:** Nenhum. O código de produção (`app/pm/board/board-panel.tsx`) contém exatamente as 3 mudanças de copy planejadas; o desvio foi puramente de setup de ambiente de verificação.

## Issues Encountered
- `git merge-base` do worktree inicialmente divergia da base esperada do plano (`4e120478...`) — corrigido com `git reset --hard` para a base correta antes de iniciar qualquer edição (passo de setup padrão do executor, não uma issue de código).

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness

**Task 2 (checkpoint:human-verify, gate="blocking") está pendente.** Por instrução explícita deste fluxo, o executor não tentou verificação via browser — isso cabe à sessão orquestradora (main session) com credenciais reais, rodando o roteiro descrito no plano:

1. `npm run dev` e abrir `/pm/board` autenticado como PM, com um cliente selecionado
2. Clicar em "Criar card" — confirmar rótulo "Conteúdo do post" e o novo placeholder
3. Preencher título + conteúdo e criar o card — confirmar que o texto aparece no detalhe do card (`description` intacto)
4. Passar o mouse sobre "Importar do chat" (~1s) — confirmar a dica nativa do navegador
5. Importar um texto via "Importar do chat" — confirmar que o card continua sendo criado em Briefing como antes
6. Confirmar que o detalhe do card ainda mostra a seção "Descrição" (fora do escopo desta task)

Resume-signal esperado: "aprovado" ou uma descrição do que ficou estranho.

Após aprovação, este quick task pode ser fechado sem nenhum trabalho de código adicional — apenas o sign-off do checkpoint.

---
*Phase: quick-260805-fku*
*Completed: 2026-08-05 (Task 1 only; Task 2 pending human verification)*

## Self-Check: PASSED

- FOUND: app/pm/board/board-panel.tsx
- FOUND: bbdb060 (Task 1 commit)
- FOUND: .planning/quick/260805-fku-no-modal-criar-card-renomear-o-campo-des/260805-fku-SUMMARY.md
