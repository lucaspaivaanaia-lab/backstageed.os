---
phase: quick-260805-iea
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - lib/actions/client-files.ts
  - components/clients/transcript-update-section.tsx
autonomous: false
requirements: [QUICK-260805-iea]

must_haves:
  truths:
    - "Na seção \"Atualizar arquivo via transcrição de reunião\", o PM/Admin continua conseguindo COLAR uma transcrição e clicar em \"Analisar transcrição\" exatamente como hoje — mesmo placeholder, mesmo botão, mesmo resultado"
    - "Como alternativa ao campo de texto, o PM/Admin consegue ESCOLHER UM ARQUIVO (PDF/TXT/MD/DOCX) com a transcrição, e a análise dispara sozinha na seleção, sem um segundo clique"
    - "Depois da análise, os dois caminhos caem no MESMO fluxo de revisão (resumo + novidades/contradições + texto proposto editável) e no MESMO \"Confirmar atualização\"/\"Descartar\""
    - "Enquanto um arquivo está sendo analisado, a UI mostra um rótulo distinto (\"Analisando arquivo...\") do rótulo do caminho de texto colado (\"Analisando...\"), então o PM sabe qual caminho está rodando"
    - "O arquivo de transcrição enviado NUNCA é persistido: não vira linha em client_files, não aparece na lista \"Arquivos do cliente\", e só o texto extraído dele existe em memória até o confirmar/descartar"
    - "Erros do caminho de arquivo (formato não suportado, arquivo grande demais, texto ilegível, falha da IA) aparecem no MESMO ErrorBox já usado pelo caminho de texto colado — há uma única superfície de erro, não duas"
    - "O seletor \"Arquivo base a atualizar\" segue único e compartilhado: o arquivo base escolhido nele é o alvo dos dois caminhos"
    - "O passo de persistência (updateClientFileContent) continua idêntico e agnóstico ao caminho — nenhuma linha dele muda"
  artifacts:
    - path: "lib/actions/client-files.ts"
      provides: "Análise de transcrição refatorada em helper privado compartilhado + nova Server Action que aceita um arquivo de transcrição via FormData"
      exports: ["analyzeTranscriptAgainstFile", "analyzeTranscriptFileAgainstFile", "updateClientFileContent", "uploadClientFile", "deleteClientFile", "listClientFiles"]
      contains: "analyzeTranscriptFileAgainstFile"
    - path: "components/clients/transcript-update-section.tsx"
      provides: "Segundo caminho de entrada (upload de arquivo) ao lado do textarea existente, usando o padrão hidden-input + Button já estabelecido no projeto"
      contains: "analyzeTranscriptFileAgainstFile"
  key_links:
    - from: "components/clients/transcript-update-section.tsx"
      to: "lib/actions/client-files.ts analyzeTranscriptFileAgainstFile"
      via: "Server Action chamada com FormData contendo o arquivo escolhido"
      pattern: "analyzeTranscriptFileAgainstFile\\("
    - from: "components/clients/transcript-update-section.tsx"
      to: "input[type=file] escondido"
      via: "useRef + Button que dispara .click() (padrão de client-files-section.tsx)"
      pattern: "transcriptFileInputRef\\.current\\?\\.click\\(\\)"
    - from: "lib/actions/client-files.ts analyzeTranscriptFileAgainstFile"
      to: "lib/extract/extract-text.ts extractDocumentText"
      via: "extração de texto do arquivo enviado, com catch de UnreadableFileError"
      pattern: "extractDocumentText\\(buffer, fileType\\)"
    - from: "lib/actions/client-files.ts analyzeTranscriptFileAgainstFile"
      to: "runTranscriptAnalysis (helper privado)"
      via: "texto extraído passado como argumento transcript"
      pattern: "runTranscriptAnalysis\\("
    - from: "lib/actions/client-files.ts analyzeTranscriptAgainstFile"
      to: "runTranscriptAnalysis (helper privado)"
      via: "mesmo helper, agora compartilhado — a chamada a runStructuredExtraction existe UMA vez no arquivo"
      pattern: "await runStructuredExtraction\\(\\{"
---

<objective>
Adicionar **upload de arquivo como alternativa** ao campo de texto na seção "Atualizar arquivo via transcrição de reunião" (`TranscriptUpdateSection`).

Hoje o único jeito de alimentar essa análise é colar o texto num `<Textarea>`. Na prática, a transcrição vem de uma ferramenta de reunião que exporta um arquivo (`.txt`/`.md`/`.pdf`/`.docx`) — colar um texto longo é atrito puro. Este plano adiciona um **segundo caminho de entrada**: escolher um arquivo, ter o texto extraído no servidor, e cair no **mesmo** fluxo de análise/revisão/confirmação que já existe.

Purpose: reduzir atrito no fluxo real (exportar transcrição → subir) sem tocar em nada que já funciona e já foi verificado ao vivo (P2, 2026-08-04).
Output: um helper privado compartilhado + uma nova Server Action em `lib/actions/client-files.ts`, e um controle de upload adicional em `components/clients/transcript-update-section.tsx`.

**Isto é ADITIVO, não um redesenho.** O `<Textarea>` + botão "Analisar transcrição" continuam exatamente como estão hoje (mesmo placeholder, mesma lógica de disabled, mesmo `handleAnalyze`, mesma posição). O novo controle é visualmente **secundário** e fica ao lado, não no lugar.

**Garantia não-negociável preservada:** o arquivo de transcrição enviado **nunca** é salvo — nem em `client_files`, nem em Storage, nem em lugar nenhum. Ele é lido em memória, tem o texto extraído, o texto vai para a IA, e some. É exatamente a mesma promessa que o caminho de texto colado já documenta e honra ("a transcrição em si nunca é salva").

**Fora de escopo (não fazer):**
- Qualquer mudança em `updateClientFileContent` — o passo de persistir já é agnóstico ao caminho (só recebe `selectedFileId` + `draftContent`). Zero linhas dele mudam.
- Qualquer mudança em `components/clients/client-files-section.tsx` (seção "Arquivos do cliente"). Apenas o **padrão** hidden-input + Button dele é reproduzido; o código dele não é editado nem importado.
- Qualquer mudança em `lib/ai/structured-extraction.ts` / `runStructuredExtraction`, no prompt/schema da análise, ou em `lib/extract/extract-text.ts`.
- Qualquer mudança em `FILE_LIMIT`/`atFileLimit`, RLS, migrations, `middleware.ts` ou `next.config.ts`. O arquivo de transcrição não consome vaga de `FILE_LIMIT` porque **não é armazenado** — logo nenhuma checagem de teto se aplica a ele.
- Nenhuma dependência npm nova.
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
@$HOME/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/STATE.md
@CLAUDE.md

