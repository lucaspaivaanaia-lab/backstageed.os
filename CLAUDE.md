<!-- GSD:project-start source:PROJECT.md -->
## Project

**BackstageEd.OS**

BackstageEd.OS é a plataforma central de produção e gestão de conteúdo para redes sociais (LinkedIn, Instagram e outras) de uma operação de social media management que atende múltiplos clientes simultaneamente. Substitui um processo hoje fragmentado em 5+ ferramentas (ChatGPT, Google Drive, Google Docs, WhatsApp, Mlabs) por um único sistema onde PMs produzem, revisam e obtêm aprovação de conteúdo, o dono da operação (Juliano) acompanha tudo em tempo real, e cada cliente aprova seus próprios conteúdos numa área dedicada — sem contaminação de contexto de IA entre clientes.

**Core Value:** Um PM consegue produzir conteúdo para um cliente específico com IA que só conhece aquele cliente (RAG isolado, zero vazamento de contexto), levar esse conteúdo do briefing até a aprovação do cliente dentro da própria plataforma, e o Juliano consegue ver o status real de qualquer card, de qualquer cliente, a qualquer momento — sem depender de alguém avisar.

### Constraints

- **Timeline**: Data alvo de 30/09/2026 para ter uma primeira versão funcionando — pressiona o cronograma, mas sem detalhes adicionais sobre o evento/compromisso por trás da data.
- **Tech stack**: Next.js (App Router) + Supabase (Postgres, Auth, RLS, Storage) + Vercel + GitHub — já definido, não é uma decisão em aberto.
- **RAG**: Tropicalia API (tropicalia.dev), 1 project por cliente, `generate_answer: false` — a geração de resposta é sempre feita pela Claude API, não pela Tropicalia.
- **Storage de mídia**: Google Drive API para arquivos pesados (imagem, vídeo, PDF) — dados estruturados (briefing, status, comentários, histórico) ficam no Supabase.
- **Isolamento de contexto**: precisa ser estrutural (project separado por cliente na Tropicalia), não um filtro — requisito não-negociável motivado pelo problema real de vazamento de contexto no ChatGPT compartilhado.
<!-- GSD:project-end -->

<!-- GSD:stack-start source:STACK.md -->
## Technology Stack

Technology stack not yet documented. Will populate after codebase mapping or first phase.
<!-- GSD:stack-end -->

<!-- GSD:conventions-start source:CONVENTIONS.md -->
## Conventions

Conventions not yet established. Will populate as patterns emerge during development.
<!-- GSD:conventions-end -->

<!-- GSD:architecture-start source:ARCHITECTURE.md -->
## Architecture

Architecture not yet mapped. Follow existing patterns found in the codebase.
<!-- GSD:architecture-end -->

<!-- GSD:skills-start source:skills/ -->
## Project Skills

No project skills found. Add skills to any of: `.claude/skills/`, `.agents/skills/`, `.cursor/skills/`, `.github/skills/`, or `.codex/skills/` with a `SKILL.md` index file.
<!-- GSD:skills-end -->

<!-- GSD:workflow-start source:GSD defaults -->
## GSD Workflow Enforcement

Before using Edit, Write, or other file-changing tools, start work through a GSD command so planning artifacts and execution context stay in sync.

Use these entry points:
- `/gsd-quick` for small fixes, doc updates, and ad-hoc tasks
- `/gsd-debug` for investigation and bug fixing
- `/gsd-execute-phase` for planned phase work

Do not make direct repo edits outside a GSD workflow unless the user explicitly asks to bypass it.
<!-- GSD:workflow-end -->



<!-- GSD:profile-start -->
## Developer Profile

> Profile not yet configured. Run `/gsd-profile-user` to generate your developer profile.
> This section is managed by `generate-claude-profile` -- do not edit manually.
<!-- GSD:profile-end -->
