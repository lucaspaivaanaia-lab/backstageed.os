# BackstageEd.OS

## Current Milestone: v1.1 PM Operations & Content Automation

**Goal:** Dar ao Admin visibilidade e controle sobre a operação dos PMs (substituindo a planilha manual da Laura), enquanto automatiza mais do pipeline de conteúdo (escolha de modelo de IA por área, geração de temas, reunião→briefing, exportação em PDF) e dá ao papel Editor seu próprio espaço de trabalho.

**Target features:**
- Painel de controle do Admin sobre POs/PMs (999.6) — clientes por PM, carga de trabalho, visão gráfica de progresso, espaço pra comentar
- Confirmação de que `shared_knowledge_files` tem escrita restrita a Admin via RLS (999.9)
- Seleção de modelo de IA por área da plataforma (999.1)
- Área/Kanban própria do Editor (999.3)
- Pipeline automático de geração de temas (999.4)
- Integração de calendário/reunião → briefing do cliente, via Gemini (999.7)
- Exportação automática em PDF de conteúdos aprovados (999.8)

**Deliberately excluded from this milestone (still cost-blocked in the backlog):** upload de áudio com transcrição automática (999.2), verificação ortográfica via OCR em imagens (999.5) — ambos aguardando checagem de custo antes de entrar em qualquer milestone.

## What This Is

BackstageEd.OS é a plataforma central de produção e gestão de conteúdo para redes sociais (LinkedIn, Instagram e outras) de uma operação de social media management que atende múltiplos clientes simultaneamente. Substitui um processo hoje fragmentado em 5+ ferramentas (ChatGPT, Google Drive, Google Docs, WhatsApp, Mlabs) por um único sistema onde PMs produzem, revisam e obtêm aprovação de conteúdo, o dono da operação (Juliano) acompanha tudo em tempo real, e cada cliente aprova seus próprios conteúdos numa área dedicada — sem contaminação de contexto de IA entre clientes.

## Core Value

Um PM consegue produzir conteúdo para um cliente específico com IA que só conhece aquele cliente (RAG isolado, zero vazamento de contexto), levar esse conteúdo do briefing até a aprovação do cliente dentro da própria plataforma, e o Juliano consegue ver o status real de qualquer card, de qualquer cliente, a qualquer momento — sem depender de alguém avisar.

## Requirements

### Validated

- [x] PM consegue preencher a base estratégica do cliente — Validated in Phase 1 (2026-07-13). Mecanismo mudou depois (quick task 260811-kl3, 2026-08-11): campos estruturados (objetivo/tom/público/pilares) foram abandonados em favor de um único campo `briefing` de texto livre extraído pela IA — a intenção do requisito (PM consegue registrar e editar a base estratégica) não mudou, só a forma
- [x] Juliano tem uma visão macro: todos os clientes, todos os PMs, status consolidado de cada card — Validated in Phase 6 (2026-08-14)
- [x] PM consegue conversar com IA sobre um cliente específico, com contexto isolado daquele cliente — Validated in Phase 2 (2026-08-05, live-verified end-to-end against production). Mecanismo: `public.client_files`, RLS-scoped por `client_id`, injeção direta do conteúdo completo no prompt (migrado de Tropicalia em 2026-07-22 — ver Key Decisions)
- [x] PM controla manualmente o que vira conhecimento permanente do cliente (curadoria explícita, nada salvo automaticamente) — Validated in Phase 2 (2026-08-05)
- [x] PM consegue criar um card de conteúdo que percorre o fluxo: briefing → produção → revisão interna → aprovação do cliente → agendamento — Validated in Phase 3/Phase 4 (2026-08-08 / 2026-08-13)
- [x] Um card pode representar um pacote de conteúdo (múltiplas peças relacionadas, cada uma avançando independentemente) — Validated in Phase 3 (2026-08-08), entregue via re-scope de execução em 2026-07-31 (waves 7-9), não no plano original da fase
- [x] PM consegue anexar mídia pesada a um card via link do Google Drive — Validated in Phase 3 (2026-08-05)
- [x] Juliano consegue configurar um checklist de revisão interna por cliente — Validated in Phase 3 (2026-08-05)
- [x] Cada item do checklist é auditável — Validated in Phase 3 (2026-08-05), incluindo trilha de auditoria para avanço forçado pelo Admin (`card_checklist_overrides`)
- [x] Cliente acessa a plataforma e vê os conteúdos preparados para ele organizados como um quadro — Validated in Phase 4 (2026-08-13)
- [x] Cliente aprova ou pede ajuste item a item, com comentário — Validated in Phase 4 (2026-08-13)
- [x] Pedido de ajuste do cliente fica registrado e conectado ao card original, card volta para produção — Validated in Phase 4 (2026-08-13)
- [x] Ao ser aprovado, o card registra data/hora de publicação e fica "pronto para publicar" — Validated in Phase 4 (2026-08-13)
- [x] PM acessa via self-signup com aprovação do admin; Cliente NÃO se auto-cadastra (PM cria o login) — Validated in Phase 5 (2026-07-16)
- [x] Multi-tenancy via RLS no Supabase (PM/cliente/admin com escopos distintos) — Validated in Phase 5 (2026-07-16). Uma lacuna real de controle de acesso (IDOR em `createClientLogin`/`deactivateClientAccess`, sem verificação de escopo do chamador) foi encontrada em verificação e fechada antes do fechamento da fase (plano 05-05, CR-01/CR-02)

