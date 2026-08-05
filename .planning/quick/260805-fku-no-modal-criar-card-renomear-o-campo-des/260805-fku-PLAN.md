---
phase: quick-260805-fku
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - app/pm/board/board-panel.tsx
autonomous: false
requirements: [QUICK-260805-FKU]

must_haves:
  truths:
    - "No modal \"Criar card\", o campo antes rotulado \"Descrição\" agora aparece como \"Conteúdo do post\""
    - "O placeholder desse campo comunica que ali vai o texto do post que será revisado e publicado"
    - "O botão \"Importar do chat\" mostra, ao passar o mouse, uma dica explicando que ali se cola o texto gerado no Chat"
    - "Nenhum comportamento muda: criar card, importar do chat e a validação com IA continuam funcionando exatamente como antes"
  artifacts:
    - path: "app/pm/board/board-panel.tsx"
      provides: "Rótulo, placeholder e dica do botão atualizados no CreateCardDialog e no ImportFromChatDialog"
      contains: "Conteúdo do post"
  key_links:
    - from: "app/pm/board/board-panel.tsx (CreateCardDialog)"
      to: "createCardSchema / CreateCardInput"
      via: "FormField name=\"description\" — inalterado"
      pattern: "name=\"description\""
---

<objective>
Ajuste de copy no board de Produção (`/pm/board`): tornar explícito que o campo de texto do modal "Criar card" é onde vai o **conteúdo do post** (e não um contexto/briefing opcional), e explicar no botão "Importar do chat" para que ele serve.

Purpose: PMs estavam tratando o campo como "contexto opcional" por causa do rótulo e do placeholder, quando na prática é esse texto que alimenta a validação com IA ("Revalidar com IA") e vira o post revisado/publicado. Mudança de risco zero, Parte 1 de 2 (a Parte 2 — unificação de modais e botão Chat→Kanban — é outra quick task, fora deste plano).

Output: `app/pm/board/board-panel.tsx` com 3 strings de UI atualizadas. Zero mudança de lógica, schema, Server Action ou banco.
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
@$HOME/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/STATE.md
@app/pm/board/board-panel.tsx

<interfaces>
<!-- Estado atual dos pontos exatos a alterar (board-panel.tsx). -->

`CreateCardDialog` (~linha 202-340) — campo a renomear (linhas 288-305):
- `<FormField control={form.control} name="description" ...>` — a **key `description` NÃO muda** (é a key de `createCardSchema` / `CreateCardInput`, consumida por `createCard` e pela validação com IA).
- `<FormLabel>Descrição</FormLabel>` — só o texto visível muda.
- `<Textarea ... placeholder="Opcional — contexto, briefing rápido, referências." ... />` — só o placeholder muda.

`ImportFromChatDialog` (~linha 358-440) — botão trigger (linhas 401-406):
```
<DialogTrigger asChild>
  <Button type="button" variant="outline" disabled={!clientId}>
    <ClipboardPasteIcon className="size-4" />
    Importar do chat
  </Button>
</DialogTrigger>
```
O botão vive dentro de `PageTitle action={<div className="flex items-center gap-2"> ... }` (~linha 1144), lado a lado com o botão "Criar card" — **inserir um `<p>` de ajuda ali quebraria o layout horizontal**, por isso a dica vai como atributo `title` no próprio `<Button>`.

Primitivas de UI disponíveis (`components/ui/`): não existe componente `Tooltip` neste projeto (nem Radix Tooltip instalado). O padrão de texto auxiliar existente no arquivo é `<span className="text-meta text-muted-foreground">` (linha ~326). Para dica em hover sobre um botão em barra horizontal, o atributo nativo `title` é a opção sem nova dependência e sem risco de layout — **não instalar nem criar componente de tooltip novo**.
</interfaces>
</context>

<tasks>

<task type="auto">
  <name>Task 1: Atualizar rótulo, placeholder e dica de importação</name>
  <files>app/pm/board/board-panel.tsx</files>
  <action>
Três edições de string em `app/pm/board/board-panel.tsx`, todas dentro de `CreateCardDialog` e `ImportFromChatDialog`:

1. Em `CreateCardDialog` (~linha 293): trocar `<FormLabel>Descrição</FormLabel>` por `<FormLabel>Conteúdo do post</FormLabel>`. NÃO alterar o `name="description"` do `FormField`, nem `defaultValues.description`, nem `createCardSchema` — a key permanece `description` em todo o caminho (form → `createCard` → banco → `validateCardAgainstChecklist`). Renomear a key seria uma mudança estrutural fora do escopo desta task.

2. Em `CreateCardDialog` (~linha 298): trocar o placeholder do `<Textarea>` de `"Opcional — contexto, briefing rápido, referências."` para `"O texto do post que será revisado e publicado."`. Manter `rows={4}` e `disabled={isPending}` como estão.

3. Em `ImportFromChatDialog` (~linha 402): adicionar o atributo `title="Cole aqui o texto gerado no Chat para criar o card automaticamente."` ao `<Button type="button" variant="outline" disabled={!clientId}>` que serve de `DialogTrigger`. Usar o atributo HTML nativo — não introduzir componente/biblioteca de tooltip (nenhum existe no projeto). Não mexer no `DialogDescription` de dentro do diálogo, nem no `placeholder` do textarea de colagem.

