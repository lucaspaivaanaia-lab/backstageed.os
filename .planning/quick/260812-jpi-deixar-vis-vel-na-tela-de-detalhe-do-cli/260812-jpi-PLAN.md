---
phase: quick-260812-jpi
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - components/clients/client-detail-form.tsx
autonomous: false
requirements: []

must_haves:
  truths:
    - "Quando o briefing tem uma proposta da IA (autofill manual pelo botão de upload, ou o redirect ?autofillBriefing=1 disparado na criação do cliente) ainda não salva, um indicador visual persistente e difícil de ignorar aparece na tela de detalhe do cliente."
    - "Qualquer edição manual do textarea de briefing (não só autofill) também dispara o mesmo indicador — o indicador deriva do isDirty já existente do react-hook-form, não de um estado paralelo específico de autofill."
    - "O indicador some assim que 'Salvar briefing' é clicado com sucesso (mesmo momento em que o botão volta a mostrar 'Salvo')."
    - "Um formulário recém-carregado, sem nenhuma edição, não mostra o indicador (nem 'Salvo', nem 'Alterações não salvas')."
    - "O gate briefingEmpty em app/pm/clients/page.tsx continua absolutamente inalterado — a correção é só de visibilidade na tela de detalhe."
  artifacts:
    - path: "components/clients/client-detail-form.tsx"
      provides: "Badge 'Alterações não salvas' no header do DataCard de briefing + destaque visual no Textarea, ambos derivados de form.formState.isDirty (sem novo estado)."
      contains: "Alterações não salvas"
  key_links:
    - from: "components/clients/client-detail-form.tsx (handleBriefingAutofilled)"
      to: "form.formState.isDirty"
      via: "form.setValue(\"briefing\", ..., { shouldDirty: true }) — já existente, reaproveitado sem mudança"
      pattern: "shouldDirty: true"
---

<objective>
Deixar visível, na tela de detalhe do cliente, que uma proposta de briefing gerada por IA (via autofill) — ou qualquer edição manual do textarea — ainda não foi salva no banco. Hoje o PM pode sair da tela achando que salvou (o texto aparece preenchido no textarea) e perder a proposta, porque o único sinal existente é o texto do botão ("Salvar briefing" vs "Salvo"), fácil de não notar — especialmente quando o preenchimento veio do redirect automático `?autofillBriefing=1` (260810-jl0), sem nenhuma ação explícita do PM que chamasse atenção pro formulário.

Purpose: fechar um bug real relatado ao vivo — perda de uma proposta de briefing por falta de sinal visual de "não salvo" — sem alterar o padrão "IA propõe, humano confirma" (nunca auto-salvar).

Output: `components/clients/client-detail-form.tsx` com um indicador visual persistente de "não salvo", derivado do `form.formState.isDirty` já existente (mesma variável que hoje só controla o texto do botão), cobrindo os dois gatilhos de autofill (botão manual em `ClientFilesSection` e o redirect `?autofillBriefing=1`) e qualquer edição manual do campo.
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
@$HOME/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/PROJECT.md
@.planning/STATE.md
@components/clients/client-detail-form.tsx
@components/clients/client-files-section.tsx
@components/ui/data-card.tsx
@components/ui/status-badge.tsx
@components/ui/textarea.tsx

<constraints>
Decisão travada pelo usuário, não é gray area:
- NÃO auto-salvar. A correção é PURAMENTE de visibilidade/UX, nunca de comportamento de persistência.
- O indicador deve derivar do `isDirty`/`justSavedBriefing` já existente (que hoje só controla o texto do botão "Salvar briefing"/"Salvo") — não criar um mecanismo de estado paralelo.
- Deve cobrir os DOIS gatilhos do autofill: o botão manual de upload (`ClientFilesSection` -> `handleBriefingAutofilled`) e o redirect `?autofillBriefing=1` (também via `handleBriefingAutofilled`, ver `useEffect` em `client-detail-form.tsx`).
- Fora de escopo: qualquer mudança no gate `briefingEmpty` de `app/pm/clients/page.tsx`.
</constraints>