@lib/actions/client-files.ts
@components/clients/transcript-update-section.tsx
@lib/extract/extract-text.ts
@components/clients/client-files-section.tsx

<interfaces>
<!-- Contratos JÁ EXISTENTES. O executor NÃO precisa explorar o codebase. -->

`lib/actions/client-files.ts` — arquivo `"use server"` (topo, L1). **Consequência dura:** todo `export` deste arquivo precisa ser uma `async function`. Helpers auxiliares devem ficar **não-exportados** (é o que o plano faz) — exportá-los quebra o build.

Constantes de módulo já definidas (L17-18) — **reutilizar, nunca redeclarar**:
- `const MAX_FILE_BYTES = 5 * 1024 * 1024;` // 5MB
- `const ALLOWED_EXTENSIONS = new Set(["pdf", "txt", "md", "docx"]);`

Helper de módulo já existente (L49-52) — reutilizar:
- `function extensionOf(filename: string): string` → extensão minúscula sem ponto, `""` se não houver.

Constantes de mensagem já existentes (L157-161):
- `TRANSCRIPT_ANALYZE_ERROR = "Não foi possível analisar a transcrição agora. Tente novamente."`
- `TRANSCRIPT_FILE_NOT_FOUND_ERROR = "Arquivo base não encontrado."`
- `TRANSCRIPT_UPDATE_ERROR = "Não foi possível atualizar o arquivo. Tente novamente."`

Tipo de retorno já existente (L163-170) — o novo action retorna EXATAMENTE este:
```
export type AnalyzeTranscriptResult =
  | { success: true; summary: string; changes: string[]; updatedContent: string }
  | { error: string };
```

`analyzeTranscriptAgainstFile(fileId: string, transcript: string)` (L187-284) — corpo atual, em 3 blocos que este plano separa:
1. **Resolve RLS** (L191-208): `createClient()` → `client_files.select("id, filename, content, client_id").eq("id", fileId).single()` → se `!file`, `{ error: TRANSCRIPT_FILE_NOT_FOUND_ERROR }`; depois `clients.select("id, name").eq("id", file.client_id).single()` → se `!client`, mesmo erro. RLS (`client_files_select_scoped`) é a fronteira real de autorização — `fileId` nunca é confiado.
2. **Chama a IA** (L210-254): `await runStructuredExtraction({ clientName, files: [base, transcrição], instruction, toolName: "report_transcript_update", toolDescription, inputSchema })`.
3. **Valida a resposta** (L256-283): `if (!result.ok) return { error: result.error }`; checa `summary` string, `changes` array, `updatedContent` string não-vazia; senão `console.error(...)` + `{ error: TRANSCRIPT_ANALYZE_ERROR }`; retorna `{ success: true, summary, changes: filtradas para string, updatedContent }`.

Padrão de validação/extração de arquivo já existente em `uploadClientFile` (L69-114) — a ser espelhado (não copiado por inteiro):
```
const file = formData.get("file");
if (!(file instanceof File) || file.size === 0) return { error: "Selecione um arquivo para enviar." };
const extension = extensionOf(file.name);
if (!ALLOWED_EXTENSIONS.has(extension)) return { error: "Formato não suportado. Envie um arquivo PDF, TXT, MD ou DOCX." };
if (file.size > MAX_FILE_BYTES) return { error: "Arquivo muito grande. O limite é 5MB." };
const fileType = extension as ClientFileType;
const buffer = Buffer.from(await file.arrayBuffer());
try { content = await extractDocumentText(buffer, fileType); }
catch (err) { /* UnreadableFileError E qualquer outro erro de parsing */ return { error: "Não foi possível ler o conteúdo deste arquivo." }; }
```

`lib/extract/extract-text.ts`:
- `export const MIN_CHARS = 20`
- `export class UnreadableFileError extends Error {}`
- `export type ClientFileType = "pdf" | "docx" | "txt" | "md"`
- `export async function extractDocumentText(buffer: Buffer, fileType: ClientFileType): Promise<string>` — colapsa whitespace, faz trim, e **lança** `UnreadableFileError` se sobrar menos de 20 caracteres. Node runtime apenas (unpdf/mammoth) — Server Actions já rodam em Node por padrão (comentário L12-15 de client-files.ts).
- Já importado em `lib/actions/client-files.ts` L4-8 (`extractDocumentText`, `UnreadableFileError`, `ClientFileType`) — **nenhum import novo é necessário no servidor**.

`components/clients/transcript-update-section.tsx` — estado atual relevante:
- Props: `{ files: ClientFileRow[] }`; retorna `null` se `files.length === 0`.
- Estado: `selectedFileId`, `transcript`, `analysis` (`{summary, changes, updatedContent}` | null), `draftContent`, `[isAnalyzing, startAnalyzeTransition]`, `analyzeError`, `[isApplying, startApplyTransition]`, `applyError`.
- `handleAnalyze()` (L64-85): limpa erro, `transcript.trim()`, retorna cedo se `!selectedFileId` ou vazio, `startAnalyzeTransition` → `analyzeTranscriptAgainstFile(selectedFileId, trimmed)` → `"error" in result` ? `setAnalyzeError` : `setAnalysis({...})` + `setDraftContent(result.updatedContent)`.
- `handleConfirm()` (L87-103) → `updateClientFileContent(selectedFileId, draftContent)` → toast + `handleDiscard()`.
- `handleDiscard()` (L105-111): zera `transcript`, `analysis`, `draftContent`, `analyzeError`, `applyError`. Também é chamado no `onValueChange` do `<Select>` (L123-126).
- Render: `<DataCard title description>` → `<Select>` do arquivo base → ternário `!analysis ? (entrada) : (revisão)`.
- Bloco de entrada (L142-160): `<Textarea rows={8} placeholder="Cole aqui a transcrição da reunião..." disabled={isAnalyzing}>`, `{analyzeError ? <ErrorBox>{analyzeError}</ErrorBox> : null}`, `<Button disabled={isAnalyzing || transcript.trim().length === 0}>{isAnalyzing ? "Analisando..." : "Analisar transcrição"}</Button>`.
- Existem exatamente **2** `<ErrorBox>` no arquivo hoje (analyzeError e applyError) — esse número não pode mudar.

