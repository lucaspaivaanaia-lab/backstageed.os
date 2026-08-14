# Phase 4: Client Approval & Scheduling - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-08-12
**Phase:** 4-Client Approval & Scheduling
**Areas discussed:** Escopo do board do Cliente, Modelo do comentário de ajuste, Campo de data de publicação, "Pronto para publicar" é estágio novo ou selo?

---

## Escopo do board do Cliente

| Option | Description | Selected |
|--------|-------------|----------|
| Só os prontos pra revisão | Board mostra só cards no estágio "Aprovação do cliente" — fila de ação | |
| Histórico completo também | Além dos prontos pra revisão, o Cliente vê (só leitura) o que já foi aprovado/agendado antes | ✓ |
| Você decide | Critério do planner | |

**User's choice:** Histórico completo também
**Notes:** Locked as D-01 in CONTEXT.md.

---

## Modelo do comentário de ajuste

| Option | Description | Selected |
|--------|-------------|----------|
| Só o mais recente | Um campo único no card, sobrescrito a cada rodada | ✓ |
| Histórico completo (thread) | Várias trocas ficam registradas, precisa de tabela nova | |
| Você decide | Critério do planner | |

**User's choice:** Só o mais recente
**Notes:** Locked as D-02 in CONTEXT.md.

---

## Campo de data de publicação

| Option | Description | Selected |
|--------|-------------|----------|
| Reaproveitar due_date | Mesma semântica de "data alvo do card" | |
| Campo novo e separado | due_date é prazo/priorização pro Editor; misturar com a data formal do cliente arrisca confundir os dois usos | ✓ |
| Você decide | Critério do planner | |

**User's choice:** Campo novo e separado
**Notes:** Locked as D-03 in CONTEXT.md. due_date was added in P3 item 3 (260811-oe0) specifically for the Editor's queue ordering.

---

## "Pronto para publicar" é estágio novo ou selo?

| Option | Description | Selected |
|--------|-------------|----------|
| Selo sobre agendamento | Chegar em "agendamento" + ter data definida = selo visual | ✓ |
| Novo 6º estágio no enum | Estado distinto, exige migração de enum em 2 arquivos | |
| Você decide | Critério do planner | |

**User's choice:** Selo sobre agendamento
**Notes:** Locked as D-04 in CONTEXT.md. Avoids the 2-migration enum-split ceremony the Editor role needed.

---

## Claude's Discretion

- Exact RLS predicate shape for Client's `cards_select_scoped` branch.
- Whether Client sees checklist state/PM assignee/Designer-Mídia on a reviewed card, or only the minimal surface (default: minimal).
- Exact approve/adjust UI (one-click vs. confirm dialog).
- Whether Pacote pieces are approved individually by the Client (default: yes, matches Phase 3's own per-piece independence).
- Where PM registers the publish date/time from (likely the existing card detail dialog, gated to `agendamento`/client-approved).

## Deferred Ideas

- Multi-round adjustment history/threading — explicitly rejected in favor of single-latest-comment (D-02), revisit if usage shows frequent back-and-forth.
- Client-side notifications (email or otherwise) — v1 has no notification channel at all, consistent with PROJECT.md's existing constraint.