<interfaces>
<!-- Estado já existente em components/clients/client-detail-form.tsx, reaproveitado sem mudança de contrato -->

```typescript
const [justSavedBriefing, setJustSavedBriefing] = useState(false);

const form = useForm<BriefingInput>({
  resolver: zodResolver(briefingSchema),
  defaultValues: { briefing: client.briefing ?? "" },
});

// Ambos os gatilhos de autofill (botão manual em ClientFilesSection via
// onBriefingAutofilled, e o redirect ?autofillBriefing=1 via useEffect)
// já chamam esta mesma função, que já seta shouldDirty: true:
function handleBriefingAutofilled(briefing: BriefingInput) {
  form.setValue("briefing", briefing.briefing, { shouldDirty: true });
}
```

O botão hoje lê o estado assim (linha ~349-359):
```typescript
{isBriefingPending
  ? "Salvando..."
  : justSavedBriefing && !form.formState.isDirty
    ? "Salvo"
    : "Salvar briefing"}
```

`form.formState.isDirty` já é `true` imediatamente após QUALQUER um dos dois
gatilhos de autofill (por causa de `shouldDirty: true`) e após qualquer edição
manual do usuário no Textarea — e volta a `false` após `form.reset(values)`
no `onSubmitBriefing` bem-sucedido. Este é o único sinal necessário; nenhum
estado novo precisa ser criado.

`DataCard` (components/ui/data-card.tsx) já aceita um slot `badge?: ReactNode`
renderizado ao lado do `title` no header do card — usar esse slot em vez de
inserir markup solto.

`StatusBadge` (components/ui/status-badge.tsx) já tem `tone="warning"`
disponível (`bg-warning/12 text-warning`), consistente com o resto do design
system (nenhuma cor nova precisa ser introduzida).
</interfaces>
</context>

<tasks>

<task type="auto">
  <name>Task 1: Indicador visual persistente de "não salvo" no briefing</name>
  <files>components/clients/client-detail-form.tsx</files>
  <action>
    No DataCard "Briefing estratégico" (por volta da linha 316-362), passar um
    novo prop `badge` renderizando `<StatusBadge tone="warning">Alterações não
    salvas</StatusBadge>` quando `form.formState.isDirty && !isBriefingPending`
    for verdadeiro, e `null` caso contrário — importar `StatusBadge` de
    "@/components/ui/status-badge". Este badge cobre os três casos que devem
    disparar o indicador: autofill via botão manual de upload, autofill via
    redirect `?autofillBriefing=1`, e qualquer edição manual do Textarea —
    todos já passam por `form.formState.isDirty` sem nenhum código novo de
    estado.

    Adicionar também um destaque visual no próprio Textarea do campo
    `briefing` (linha ~332-338), já que o card tem `min-h-[400px]` e pode
    rolar o header (com o badge) para fora da tela enquanto o PM edita — trocar
    a `className` fixa `"min-h-[400px]"` por uma computada com `cn()` (importar
    de "@/lib/utils") que adiciona `"border-warning ring-1 ring-warning/40"`
    quando `form.formState.isDirty` for verdadeiro, preservando `min-h-[400px]`
    em ambos os casos.

    Não alterar `justSavedBriefing`, `onSubmitBriefing`, `handleBriefingAutofilled`
    nem o `useEffect` do `?autofillBriefing=1` — a correção é apenas leitura de
    `form.formState.isDirty`/`isBriefingPending`, já computados, em dois pontos
    de render.
  </action>
  <verify>
    <automated>cd /Users/lucaspaiva/projects/backstageed.OS && npx tsc --noEmit && npx eslint components/clients/client-detail-form.tsx</automated>
  </verify>
  <done>
    `tsc --noEmit` e `eslint` passam sem erro; o arquivo importa `StatusBadge`
    e `cn`; a StatusBadge "Alterações não salvas" e o destaque de borda no
    Textarea estão condicionados a `form.formState.isDirty`, sem nenhum novo
    `useState`/`useEffect` adicionado.
  </done>
