# Phase 6: Admin Oversight Dashboard - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-08-13
**Phase:** 6-Admin Oversight Dashboard
**Areas discussed:** Formato da visão consolidada, O que conta como "parado/atrasado", Pra onde vai o "drill-down", Painel de carga de trabalho por PM/Editor

---

## Formato da visão consolidada

| Option | Description | Selected |
|--------|-------------|----------|
| Tabela única cross-client | Uma linha por card: cliente, PM, estágio, tempo parado — filtrável/ordenável | ✓ |
| Cards-resumo por cliente | Um card por cliente com contagem por estágio | |
| Kanban único agrupando todos os clientes | Replica o board do PM com todos os clientes juntos | |

**User's choice:** Tabela única cross-client
**Notes:** Locked as D-01 in CONTEXT.md. Estende `/admin/cards` em vez de substituir.

---

## O que conta como "card parado/atrasado"

| Option | Description | Selected |
|--------|-------------|----------|
| Dias desde a última atualização | Usa `updated_at`, já existe | ✓ |
| Dias na etapa atual | Mais preciso, exige campo novo (`stage_entered_at`) | |
| Você decide | Critério do planner | |

**User's choice:** Dias desde a última atualização
**Notes:** Locked as D-02 in CONTEXT.md. Tradeoff aceito: qualquer edição reseta o relógio, não só troca de estágio.

---

## Pra onde vai o "drill-down"

| Option | Description | Selected |
|--------|-------------|----------|
| Reaproveitar /pm/board | Admin já tem acesso (260812-k6c) | ✓ |
| Tela de detalhe própria em /admin | Mais isolamento, duplica esforço | |

**User's choice:** Reaproveitar /pm/board
**Notes:** Locked as D-03 in CONTEXT.md.

---

## Painel de carga de trabalho por PM/Editor

| Option | Description | Selected |
|--------|-------------|----------|
| Sim, incluir nesta fase | Já combinado desde a discussão do P3 | ✓ |
| Não, deixar pra depois | Fase 6 fica só na visão consolidada | |

**User's choice:** Sim, incluir nesta fase
**Notes:** Locked as D-04 in CONTEXT.md.

---

## Claude's Discretion

- Threshold exato (dias) pro destaque visual de "parado".
- Colunas exatas da tabela além das 4 travadas, ordem padrão.
- Métricas exatas do painel de carga de trabalho.
- Como o drill-down por PM (não só por cliente) funciona — provavelmente filtro na própria tabela, já que não existe equivalente PM-scoped de `/pm/board`.
- Se isso vira uma rota nova (`/admin` root, hoje placeholder) ou extensão de `/admin/cards`.

## Deferred Ideas

Nenhuma — discussão ficou dentro do escopo da fase.