Padrão hidden-input + Button (fonte da verdade: `components/clients/client-files-section.tsx` L56, L207-228) — **reproduzir, não importar**:
```
const fileInputRef = useRef<HTMLInputElement>(null);
<input ref={fileInputRef} type="file" accept=".pdf,.txt,.md,.docx" className="hidden" ... />
<Button type="button" variant="outline" onClick={() => fileInputRef.current?.click()}>Escolher arquivo(s)</Button>
```
Motivo documentado no próprio arquivo (L57-65): input file nativo visível tem comportamento inconsistente entre navegadores/SOs e gerou o relato "o botão não faz nada" (2026-08-04). Este projeto **não** usa input file nativo visível — não introduzir um.

`next.config.ts` L18: `experimental.serverActions.bodySizeLimit: "6mb"` — já acomoda um arquivo de 5MB via FormData num Server Action (fix de 260805-fao). Nada a mudar.

Componentes UI disponíveis: `Button`, `Textarea`, `ErrorBox`, `DataCard`, `Select*`, `SectionTitle` (todos já importados no arquivo). `lucide-react` disponível se um ícone for desejado (opcional).

Verificação: não há `npm run typecheck` — usar `npx tsc --noEmit`. `npm test` = `node --test` só sobre módulos puros (`lib/**/*.test.ts`); **não existe harness de teste para Server Actions** neste projeto (elas exigem sessão Supabase real + `ANTHROPIC_API_KEY`), por isso a prova de runtime está no checkpoint humano da Task 3.

**Contagem de writes no arquivo hoje (baseline verificado, 2026-08-05)** — `lib/actions/client-files.ts` tem **exatamente** 1 `.insert(` (L116, dentro de `uploadClientFile`), **exatamente** 1 `.update(` (L307, dentro de `updateClientFileContent`) e **zero** `.upsert(`. Este plano **não adiciona nenhum write** — o caminho novo é somente-leitura + IA. A Task 1 congela essa contagem num gate automatizado.
</interfaces>
</context>

<tasks>

<task type="auto">
  <name>Task 1: Extrair a análise para um helper compartilhado e adicionar a Server Action que aceita arquivo</name>
  <files>lib/actions/client-files.ts</files>
  <action>
Três mudanças em `lib/actions/client-files.ts`, todas na região de transcrição (a partir da L157). **Nenhum import novo** — `extractDocumentText`, `UnreadableFileError`, `ClientFileType`, `MAX_FILE_BYTES`, `ALLOWED_EXTENSIONS`, `extensionOf` já existem no arquivo.

**(1) Extrair 4 mensagens de erro de arquivo para constantes de módulo, compartilhadas com `uploadClientFile`.**
Junto das constantes existentes, declarar (valores **byte-idênticos** aos literais que hoje estão inline em `uploadClientFile` — nenhuma palavra muda):
- `FILE_SELECT_ERROR = "Selecione um arquivo para enviar."`
- `FILE_FORMAT_ERROR = "Formato não suportado. Envie um arquivo PDF, TXT, MD ou DOCX."`
- `FILE_TOO_LARGE_ERROR = "Arquivo muito grande. O limite é 5MB."`
- `FILE_UNREADABLE_ERROR = "Não foi possível ler o conteúdo deste arquivo."`
Substituir os literais correspondentes dentro de `uploadClientFile` por essas constantes (as duas ocorrências de "Não foi possível ler o conteúdo deste arquivo." viram `FILE_UNREADABLE_ERROR`). Esta é uma extração **pura**: mesmo texto, mesma ordem de checagens, mesmos branches, mesmo retorno. **Não** mudar mais nada em `uploadClientFile` — o gate de `atFileLimit`, o insert, os comentários e a mensagem de erro de insert ficam intactos. Justificativa: as mesmas 4 mensagens passam a ter dois consumidores; duplicar string voltada ao usuário garante divergência futura.

**(2) Extrair dois helpers PRIVADOS (não-exportados — este é um arquivo `"use server"`, exportar quebra o build):**

`async function resolveTranscriptTarget(fileId: string)` — contém **exatamente** o bloco 1 (resolve RLS) que hoje abre `analyzeTranscriptAgainstFile` (L191-208), sem alteração de lógica: `createClient()`, busca do `client_files` por id via `.single()`, busca do `clients` por `file.client_id` via `.single()`. Retorna `{ file, client }` quando ambos existem e `null` quando qualquer um falta. Cada chamador mapeia `null` para `{ error: TRANSCRIPT_FILE_NOT_FOUND_ERROR }` (o retorno de erro fica no chamador, não no helper). Preservar o comentário existente sobre RLS ser a fronteira real de autorização.

`async function runTranscriptAnalysis(file: { filename: string; content: string }, client: { name: string }, transcript: string): Promise<AnalyzeTranscriptResult>` — contém **exatamente** os blocos 2 e 3 de hoje (a chamada `runStructuredExtraction` completa — instruction, toolName, toolDescription, inputSchema, tudo literalmente igual — mais toda a validação de shape e o retorno de sucesso). Tipos de parâmetro deliberadamente estreitos (só os campos usados), para não acoplar o helper aos tipos inferidos do Supabase. Única mudança de conteúdo permitida: a tag do `console.error` passa de `[analyzeTranscriptAgainstFile]` para `[runTranscriptAnalysis]`, já que o log agora serve aos dois caminhos. **Nada mais** no prompt, no schema ou na validação pode mudar — se o diff alterar qualquer string do `instruction`/`inputSchema`, é regressão.

`analyzeTranscriptAgainstFile(fileId, transcript)` mantém **assinatura, tipo de retorno, nome, `export`, ordem de argumentos e doc comment idênticos**. O corpo vira: `resolveTranscriptTarget(fileId)` → se `null`, `{ error: TRANSCRIPT_FILE_NOT_FOUND_ERROR }` → `return runTranscriptAnalysis(target.file, target.client, transcript)`. Zero mudança de comportamento observável.

**(3) Adicionar a nova Server Action exportada:**

```
export async function analyzeTranscriptFileAgainstFile(
  fileId: string,
  formData: FormData
): Promise<AnalyzeTranscriptResult>
```

Ordem de operações (obrigatória, nesta sequência):
1. `const file = formData.get("file")`; se `!(file instanceof File) || file.size === 0` → `{ error: FILE_SELECT_ERROR }`.
2. `extensionOf(file.name)`; se não estiver em `ALLOWED_EXTENSIONS` → `{ error: FILE_FORMAT_ERROR }`.
3. `file.size > MAX_FILE_BYTES` → `{ error: FILE_TOO_LARGE_ERROR }`.
4. `resolveTranscriptTarget(fileId)`; se `null` → `{ error: TRANSCRIPT_FILE_NOT_FOUND_ERROR }`.
5. `Buffer.from(await file.arrayBuffer())` + `await extractDocumentText(buffer, extension as ClientFileType)` dentro de `try/catch`; **tanto** `UnreadableFileError` **quanto** qualquer outro erro de parsing retornam `{ error: FILE_UNREADABLE_ERROR }` (mesmo tratamento de `uploadClientFile`).
6. `return runTranscriptAnalysis(target.file, target.client, extractedText)`.

