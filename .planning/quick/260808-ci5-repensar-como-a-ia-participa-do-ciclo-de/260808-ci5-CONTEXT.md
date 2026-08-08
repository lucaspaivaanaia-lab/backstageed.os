# Quick Task 260808-ci5: Repensar como a IA participa do ciclo de checklist do cliente - Context

**Gathered:** 2026-08-08
**Status:** Ready for planning

<domain>
## Task Boundary

Repensar como a IA participa do ciclo de checklist do cliente, com dois pontos trazidos pelo usuário durante o checkpoint da onda 9 (2026-08-08):

1. Hoje o Admin precisa clicar manualmente em "Gerar checklist com IA" depois que o cliente já existe (feature do P0 pivot de 2026-08-04). O usuário quer que a IA já proponha o checklist principal automaticamente, lendo os briefings/materiais do cliente.
2. Hoje "Revalidar com IA" (também do P0 pivot) é só consultivo — mostra quais itens do checklist não passaram e por quê, mas não altera o conteúdo do post. O usuário quer que a IA se autocorrija, ajustando o próprio rascunho do post para ter mais chance de passar nos itens do checklist.

Toca três sistemas já em produção: criação/upload de arquivos do cliente (Fase 1 + `lib/ai/`), a gestão de `checklist_templates` (Fase 3 wave 1, hoje Admin-only), e o "Revalidar com IA" do P0 pivot (hoje advisory-only por decisão explícita D-06).

</domain>

<decisions>
## Implementation Decisions

### Gatilho de geração do checklist
- A IA gera automaticamente o checklist do cliente **a cada arquivo enviado** — o mesmo gatilho que já dispara hoje o autofill do briefing estratégico (`lib/ai/` + upload de `client_files`). Não é necessário um botão manual novo para o caminho automático. O botão manual existente ("Gerar/Atualizar checklist com IA") pode continuar existindo como re-geração/fallback — decisão de manter ou não fica a critério do planner, desde que o caminho automático funcione sem exigir clique.

### Aprovação do checklist gerado
- **Tanto o PM quanto o Admin podem aprovar/editar o checklist gerado pela IA** — não é mais Admin-only como o modelo atual de `checklist_templates` (RLS hoje restringe gestão a Admin, Fase 3 CHK-01/CHK-02).
- **Esta é a maior mudança de escopo desta feature.** Abrir a gestão/aprovação de `checklist_templates` (ou de um novo estado "gerado, pendente de revisão") para o papel de PM é uma extensão deliberada de permissão, não um bug a corrigir — mas o planner deve propor explicitamente COMO isso funciona a nível de dado e RLS (ex.: um novo status como `pending_review` no checklist gerado, editável por PM OU Admin até ser confirmado; versus abrir INSERT/UPDATE de `checklist_templates` por inteiro para PM). Qualquer novo caminho de escrita em `checklist_templates` por um PM precisa ser escopado ao(s) cliente(s) daquele PM (mesmo padrão de `pm_assigned_clients()` já usado em todo o resto do sistema) — nunca um PM editando o checklist de um cliente que não é dele.

### Autocorreção do rascunho do post
- Quando "Revalidar com IA" identifica que o post não vai passar em algum item do checklist, **a IA reescreve o rascunho automaticamente, sem pedir confirmação antes** — o PM vê o texto já corrigido como resultado de clicar em "Revalidar com IA" (deixa de ser só um relatório pass/fail, passa a devolver texto revisado).
- **Esta decisão supersede D-06** (pivot 2026-08-04: "IA é apenas consultiva, nunca decide sozinha o que vira conteúdo final") — **apenas no que diz respeito ao TEXTO DO RASCUNHO DO POST** (o campo `description`/"Conteúdo do post" do card). A proteção mais crítica de D-06 — o gate de CHK-03 exigindo que o PM confira manualmente cada item do checklist em Revisão interna antes de avançar — **continua intacta e não deve ser tocada por esta feature**. A IA pode reescrever o rascunho do post; ela não pode marcar itens de `card_checklist_items` como concluídos, nem chamar `advanceStage`/`moveCard`, nem abrir qualquer novo caminho de auto-avanço. O planner deve tratar isso como um limite rígido, citável como D-06-amendment nesta feature.

### Timing da autocorreção
- Continua disparando pelo mesmo botão "Revalidar com IA" já existente (`validateCardAgainstChecklist`) — muda o que a resposta faz (reescreve o rascunho, além de reportar por item), não quando é chamada. Sem disparo automático a cada edição, sem disparo automático ao tentar avançar de estágio.

### Claude's Discretion
- Se o checklist manual ("Gerar/Atualizar checklist com IA") deve continuar existindo lado a lado com o caminho automático, ou ser removido/fundido — não discutido explicitamente, fica a critério do planner desde que o caminho automático não dependa dele.
- O exato desenho de schema/RLS para a aprovação PM-ou-Admin (novo status vs. nova policy) não foi travado — o usuário aprovou o PRINCÍPIO (ambos os papéis podem aprovar/editar), não a implementação.
- Como o `draftDescription`/UI comunica que o texto foi reescrito pela IA (ex.: um diff, um aviso, um botão de desfazer) não foi discutido — deixado para o planner propor, com atenção a não surpreender o PM silenciosamente sobrescrevendo o que ele tinha escrito.

</decisions>

<specifics>
## Specific Ideas

Nenhuma referência específica de UI/copy foi trazida além do que já existe em `03-UI-SPEC.md` e no `lib/ai/` engine atual — abordagem padrão esperada, seguindo os componentes/padrões já estabelecidos no board (`ErrorBox`, `useTransition`, ícones/botões existentes).

</specifics>

<canonical_refs>
## Canonical References

- `.planning/STATE.md` — Decisions 2026-08-04 (P0 pivot, itens 4 e 6: geração de checklist por Admin, "Revalidar com IA" advisory-only, D-06)
- `.planning/phases/03-content-production-kanban/` — CHK-01/CHK-02 (checklist templates, Admin-only), CHK-03 (gate de revisão interna, PM-driven)
- `lib/ai/` — motor de IA compartilhado (client_files + prompt → structured output), já usado por autofill de briefing, geração de checklist, e "Revalidar com IA"

</canonical_refs>
