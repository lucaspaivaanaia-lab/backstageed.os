---
phase: quick-260805-i1m
plan: 01
subsystem: ui
tags: [client-files, upload-limit, auth, login, signup]

# Dependency graph
requires:
  - phase: quick-260722-hnm
    provides: "lib/client-files/limit.ts (FILE_LIMIT/FILE_LIMIT_MESSAGE/atFileLimit), the shared ceiling consumed by upload + chat curation"
  - phase: quick-260805-dkr
    provides: "lib/client-files/multi-upload.ts (remainingSlots/splitBySlots/summarizeUploadOutcomes), the batch helpers whose tests were desacoupled from the literal 3"
provides:
  - "FILE_LIMIT raised from 3 to 20, with FILE_LIMIT_MESSAGE derived from the constant (no hardcoded number)"
  - "multi-upload.test.ts assertions now derive from FILE_LIMIT instead of the literal 3"
  - "/login now has a visible, functional 'Criar conta' link to /signup"
affects: [client-files, chat-knowledge-curation, auth]

# Tech tracking
tech-stack:
  added: []
  patterns: ["Constants that feed user-facing copy should be interpolated into a template literal, not duplicated as separate hardcoded strings, so the number can never drift"]

key-files:
  created: []
  modified:
    - lib/client-files/limit.ts
    - lib/client-files/multi-upload.test.ts
    - app/(auth)/login/page.tsx

key-decisions:
  - "20 chosen over unlimited: the RAG has no embeddings/vector search, so all client_files content is injected in full into the chat system prompt every turn — an unlimited ceiling risks unbounded prompt size/cost/context-window overflow. 20 is ~6.6x the old ceiling, covers real usage, keeps the guard-rail finite."
  - "The 3 downstream consumers (client-files-section.tsx, lib/actions/client-files.ts, app/pm/chat/actions.ts, multi-upload.ts) were deliberately left unedited — they already import FILE_LIMIT/atFileLimit/FILE_LIMIT_MESSAGE and pick up the new ceiling automatically. Editing them would have been scope creep per the plan's explicit instruction."

requirements-completed: [QUICK-260805-i1m]

# Metrics
duration: ~12min (code tasks only; human-check pending)
completed: 2026-08-05
---

# Quick Task 260805-i1m: Raise file limit to 20 + add signup link on login Summary

**FILE_LIMIT raised 3→20 (message now derived from the constant, no hardcoded number) and a secondary "Criar conta" link added to /login pointing at /signup**

## Performance