### Active

- [ ] Admin consegue ver clientes por PM, carga de trabalho, e progresso visual de cada PM — substituindo a planilha manual
- [ ] Admin consegue deixar comentários sobre a gestão de um PM específico
- [ ] `shared_knowledge_files` tem escrita (INSERT/UPDATE/DELETE) restrita a Admin, confirmado via RLS
- [ ] PM/Admin consegue escolher/configurar qual modelo de IA é usado em cada ponto de geração da plataforma
- [ ] Editor tem uma área própria (Kanban/fila) mostrando todos os cards atribuídos a ele via `media_assignee_id`, ordenados por `due_date`
- [ ] Ao criar um cliente, ~10 temas de pauta são gerados automaticamente; volume de posts/semana é configurável por cliente; gatilho semanal propõe novos temas; aprovar um tema gera o post
- [ ] Transcrições de reunião (Gemini) alimentam automaticamente o briefing do cliente, extraindo só o que for novo/relevante por reunião
- [ ] PM/Admin consegue exportar um PDF único por cliente com todos os cards em "Aprovação do cliente" (data, título, texto, imagem), via template revisável

*(REQ-IDs formalizados em REQUIREMENTS.md na próxima etapa)*

### Out of Scope

- Captura automática de transcrições de reunião via Google Calendar/Meet — mapeado como integração futura, não faz parte do processo central v1
- Canal de WhatsApp por PM para alimentar contexto — integração futura
- Publicação automática via API de redes sociais — v1 registra data/hora de agendamento, mas a publicação em si continua manual via Mlabs
- Notificações por email — v1 é só in-app; PM e cliente veem mudanças de status ao acessar a plataforma
- Self-signup sem aprovação (PM) — cadastro de PM sempre passa por aprovação do admin antes de ter acesso
- Self-signup de Cliente — decidido na discussão da Phase 5 (Access & Roles, originalmente Phase 1) que Cliente não se auto-cadastra; PM cria o login do cliente diretamente
- Múltiplos logins por cliente — v1 é 1 login por empresa-cliente; mais de uma pessoa por cliente fica para v2 (o papel "Editor", adicionado em 2026-08-12, é um colaborador interno com acesso restrito por card atribuído — não é um segundo login de cliente, continua fora deste escopo)

## Context

- Operação estruturada como agência: Juliano (dono) gerencia PMs, cada PM gerencia um conjunto de clientes.
- Escala inicial é pequena (poucos PMs, até ~10 clientes) — v1 não precisa otimizar para navegação/filtro em grande escala, mas a arquitetura (RLS multi-tenant) já suporta crescimento.
- O processo atual estava espalhado em ChatGPT (com uma única conta compartilhada entre a equipe, o que gerava vazamento de contexto entre clientes), Google Drive, Google Docs, WhatsApp e Mlabs — v1.0 substitui esse processo pela plataforma.
- Cada cliente tem sua própria "base de conhecimento", hoje um campo de briefing de texto livre extraído por IA a partir de arquivos enviados (`client_files`), mais uma base de conhecimento compartilhada entre todos os clientes (`shared_knowledge_files`, estruturalmente pronta mas ainda vazia — aguardando o primeiro documento real do Juliano).

