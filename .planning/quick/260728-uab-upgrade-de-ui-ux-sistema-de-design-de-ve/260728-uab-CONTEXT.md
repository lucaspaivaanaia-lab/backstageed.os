# Quick Task 260728-uab: Upgrade de UI/UX - Design System - Context

**Gathered:** 2026-07-29
**Status:** Ready for planning

<domain>
## Task Boundary

Upgrade de UI/UX além da passada anterior (260721-wqd, que só uniformizou cores/tipografia): sistema de design de verdade, direção clean/minimalista (referência Linear/Notion), construído sobre a paleta indigo já estabelecida. Sidebar de navegação persistente, tokens de espaçamento/tipografia formalizados, componentes reutilizáveis (Card, Badge/status pill, tabela, EmptyState, loading, erro), ícones lucide-react, e polimento de formulários (criar cliente, briefing) + lista de clientes. Fundação reutilizável para a Fase 3 (Kanban de Produção de Conteúdo) — próximo passo após esta tarefa é `/gsd-discuss-phase` da Fase 3.

Restrição não-negociável: só camada visual/apresentação — zero mudança em lógica de negócio, RLS, Server Actions, queries, ou fluxo de dados.

</domain>

<decisions>
## Implementation Decisions

### Sidebar responsiva
Fixa, sem colapsar. Largura fixa sempre visível (desktop-first, reflete o uso real da equipe hoje). Sem lógica de collapse/toggle/localStorage — menos superfície pra manter.

### Card reutilizável (base pro Kanban futuro)
Card de propósito geral com slots genéricos (título, badge de status, metadados, ações), usado nas telas atuais (lista de clientes, briefing). NADA Kanban-específico agora — sem drag-and-drop, sem lógica de coluna. Só garantir que o Card em si sirva de base visual reutilizável; o desenho específico do Kanban fica para o discuss-phase da Fase 3.

### Escopo chat + tela de acesso do cliente
Ambas herdam a sidebar nova automaticamente (o layout já envolve /pm/* e /admin/* inteiros). Além disso, DEVEM adotar os componentes NOVOS desta rodada (Badge padronizado, caixa de erro compartilhada) — trocar seus badges/caixas de erro ad-hoc pelos componentes compartilhados, evitando duas gerações de padrão visual coexistindo. É troca de markup/classe, baixo risco.

### Claude's Discretion
- Estrutura exata dos tokens de espaçamento/tipografia (quantos níveis na escala, nomenclatura) — expandir o que já existe em app/globals.css e components/layout/page-shell.tsx, não recriar do zero.
- Exato conjunto de ícones lucide-react usados em cada ponto (nav da sidebar, ações de tabela, empty states).
- Composição interna do componente de erro compartilhado e do Skeleton de loading — usar o Skeleton do shadcn já instalado.
- Se a sidebar ganha um cabeçalho de marca (wordmark) próprio ou reaproveita o que já existe no AppNav atual.

</decisions>

<specifics>
## Specific Ideas

Referências de estilo citadas pelo usuário: Linear, Notion — direção clean/minimalista.

</specifics>

<canonical_refs>
## Canonical References

- .planning/quick/260721-wqd-passada-de-design-ui-consistente-login-p/ — passada de design anterior (paleta indigo, PageShell/PageTitle/SectionTitle/EmptyState) que esta tarefa expande, não substitui.
- .planning/quick/260722-eb7-corrigir-navegacao-quebrada-links-relati/ — criou o AppNav (header de topo) e os layouts app/pm/layout.tsx e app/admin/layout.tsx que esta tarefa substitui pela sidebar.
- ROADMAP.md Fase 3 (Content Production Kanban) — próximo passo após esta tarefa, consumidor pretendido dos componentes construídos aqui.

</canonical_refs>