**Por que o passo 4 (autorização) vem ANTES do passo 5 (extração), e não depois:** parsear um PDF/DOCX de até 5MB é a operação mais cara desta action. Fazê-la antes de saber se o chamador sequer alcança aquele `fileId` via RLS permite queimar CPU do servidor com um `fileId` inválido/alheio. Autorizar primeiro é estritamente melhor e não altera nenhum resultado do caminho feliz — só a precedência entre dois erros que nunca coexistem na prática (a UI sempre manda um `fileId` vindo do `<Select>`). Ver T-iea-02.

**Esta action é somente-leitura + IA: ela NÃO pode conter nenhuma escrita.** Nenhum `.insert(`, `.update(`, `.upsert(`, nenhuma chamada a Storage, nenhuma chamada a `updateClientFileContent`. O buffer e o texto extraído existem só durante a requisição. O gate automatizado abaixo congela a contagem de writes do arquivo inteiro em **1 `.insert(` / 1 `.update(` / 0 `.upsert(`** — exatamente o baseline de hoje (o insert de `uploadClientFile` e o update de `updateClientFileContent`). Se o executor acidentalmente ligar o caminho novo a uma escrita, o gate quebra aqui, na Task 1, em vez de só no checkpoint ao vivo da Task 3. Ver T-iea-03.

Escrever um doc comment na nova action deixando explícito: (a) é o mesmo fluxo de `analyzeTranscriptAgainstFile`, só com a transcrição vindo de um arquivo em vez de texto colado; (b) o arquivo enviado **NUNCA** é persistido — não há `insert`/`upsert`/`update` nem escrita em Storage neste caminho, o buffer e o texto extraído existem só durante a requisição; (c) por não ser armazenado, ele não consome vaga de `FILE_LIMIT` e nenhuma checagem de teto se aplica.

**Não** alterar: `updateClientFileContent` (nenhuma linha), `listClientFiles`, `deleteClientFile`, o gate de `atFileLimit`, os tipos exportados existentes, ou qualquer arquivo fora de `lib/actions/client-files.ts`.
  </action>
  <verify>
    <automated>
cd /Users/lucaspaiva/projects/backstageed.OS &&
CODE=$(grep -v -E '^[[:space:]]*(//|\*|/\*)' lib/actions/client-files.ts) &&
[ "$(printf '%s\n' "$CODE" | grep -c 'export async function analyzeTranscriptFileAgainstFile')" -eq 1 ] &&
[ "$(printf '%s\n' "$CODE" | grep -c 'export async function analyzeTranscriptAgainstFile(')" -eq 1 ] &&
[ "$(printf '%s\n' "$CODE" | grep -c 'async function runTranscriptAnalysis')" -eq 1 ] &&
[ "$(printf '%s\n' "$CODE" | grep -c 'export async function runTranscriptAnalysis')" -eq 0 ] &&
[ "$(printf '%s\n' "$CODE" | grep -c 'export async function resolveTranscriptTarget')" -eq 0 ] &&
[ "$(printf '%s\n' "$CODE" | grep -c 'runTranscriptAnalysis(')" -eq 3 ] &&
[ "$(printf '%s\n' "$CODE" | grep -c 'resolveTranscriptTarget(')" -eq 3 ] &&
[ "$(printf '%s\n' "$CODE" | grep -c 'await runStructuredExtraction({')" -eq 1 ] &&
[ "$(printf '%s\n' "$CODE" | grep -c 'const MAX_FILE_BYTES')" -eq 1 ] &&
[ "$(printf '%s\n' "$CODE" | grep -c 'const ALLOWED_EXTENSIONS')" -eq 1 ] &&
[ "$(printf '%s\n' "$CODE" | grep -c 'Formato não suportado. Envie um arquivo PDF, TXT, MD ou DOCX.')" -eq 1 ] &&
[ "$(printf '%s\n' "$CODE" | grep -c 'Não foi possível ler o conteúdo deste arquivo.')" -eq 1 ] &&
[ "$(printf '%s\n' "$CODE" | grep -c '\.insert(')" -eq 1 ] &&
[ "$(printf '%s\n' "$CODE" | grep -c '\.update(')" -eq 1 ] &&
[ "$(printf '%s\n' "$CODE" | grep -c '\.upsert(')" -eq 0 ] &&
[ "$(git diff -U0 lib/actions/client-files.ts | grep -E '^[+-]' | grep -v -E '^(\+\+\+|---)' | grep -c 'updateClientFileContent')" -eq 0 ] &&
[ "$(git diff -U0 lib/actions/client-files.ts | grep -E '^[+-]' | grep -v -E '^(\+\+\+|---)' | grep -c 'export async function analyzeTranscriptAgainstFile')" -eq 0 ] &&
[ "$(git diff -U0 lib/actions/client-files.ts | grep -E '^[+-]' | grep -v -E '^(\+\+\+|---)' | grep -c 'atFileLimit')" -eq 0 ] &&
npx tsc --noEmit &&
npm run lint &&
npm test &&
[ -z "$(git diff --name-only -- supabase/ middleware.ts next.config.ts package.json lib/ai/ lib/extract/ lib/client-files/ components/clients/client-files-section.tsx)" ]
    </automated>
    <manual>
Ler o diff de `lib/actions/client-files.ts` e confirmar, linha a linha, que o bloco movido para `runTranscriptAnalysis` é o MESMO texto de antes: o `instruction` (as 3 partes numeradas do prompt), `toolName: "report_transcript_update"`, `toolDescription` e o `inputSchema` (summary/changes/updatedContent + required) devem aparecer no diff apenas como linhas movidas/reindentadas, nunca reescritas. Qualquer alteração de palavra no prompt é regressão de comportamento da IA e deve ser revertida.
    </manual>
  </verify>
  <done>`analyzeTranscriptFileAgainstFile` existe e é exportada; `analyzeTranscriptAgainstFile` mantém assinatura e comportamento; `runTranscriptAnalysis`/`resolveTranscriptTarget` são privados e têm exatamente 2 chamadores cada; `runStructuredExtraction` é chamado uma única vez no arquivo; `MAX_FILE_BYTES`/`ALLOWED_EXTENSIONS` não foram redeclarados; a contagem de writes do arquivo segue congelada em 1 `.insert(` / 1 `.update(` / 0 `.upsert(` (o caminho novo não escreve nada); `updateClientFileContent` e o gate de `atFileLimit` não aparecem no diff; `tsc`/`lint`/`npm test` verdes; nenhum arquivo fora de `lib/actions/client-files.ts` foi tocado.</done>