NÃO tocar em: `<SectionTitle>Descrição</SectionTitle>` (~linha 828, é o detalhe do card, outra tela); `handleImport` e sua lógica de parsing de primeira linha; `onSubmit`/`createCard`; qualquer coisa relacionada a checklist/validação com IA. O diff deve conter exatamente 3 linhas alteradas/1 atributo adicionado neste único arquivo.
  </action>
  <verify>
  <automated>
cd /Users/lucaspaiva/projects/backstageed.OS && \
F=app/pm/board/board-panel.tsx && \
test "$(grep -v '^\s*\*' $F | grep -c 'Conteúdo do post')" = "1" && \
test "$(grep -c 'Opcional — contexto, briefing rápido, referências' $F)" = "0" && \
test "$(grep -c 'O texto do post que será revisado e publicado' $F)" = "1" && \
test "$(grep -c 'Cole aqui o texto gerado no Chat para criar o card automaticamente' $F)" = "1" && \
test "$(grep -c '<SectionTitle>Descrição</SectionTitle>' $F)" = "1" && \
test "$(grep -c 'name="description"' $F)" -ge "1" && \
git diff --stat -- $F && \
test "$(git diff --name-only | wc -l | tr -d ' ')" = "1" && \
npx tsc --noEmit && npm run lint && npm run build
  </automated>
  </verify>
  <done>
`FormLabel` do modal "Criar card" lê "Conteúdo do post"; placeholder lê "O texto do post que será revisado e publicado."; botão "Importar do chat" tem `title` com a dica; `name="description"` intacto; `<SectionTitle>Descrição</SectionTitle>` do detalhe do card intacto; apenas `board-panel.tsx` no diff; tsc, lint e build verdes.
  </done>
</task>

<task type="checkpoint:human-verify" gate="blocking">
  <what-built>
As 3 strings de UI foram atualizadas em `app/pm/board/board-panel.tsx` (rótulo do campo, placeholder e dica no botão "Importar do chat"). Nenhuma lógica foi alterada — `tsc`, `lint` e `build` passaram.
  </what-built>
  <how-to-verify>
1. `npm run dev` e abrir `/pm/board` autenticado como PM, com um cliente selecionado.
2. Clicar em "Criar card" — o segundo campo deve estar rotulado **"Conteúdo do post"** (não mais "Descrição") e o placeholder deve ler **"O texto do post que será revisado e publicado."**
3. Preencher título + conteúdo e clicar em "Criar card" — o card deve ser criado normalmente e o texto aparecer no detalhe do card (nada quebrou no caminho `description`).
4. Passar o mouse sobre o botão **"Importar do chat"** e aguardar ~1s — deve aparecer a dica nativa do navegador: "Cole aqui o texto gerado no Chat para criar o card automaticamente."
5. Abrir "Importar do chat", colar um texto qualquer e importar — deve continuar criando o card em Briefing como antes.
6. Abrir o detalhe de um card — a seção continua se chamando "Descrição" (não faz parte deste ajuste; se preferir renomear também, é escopo de outra task).
  </how-to-verify>
  <resume-signal>Digite "aprovado" ou descreva o que ficou estranho (ex.: outra redação preferida para o placeholder)</resume-signal>
</task>

</tasks>

<threat_model>
## Trust Boundaries

| Boundary | Description |
|----------|-------------|
| PM (browser) → Server Action `createCard` | Inalterado por esta task — nenhum novo input, validação ou caminho de dados |

## STRIDE Threat Register

| Threat ID | Category | Component | Disposition | Mitigation Plan |
|-----------|----------|-----------|-------------|-----------------|
| T-FKU-01 | Tampering | `CreateCardDialog` / `createCardSchema` | accept | Mudança é copy-only; a key `description` e a validação Zod permanecem idênticas — gate de verificação exige `name="description"` presente e diff limitado a 1 arquivo |
| T-FKU-02 | Information Disclosure | `title` do botão "Importar do chat" | accept | Texto estático em português, sem dado de cliente, sem interpolação |
| T-FKU-SC | Tampering | npm/pip/cargo installs | mitigate | Nenhuma dependência nova é instalada (tooltip usa atributo HTML nativo); se o executor sentir necessidade de instalar qualquer pacote, parar e escalar |
</threat_model>

<verification>
- `npx tsc --noEmit` — sem erros
- `npm run lint` — sem erros
- `npm run build` — sucesso
- `git diff --name-only` retorna somente `app/pm/board/board-panel.tsx`
- Gates de grep da Task 1 todos verdes (rótulo novo presente, placeholder antigo ausente, dica presente, `name="description"` e `<SectionTitle>Descrição</SectionTitle>` preservados)
- Checkpoint humano aprovado
</verification>

<success_criteria>
- Modal "Criar card" exibe "Conteúdo do post" com o novo placeholder
- Botão "Importar do chat" exibe a dica em hover
- Criar card e importar do chat funcionam exatamente como antes (verificado no navegador)
- Zero mudança em schema, Server Actions, lógica de parsing ou validação com IA
</success_criteria>

<output>
Create `.planning/quick/260805-fku-no-modal-criar-card-renomear-o-campo-des/260805-fku-SUMMARY.md` when done
</output>
