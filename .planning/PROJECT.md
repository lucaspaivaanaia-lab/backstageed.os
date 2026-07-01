# BackstageEd.OS

## What This Is

BackstageEd.OS é a plataforma central de produção e gestão de conteúdo para redes sociais (LinkedIn, Instagram e outras) de uma operação de social media management que atende múltiplos clientes simultaneamente. Substitui um processo hoje fragmentado em 5+ ferramentas (ChatGPT, Google Drive, Google Docs, WhatsApp, Mlabs) por um único sistema onde PMs produzem, revisam e obtêm aprovação de conteúdo, o dono da operação (Juliano) acompanha tudo em tempo real, e cada cliente aprova seus próprios conteúdos numa área dedicada — sem contaminação de contexto de IA entre clientes.

## Core Value

Um PM consegue produzir conteúdo para um cliente específico com IA que só conhece aquele cliente (RAG isolado, zero vazamento de contexto), levar esse conteúdo do briefing até a aprovação do cliente dentro da própria plataforma, e o Juliano consegue ver o status real de qualquer card, de qualquer cliente, a qualquer momento — sem depender de alguém avisar.

## Requirements

### Validated

(None yet — ship to validate)

### Active

- [ ] PM consegue conversar com IA sobre um cliente específico, com contexto isolado daquele cliente (RAG via Tropicalia, 1 project por cliente)
- [ ] PM controla manualmente o que vira conhecimento permanente do cliente (curadoria explícita — nada é salvo automaticamente no RAG)
- [ ] PM consegue preencher a base estratégica do cliente em formato estruturado (objetivo, tom de voz, público-alvo, pilares de conteúdo, etc.)
- [ ] PM consegue criar um card de conteúdo que percorre o fluxo: briefing → produção → revisão interna → aprovação do cliente → agendamento
- [ ] Um card pode representar um pacote de conteúdo (ex: campanha com múltiplas peças relacionadas), não só um post isolado
- [ ] PM consegue anexar mídia pesada (imagem, vídeo, PDF) a um card via link do Google Drive, sem precisar abrir o Drive manualmente
- [ ] Juliano consegue configurar um checklist de revisão interna, que pode variar por cliente, com itens que o PM precisa cumprir antes de enviar ao cliente
- [ ] Cada item do checklist é auditável — Juliano consegue ver se um PM pulou etapas
- [ ] Cliente acessa a plataforma e vê os conteúdos preparados para ele organizados como um quadro
- [ ] Cliente aprova ou pede ajuste item a item, com comentário
- [ ] Pedido de ajuste do cliente fica registrado e conectado ao card original, e o card volta para a etapa de produção (passando de novo pela revisão interna antes de retornar ao cliente)
- [ ] Ao ser aprovado, o card registra a data/hora combinada de publicação e fica marcado como "pronto para publicar" (PM ainda posta manualmente no Mlabs — sem integração de publicação automática na v1)
- [ ] Juliano tem uma visão macro: todos os clientes, todos os PMs, status consolidado de cada card
- [ ] Acesso à plataforma via self-signup com aprovação do admin (PM e cliente se cadastram, Juliano aprova)
- [ ] Multi-tenancy via RLS no Supabase: PM só acessa clientes que gerencia, cliente só acessa os próprios conteúdos, admin acessa tudo

### Out of Scope

- Captura automática de transcrições de reunião via Google Calendar/Meet — mapeado como integração futura, não faz parte do processo central v1
- Canal de WhatsApp por PM para alimentar contexto — integração futura
- Publicação automática via API de redes sociais — v1 registra data/hora de agendamento, mas a publicação em si continua manual via Mlabs
- Notificações por email — v1 é só in-app; PM e cliente veem mudanças de status ao acessar a plataforma
- Self-signup sem aprovação — todo cadastro (PM ou cliente) passa por aprovação do admin antes de ter acesso

## Context