</task>

<task type="checkpoint:human-verify" gate="blocking">
  <what-built>
    Indicador visual persistente de "não salvo" na tela de detalhe do cliente
    (`/pm/clients/[id]` e `/admin/clients/[id]`), cobrindo os dois gatilhos de
    autofill do briefing e qualquer edição manual.
  </what-built>
  <how-to-verify>
    1. Rode `npm run dev` e abra um cliente EXISTENTE (briefing já preenchido
       e salvo) em `/pm/clients/[id]`. Confirme que NENHUM indicador de "não
       salvo" aparece (nem badge, nem borda destacada no Textarea) — só o
       estado normal.
    2. Edite manualmente uma palavra no Textarea do briefing. Confirme que o
       badge "Alterações não salvas" aparece no header do card e a borda do
       Textarea muda visualmente, SEM salvar nada ainda.
    3. Clique em "Salvar briefing". Confirme que o badge some e o botão volta
       a mostrar "Salvo" (comportamento já existente, não deve regredir).
    4. Envie um arquivo novo em "Arquivos do cliente" (gatilho do autofill
       manual). Após o toast "Briefing preenchido pela IA...", confirme que o
       badge "Alterações não salvas" aparece imediatamente, mesmo sem o PM ter
       tocado no Textarea.
    5. Crie um cliente NOVO anexando um arquivo já na tela de criação
       (gatilho do redirect `?autofillBriefing=1`, quick task 260810-jl0) e
       confirme que, ao cair em `/pm/clients/[id]?autofillBriefing=1` e o
       briefing ser preenchido automaticamente, o badge "Alterações não
       salvas" já aparece SEM precisar editar nada — este é o caso real que
       causou a perda de dados reportada.
    6. Confirme que `app/pm/clients/page.tsx` (a listagem, o gate
       `briefingEmpty`) não mudou de comportamento — cliente com briefing
       vazio ainda cai direto no form de briefing.
  </how-to-verify>
  <resume-signal>Digite "aprovado" ou descreva o problema encontrado</resume-signal>
</task>

</tasks>

<threat_model>
## Trust Boundaries

| Boundary | Description |
|----------|-------------|
| N/A | Mudança puramente visual em um Client Component já renderizado apenas para o próprio PM/Admin autenticado da sessão; nenhum dado novo é lido, escrito ou exposto. `form.formState.isDirty` é estado local do react-hook-form, nunca enviado ao servidor. |

## STRIDE Threat Register

Nenhum threat novo introduzido — task não cria nova superfície de dados,
Server Action, endpoint ou query. Escopo estritamente limitado a leitura de
estado de formulário já existente para controlar classes CSS/badge.
</threat_model>

<verification>
- `npx tsc --noEmit` limpo
- `npx eslint components/clients/client-detail-form.tsx` limpo
- `npm run build` verde (rodado pelo orchestrator após merge, mesma limitação de Turbopack em worktree isolado já documentada em STATE.md)
- Checkpoint humano (Task 2) aprovado cobrindo os dois gatilhos de autofill + edição manual + reversão pós-save
</verification>

<success_criteria>
- PM/Admin não consegue mais sair da tela de detalhe do cliente sem perceber que uma proposta de briefing da IA (de qualquer um dos dois gatilhos) ou uma edição manual está pendente de salvar.
- Nenhuma mudança de comportamento de persistência: "Salvar briefing" continua sendo o único caminho que grava no banco.
- `app/pm/clients/page.tsx`'s `briefingEmpty` gate permanece byte-idêntico.
</success_criteria>

<output>
Create `.planning/quick/260812-jpi-deixar-vis-vel-na-tela-de-detalhe-do-cli/260812-jpi-SUMMARY.md` when done
</output>
