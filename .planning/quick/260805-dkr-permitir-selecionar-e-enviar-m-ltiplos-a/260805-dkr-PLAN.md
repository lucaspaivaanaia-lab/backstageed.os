---
phase: quick-260805-dkr
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - lib/client-files/multi-upload.ts
  - lib/client-files/multi-upload.test.ts
  - components/clients/client-files-section.tsx
  - package.json
autonomous: false
requirements: [QUICK-260805-dkr]

must_haves:
  truths:
    - "O PM consegue selecionar mais de um arquivo de uma vez no seletor nativo do sistema em \"Arquivos do cliente\""
    - "Ao clicar em \"Enviar\", todos os arquivos selecionados são enviados e aparecem na lista de arquivos do cliente"
    - "Se um arquivo falhar e outros derem certo, os que deram certo aparecem na lista E a falha do outro é mostrada com o nome do arquivo (nunca silenciosa)"
    - "Selecionar mais arquivos do que as vagas restantes (FILE_LIMIT=3) envia só os que cabem e informa explicitamente quais ficaram de fora"
    - "O botão mostra progresso enquanto vários arquivos estão sendo enviados"
    - "O auto-fill do briefing roda uma única vez após o lote, não uma vez por arquivo"
  artifacts:
    - path: "lib/client-files/multi-upload.ts"
      provides: "Helpers puros de vagas restantes e resumo de resultados do lote"
      exports: ["remainingSlots", "splitBySlots", "summarizeUploadOutcomes"]
    - path: "lib/client-files/multi-upload.test.ts"
      provides: "Testes node:test dos helpers (limite, parcial, tudo-ok, tudo-falha)"
    - path: "components/clients/client-files-section.tsx"
      provides: "Seleção e envio de múltiplos arquivos com progresso e erro agregado"
      contains: "multiple"
  key_links:
    - from: "components/clients/client-files-section.tsx"
      to: "lib/actions/client-files.ts uploadClientFile"
      via: "loop sequencial com um FormData novo por arquivo"
      pattern: "for .*of accepted"
    - from: "components/clients/client-files-section.tsx"
      to: "lib/client-files/multi-upload.ts"
      via: "import de splitBySlots/summarizeUploadOutcomes"
      pattern: "from \"@/lib/client-files/multi-upload\""
    - from: "package.json test script"
      to: "lib/client-files/*.test.ts"
      via: "glob do node --test"
      pattern: "lib/client-files/\\*.test.ts"
---

<objective>
Permitir que o PM/Admin selecione e envie **um ou mais** arquivos de uma vez na seção "Arquivos do cliente" (`/pm/clients/[id]` e `/admin/clients/[id]`), hoje limitada a um arquivo por vez.

Purpose: hoje enviar os ~3 arquivos base de um cliente exige três ciclos completos de escolher → enviar → esperar extração. Com o teste do cliente Netuxa em andamento, isso é atrito puro.
Output: helper puro testado para o lote + UI de upload múltiplo com progresso e relato de falhas parciais.

**Fora de escopo (não fazer):** drag-and-drop, redesenho da seção de arquivos, mudança no modelo de extração/armazenamento (`extractDocumentText` → texto puro em `public.client_files`), mudança de RLS/migrations, mudança no `FILE_LIMIT` de 3, mudança em `uploadClientFile` (a Server Action continua sendo **um arquivo por chamada**).
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
@$HOME/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/STATE.md
@CLAUDE.md
@components/clients/client-files-section.tsx
@lib/actions/client-files.ts
@lib/client-files/limit.ts

<interfaces>
<!-- Contratos já existentes no código. Use-os direto, sem explorar o codebase. -->

De `lib/client-files/limit.ts`:
- `FILE_LIMIT: number` (= 3)
- `FILE_LIMIT_MESSAGE: string`
- `atFileLimit(count: number): boolean`

De `lib/actions/client-files.ts` (Server Actions, **não alterar**):
- `uploadClientFile(clientId: string, formData: FormData): Promise<{ success: true } | { error: string }>`
  — lê `formData.get("file")`, valida extensão/tamanho (5MB), checa `atFileLimit(count)` no banco, extrai texto, insere. **Um arquivo por chamada.**
- `listClientFiles(clientId: string): Promise<ClientFileRow[]>`
- `deleteClientFile(fileId: string): Promise<{ success: true } | { error: string }>`
- `type ClientFileRow = { id: string; filename: string; file_type: string; created_at: string }`

De `lib/actions/clients.ts`:
- `autofillBriefingFromFiles(clientId): Promise<{ success: true; briefing: BriefingInput } | { error: string }>`