- **Duration:** ~12 min (Task 1 + Task 2 code work; the plan's human-check step is still pending, see below)
- **Tasks:** 2/2 automated tasks complete; 1 human-check step pending (not executable by this agent per dispatch instructions)
- **Files modified:** 3

## Accomplishments
- `FILE_LIMIT` raised from 3 to 20 in `lib/client-files/limit.ts`; `FILE_LIMIT_MESSAGE` converted from a literal string to a template literal derived from the constant, so the number can never drift out of sync again
- `lib/client-files/multi-upload.test.ts` assertions rewritten to derive from `FILE_LIMIT` instead of the literal `3` — the tests now validate helper *behavior*, not the specific ceiling value, so they won't break on a future limit change
- `/login` now has a secondary "Criar conta" link to `/signup`, mirroring the existing "Esqueceu sua senha?" link's exact visual pattern, with "Entrar" remaining the sole primary CTA

## Task Commits

Each task was committed atomically:

1. **Task 1: Elevar FILE_LIMIT de 3 para 20 e desacoplar o teste do número literal** - `5e89f80` (feat)
2. **Task 2: Adicionar link "Criar conta" para /signup na tela de login** - `ef38a5f` (feat)

**Plan metadata:** pre-dispatch commit `086de1c` (docs: pre-dispatch plan); this SUMMARY committed separately after both task commits.

## Files Created/Modified
- `lib/client-files/limit.ts` - `FILE_LIMIT = 20`; `FILE_LIMIT_MESSAGE` now a template literal; header comment explains why the ceiling is finite (full-content system-prompt injection, no embeddings)
- `lib/client-files/multi-upload.test.ts` - assertions for `remainingSlots`/`splitBySlots`/`summarizeUploadOutcomes` now derive from imported `FILE_LIMIT` instead of the literal `3`
- `app/(auth)/login/page.tsx` - new `<Link href="/signup">Criar conta</Link>` below the existing "Esqueceu sua senha?" link, same secondary-link styling, outside the `<form>`

## Decisions Made
- 20 over unlimited (locked decision, restated in the plan's objective and honored as-is): the RAG has no embeddings/vector search — all of a client's `client_files` content goes into the chat system prompt on every turn (`lib/chat/assemble-prompt.ts`), so an unlimited ceiling risks unbounded prompt size, cost, and eventual context-window overflow mid-conversation. 20 covers real usage with a wide margin while keeping the existing `atFileLimit`/`MAX_FILE_BYTES` guard-rails meaningful.
- Left the 4 downstream consumers of `FILE_LIMIT`/`atFileLimit`/`FILE_LIMIT_MESSAGE` untouched, exactly as the plan specified — they already interpolate the constant and pick up 20 automatically without any code change.

## Deviations from Plan

None - plan executed exactly as written. Both task `<verify><automated>` blocks passed in full:
- `npm test` — all 78 tests pass (multi-upload.test.ts assertions now FILE_LIMIT-derived)
- `npx tsc --noEmit` — clean
- `npm run lint` — 0 errors (3 pre-existing warnings in unrelated files: `client-create-form.tsx`, `client-detail-form.tsx` React Compiler incompatible-library notices, and an unused-var warning in `build-knowledge-markdown.test.ts` — none touched by this plan)
- `npm run build` — green
- Overall diff (`086de1c..HEAD`) touches exactly the 3 planned files: `lib/client-files/limit.ts`, `lib/client-files/multi-upload.test.ts`, `app/(auth)/login/page.tsx`
- Security scope gate `git diff -- supabase/ middleware.ts lib/actions/ app/pm/chat/actions.ts components/clients/` — empty, confirmed

## Issues Encountered

None during code execution. `node_modules` was missing in this worktree (known environment quirk per dispatch instructions) — resolved with `npm ci` before running `npm test`/`tsc`/`lint`/`build`.

## Human-Check — APROVADO

Rodado pela sessão orquestradora via Playwright com credenciais reais, contra o dev server local reiniciado após o merge:

1. Cliente de teste criado do zero, 4 arquivos enviados de uma vez (multi-upload) — todos os 4 apareceram na lista, o badge de limite NÃO apareceu (esperado: só aparece a partir de 20), e o formulário de upload continuou visível.
2. Texto "Até 20 arquivos (PDF/TXT/MD/DOCX)..." confirmado presente na seção "Arquivos do cliente".
3. `/login` mostra "Criar conta" abaixo de "Esqueceu sua senha?" — clique navegou corretamente para `/signup`.
4. Login real (credenciais reais) continua funcionando normalmente, chegando em `/pm`.

Todos os 4 passos aprovados sem ressalvas. Clientes de teste (3 no total, incluindo um criado durante debug de seletor) removidos do banco após a verificação.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

Ambas as tasks completas e o human-check aprovado. Nenhum trabalho adicional necessário — quick task fechado.

---
*Phase: quick-260805-i1m*
*Completed: 2026-08-05*

## Self-Check: PASSED

- FOUND: lib/client-files/limit.ts
- FOUND: lib/client-files/multi-upload.test.ts
- FOUND: app/(auth)/login/page.tsx
- FOUND: .planning/quick/260805-i1m-dois-ajustes-de-ux-remover-limite-de-3-a/260805-i1m-SUMMARY.md
- FOUND commit: 5e89f80
- FOUND commit: ef38a5f