**Estado atual (v1.0 shipped, 2026-08-14):**
- 6 fases, 32 planos, 44 dias (2026-07-01 → 2026-08-14), 538 commits, ~20,7 mil linhas de TypeScript.
- Stack: Next.js 16 (App Router) + Supabase (Postgres/Auth/RLS) + Claude API (`@anthropic-ai/sdk`, modelo Sonnet centralizado) + Vercel. Em produção desde 2026-08-05: https://backstageed-os.vercel.app (protegido por login + RLS; `noindex` até sair do estágio "em construção").
- Papéis de acesso: Admin, PM, Client, e Editor (adicionado 2026-08-12 — colaborador interno de mídia, visibilidade restrita a cards com `media_assignee_id` próprio).
- Débito técnico conhecido (não bloqueia v1.0): (1) crash intermitente do stream de chat só em `npm run dev`/Turbopack local, nunca visto em produção; (2) sem UI de "restaurar" um cliente arquivado (reversão hoje é manual via `archived_at = null`); (3) base de conhecimento compartilhada estruturalmente pronta mas sem conteúdo real ainda.

## Constraints

- **Timeline**: Data alvo de 30/09/2026 para ter uma primeira versão funcionando — pressiona o cronograma, mas sem detalhes adicionais sobre o evento/compromisso por trás da data.
- **Tech stack**: Next.js (App Router) + Supabase (Postgres, Auth, RLS, Storage) + Vercel + GitHub — já definido, não é uma decisão em aberto.
- **RAG**: arquivos do cliente (PDF/TXT/MD/DOCX, ~3 por cliente) são extraídos para texto puro no upload e armazenados diretamente em `public.client_files` no Supabase — sem embeddings/vetor, sem serviço externo. O conteúdo completo de todos os arquivos do cliente ativo é injetado no system prompt a cada turno; a geração de resposta é sempre feita pela Claude API. (Migrado de Tropicalia em 2026-07-22 — ver Key Decisions.)
- **Storage de mídia**: Google Drive API para arquivos pesados (imagem, vídeo, PDF) — dados estruturados (briefing, status, comentários, histórico) ficam no Supabase.
- **Isolamento de contexto**: precisa ser estrutural, não um filtro — requisito não-negociável motivado pelo problema real de vazamento de contexto no ChatGPT compartilhado. Mecanismo atual: RLS scoping de `client_files` por `client_id` no Postgres (`is_admin()`/`pm_assigned_clients()`), a mesma camada de multi-tenancy usada por todas as outras tabelas do sistema.

## Key Decisions