</task>

<task type="auto">
  <name>Task 2: Adicionar o controle de upload de transcrição ao lado do textarea existente</name>
  <files>components/clients/transcript-update-section.tsx</files>
  <action>
Adicionar o segundo caminho de entrada em `components/clients/transcript-update-section.tsx`. Tudo é **aditivo**.

**Imports:** acrescentar `useRef` ao import de `react` existente e `analyzeTranscriptFileAgainstFile` ao import de `@/lib/actions/client-files` existente. Nenhum import novo além desses dois nomes.

**Estado novo (2 itens):**
- `const transcriptFileInputRef = useRef<HTMLInputElement>(null);`
- `const [analyzingSource, setAnalyzingSource] = useState<"text" | "file" | null>(null);`

**Reutilizar o `useTransition` existente** (`isAnalyzing`/`startAnalyzeTransition`) para os dois caminhos — **não** criar um segundo `useTransition`. Motivo: com um único flag `isAnalyzing`, toda a lógica de `disabled` já escrita (textarea, botão "Analisar transcrição", `<Select>` do arquivo base) continua **literalmente a mesma string de código** e passa a cobrir também o caminho de arquivo, sem nenhum risco de disparar as duas análises ao mesmo tempo. `analyzingSource` serve apenas para escolher o rótulo.

**Novo handler `handleTranscriptFileSelected(event: React.ChangeEvent<HTMLInputElement>)`:**
1. `const picked = event.target.files?.[0] ?? null;`
2. `event.target.value = "";` — **obrigatório**, e feito logo após capturar a referência: sem isso, escolher o MESMO arquivo de novo (depois de um erro ou de um descarte) não dispara `onChange` e o botão parece morto.
3. `setAnalyzeError(null);`
4. `if (!picked || !selectedFileId) return;`
5. `setAnalyzingSource("file");`
6. `startAnalyzeTransition(async () => { const fd = new FormData(); fd.append("file", picked); const result = await analyzeTranscriptFileAgainstFile(selectedFileId, fd); ... })` — o tratamento do resultado é **idêntico** ao de `handleAnalyze`: `"error" in result` → `setAnalyzeError(result.error)`; senão `setAnalysis({summary, changes, updatedContent})` + `setDraftContent(result.updatedContent)`. Em ambos os desfechos, `setAnalyzingSource(null)` ao final.
   O nome do campo do FormData **precisa** ser `"file"` — é o que a Server Action lê com `formData.get("file")`.

**`handleAnalyze` (caminho de texto colado):** única alteração permitida é `setAnalyzingSource("text")` antes do `startAnalyzeTransition` e `setAnalyzingSource(null)` ao final do callback. Placeholder, `trim`, early-return, argumentos e tratamento de resultado ficam intactos.

**`handleDiscard`:** acrescentar `setAnalyzingSource(null)` e limpar o input escondido (`if (transcriptFileInputRef.current) transcriptFileInputRef.current.value = "";`). Nada mais muda — ele continua zerando `transcript`, `analysis`, `draftContent`, `analyzeError`, `applyError`, e continua sendo chamado no `onValueChange` do `<Select>`.

**Render — dentro do ramo `!analysis`, sem mexer no que já existe:**
- `<Textarea>` fica **exatamente** como está (mesmo `rows={8}`, mesmo placeholder, mesmo `disabled={isAnalyzing}`).
- O `<Button>` "Analisar transcrição" fica na mesma posição, com o **mesmo** `disabled={isAnalyzing || transcript.trim().length === 0}`. Seu rótulo passa a ser `isAnalyzing && analyzingSource === "text" ? "Analisando..." : "Analisar transcrição"` — durante uma análise de texto colado ele renderiza **idêntico a hoje**; a única diferença aparece num estado que não existia antes deste plano (análise de arquivo em curso), quando ele fica desabilitado sem se anunciar como responsável.
- **Depois** desse botão, adicionar o bloco alternativo, visualmente secundário:
  - um separador discreto com o texto `ou` (ex.: `<span className="text-xs text-muted-foreground">ou</span>`) deixando claro que é uma alternativa, não um passo seguinte;
  - `<input ref={transcriptFileInputRef} type="file" accept=".pdf,.txt,.md,.docx" className="hidden" disabled={isAnalyzing} onChange={handleTranscriptFileSelected} />` — sem `name`, sem `multiple` (um arquivo por vez), e **nunca** um input file nativo visível;
  - `<Button type="button" variant="outline" size="sm" className="w-fit" disabled={isAnalyzing} onClick={() => transcriptFileInputRef.current?.click()}>` com rótulo `isAnalyzing && analyzingSource === "file" ? "Analisando arquivo..." : "Enviar arquivo de transcrição"`;
  - uma linha de ajuda curta em `text-xs text-muted-foreground` informando os formatos aceitos e o limite (PDF/TXT/MD/DOCX, até 5MB) e que o arquivo não é salvo.
  - O `variant="outline" size="sm"` é o que mantém este caminho secundário: o CTA primário do bloco continua sendo "Analisar transcrição".
- O `<ErrorBox>` de `analyzeError` continua **único e no mesmo lugar**, servindo aos dois caminhos. **Não** adicionar um segundo ErrorBox — o arquivo deve continuar com exatamente 2 ocorrências de `<ErrorBox>` no total (analyzeError + applyError).
- O ramo de revisão (`analysis` não-nulo: resumo, novidades, textarea de `draftContent`, "Confirmar atualização"/"Descartar") **não muda em nada**.

**Descrição do `<DataCard>`:** acrescentar ao final da frase existente que também é possível enviar um arquivo com a transcrição (PDF/TXT/MD/DOCX). É a única mudança de cópia permitida, e é obrigatória: sem ela o card descreve incorretamente o que aceita. Manter a frase "A transcrição em si nunca é salva." como está.

**Doc comment do componente:** acrescentar um parágrafo curto registrando o segundo caminho e reafirmando que o arquivo enviado nunca é persistido (só o texto extraído dele trafega, e só até o confirmar/descartar).

**Não** editar `client-files-section.tsx` (que renderiza este componente na L253 — a prop `files` já é passada e não muda), nem qualquer Server Action, nem `handleConfirm`.
  </action>
  <verify>
    <automated>
