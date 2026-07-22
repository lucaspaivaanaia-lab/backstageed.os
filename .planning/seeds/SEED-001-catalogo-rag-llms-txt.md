---
id: SEED-001
status: dormant
planted: 2026-07-22
planted_during: Phase 02 — client-isolated-ai-chat
trigger_when: "quando o volume de arquivos por cliente crescer além de ~3 (hoje a Fase 2 usa injeção direta do conteúdo completo dos arquivos no contexto, sem catálogo, porque o volume real por cliente é baixo)"
scope: medium — um catálogo por cliente + duas ferramentas de agente (buscar, puxar documento completo); não é um rewrite de RAG, é uma camada de indireção sobre o armazenamento de arquivos já existente
---

# SEED-001: Sistema de catálogo/index por cliente para RAG (convenção llms.txt)

## Why This Matters

A Fase 2 implementa RAG isolado por cliente injetando o conteúdo COMPLETO dos arquivos do cliente ativo direto no contexto do agente (junto com o briefing estratégico), sem embeddings/vetor — decisão confirmada em reunião com o fundador da Tropicalia em 2026-07-22, motivada pela mudança de modelo de negócio da Tropicalia e pelo volume real por cliente ser baixo (~3 arquivos: transcrições de reunião, PDFs, TXT/Markdown/Docs). Essa abordagem substitui o escopo original de LUC-16 (auto-provisioning de project na Tropicalia, já entregue na Fase 1) e LUC-22 (upload de aprendizado para Tropicalia, mapeado para a Fase 2) — ambos retirados/substituídos por armazenamento e injeção direta em Supabase.

Injeção direta de conteúdo completo não escala: quando o volume de arquivos por cliente crescer, despejar tudo no contexto fica caro (tokens) e ruim para relevância (o agente recebe documentos irrelevantes à pergunta atual). A alternativa é dar ao agente um índice curado — título + descrição + referência — e duas ferramentas (buscar no catálogo, puxar o documento completo) em vez de tudo já pronto no prompt.

## When to Surface

**Trigger:** quando o volume de arquivos por cliente crescer além de ~3 (o limiar observado que motivou a decisão de injeção direta na Fase 2).

This seed will surface during `/gsd:new-milestone` when the milestone scope matches.

## Scope Estimate

**Medium** — não é um rewrite do mecanismo de RAG, é uma camada de indireção sobre o armazenamento de arquivos que a Fase 2 já constrói:
- Uma entrada por documento no catálogo: título, referência (id/link), descrição resumida gerada automaticamente no momento do upload.
- Formato de referência: convenção de mercado **llms.txt** (proposta por Jeremy Howard/Answer.AI, usada por Anthropic, Stripe, Cloudflare) — uma linha por documento no formato `[Título](referência): descrição breve`. Exemplo:
  ```
  - [Reunião de kickoff — 10/07](doc_id_123): Discussão sobre objetivo do trimestre, tom de voz da marca e briefing inicial de conteúdo.
  ```
  Não inventar formato do zero quando for implementar — usar essa convenção já estabelecida.
- Agente ganha duas ferramentas (tool use): buscar no catálogo (retorna entradas relevantes por título/descrição), puxar o documento completo (dado o id/referência).

## Breadcrumbs

- `.planning/phases/02-client-isolated-ai-chat/` — Fase 2, onde a injeção direta (versão simples) é implementada primeiro.
- Linear LUC-16 ("Auto-provisioning de project na Tropicalia", Fase 1, Done) e LUC-22 ("Upload de aprendizado para Tropicalia", Fase 2, Backlog) — escopo original que este seed e a decisão de injeção direta substituem.
- `lib/chat/assemble-prompt.ts` (ou o módulo equivalente pós-migração para Supabase) — ponto de injeção do conteúdo do arquivo no prompt do sistema; é aqui que a troca "injeção direta" → "catálogo + tool use" acontece quando o trigger disparar.

## Notes

Decisão e este seed capturados na mesma conversa em que a migração de Tropicalia → armazenamento direto em Supabase foi especificada e planejada (2026-07-22).
