---
phase: quick-260805-fao
plan: 01
type: execute
wave: 1
depends_on: [260805-dkr]
files_modified:
  - next.config.ts
autonomous: false
requirements: [QUICK-260805-fao]

must_haves:
  truths:
    - "Um arquivo .txt real de ~1.1MB enviado via 'Arquivos do cliente' é aceito sem erro de runtime"
    - "O limite de negócio de 5MB por arquivo (MAX_FILE_BYTES em lib/actions/client-files.ts) continua sendo a validação efetiva — o config do Next.js só deixa de ser o teto artificial mais baixo"
  artifacts:
    - path: "next.config.ts"
      provides: "experimental.serverActions.bodySizeLimit configurado acima do MAX_FILE_BYTES de 5MB da action"
      contains: "bodySizeLimit"
---

<objective>
Corrigir "Body exceeded 1 MB limit" ao enviar um arquivo em "Arquivos do cliente" via `uploadClientFile` Server Action.

Purpose: reportado pelo usuário ao vivo em `/pm/clients/[id]` logo após o quick task 260805-dkr (upload múltiplo) ir ao ar — mas o bug é anterior e independente daquele task: Next.js limita o corpo de qualquer Server Action a 1MB por padrão, enquanto `lib/actions/client-files.ts` já validava até 5MB (`MAX_FILE_BYTES`) sem que `next.config.ts` jamais tivesse configurado esse teto do framework. Qualquer arquivo individual acima de ~1MB — enviado sozinho ou em lote — sempre teria batido nesse erro; só não tinha sido exercitado ainda com um arquivo real desse tamanho.

**Fora de escopo:** qualquer mudança em `MAX_FILE_BYTES`, `ALLOWED_EXTENSIONS` ou na lógica de `uploadClientFile`/extração — o teto de negócio de 5MB por arquivo continua o mesmo, só o teto de transporte do Next.js estava mais baixo que ele.
</objective>

<context>
De `lib/actions/client-files.ts`: `MAX_FILE_BYTES = 5 * 1024 * 1024` (5MB), validado dentro da action após o upload chegar ao servidor.
De `next.config.ts` (antes desta correção): nenhuma configuração de `experimental.serverActions.bodySizeLimit` — Next.js 16.2.9 usa o default de 1MB (`node_modules/next/dist/server/config-schema.js`, campo `serverActions.bodySizeLimit` dentro de `experimentalSchema`).
</context>

<tasks>

<task type="auto">
  <name>Task 1: Configurar bodySizeLimit acima do teto de 5MB da action</name>
  <files>next.config.ts</files>
  <action>
Adicionar `experimental.serverActions.bodySizeLimit: "6mb"` ao `nextConfig` em `next.config.ts`, com um comentário curto explicando por que 6mb (headroom acima dos 5MB de `MAX_FILE_BYTES` para a sobrecarga de framing do `multipart/form-data`). Não alterar `turbopack.root` nem nenhuma outra chave existente.
  </action>
  <verify>
    <automated>npx tsc --noEmit && npm run lint && npm run build</automated>
    <human-check>Reiniciar o dev server (mudança em next.config.ts não é hot-reloadable), enviar um arquivo real de ~1.1MB em "Arquivos do cliente" e confirmar ausência do erro "Body exceeded 1 MB limit"</human-check>
  </verify>
  <done>Build/lint/tsc verdes; upload ao vivo de um arquivo real de ~1.1MB concluído sem erro de runtime, arquivo aparece na lista.</done>
</task>

</tasks>

<verification>
- `npx tsc --noEmit`, `npm run lint`, `npm run build` limpos
- Verificado ao vivo via Playwright com credenciais reais: cliente novo, upload de arquivo `.txt` de ~1.1MB, sem "Body exceeded" nem "Runtime Error" na página, arquivo listado com sucesso
- Cliente de teste removido do banco após verificação
</verification>

<success_criteria>
- Upload de arquivos entre 1MB e 5MB (o teto real de negócio já validado pela action) para de falhar com erro de transporte do Next.js
- Nenhuma mudança de comportamento para arquivos abaixo de 1MB ou acima de 5MB (que já era rejeitado pela action, comportamento inalterado)
</success_criteria>

<output>
Create `.planning/quick/260805-fao-corrigir-erro-body-exceeded-1-mb-limit-a/260805-fao-SUMMARY.md` when done
</output>