cd /Users/lucaspaiva/projects/backstageed.OS &&
UI=components/clients/transcript-update-section.tsx &&
[ "$(grep -c 'analyzeTranscriptFileAgainstFile(' $UI)" -eq 1 ] &&
[ "$(grep -c 'analyzeTranscriptAgainstFile(' $UI)" -eq 1 ] &&
[ "$(grep -c 'Analisar transcrição' $UI)" -eq 1 ] &&
[ "$(grep -c '"Analisando\.\.\."' $UI)" -eq 1 ] &&
[ "$(grep -c 'Analisando arquivo' $UI)" -eq 1 ] &&
[ "$(grep -c '<ErrorBox>' $UI)" -eq 2 ] &&
[ "$(grep -c 'type="file"' $UI)" -eq 1 ] &&
[ "$(grep -c 'accept=".pdf,.txt,.md,.docx"' $UI)" -eq 1 ] &&
[ "$(grep -c 'className="hidden"' $UI)" -eq 1 ] &&
[ "$(grep -c 'transcriptFileInputRef.current?.click()' $UI)" -eq 1 ] &&
[ "$(grep -c 'useTransition' $UI)" -eq 3 ] &&
[ "$(grep -c 'startAnalyzeTransition' $UI)" -eq 3 ] &&
[ "$(grep -c 'disabled={isAnalyzing || transcript.trim().length === 0}' $UI)" -eq 1 ] &&
[ "$(grep -c 'placeholder="Cole aqui a transcrição da reunião\.\.\."' $UI)" -eq 1 ] &&
[ "$(grep -c 'updateClientFileContent' $UI)" -eq 2 ] &&
npx tsc --noEmit &&
npm run lint &&
npm run build &&
[ "$(git diff --name-only | sort | tr '\n' ' ')" = "components/clients/transcript-update-section.tsx lib/actions/client-files.ts " ] &&
[ -z "$(git diff --name-only -- supabase/ middleware.ts next.config.ts lib/ai/ lib/extract/ lib/client-files/ components/clients/client-files-section.tsx)" ]
    </automated>
    <manual>
Ler o diff de `transcript-update-section.tsx` e confirmar que o ramo de revisão (`analysis` não-nulo) e `handleConfirm` aparecem com **zero** linhas alteradas, e que as únicas linhas modificadas (não adicionadas) no bloco de entrada são: o rótulo do botão "Analisar transcrição", a descrição do `<DataCard>`, e as duas linhas de `setAnalyzingSource` em `handleAnalyze`/`handleDiscard`.
    </manual>
  </verify>
  <done>O bloco de entrada mostra o textarea + "Analisar transcrição" inalterados e, abaixo, um "ou" + botão secundário que abre o seletor de arquivo escondido; escolher um arquivo dispara a análise sozinho, com rótulo "Analisando arquivo..."; erros dos dois caminhos caem no mesmo `<ErrorBox>`; `tsc`/`lint`/`build` verdes; o diff total do plano toca exatamente 2 arquivos.</done>
</task>

<task type="checkpoint:human-verify" gate="blocking">
  <name>Task 3: Verificação humana ao vivo dos DOIS caminhos, com cliente e arquivo base reais</name>
  <action>Pausar a execução e entregar ao desenvolvedor o roteiro de <how-to-verify> abaixo. Nenhum código é escrito nesta task — ela existe porque a nova Server Action só é exercitada de verdade com sessão Supabase real (RLS), arquivo real e chamada real à Claude API, e porque a garantia "o arquivo enviado nunca é persistido" só é comprovável observando client_files depois de um envio real. Não prosseguir para o commit/SUMMARY sem a aprovação explícita do desenvolvedor.</action>
  <what-built>
Os dois caminhos de entrada da seção "Atualizar arquivo via transcrição de reunião": o de texto colado (inalterado) e o novo de upload de arquivo, ambos desembocando no mesmo fluxo de revisão/confirmação. Servidor: `analyzeTranscriptFileAgainstFile` (nova) + `analyzeTranscriptAgainstFile` (refatorada, comportamento idêntico), compartilhando o mesmo helper de análise.

Gates automáticos já verdes: `npx tsc --noEmit`, `npm run lint`, `npm run build`, `npm test`, os gates de escopo (diff toca exatamente 2 arquivos; `updateClientFileContent`, RLS, migrations, `client-files-section.tsx` e o motor de IA intocados) e o gate de writes (contagem congelada em 1 `.insert(` / 1 `.update(` / 0 `.upsert(` — o caminho novo não escreve nada).

**Por que este checkpoint é obrigatório e bloqueante:** não existe harness de teste automatizado para Server Actions neste projeto — a nova action só é exercitada de verdade com sessão Supabase real (RLS), arquivo real e chamada real à Claude API. A garantia central deste plano ("o arquivo enviado nunca é persistido") tem o gate estático da Task 1 provando que nenhuma escrita nova foi introduzida, mas a confirmação de runtime só vem observando o banco/UI depois de um envio real.
  </what-built>
  <how-to-verify>
Rodar `npm run dev` e logar com credenciais reais (PM ou Admin). Usar um **cliente de teste** (criar um, ou reutilizar um cliente de teste já existente) com pelo menos **um arquivo base real** em "Arquivos do cliente" — nunca um cliente de produção, porque o fluxo sobrescreve o conteúdo do arquivo base.

Anotar antes de começar: quantos arquivos aparecem na lista "Arquivos do cliente" desse cliente (`N`).

**A) Caminho de texto colado — provar que NÃO regrediu**
1. Abrir `/pm/clients/[id]` (ou `/admin/clients/[id]`) do cliente de teste e rolar até "Atualizar arquivo via transcrição de reunião".
2. Confirmar que o `<Textarea>` continua lá, com o placeholder "Cole aqui a transcrição da reunião...", e que "Analisar transcrição" continua sendo o botão principal do bloco.
3. Colar um texto curto de transcrição fictícia mas coerente com o cliente (ex.: 5-10 linhas de reunião decidindo mudar tom de voz e adicionar um pilar novo) e clicar em "Analisar transcrição".
4. Confirmar que o botão mostra **"Analisando..."** durante a espera.
5. Confirmar que aparecem o "Resumo da reunião", a lista "Novidades e contradições" e o "Arquivo base atualizado (revise antes de confirmar)" — e que o **conteúdo faz sentido**: o resumo descreve mesmo o que foi colado, e o texto proposto preserva o que já havia no arquivo base além de incorporar a novidade.
6. Clicar em "Descartar" e confirmar que o formulário volta ao estado inicial (textarea vazio).