Estilo de teste do projeto (`lib/extract/extract-text.test.ts`): `node:test` + `node:assert/strict`, import com extensão `.ts` explícita (`from "./multi-upload.ts"`), rodado via `npm test` (`node --test lib/<dir>/*.test.ts`).
</interfaces>
</context>

<tasks>

<task type="auto" tdd="true">
  <name>Task 1: Helpers puros do lote de upload (vagas restantes + resumo de resultados)</name>
  <files>lib/client-files/multi-upload.ts, lib/client-files/multi-upload.test.ts, package.json</files>
  <behavior>
    - `remainingSlots(0)` → 3; `remainingSlots(2)` → 1; `remainingSlots(3)` → 0; `remainingSlots(5)` → 0 (nunca negativo)
    - `splitBySlots(["a","b","c","d"], 1)` → `{ accepted: ["a","b"], skipped: ["c","d"] }` (preserva a ordem da seleção)
    - `splitBySlots(["a"], 3)` → `{ accepted: [], skipped: ["a"] }` (cliente já no teto)
    - `splitBySlots([], 0)` → `{ accepted: [], skipped: [] }`
    - `summarizeUploadOutcomes([{filename:"a.pdf"},{filename:"b.pdf"}], [])` → `{ successCount: 2, message: null }` (sucesso total não gera mensagem)
    - `summarizeUploadOutcomes([{filename:"a.pdf"},{filename:"b.pdf",error:"Arquivo muito grande. O limite é 5MB."}], [])` → `successCount: 1` e `message` contendo `"b.pdf"` e o texto do erro, e **não** contendo `"a.pdf"`
    - `summarizeUploadOutcomes([{filename:"a.pdf",error:"X"}], [])` → `successCount: 0`, `message` não-nula
    - `summarizeUploadOutcomes([{filename:"a.pdf"}], ["c.pdf","d.pdf"])` → `successCount: 1`, `message` contendo `"c.pdf"`, `"d.pdf"` e o número 3 (o teto)
  </behavior>
  <action>
Crie `lib/client-files/multi-upload.ts` importando `FILE_LIMIT` de `./limit.ts` (nunca redeclare o número 3 — o teto tem uma única fonte). Exporte:

1. `remainingSlots(currentCount: number): number` — `Math.max(0, FILE_LIMIT - currentCount)`.
2. `splitBySlots<T>(items: T[], currentCount: number): { accepted: T[]; skipped: T[] }` — genérico (será usado com `File[]` na UI e com `string[]` nos testes), corta em `remainingSlots(currentCount)` preservando a ordem.
3. `export type UploadOutcome = { filename: string; error?: string }`.
4. `summarizeUploadOutcomes(outcomes: UploadOutcome[], skippedNames: string[]): { successCount: number; message: string | null }` — `successCount` = outcomes sem `error`. `message` é `null` **somente** quando não há nenhuma falha e nenhum skipped; caso contrário monta um texto em pt-BR com uma linha por falha no formato `"<filename>: <error>"` e, se houver skipped, uma linha final citando os nomes pulados e o limite de `FILE_LIMIT` arquivos por cliente. Não use `FILE_LIMIT_MESSAGE` literal aqui (ela fala de "remova um arquivo antes de enviar outro", que não descreve o caso de lote parcial) — escreva a frase do lote referenciando `${FILE_LIMIT}` por interpolação.

Escreva `lib/client-files/multi-upload.test.ts` cobrindo cada item de `<behavior>` (import `./multi-upload.ts` com extensão, `node:test` + `node:assert/strict`, no estilo de `lib/extract/extract-text.test.ts`).

Em `package.json`, adicione `lib/client-files/*.test.ts` ao glob do script `test` (mantendo todos os globs já existentes) — sem esse passo o teste novo nunca roda em CI/local.
  </action>
  <verify>
    <automated>npm test 2>&1 | tail -20 && npm test 2>&1 | grep -q "multi-upload" && npx tsc --noEmit</automated>
  </verify>
  <done>`npm test` executa e passa incluindo os casos de multi-upload; `npx tsc --noEmit` limpo; `package.json` lista `lib/client-files/*.test.ts` no script `test`.</done>
</task>

<task type="auto">
  <name>Task 2: Seleção e envio de múltiplos arquivos na ClientFilesSection</name>
  <files>components/clients/client-files-section.tsx</files>
  <action>
Altere **apenas** o bloco de upload (o `<form action={handleUpload}>` e o estado que ele usa). Não toque na listagem, no `handleDelete`, no badge de `atFileLimit`, nem no `<TranscriptUpdateSection />`.

