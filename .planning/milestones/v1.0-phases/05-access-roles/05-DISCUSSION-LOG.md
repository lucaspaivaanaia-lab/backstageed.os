# Phase 5: Access & Roles - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-07-01
**Phase:** 1-Access & Roles
**Areas discussed:** Fluxo de aprovação do admin, Tela de pendente, Mecanismo de login, Multi-usuário por cliente

---

## Fluxo de aprovação do admin

| Option | Description | Selected |
|--------|-------------|----------|
| Usuário declara papel no cadastro | Formulário tem seletor "Sou PM" / "Sou cliente"; admin só confirma | |
| Admin decide papel do zero | Cadastro só tem email/senha/nome; admin atribui papel manualmente | |
| Other (free text) | PM cria o acesso do cliente diretamente — define email e senha provisória. Cliente não passa por signup nem fila de aprovação, entra direto com as credenciais que o PM forneceu. | ✓ |

**User's choice:** Free text — PM provisions the Client's account directly; Client never signs up or waits for approval.
**Notes:** This changed the initial project-level assumption (self-signup + approval for both PM and Client). Follow-up question confirmed PM still self-signs up and waits for admin approval — only Client accounts are PM-issued.

| Option | Description | Selected |
|--------|-------------|----------|
| PM faz self-signup + aprovação do admin | PM se cadastra sozinho e fica pendente até aprovação. Só Cliente tem conta criada manualmente | ✓ |
| Admin também cria o acesso do PM diretamente | Ninguém se auto-cadastra; Juliano cria contas de PM manualmente também | |

**User's choice:** PM faz self-signup + aprovação do admin.
**Notes:** Confirms the split model — PM self-signup+approval, Client account is provisioned.

| Option | Description | Selected |
|--------|-------------|----------|
| Sim, cliente já existe | PM cria/seleciona o registro da empresa-cliente primeiro, depois cria o login vinculado | ✓ |
| Não necessariamente | PM pode criar o login antes do registro existir, vincular depois | |

**User's choice:** Sim, cliente já existe.
**Notes:** Client record (Phase 1) must exist before a login can be provisioned for it.

| Option | Description | Selected |
|--------|-------------|----------|
| Fica marcada como rejeitada | Conta permanece no banco com status "rejeitada", sem acesso; auditável, reativável | ✓ |
| Conta é excluída | Rejeitar remove a conta completamente | |

**User's choice:** Fica marcada como rejeitada.

---

## Tela de pendente

| Option | Description | Selected |
|--------|-------------|----------|
| Tela estática de espera | Mensagem simples "cadastro pendente de aprovação", sem mais ações | ✓ |
| Algo mais elaborado | Status do pedido, edição de dados enquanto espera, etc. | |

**User's choice:** Tela estática de espera.
**Notes:** This area now applies to PM only, since Client no longer goes through a pending state.

| Option | Description | Selected |
|--------|-------------|----------|
| Precisa tentar logar de novo | Sem aviso ativo; PM tenta acessar de novo depois de um tempo | ✓ |
| Precisa de algum aviso ativo mesmo sem email | SMS ou outro canal fora do escopo "sem email" | |

**User's choice:** Precisa tentar logar de novo.

---

## Mecanismo de login

| Option | Description | Selected |
|--------|-------------|----------|
| Email + senha | Padrão Supabase Auth; funciona com o fluxo de senha provisória pro Cliente | ✓ |
| Magic link | Sem senha, login por link; exige email funcionando (fora do escopo v1) | |

**User's choice:** Email + senha.

| Option | Description | Selected |
|--------|-------------|----------|
| Sim, troca obrigatória | Senha provisória só serve pro primeiro acesso; cliente define a própria depois | ✓ |
| Não, pode continuar usando a provisória | Mais simples, mas senha do PM fica valendo indefinidamente | |

**User's choice:** Sim, troca obrigatória.

---

## Multi-usuário por cliente

| Option | Description | Selected |
|--------|-------------|----------|
| 1 login por cliente na v1 | Simplifica modelo de dados e lógica de aprovação; mais gente fica pra v2 | ✓ |
| Múltiplos logins por cliente já na v1 | Modelo de dados suporta N usuários por cliente desde o início | |

**User's choice:** 1 login por cliente na v1.

| Option | Description | Selected |
|--------|-------------|----------|
| Sim, criar e desativar | PM/Admin pode criar quantos logins de Cliente forem necessários e desativar acesso quando preciso | ✓ |
| Só criar, sem desativar na v1 | Desativação fica fora do escopo v1, manual no banco se precisar | |

**User's choice:** Sim, criar e desativar.

---

## Claude's Discretion

- Exact copy/wording of the pending-approval screen.
- Exact UI for Admin's approval queue (list vs table, batch vs one-by-one actions) — not discussed in depth.
- Exact mechanism for forcing password change on first Client login (Supabase Auth native flow vs custom check).

## Deferred Ideas

- Multiple Client-side users per client company (v1 is 1 login per client) — reconsider if a client's team grows.
- Active notification (beyond in-app) when a PM's signup is approved — v1 relies on the PM retrying login.