**B) Caminho de arquivo — o comportamento novo**
7. Criar um arquivo `.txt` real no disco com uma transcrição fictícia (mais de 20 caracteres; pode ser um texto diferente do item 3).
8. Confirmar que existe um "ou" + um botão secundário de envio de arquivo abaixo de "Analisar transcrição", e que ele é visivelmente **secundário** (não compete com o botão principal). Confirmar que **não** há um input file nativo cinza visível na tela.
9. Clicar nesse botão → o seletor de arquivos do SO abre (o botão não pode "não fazer nada").
10. Escolher o `.txt` → a análise dispara **sozinha**, sem um segundo clique, e o rótulo mostra **"Analisando arquivo..."** (distinto do "Analisando..." do item 4).
11. Confirmar que cai na **mesma** tela de revisão do item 5, e que resumo/novidades/texto proposto fazem sentido em relação ao conteúdo do `.txt`.
12. Editar uma palavra no textarea "Arquivo base atualizado" (provar que segue editável) e clicar em "Confirmar atualização" → toast "Arquivo base atualizado." e o formulário volta ao estado inicial.
13. Recarregar a página e reabrir o fluxo: o arquivo base selecionado deve refletir o conteúdo atualizado (dá para conferir escolhendo-o e rodando uma nova análise, ou olhando o `content` da linha em `client_files` pelo Supabase).

**C) O arquivo de transcrição NUNCA foi salvo — a checagem crítica**
14. Olhar a lista "Arquivos do cliente": ela deve continuar com **exatamente `N` arquivos**, e **nenhum** deles pode ter o nome do `.txt` de transcrição enviado no item 7.
15. Confirmar no Supabase que não existe linha de `client_files` com o `filename` da transcrição (para esse cliente e, por segurança, para nenhum): nenhuma linha nova foi criada — só o `content` da linha do arquivo base mudou.

**D) Erros — uma única superfície**
16. Tentar enviar um arquivo de formato não suportado (ex.: um `.png`) pelo botão de arquivo → deve aparecer "Formato não suportado. Envie um arquivo PDF, TXT, MD ou DOCX." **no mesmo ErrorBox** já usado pelo caminho de texto (não uma segunda caixa de erro, não um alert do navegador).
17. Tentar enviar um `.txt` com pouquíssimo texto (ex.: `oi`, abaixo dos 20 caracteres mínimos) → deve aparecer "Não foi possível ler o conteúdo deste arquivo." no mesmo ErrorBox.
18. Depois de um erro, escolher **o mesmo arquivo de novo** deve voltar a disparar a ação (prova de que o input é resetado — o botão não pode ficar "morto" na segunda tentativa).
19. Reenviar o `.txt` válido do item 7 e confirmar que ainda funciona depois dos erros.

**E) Limpeza (obrigatória)**
20. Apagar todo dado de teste criado: o cliente de teste e seus arquivos, se foi criado para isto. Se um cliente pré-existente foi usado, restaurar o `content` original do arquivo base (anotar/copiar o conteúdo antes do item 12 para poder reverter) ou remover o arquivo de teste.
21. Confirmar ao final que a lista de clientes e `client_files` não têm resíduo de teste.
  </how-to-verify>
  <resume-signal>Responda "aprovado" se A, B, C, D e E passaram (com atenção especial ao item 14/15 — nenhum arquivo de transcrição persistido) ou descreva o que falhou, citando o número do passo.</resume-signal>
  <verify>
    <automated>echo "Checkpoint humano — sem gate automatizado. Os gates de tsc/lint/build/test, de escopo e de contagem de writes já rodaram nas Tasks 1 e 2; a prova de runtime desta task é a aprovação explícita do desenvolvedor registrada no SUMMARY."</automated>
    <human-check>Roteiro completo em &lt;how-to-verify&gt; acima: seções A (texto colado inalterado), B (arquivo ponta a ponta), C (nada persistido em client_files), D (erros num único ErrorBox), E (limpeza).</human-check>
  </verify>
  <done>Desenvolvedor confirmou ao vivo: (A) caminho de texto colado inalterado, (B) caminho de arquivo funcionando ponta a ponta com rótulo "Analisando arquivo..." e o arquivo base realmente atualizado, (C) nenhuma linha nova em client_files e a lista "Arquivos do cliente" com a mesma contagem de antes, (D) os erros aparecendo no mesmo ErrorBox e o reenvio do mesmo arquivo voltando a disparar, (E) dados de teste limpos.</done>
</task>

</tasks>

<threat_model>
## Trust Boundaries

| Boundary | Description |
|----------|-------------|
| Navegador do PM/Admin → Server Action `analyzeTranscriptFileAgainstFile` | Entrada não-confiável cruza aqui: `fileId` (string arbitrária) e bytes de arquivo arbitrários via FormData. RLS + validação de extensão/tamanho são o gate |
| Server Action → Postgres (`client_files`, `clients`) | `client_files_select_scoped` / `clients` RLS são a fronteira real de autorização; `fileId` nunca é confiado |
| Server Action → Claude API (`runStructuredExtraction`) | Conteúdo do arquivo base + texto extraído da transcrição saem para um provedor externo |
| Bytes do arquivo → `extractDocumentText` (unpdf/mammoth) | Parsers processando arquivo controlado pelo usuário no runtime Node |

## STRIDE Threat Register