1. **Input**: adicione `multiple` ao `<input type="file" name="file" .../>` (mantém `name="file"`, `accept`, `className="hidden"` e o `fileInputRef`).
2. **Estado de seleção**: troque `selectedFileName: string | null` por `selectedNames: string[]` (`useState<string[]>([])`). No `onChange`: `setSelectedNames(Array.from(event.target.files ?? []).map((f) => f.name))`.
3. **Rótulo da seleção**: quando `selectedNames.length === 0` → `"Nenhum arquivo selecionado"`; quando `=== 1` → o nome; quando `> 1` → `${selectedNames.length} arquivos selecionados`.
4. **Botões**: `"Escolher arquivo(s)"` e `"Enviar arquivo(s)"`; `disabled={isUploadPending || selectedNames.length === 0}` no submit.
5. **Progresso**: adicione `const [progress, setProgress] = useState<{ done: number; total: number } | null>(null)`. Enquanto `isUploadPending`, o label do submit é `Enviando ${progress.done + 1} de ${progress.total}...` quando `progress && progress.total > 1`, senão `"Enviando..."`. Limpe (`setProgress(null)`) ao final do lote.
6. **`handleUpload(formData)`** reescrito, dentro do mesmo `startUploadTransition`:
   - `const picked = formData.getAll("file").filter((v): v is File => v instanceof File && v.size > 0);`
   - se `picked.length === 0` → `setUploadError("Selecione ao menos um arquivo para enviar.")` e retorne.
   - `const { accepted, skipped } = splitBySlots(picked, files.length);` (import de `@/lib/client-files/multi-upload`). Se `accepted.length === 0`, pule direto para o resumo (mensagem de skipped) sem chamar a Server Action.
   - **Loop sequencial obrigatório** (`for (const file of accepted) { ... await ... }`), **nunca `Promise.all`**: `uploadClientFile` faz read-then-insert do contador para checar `atFileLimit` no banco, então chamadas concorrentes podem todas ler o mesmo count pré-insert e ultrapassar o teto de 3. A cada volta: monte um `FormData` novo com `fd.append("file", file)`, chame `await uploadClientFile(clientId, fd)`, empurre `{ filename: file.name, error }` (ou sem `error`) num array de `UploadOutcome`, e atualize `setProgress({ done: i + 1, total: accepted.length })`.
   - Depois do loop: `const { successCount, message } = summarizeUploadOutcomes(outcomes, skipped.map((f) => f.name));` → `setUploadError(message)` (null limpa o box).
   - Se `successCount > 0`: limpe `fileInputRef.current.value`, `setSelectedNames([])`, e `setFiles(await listClientFiles(clientId))`. Se `successCount === 0`, **mantenha** a seleção para o usuário poder tentar de novo.
   - **Auto-fill do briefing uma única vez por lote**, e só se `successCount > 0`: `await autofillBriefingFromFiles(clientId)` → em `"success" in autofill`, `onBriefingAutofilled?.(...)` + `toast.success(BRIEFING_AUTOFILLED_TOAST)`. Falha continua silenciosa, como hoje.
   - `setProgress(null)` no fim.
7. Atualize o comentário existente sobre `selectedFileName` (linhas ~52-62) para descrever `selectedNames` — o padrão hidden-input + `fileInputRef.current.click()` continua valendo e **não deve ser trocado** por um input nativo visível.
  </action>
  <verify>
    <automated>npx tsc --noEmit && npm run lint && npm test && npm run build && grep -n 'multiple' components/clients/client-files-section.tsx && ! grep -n 'Promise.all' components/clients/client-files-section.tsx</automated>
  </verify>
  <done>tsc/lint/test/build verdes; o input tem `multiple`; o envio é um loop sequencial (`Promise.all` ausente do arquivo); `autofillBriefingFromFiles` é chamado no máximo uma vez por lote.</done>
</task>

<task type="checkpoint:human-verify" gate="blocking">
  <name>Task 3: Verificacao manual do envio multiplo</name>
  <files>components/clients/client-files-section.tsx</files>
  <action>Pausar para o developer validar o fluxo no browser conforme how-to-verify abaixo. Nao alterar codigo ate receber o sinal.</action>
  <what-built>Seleção múltipla no seletor nativo + envio sequencial do lote, com progresso, corte pelas vagas restantes (limite de 3) e ErrorBox agregado nomeando cada arquivo que falhou ou foi pulado. Auto-fill do briefing roda uma vez por lote.</what-built>
  <how-to-verify>
