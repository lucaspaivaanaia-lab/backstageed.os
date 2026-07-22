# BackstageEd.OS

Plataforma central de produção e gestão de conteúdo para redes sociais.

---

## O que é

BackstageEd.OS é o sistema operacional interno de uma operação de social media management que atende múltiplos clientes simultaneamente. Ele substitui um processo hoje fragmentado entre ChatGPT, Google Drive, Google Docs, WhatsApp e Mlabs por uma plataforma única — do briefing estratégico até o checklist de agendamento.

---

## Stack

| Camada | Tecnologia |
|---|---|
| Frontend + Backend | Next.js 14 (App Router) + TypeScript |
| Estilização | Tailwind CSS |
| Banco de dados | Supabase (PostgreSQL + Auth + RLS + Storage) |
| Deploy | Vercel |
| Versionamento | GitHub |
| RAG por cliente | Arquivos armazenados no Supabase (`public.client_files`), injeção direta de conteúdo — sem embeddings/vetor |
| Geração de IA | Claude API (Anthropic) |
| Storage de mídia | Google Drive API |

---

## Pré-requisitos

- Node.js 18+
- Conta no [Supabase](https://supabase.com)
- Conta na [Vercel](https://vercel.com)
- Chave de API da [Anthropic](https://console.anthropic.com)
- Projeto no [Google Cloud](https://console.cloud.google.com) com Drive API habilitada

---

## Instalação

```bash
# Clone o repositório
git clone https://github.com/seu-usuario/backstageed-os.git
cd backstageed-os

# Instale as dependências
npm install

# Configure as variáveis de ambiente
cp .env.example .env.local

# Rode localmente
npm run dev
```

---

## Variáveis de ambiente

Copie `.env.example` para `.env.local` e preencha:

```env
# Supabase
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=

# Anthropic
ANTHROPIC_API_KEY=

# Google Drive
GOOGLE_CLIENT_ID=
GOOGLE_CLIENT_SECRET=
GOOGLE_REDIRECT_URI=
```

---

## Estrutura de pastas

```
src/
├── app/                  # Rotas e páginas (Next.js App Router)
│   ├── (admin)/          # Área do Juliano — visão macro
│   ├── (pm)/             # Área dos PMs — trabalho diário
│   └── (client)/         # Área do cliente — aprovação de conteúdo
├── components/           # Componentes reutilizáveis
├── lib/                  # Lógica de negócio e integrações
│   ├── supabase/         # Queries e helpers do Supabase
│   ├── extract/          # Extração de texto de arquivos do cliente (PDF/DOCX/TXT/MD)
│   ├── anthropic/        # Chamadas à Claude API
│   └── drive/            # Integração com Google Drive API
├── hooks/                # Custom hooks
└── types/                # Tipos TypeScript globais
```

---

## Papéis de usuário

| Papel | Acesso |
|---|---|
| **PM** | Chat de IA por cliente, Kanban de produção, checklist de revisão, upload de conteúdo |
| **Cliente** | Visualização e aprovação dos próprios conteúdos, comentários por item |
| **Admin (Juliano)** | Visão consolidada de todos os PMs e clientes, configuração de checklists |

**Acesso:** todo cadastro (PM ou Cliente) é feito via self-signup, mas fica em estado "pendente" até o Admin aprovar e atribuir o papel (PM, Cliente ou Admin). Não existe cadastro aberto com acesso imediato.

---

## Fluxo de produção

Cada card de conteúdo percorre um fluxo fixo de estados:

```
briefing → produção → revisão interna → aprovação do cliente → agendamento
```

- Um card pode representar um único post ou um pacote de peças relacionadas (ex: uma campanha semanal com várias peças avançando juntas).
- Antes de ir para aprovação do cliente, o card precisa passar por um **checklist de revisão interna configurável por cliente** — cada item concluído fica registrado (quem, quando), então nenhuma etapa pode ser pulada sem o Admin perceber.
- Se o cliente pedir ajuste em um item, o card volta para produção e precisa passar de novo pela revisão interna antes de retornar ao cliente.
- Quando o cliente aprova, o PM registra a data/hora de publicação combinada e o card fica marcado como **"Pronto para publicar"**. A publicação em si ainda é manual, feita pelo PM no Mlabs — não há integração de publicação automática na v1.

---

## Decisões de arquitetura

**RAG isolado por cliente**
Arquivos do cliente (PDF/TXT/MD/DOCX, ~3 por cliente) são extraídos para texto puro no upload e armazenados em `public.client_files` no Supabase — sem embeddings/vetor, sem serviço externo. O isolamento é estrutural via RLS scoping por `client_id` (`is_admin()`/`pm_assigned_clients()`) — não é filtro de aplicação. Isso torna contaminação de contexto entre clientes impossível por design. (Migrado de Tropicalia em 2026-07-22 — a Tropicalia mudou de modelo de negócio; ver `.planning/PROJECT.md` Key Decisions.)

**Curadoria manual de memória**
Quando a PM marca um trecho de conversa como aprendizado permanente, a aplicação gera um arquivo `.md` e insere uma nova linha em `client_files`. Nada vai para o contexto automaticamente.

**Claude API com controle total de prompt**
O conteúdo completo dos arquivos do cliente ativo + a pergunta da PM + as instruções de sistema são enviados à Claude API para geração da resposta. Tom e personalização ficam sob controle da aplicação.

**Google Drive como storage de mídia**
Dados estruturados (briefing, status, comentários, aprovações) ficam no Supabase. Arquivos pesados (imagem final, vídeo, PDF) vão para o Google Drive via API, com o link salvo no banco. A PM nunca abre o Drive manualmente.

**Row Level Security (RLS) no Supabase**
Multi-tenancy implementado via RLS. PM acessa só os dados dos clientes que gerencia. Cliente acessa só os próprios conteúdos. Admin acessa tudo.

**Sem notificações por email na v1**
Mudanças de status (aprovação, pedido de ajuste) são visíveis apenas in-app quando o usuário acessa a plataforma. Email fica para uma versão futura.

---

## Comandos

```bash
npm run dev          # Servidor local
npm run build        # Build de produção
npm run lint         # Lint
npm run type-check   # Verificação de tipos TypeScript
```

---

## Planejamento

O escopo, requisitos e roadmap de fases vivem em `.planning/` (gerenciado via [GSD](https://github.com/gsd-build/get-shit-done)):

- `.planning/PROJECT.md` — contexto e decisões do projeto
- `.planning/REQUIREMENTS.md` — requisitos v1/v2 com rastreabilidade
- `.planning/ROADMAP.md` — as 6 fases do MVP, em ordem de execução:
  1. Access & Roles
  2. Client Records & Isolated RAG Setup
  3. Client-Isolated AI Chat
  4. Content Production Kanban
  5. Client Approval & Scheduling
  6. Admin Oversight Dashboard

---

## Roadmap futuro (v2, fora do escopo da v1)

- Captura automática de transcrições de reunião via Google Calendar/Meet, alimentando o contexto do cliente
- Canal de WhatsApp por PM para alimentar contexto do cliente
- Publicação automática via API de redes sociais (substituindo o passo manual no Mlabs)
- Notificações por email para eventos importantes (aprovação, pedido de ajuste)
