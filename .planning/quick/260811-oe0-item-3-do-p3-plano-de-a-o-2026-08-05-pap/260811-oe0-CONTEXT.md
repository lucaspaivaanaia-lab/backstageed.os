# Quick Task 260811-oe0: Papel de acesso "Editor" - Context

**Gathered:** 2026-08-11
**Status:** Ready for planning

<domain>
## Task Boundary

Item 3 do P3 do plano de ação de 2026-08-05: novo papel de acesso "Editor" — vê só os cards atribuídos a ele (via Designer/Mídia), ordenados por prazo, pode editar conteúdo/checklist desses cards, mas não pode avançar estágio nem criar/atribuir cards (decisão macro já travada em `260811-lp5-CONTEXT.md`, item 3).

Toca: `public.profiles` (enum `user_role`), RLS de `cards`/`card_checklist_items`/`card_attachments`/`clients`/`client_files` (cada policy que hoje branch por `pm`/`admin`/`client` precisa decidir onde o Editor entra), fluxo de provisionamento de conta (mesmo padrão de `createClientLogin`), e uma tela/visão nova pro Editor (fila de cards atribuídos, ordenada por prazo).

**Achado durante a discussão, não estava no CONTEXT.md macro:** não existe nenhum campo de prazo/data em `public.cards` hoje (Fase 4, que traria "publish date/time", ainda está TBD). O usuário decidiu que este item ganha escopo adicional pra suprir isso.

</domain>

<decisions>
## Implementation Decisions

### Provisionamento da conta Editor
- **Como Client: PM ou Admin provisiona diretamente** (email + senha provisória), sem autocadastro nem fila de aprovação — mesmo fluxo já usado hoje pra criar login de Client (`createClientLogin`-equivalente).

### Escopo de visibilidade
- **Só Designer/Mídia** — o Editor só vê cards onde ele é o `media_assignee_id` (campo já existente, item 4 do P3, quick task 260811-n0i). Não inclui cards onde ele é `assignee_id`/"Responsável" — esse papel implica mais controle sobre o card do que um Editor deveria ter.

### Desenho de RLS
- **Novo valor no enum `user_role`** (hoje `admin`/`pm`/`client`) — adicionar `'editor'`. Mais correto semanticamente que reaproveitar `pm` com uma flag. Implica revisar cada policy que hoje branch por papel (`is_admin()`, `pm_assigned_clients()`, e as RLS diretas de `cards`/`card_checklist_items`/`card_attachments`/`clients`/`client_files`) pra decidir explicitamente se o Editor entra ou fica de fora de cada uma.
- **Nota técnica pro planner:** `alter type ... add value` em Postgres tem restrição de não poder ser usado na mesma transação que outras instruções que referenciam o novo valor — pesquisar/confirmar o padrão correto de migração antes de escrever o SQL.

### Fila pendente
- **Todos os cards atribuídos ao Editor (via Designer/Mídia), ordenados por prazo** — não é uma tela nova e desconectada, é uma extensão natural de uma visão já existente (provavelmente uma variante do board ou uma lista simples), ordenada pelo prazo mais próximo primeiro.

### Campo de prazo (escopo adicional, decisão do usuário)
- **Adicionar um campo de prazo (`due_date` ou nome equivalente) em `public.cards` agora**, mesmo sem a Fase 4 (Client Approval & Scheduling) estar planejada — só pra dar ao Editor algo real pra ordenar. Editável por PM/Admin (nunca pelo próprio Editor). Isso adianta parte do que a Fase 4 provavelmente vai precisar de qualquer forma, mas o escopo aqui é estritamente "campo + ordenação da fila do Editor", não o fluxo completo de agendamento/aprovação da Fase 4.

### Permissões do Editor nos cards atribuídos
- Pode editar: descrição e itens de checklist (marcar/desmarcar) dos cards onde é Designer/Mídia.
- NÃO pode: avançar estágio, criar cards, atribuir/reatribuir cards (nem a si mesmo nem a outros), editar Responsável/Designer-Mídia/Canal/prazo.

### Permissões de leitura adicionais (achado na pesquisa técnica)
- **Anexos (links do Drive): sim, só leitura.** O Editor vê os anexos já vinculados aos cards atribuídos a ele (referências/assets), mas não pode adicionar/remover. Implica uma nova policy `card_attachments_select_scoped` pro Editor (mesma forma das novas policies de `cards`/`card_checklist_items`, escopada por `media_assignee_id`), sem nenhuma mudança de escrita.
- **`clients_select_scoped` ganha uma branch estreita pro Editor** (recomendação da pesquisa, aceita): `id in (select client_id from cards where media_assignee_id = auth.uid())` — só os clientes de cards que ele realmente tem, nunca acesso amplo a cliente (diferente de `pm_assigned_clients()`). Necessário pra fila do Editor conseguir mostrar o nome do cliente de cada card.

### Camada de proteção da restrição de coluna
- **Só a Server Action restrita**, sem trigger de reforço no banco — mesmo padrão já usado em toda a base (RLS decide quais linhas, a Server Action decide quais colunas, via payload fixo `{description, updated_at}`). Nenhuma outra ação do projeto tem uma camada extra de trigger pra isso; manter consistência com o resto do código em vez de introduzir um mecanismo novo só pro Editor.

### Claude's Discretion
- Onde exatamente o campo de prazo aparece na UI de edição (dialog de detalhe do card, ao lado de Responsável/Designer-Mídia/Canal) — critério do planner, seguindo o padrão visual já estabelecido.
- Formato exato da "fila" do Editor — uma rota nova (`/editor` ou similar) com uma lista simples, ou uma variante do board Kanban existente filtrada — desde que ordene por prazo e mostre só os cards atribuídos via Designer/Mídia. Confirmar landing page pós-login pro papel Editor, seguindo o padrão de landing pages já roteadas por papel (PM → `/pm`, Client → `/client`, Admin → `/admin`).
- Nome exato da rota/diretório (`app/editor/...` ou reaproveitar estrutura existente).
- Se o checklist do Editor precisa de alguma UI diferente da que o PM já usa, ou se é literalmente o mesmo componente com menos ações disponíveis (recomendado: mesmo componente, ações condicionadas ao papel).

</decisions>

<specifics>
## Specific Ideas

Nenhuma referência específica de UI/copy trazida além do já estabelecido no restante do app.

</specifics>

<canonical_refs>
## Canonical References

- `.planning/quick/260811-lp5-discutir-os-5-itens-do-p3-do-plano-de-a-/260811-lp5-CONTEXT.md` — decisão macro do item 3
- `.claude/plans/parallel-prancing-map.md` — plano de ação original de 2026-08-05, seção P3
- `.planning/ROADMAP.md` — Fase 4 (Client Approval & Scheduling, TBD, onde "publish date/time" formal apareceria) e Fase 5 (Access & Roles, fechada — onde o modelo de papéis atual foi construído)
- `supabase/migrations/0001_profiles.sql` — enum `user_role`, `handle_new_user()`
- `supabase/migrations/0003_pm_clients.sql`, `0004_rls_policies.sql`, `0007_clients_rls_fix.sql`, `0021_pm_assigned_clients_status_check.sql` — RLS helper functions (`is_admin()`, `pm_assigned_clients()`) a serem revisadas
- Fluxo de provisionamento de Client (`createClientLogin`, `lib/actions/clients.ts` ou equivalente) — padrão a espelhar pro Editor
- Item 4 do P3 (260811-n0i): `media_assignee_id` em `public.cards` — campo que define o escopo de visibilidade do Editor

</canonical_refs>