1. `npm run dev`, abra `/pm/clients/[id]` de um cliente **sem nenhum arquivo** (ou remova os existentes).
2. Clique em "Escolher arquivo(s)" → no seletor do sistema, selecione **2 arquivos de uma vez** (ex.: um .pdf e um .txt com texto real). O rótulo deve mostrar "2 arquivos selecionados".
3. Clique em "Enviar arquivo(s)". Esperado: o botão mostra "Enviando 1 de 2..." → "Enviando 2 de 2...", e ao final **os 2 arquivos aparecem na lista**.
4. Repita selecionando **3 arquivos** num cliente que já tem 2 (só resta 1 vaga). Esperado: 1 é enviado, e o ErrorBox nomeia os 2 que ficaram de fora citando o limite de 3.
5. Teste falha parcial: selecione 1 arquivo válido + 1 arquivo `.png` (formato não suportado) num cliente vazio. Esperado: o válido entra na lista, o ErrorBox mostra `nome.png: Formato não suportado...`.
6. Confirme que o envio de **um único** arquivo continua funcionando igual a antes (inclusive o toast de briefing preenchido pela IA).
  </how-to-verify>
  <resume-signal>Digite "aprovado" ou descreva o que quebrou</resume-signal>
  <verify><human-check>Developer confirma os 6 passos acima</human-check></verify>
  <done>Developer respondeu "aprovado" (ou os problemas relatados foram corrigidos e reverificados)</done>
</task>

</tasks>

<threat_model>
## Trust Boundaries

| Boundary | Description |
|----------|-------------|
| browser → Server Action (`uploadClientFile`) | seleção de arquivos do usuário atravessa aqui; nada do lado do cliente é confiável |
| Server Action → Postgres (`client_files`) | RLS `client_files_insert_scoped` é a fronteira real de autorização |

## STRIDE Threat Register

| Threat ID | Category | Component | Disposition | Mitigation Plan |
|-----------|----------|-----------|-------------|-----------------|
| T-dkr-01 | Elevation of Privilege | `splitBySlots` no cliente | accept | O corte por vagas no cliente é só UX. A checagem real de `atFileLimit` continua na Server Action a cada chamada, contra o count real do banco — nenhum caminho novo de bypass é criado, porque a action não mudou. |
| T-dkr-02 | Denial of Service | loop de upload no cliente | mitigate | Envio **sequencial** (nunca `Promise.all`): evita N extrações concorrentes (unpdf/mammoth) num único request handler e evita a corrida read-then-insert que deixaria o cliente passar de 3 arquivos. `accepted` é cortado por `remainingSlots`, então no máximo 3 chamadas por lote. |
| T-dkr-03 | Tampering | validação por arquivo | mitigate | Cada arquivo passa individualmente pela validação já existente da action (extensão em `ALLOWED_EXTENSIONS`, 5MB, `extractDocumentText` bloqueando insert em falha). Nenhuma validação é movida para o cliente. |
| T-dkr-04 | Information Disclosure | mensagem agregada de erro | mitigate | `summarizeUploadOutcomes` só repassa as mensagens amigáveis já retornadas pela action (que nunca expõem erro bruto de banco/parse) + os nomes dos arquivos que o próprio usuário selecionou. |
| T-dkr-SC | Tampering | npm/pip/cargo installs | mitigate | Nenhuma dependência nova é instalada neste plano — sem superfície de supply chain. |
</threat_model>

<verification>
- `npx tsc --noEmit` limpo
- `npm run lint` limpo
- `npm test` passa, incluindo `lib/client-files/multi-upload.test.ts`
- `npm run build` verde
- Nenhuma migration, nenhuma política RLS e nenhuma assinatura de Server Action alterada (`git diff --stat` deve tocar só os 4 arquivos de `files_modified`)
</verification>

<success_criteria>
- O seletor nativo permite escolher vários arquivos de uma vez em "Arquivos do cliente"
- Um lote de N arquivos é enviado com uma chamada sequencial de `uploadClientFile` por arquivo, respeitando o teto de 3
- Falhas parciais nunca são silenciosas: cada arquivo que falhou ou foi pulado aparece nomeado no ErrorBox, e os que deram certo aparecem na lista
- Enviar um único arquivo continua se comportando exatamente como antes (incluindo o auto-fill do briefing)
- Developer aprovou o checkpoint de verificação manual
</success_criteria>

<output>
Create `.planning/quick/260805-dkr-permitir-selecionar-e-enviar-m-ltiplos-a/260805-dkr-SUMMARY.md` when done
</output>