| Threat ID | Category | Component | Disposition | Mitigation Plan |
|-----------|----------|-----------|-------------|-----------------|
| T-iea-01 | Elevation of Privilege | `analyzeTranscriptFileAgainstFile` — `fileId` vindo do cliente | mitigate | Reutiliza `resolveTranscriptTarget`, o MESMO resolve RLS de `analyzeTranscriptAgainstFile`: `client_files.select(...).eq("id", fileId).single()` pelo client Supabase com sessão do usuário. Um `fileId` de outro cliente volta vazio → `TRANSCRIPT_FILE_NOT_FOUND_ERROR`. Nenhum client de service-role é usado, nenhuma checagem nova de autorização é inventada |
| T-iea-02 | Denial of Service | parsing de PDF/DOCX de até 5MB por chamador não autorizado | mitigate | A autorização (passo 4) roda **antes** da extração (passo 5): um `fileId` inalcançável é rejeitado sem que um único byte seja parseado. Além disso a rota inteira já está atrás do auth gate do `middleware.ts`, e `MAX_FILE_BYTES` (5MB) + `bodySizeLimit: "6mb"` limitam o tamanho aceito |
| T-iea-03 | Tampering | arquivo de transcrição enviado poderia acabar persistido | mitigate | O caminho novo não executa nenhum `insert`/`upsert`/`update` nem escrita em Storage — o buffer e o texto extraído só existem no escopo da requisição. Gates estruturais na Task 1: (a) a contagem de writes do arquivo inteiro fica congelada em **1 `.insert(` / 1 `.update(` / 0 `.upsert(`**, exatamente o baseline de hoje (`uploadClientFile` + `updateClientFileContent`), então qualquer escrita nova quebra o gate; (b) `updateClientFileContent` não aparece no diff; (c) `runTranscriptAnalysis`, único destino do texto extraído, só chama a IA. Prova de runtime: Task 3 itens 14-15 (contagem de `client_files` inalterada, nenhuma linha com o filename da transcrição) |
| T-iea-04 | Information Disclosure | texto extraído da transcrição enviado à Claude API | accept | Mesma exposição que o caminho de texto colado já tinha desde 2026-08-04 (e que todo o RAG deste app já tem): o `runStructuredExtraction` compartilhado é o único canal, inalterado. Nenhuma superfície nova de terceiros é criada |
| T-iea-05 | Tampering | arquivo malicioso explorando unpdf/mammoth | accept | Mesmo parser, mesma versão e mesma superfície já expostos por `uploadClientFile` desde 260722-hnm — este plano não amplia o conjunto de tipos aceitos (mesmo `ALLOWED_EXTENSIONS`) nem o tamanho (mesmo `MAX_FILE_BYTES`); só adiciona um segundo chamador autenticado do mesmo caminho |
| T-iea-06 | Denial of Service | transcrição gigante (5MB de .txt) inflando o prompt da IA | accept | `MAX_FILE_BYTES` já limita a 5MB, o mesmo teto que um arquivo de `client_files` (que é injetado inteiro no system prompt do chat a cada turno). Exposição não é maior que a já aceita; uma falha aqui é um erro de uma requisição, não persistente |
| T-iea-07 | Spoofing | extensão do arquivo não prova o conteúdo real | accept | `extensionOf` decide o parser, como já faz `uploadClientFile`. Um arquivo com extensão mentirosa falha na extração e retorna `FILE_UNREADABLE_ERROR` — o pior caso é uma mensagem de erro, nada é persistido |
| T-iea-SC | Tampering | instalações npm/pip/cargo | mitigate | Nenhum pacote novo é instalado (`package.json` não está em `files_modified`; `unpdf`/`mammoth` já são dependências desde 260722-hnm). Gate não aplicável |
</threat_model>

<verification>
Gates automáticos (raiz do repo):
- `npx tsc --noEmit` — sem erros.
- `npm run lint` — sem erros.
- `npm run build` — verde (build de produção exercita o `"use server"`: qualquer export não-async no arquivo quebra aqui).
- `npm test` — verde (suíte de módulos puros continua intacta; nenhum módulo puro é adicionado ou alterado por este plano).
- `git diff --name-only` ao fim do plano lista **exatamente** 2 arquivos: `lib/actions/client-files.ts` e `components/clients/transcript-update-section.tsx`. Qualquer arquivo a mais é scope creep e deve ser revertido antes do commit.
- Scope gate: `git diff -- supabase/ middleware.ts next.config.ts package.json lib/ai/ lib/extract/ lib/client-files/ components/clients/client-files-section.tsx` deve sair **vazio** (nenhuma migration/RLS, nenhum middleware, nenhuma dependência nova, nenhuma mudança no motor de IA, no extrator, no teto de arquivos ou na seção "Arquivos do cliente").
- Gate de não-regressão: `git diff -U0 lib/actions/client-files.ts | grep -E '^[+-]' | grep -v -E '^(\+\+\+|---)' | grep -cE 'updateClientFileContent|atFileLimit'` deve ser `0` (o passo de persistência e o gate de teto não são tocados).
- Gate de escrita zero (T-iea-03): em `lib/actions/client-files.ts`, a contagem de `\.insert(` deve continuar `1`, a de `\.update(` deve continuar `1` e a de `\.upsert(` deve continuar `0` — o baseline de hoje (`uploadClientFile` + `updateClientFileContent`). O caminho novo é somente-leitura + IA; qualquer escrita adicionada quebra este gate na Task 1, antes do checkpoint ao vivo.
- Gate de superfície única de erro: `grep -c '<ErrorBox>' components/clients/transcript-update-section.tsx` deve continuar `2`.

<human-check>
A verificação humana ao vivo é a Task 3 (checkpoint bloqueante) — cobre os dois caminhos ponta a ponta com credenciais reais, cliente e arquivo base reais, incluindo a prova de que o arquivo de transcrição enviado nunca é persistido e a limpeza dos dados de teste.
</human-check>
</verification>

<success_criteria>
- O caminho de texto colado funciona **exatamente** como antes: mesmo placeholder, mesmo botão "Analisar transcrição", mesma lógica de disabled, mesmo rótulo "Analisando...", mesmo resultado da IA (prompt/schema inalterados palavra por palavra).
- Existe um segundo caminho, visualmente secundário, que abre um seletor de arquivo via o padrão hidden-input + Button já estabelecido no projeto (nenhum input file nativo visível novo), aceita PDF/TXT/MD/DOCX até 5MB, e dispara a análise na própria seleção.
- Os dois caminhos convergem para o mesmo estado `analysis`/`draftContent` e para o mesmo "Confirmar atualização"/"Descartar" — `updateClientFileContent` não muda uma linha.
- `runStructuredExtraction` é chamado em **um único** lugar do arquivo (helper compartilhado), provando que a lógica de análise não foi duplicada; `MAX_FILE_BYTES` e `ALLOWED_EXTENSIONS` não foram redeclarados.
- Rótulos de pending distintos por caminho ("Analisando..." vs "Analisando arquivo..."), e uma **única** superfície de erro (`analyzeError` → `<ErrorBox>`) para ambos.
- O arquivo de transcrição enviado não é persistido em lugar nenhum — comprovado estruturalmente (contagem de writes do arquivo congelada em 1 insert / 1 update / 0 upsert, nenhuma escrita no caminho novo) e ao vivo (contagem de `client_files` inalterada após um envio real).
- `tsc`/`lint`/`build`/`test` verdes; diff toca exatamente 2 arquivos; RLS, migrations, middleware, dependências, motor de IA, extrator e a seção "Arquivos do cliente" permanecem intocados.
- Checkpoint humano da Task 3 aprovado e dados de teste limpos.
</success_criteria>

<output>
Criar `.planning/quick/260805-iea-adicionar-upload-de-arquivo-como-alterna/260805-iea-SUMMARY.md` ao concluir.
</output>