| Decision | Rationale | Outcome |
|----------|-----------|---------|
| RAG isolado por cliente via project separado na Tropicalia (não filtro) | Vazamento de contexto entre clientes no ChatGPT compartilhado é uma das três dores centrais motivadoras do projeto — precisa ser estruturalmente impossível | Superseded 2026-07-22 (ver linha abaixo) — provisioning chegou a ser wired end-to-end em Phase 1 (POST /v1/projects on client creation, `public_id` stored as `tropicalia_project_id`), mas nunca chegou a rodar com uma key real de produção antes da migração |
| Migração do RAG de Tropicalia para armazenamento direto em Supabase (`client_files`), com injeção completa de conteúdo no prompt, sem embeddings/vetor | Mudança de modelo de negócio da Tropicalia confirmada em reunião com o fundador; volume real por cliente é baixo (~3 arquivos), tornando embeddings desnecessários; simplicidade operacional e ausência de latência de indexação assíncrona superam o retrieval vetorial para esse volume. O isolamento estrutural (requisito não-negociável) é preservado via RLS scoping de `client_files` por `client_id`, no lugar de um project separado por cliente | 2026-07-22 |
| Curadoria manual de memória (PM gera .md e faz upload manual pro RAG) | Evita que erros de conversa virem memória permanente sem controle | ✓ Good — shipped Phase 2, live-verified round-trip 2026-08-05 |
| Supabase RLS para multi-tenancy | PM/cliente/admin com escopos de acesso diferentes, sem lógica de autorização duplicada na aplicação | ✓ Good — shipped Phase 5; um gap real de app-layer (IDOR em `createClientLogin`/`deactivateClientAccess`) mostrou que RLS sozinho não bastava para toda superfície — Server Actions que usam o cliente service-role precisam do próprio check de escopo, fechado no plano 05-05 |
| Google Drive como storage de mídia, Supabase como fonte de dados estruturados | Evita duplicar armazenamento de arquivos pesados; mantém histórico/estado estruturado consultável | ✓ Good — shipped Phase 3 (KAN-05, links validados client+server) |
| Claude API com prompt montado no servidor (client_files só fornece o contexto injetado) | Controle total de tom, instrução de sistema e personalização por cliente, fora da camada de armazenamento de contexto | ✓ Good — shipped Phase 2; modelo (Sonnet) depois centralizado num único módulo (quick task 260811-p2c) |
| Card pode representar pacote de conteúdo, não só post único | Reflete como PMs realmente trabalham (campanhas com múltiplas peças relacionadas avançando juntas) | ✓ Good — shipped Phase 3 via re-scope de execução (waves 7-9, 2026-08-08), cada peça com seu próprio gate de checklist e um badge de rollup calculado em render-time |
| Agendamento v1 = registro de data/hora + status "pronto para publicar", sem integração de publicação | Publicação automática via API de redes sociais é integração futura mapeada, não bloqueia o processo central | ✓ Good — shipped Phase 4 (SCH-01/02) |
| Self-signup com aprovação do admin (PM apenas) | Evita que Juliano precise criar manualmente cada conta de PM, mas mantém controle de quem entra | ✓ Good — shipped Phase 5 (2026-07-16) |
| Sem notificações por email na v1 | Reduz escopo/dependências da v1; in-app é suficiente para o volume inicial pequeno | ✓ Good — nenhum pedido de reversão durante a v1.0 |
| Cliente não se auto-cadastra — PM cria o login do cliente (email + senha provisória, troca obrigatória no 1º acesso) vinculado a um registro de cliente existente | Revisado na discussão da Phase 5 (Access & Roles, originalmente Phase 1): o cliente é uma conta "provisionada" pela agência, não um usuário que decide se cadastrar sozinho — reflete como PMs onboardam clientes na prática | ✓ Good — shipped Phase 5 (AUTH-09/10/11) |
| Reordenação de fases: Client Records & RAG Setup vira Phase 1 (era Phase 2); Access & Roles vira Phase 5 (era Phase 1) | Decisão do Juliano em reunião de stakeholder — prioriza validar o cadastro de cliente + RAG isolado antes do fluxo completo de login/aprovação; o scaffold técnico da Phase 5 (05-01) já está pronto e serve de base | ✓ Good — 2026-07-08, permitiu Sub-phase 1A entregar cedo sem esperar o fluxo de login completo |
| Abandonar campos estruturados de briefing (objetivo/tom/público/pilares) por um único campo de texto livre extraído pela IA | O usuário assumiu a decisão pessoalmente (quick task 260811-kl3): campos fixos limitavam como a IA podia estruturar o contexto real de cada cliente; texto livre deixa a IA escolher sua própria estrutura por caso | ✓ Good — 2026-08-11, sem backfill (dados de teste), sem mudança de RLS |
| Tag curta por cliente como chave de referência no prompt de IA, em vez do nome completo | Achado de produção: a IA misturou conteúdo de dois clientes por nome ambíguo dentro de um arquivo — correção de segurança real, não só qualidade | ✓ Good — 2026-08-10, os 4 call-sites de extração estruturada atualizados, testes de leakage-guard adicionados |
| Papel "Editor" (colaborador interno de mídia): visibilidade e escrita restritas a cards com `media_assignee_id` próprio | Item 3 do plano de ação de 2026-08-05 (P3) — precisava de acesso interno mais granular que PM/Admin sem virar um segundo login de cliente | ✓ Good — 2026-08-12, mas o item mais sensível em segurança da sessão: o plan-checker encontrou e fechou um bloqueador real (3 Server Actions PM/Admin que confiavam só em RLS, sem checagem de papel própria, ficariam abertas ao Editor) antes do merge |
| Soft delete/archive de cliente (`archived_at`), não hard delete | Um cliente real estava prestes a entrar em produção quando o pedido de exclusão surgiu — reversibilidade importava mais que limpeza | ✓ Good — 2026-08-04; sem UI de restore ainda, reversão manual via `archived_at = null` (débito técnico conhecido, ver Context) |

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
*Last updated: 2026-08-16 — v1.1 "PM Operations & Content Automation" started from backlog items 999.1, 999.3, 999.4, 999.6, 999.7, 999.8, 999.9*