- Operação estruturada como agência: Juliano (dono) gerencia PMs, cada PM gerencia um conjunto de clientes.
- Escala inicial é pequena (poucos PMs, até ~10 clientes) — v1 não precisa otimizar para navegação/filtro em grande escala, mas a arquitetura (RLS multi-tenant) já suporta crescimento.
- O processo atual está espalhado em ChatGPT (com uma única conta compartilhada entre a equipe, o que gera vazamento de contexto entre clientes), Google Drive, Google Docs, WhatsApp e Mlabs.
- Cada cliente tem sua própria "base de conhecimento" que hoje vive de forma inconsistente entre PMs — a padronização do briefing em campos estruturados é uma resposta direta a isso.

## Constraints

- **Timeline**: Data alvo de 30/09/2026 para ter uma primeira versão funcionando — pressiona o cronograma, mas sem detalhes adicionais sobre o evento/compromisso por trás da data.
- **Tech stack**: Next.js (App Router) + Supabase (Postgres, Auth, RLS, Storage) + Vercel + GitHub — já definido, não é uma decisão em aberto.
- **RAG**: Tropicalia API (tropicalia.dev), 1 project por cliente, `generate_answer: false` — a geração de resposta é sempre feita pela Claude API, não pela Tropicalia.
- **Storage de mídia**: Google Drive API para arquivos pesados (imagem, vídeo, PDF) — dados estruturados (briefing, status, comentários, histórico) ficam no Supabase.
- **Isolamento de contexto**: precisa ser estrutural (project separado por cliente na Tropicalia), não um filtro — requisito não-negociável motivado pelo problema real de vazamento de contexto no ChatGPT compartilhado.

## Key Decisions

| Decision | Rationale | Outcome |
|----------|-----------|---------|
| RAG isolado por cliente via project separado na Tropicalia (não filtro) | Vazamento de contexto entre clientes no ChatGPT compartilhado é uma das três dores centrais motivadoras do projeto — precisa ser estruturalmente impossível | — Pending |
| Curadoria manual de memória (PM gera .md e faz upload manual pro RAG) | Evita que erros de conversa virem memória permanente sem controle | — Pending |
| Supabase RLS para multi-tenancy | PM/cliente/admin com escopos de acesso diferentes, sem lógica de autorização duplicada na aplicação | — Pending |
| Google Drive como storage de mídia, Supabase como fonte de dados estruturados | Evita duplicar armazenamento de arquivos pesados; mantém histórico/estado estruturado consultável | — Pending |
| Claude API com prompt montado no servidor (Tropicalia só recupera contexto) | Controle total de tom, instrução de sistema e personalização por cliente, fora da camada de RAG | — Pending |
| Card pode representar pacote de conteúdo, não só post único | Reflete como PMs realmente trabalham (campanhas com múltiplas peças relacionadas avançando juntas) | — Pending |
| Agendamento v1 = registro de data/hora + status "pronto para publicar", sem integração de publicação | Publicação automática via API de redes sociais é integração futura mapeada, não bloqueia o processo central | — Pending |
| Self-signup com aprovação do admin | Evita que Juliano precise criar manualmente cada conta de PM/cliente, mas mantém controle de quem entra | — Pending |
| Sem notificações por email na v1 | Reduz escopo/dependências da v1; in-app é suficiente para o volume inicial pequeno | — Pending |

## Evolution

This document evolves at phase transitions and milestone boundaries.

**After each phase transition** (via `/gsd-transition`):
1. Requirements invalidated? → Move to Out of Scope with reason
2. Requirements validated? → Move to Validated with phase reference
3. New requirements emerged? → Add to Active
4. Decisions to log? → Add to Key Decisions
5. "What This Is" still accurate? → Update if drifted

**After each milestone** (via `/gsd:complete-milestone`):
1. Full review of all sections
2. Core Value check — still the right priority?
3. Audit Out of Scope — reasons still valid?
4. Update Context with current state

---
*Last updated: 2026-07-01 after initialization*
