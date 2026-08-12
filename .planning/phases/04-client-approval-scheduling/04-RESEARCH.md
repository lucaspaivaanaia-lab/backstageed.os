# Phase 4: Client Approval & Scheduling - Research

**Researched:** 2026-08-12
**Domain:** Postgres RLS (Supabase), Next.js Server Actions, internal stage-machine extension — no new libraries, no external services
**Confidence:** HIGH

## Summary

This phase adds a third row-scoped role branch to `public.cards` (Client, scoped by `client_id`), a backward stage transition triggered only by the Client's own adjustment action, and two new nullable columns (`client_adjustment_comment`, a publish-date field). Every mechanic needed already has a direct precedent in this codebase: the Client's exact RLS scoping predicate (`client_id = (select client_id from public.profiles where id = auth.uid())`) has existed on `public.clients` since migration `0004_rls_policies.sql` (Phase 1) — it has simply never been applied to `cards`. The "RLS decides rows, a dedicated Server Action decides columns" pattern, and the app-layer `assertPmOrAdminCaller`-style guard needed to prevent a new RLS branch from silently re-authorizing unrelated actions, are both directly reusable from the Editor role's `260811-oe0` implementation (`app/editor/actions.ts`, `lib/security/editor-card-write-scope.ts`, `lib/security/board-write-authz.ts`).

The single most important, non-obvious finding: **`updateCardDetails`/`advanceStage`/`moveCard` in `app/pm/board/actions.ts` are already safe against a new Client RLS branch on `cards_update_scoped`**, because their PRIMARY authorization boundary since `260811-oe0` is `assertPmOrAdminCaller` (an app-layer `profile.role in ('admin','pm')` check), not RLS. This was verified directly against the current code, not assumed — see Pitfall 1 below. The phase's own new Client-only actions must follow the identical column-restricted pattern (`buildEditorCardUpdatePayload`'s precedent) so they never become a second bypass.

The backward transition (`aprovacao_cliente` → `producao`) does not need any change to `lib/cards/stages.ts`'s forward-only `nextStage`. Because the Client role can only ever reach a card that is currently in `aprovacao_cliente` (that is the only stage this phase's RLS branch should expose for write), the adjustment action can simply hardcode its target stage — there is no generic "move backward" primitive to design, and `nextStage`'s forward-only contract is never touched.

A second load-bearing finding: `lib/cards/checklist-snapshot.ts`'s `snapshotChecklistForCard` is **already idempotent** and its own doc comment explicitly anticipates "Phase 4's adjustment loop" — checklist items are never reset or re-snapshotted on a second entry into `revisão interna`. This resolves the CONTEXT.md open question about checklist behavior on bounce-back: the existing, already-shipped Phase 3 design is "stay as-is," not "reset." No new code is needed for this; the planner should not build a reset mechanism.

**Primary recommendation:** Add a single migration mirroring `0031`'s shape exactly — a Client OR-branch on `cards_select_scoped`/`cards_update_scoped` (SELECT branch stage-filtered to `('aprovacao_cliente','agendamento')`, not just `client_id`), a read-only Client branch on `card_attachments_select_scoped`, two new nullable columns on `cards` (`client_adjustment_comment text`, `publish_at timestamptz` + index) — plus one new file pair (`app/client/actions.ts` + `lib/security/client-card-write-scope.ts`) implementing `approveCard`/`requestAdjustment` as two narrow, hardcoded-payload Server Actions, and a computed (never stored) "Pronto para publicar" badge derived from `stage === 'agendamento' && publish_at !== null`.

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Client board (queue + history) | Frontend Server (SSR, `app/client/page.tsx`) | Database/RLS (`cards_select_scoped` Client branch) | Same pattern as `app/pm/board/page.tsx`/`app/editor/page.tsx` — an RSC reads through the RLS-scoped Supabase server client, no separate API layer |
| Approve / request-adjustment write | API/Backend (Server Action, `app/client/actions.ts`) | Database/RLS (`cards_update_scoped` Client branch, row boundary only) | Column-restricted write boundary lives in the Server Action's hardcoded payload builder, not in RLS (Postgres RLS has no column-level policy) |
| Stage-machine integrity (forward + this phase's one backward case) | API/Backend (`lib/cards/stages.ts` + the new action's hardcoded target) | — | Pure logic module, no I/O; the backward case is intentionally NOT generalized into `nextStage` |
| Publish-date registration | API/Backend (existing `updateCardDetails`/new field on its schema, PM/Admin-only) | Frontend Server (`board-panel.tsx` detail dialog) | Reuses the existing PM-facing write path, not a new Client-facing one — PM registers this, never the Client |
| "Pronto para publicar" badge | Browser/Client (render-time computation) | — | Pure derived value from `stage`+`publish_at`, mirrors `packageRollupLabel`'s "never stored" precedent (D-04) |

## User Constraints (from CONTEXT.md)

<user_constraints>

### Locked Decisions

- **D-01 (board scope):** `/client` shows BOTH the queue of cards currently in `aprovacao_cliente` AND the full history of already-approved/scheduled cards (read-only). Not just an action queue.
- **D-02 (adjustment comment model):** A single "latest comment" field on the card — overwritten each round, no thread, no separate comments table. Matches APR-04 literally: "attached to the original card, visible to the PM."
- **D-03 (publish date field):** A NEW, separate field for SCH-01 — does NOT reuse `due_date` (Editor's internal prioritization signal, added 260811-oe0/migration 0031). The two are structurally distinct. Exact column name left to the planner/researcher (e.g. `publish_at`/`scheduled_at`), must be a genuinely new column.
- **D-04 ("Pronto para publicar" is a badge, not a stage):** No 6th `card_stage` enum value. Computed at render time from `stage === 'agendamento' && <publish-date field> is set`. Avoids the Editor role's 2-migration enum-split ceremony — nothing here needs Postgres to treat it as a distinct value.

### Claude's Discretion

- Exact RLS predicate for the Client's `cards_select_scoped` branch — natural shape mirrors `client_id = (select client_id from public.profiles where id = auth.uid())`, confirm against current `clients_select_scoped`/`profiles.client_id` shape before writing it (done below — Pattern 1).
- Whether the Client sees checklist state/PM assignee/Designer-Mídia on a card, or only title/description/attachments — CONTEXT defaults to the MINIMAL surface unless a concrete reason argues for more (researched below — no such reason found; minimal surface confirmed).
- Exact approve/adjust UI (one-click vs. confirm dialog; comment field always-visible vs. conditional) — implementation detail, left to the planner.
- Whether Pacote pieces are approved individually (matches Phase 3's D-01/D-02 per-piece independence) or as a whole Pacote — apply Phase 3's own precedent (individual, per-piece) unless a concrete reason argues otherwise (researched below — no such reason found).
- Where PM registers the publish date/time — likely the same card detail dialog (`board-panel.tsx`) already used for Canal/Responsável/Designer-Mídia/Prazo, gated to `agendamento` stage (or client-approved). Exact gating condition left to the planner (researched below — recommend gating on `stage === 'agendamento'`, which the current stage machine already guarantees can only be reached via approval).

### Deferred Ideas (OUT OF SCOPE)

- Multi-round adjustment history/threading (D-02 explicitly chose single-latest-comment) — revisit only if real usage shows this insufficient.
- Client-side notification (email or otherwise) when new content is ready for review — v1 has no notification channel at all (PROJECT.md Constraints).

</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| KAN-04 | When the client requests an adjustment, the card returns to `producao` and must pass `revisao_interna` again before returning to the client | Pattern 3 (backward transition, hardcoded target); confirms `snapshotChecklistForCard`'s existing idempotency already governs re-entry into `revisao_interna` — no new snapshot logic needed |
| APR-01 | Client can view their content organized as a board of cards ready for their review | Pattern 1 (RLS branch, stage-filtered SELECT); `app/client/page.tsx` replacement, mirrors `app/editor/page.tsx`'s RSC-reads-through-RLS shape |
| APR-02 | Client can approve an individual content item | Pattern 2 (`approveCard` action, hardcoded `{stage: 'agendamento'}` payload via `nextStage`) |
| APR-03 | Client can request an adjustment, with a comment explaining what to change | Pattern 2 (`requestAdjustment` action, hardcoded `{stage: 'producao', client_adjustment_comment}` payload) |
| APR-04 | Adjustment comments are attached to the original card and visible to the PM | New nullable `cards.client_adjustment_comment` column, PM sees it via existing `updateCardDetails`/board read path (Pattern 4) |
| SCH-01 | Once approved, PM can register the agreed publish date/time | New nullable `cards.publish_at` column + extension of `updateCardDetailsSchema`/`updateCardDetails` (PM/Admin-only, unchanged authz) |
| SCH-02 | A card with a registered publish date/time is marked "Pronto para publicar" | Pure render-time computation, Pattern 5 — never stored (mirrors `packageRollupLabel`'s D-02 precedent) |

</phase_requirements>

## Standard Stack

No new libraries. This phase is 100% internal Postgres/RLS + Next.js Server Actions work, reusing the existing stack (Next.js App Router, Supabase Postgres/Auth/RLS, Zod, `node --test`, pgTAP).

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Hardcoded backward-transition target in the Client action | A generic `previousStage()`/"any transition" primitive in `lib/cards/stages.ts` | Rejected — over-generalizes a single, narrowly-triggered case (only the Client's adjustment ever moves a card backward) and would invite future misuse of a generic "move anywhere" function outside `moveCard`'s already-guarded drag path |
| A new `card_adjustments` table for the comment | Single `client_adjustment_comment text` column on `cards` | Rejected by CONTEXT D-02 explicitly — matches APR-04's literal wording, avoids an unrequested threading feature |
| Reusing `due_date` for the publish date | New `publish_at` column | Rejected by CONTEXT D-03 explicitly — the two concepts (internal prioritization vs. client-approved formal date) must stay structurally distinct |

No package-legitimacy audit needed — no new packages are installed in this phase.

## Architecture Patterns

### System Architecture Diagram

```
Client (browser)                    Server (Next.js)                      Postgres (Supabase)
─────────────────                   ─────────────────                     ────────────────────
GET /client  ──────────────────────▶ app/client/page.tsx (RSC)
                                       │
                                       ├─ supabase.from("cards")
                                       │    .select(...)  ────────────────▶ cards_select_scoped
                                       │                                     (NEW Client branch:
                                       │                                      client_id = own profile's
                                       │                                      client_id AND stage IN
                                       │                                      ('aprovacao_cliente',
                                       │                                       'agendamento'))
                                       │
                                       ├─ supabase.from("card_attachments")
                                       │    .select(...)  ────────────────▶ card_attachments_select_scoped
                                       │                                     (NEW read-only Client branch)
                                       ▼
                                     renders queue (aprovacao_cliente)
                                     + history (agendamento, incl.
                                     computed "Pronto para publicar")

Client clicks "Aprovar"  ──────────▶ approveCard(cardId)                    (app/client/actions.ts)
                                       │
                                       ├─ re-read card via cards_select_scoped
                                       │  (NEW Client branch) — proves ownership
                                       │  AND current stage
                                       ├─ reject unless stage === 'aprovacao_cliente'
                                       ├─ buildClientApprovePayload()
                                       │    { stage: nextStage('aprovacao_cliente') }
                                       │    = { stage: 'agendamento' }
                                       └─ supabase.from("cards").update(...) ─▶ cards_update_scoped
                                                                                 (NEW Client branch, row
                                                                                  boundary only — Server
                                                                                  Action decides columns)

Client submits adjustment ─────────▶ requestAdjustment(cardId, comment)     (app/client/actions.ts)
                                       │
                                       ├─ re-read + reject unless
                                       │  stage === 'aprovacao_cliente'
                                       ├─ buildClientAdjustPayload(comment)
                                       │    { stage: 'producao',
                                       │      client_adjustment_comment }
                                       └─ supabase.from("cards").update(...) ─▶ same policy as above

PM later opens card, sees comment,
fixes content, re-advances through
revisao_interna (unchanged path,
existing checklist state preserved
— snapshotChecklistForCard is
already idempotent) ───────────────▶ advanceStage() (unchanged, existing
                                     assertPmOrAdminCaller guard already
                                     rejects a Client caller here)

PM registers publish date  ────────▶ updateCardDetails({ ..., publishAt }) (unchanged file, extended
                                     (gated stage === 'agendamento' in UI)  schema/payload)
```

### Recommended Project Structure

```
app/client/
├── page.tsx              # replaces the placeholder — RSC board loader (queue + history)
├── actions.ts             # NEW — approveCard, requestAdjustment (Client-only, "use server")
└── client-board-panel.tsx # NEW — client component, reuses DataCard/StatusBadge/CardDetailDialogBody-style primitives

lib/security/
└── client-card-write-scope.ts   # NEW — buildClientApprovePayload/buildClientAdjustPayload (pure, no I/O, mirrors editor-card-write-scope.ts)

lib/validation/cards.ts    # EXTENDED — approveCardSchema, requestAdjustmentSchema, publishAt on updateCardDetailsSchema

supabase/migrations/
└── 0032_client_approval_scheduling.sql  # RLS branches + 2 new columns, one migration (no enum touched, no 2-migration split needed — see Pitfall 4)

supabase/tests/
└── 0018_rls_client_card_scoping_test.sql  # NEW pgTAP file, reuses rls_helpers.sql's existing client_a_user fixture
```

### Pattern 1: Client's RLS branch on `cards` — stage-filtered, not just client-scoped

**What:** Unlike every prior role branch on `cards_select_scoped` (PM: `client_id in pm_assigned_clients()`; Editor: `media_assignee_id = auth.uid()`), the Client's branch must combine the client-scoping predicate with an explicit stage filter. Without the stage filter, a Client would see `briefing`/`producao`/`revisao_interna` cards — internal WIP the CONTEXT explicitly says should not leak ("no internal PM coordination details leak to Client", mirrors why Editor doesn't see `messages`/`client_files` either).

**When to use:** Both `cards_select_scoped` (read) and `cards_update_scoped` (write, row boundary only) need this same predicate.

**Verified predicate source:** `clients_select_scoped` (`supabase/migrations/0004_rls_policies.sql`, unchanged since Phase 1):
```sql
-- 0004_rls_policies.sql, line 126 — the exact Client-scoping predicate,
-- already proven safe in production since Phase 1.
or id = (select client_id from public.profiles where id = (select auth.uid()))
```

**Recommended migration shape** (mirrors `0031`'s drop/recreate style exactly):
```sql
-- Source: pattern from 0031_editor_role_rls_and_due_date.sql (Editor branch)
-- + 0004_rls_policies.sql (Client-scoping predicate, clients table)
drop policy "cards_select_scoped" on public.cards;
create policy "cards_select_scoped"
on public.cards
for select
to authenticated
using (
  (select public.is_admin())
  or client_id in (select public.pm_assigned_clients())
  or media_assignee_id = (select auth.uid())
  or (
    client_id = (select client_id from public.profiles where id = (select auth.uid()))
    and stage in ('aprovacao_cliente', 'agendamento')
  )
);

drop policy "cards_update_scoped" on public.cards;
create policy "cards_update_scoped"
on public.cards
for update
to authenticated
using (
  (select public.is_admin())
  or client_id in (select public.pm_assigned_clients())
  or media_assignee_id = (select auth.uid())
  or (
    client_id = (select client_id from public.profiles where id = (select auth.uid()))
    and stage = 'aprovacao_cliente'
  )
)
with check (
  (select public.is_admin())
  or client_id in (select public.pm_assigned_clients())
  or media_assignee_id = (select auth.uid())
  or (
    client_id = (select client_id from public.profiles where id = (select auth.uid()))
    and stage in ('aprovacao_cliente', 'producao')
  )
);
```
Note the `with check` branch intentionally allows the WRITE to land the row in EITHER `aprovacao_cliente` (a no-op edge case, never actually produced by the two new actions) or `producao` (the adjustment's landing stage) — because Postgres RLS's `with check` evaluates the ROW AFTER the update, not before. The `using` clause is what restricts which rows a Client may target for update in the first place (only rows currently `aprovacao_cliente`), and the Server Action's own re-read (Pattern 2) is the actual state-machine boundary — RLS here is defense in depth, consistent with this codebase's established division of labor.

**Recommendation — package/piece handling (Discretion point):** No special-casing needed. A package parent always has `stage = null` (`cards_package_has_no_stage` constraint) and therefore never satisfies `stage in (...)` — it is automatically excluded from the Client's view without any extra filter, exactly like it already is for the PM board's stage columns. A piece (`card_type = 'piece'`) carries its own real `stage` and is visible/actionable through this same branch exactly like a `single` card — confirms Phase 3's D-01/D-02 per-piece independence precedent applies with zero extra code.

### Pattern 2: Client-only write actions — hardcoded target stage, hardcoded column payload

**What:** Two new Server Actions in a new `app/client/actions.ts`, following `updateCardDescriptionAsEditor`'s exact "RLS decides rows, the Server Action decides columns" split (`app/editor/actions.ts` + `lib/security/editor-card-write-scope.ts`).

**Recommended payload builder** (`lib/security/client-card-write-scope.ts`, pure, no I/O — mirrors `editor-card-write-scope.ts` exactly):
```typescript
// Source: pattern from lib/security/editor-card-write-scope.ts
export function buildClientApprovePayload(): {
  stage: "agendamento";
  updated_at: string;
} {
  return { stage: "agendamento", updated_at: new Date().toISOString() };
}

export function buildClientAdjustPayload(comment: string): {
  stage: "producao";
  client_adjustment_comment: string;
  updated_at: string;
} {
  return {
    stage: "producao",
    client_adjustment_comment: comment,
    updated_at: new Date().toISOString(),
  };
}
```

**Recommended action shape:**
```typescript
// app/client/actions.ts
"use server";

export async function approveCard(input: ApproveCardInput): Promise<ApproveCardResult> {
  const parsed = approveCardSchema.safeParse(input);
  if (!parsed.success) return { error: "..." };

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: NOT_AUTHENTICATED_ERROR };

  // Defense-in-depth role check, mirrors assertPmOrAdminCaller's discipline
  // even though the RLS predicate alone is already structurally safe here
  // (a PM/Admin profile's client_id is always null, so it can never match
  // this branch — see Pitfall 1).
  const { data: profile } = await supabase
    .from("profiles").select("role, status").eq("id", user.id).single();
  if (profile?.role !== "client" || profile.status !== "approved") {
    return { error: CLIENT_ONLY_ERROR };
  }

  // Re-read through RLS — proves BOTH ownership (client_id match) AND that
  // the card is currently in the only stage a Client may act on. Never
  // trust a stage claim from the browser.
  const { data: card } = await supabase
    .from("cards").select("id, stage").eq("id", parsed.data.cardId).single();
  if (!card) return { error: CARD_NOT_FOUND_ERROR };
  if (card.stage !== "aprovacao_cliente") return { error: WRONG_STAGE_ERROR };

  const { error } = await supabase
    .from("cards")
    .update(buildClientApprovePayload())
    .eq("id", card.id);
  if (error) return { error: "..." };

  revalidatePath("/client");
  return {};
}
// requestAdjustment mirrors this exactly, swapping buildClientAdjustPayload
// and validating a non-empty trimmed comment via Zod (mirrors
// updateCardDescriptionAsEditorSchema's trim().max() convention).
```

**Why `nextStage('aprovacao_cliente')` is safe to hardcode as `'agendamento'` rather than calling `nextStage`:** `STAGE_ORDER` is a fixed 5-element array; `nextStage('aprovacao_cliente')` always resolves to `'agendamento'` today. Either hardcoding the literal or calling `nextStage(card.stage)` (after confirming `card.stage === 'aprovacao_cliente'`) is correct — calling `nextStage` is marginally more future-proof if a 6th stage is ever inserted between `aprovacao_cliente` and `agendamento`, and costs nothing. **Recommend calling `nextStage(card.stage)`, not hardcoding the literal**, purely for that resilience — this is a preference, not a security requirement.

### Pattern 3: The backward transition needs no new primitive in `lib/cards/stages.ts`

**What:** `KAN-04`'s "adjustment bounces the card back to `producao`" is expressed entirely inside `requestAdjustment`'s hardcoded payload (`{ stage: 'producao' }`), never as a generalized backward-move function.

**Why this is the cleanest design (confirms the CONTEXT's own framing in `<specifics>`):** The ONLY caller that ever needs to move a card backward is this one action, and it only ever needs to do so FROM `aprovacao_cliente`. Generalizing this into `lib/cards/stages.ts` (e.g. a `previousStage()` mirroring `nextStage()`) would:
1. Have exactly one real call site, making the abstraction premature.
2. Risk `moveCard`'s `evaluateMove` (`lib/cards/move-rules.ts`) or the PM's drag-and-drop UI misinterpreting it as a generally-available backward move — `evaluateMove` already permits ALL backward moves unconditionally ("Everything else (including every BACKWARD move) is allowed" — `move-rules.ts` line 49 comment), which is correct for PM/Admin's own drag gesture but must NOT be conflated with the Client's narrowly-triggered, single-direction bounce.

`nextStage`'s forward-only contract in `lib/cards/stages.ts` is therefore left completely untouched by this phase — zero changes to that file.

### Pattern 4: PM sees the adjustment comment via the existing detail dialog, no new read path

**What:** `card_adjustment_comment` needs no new RLS policy beyond the plain `ADD COLUMN` (row-level policies auto-cover new columns — confirmed precedent, see Pitfall 3). Surface it in `board-panel.tsx`'s `CardDetailDialogBody` (read-only display, e.g. next to the stage badge when the card is in `producao` and the field is non-null) — no new Server Action needed for the PM side, since PM never WRITES this field (only the Client's `requestAdjustment` ever does).

### Pattern 5: "Pronto para publicar" — pure computed badge, never stored

**What:** Mirrors `lib/cards/package-rollup.ts`'s established "computed at render time, never a column" precedent (D-02's own justification: "A stored rollup drifts the moment a child's stage changes").

**Recommended placement:** A small pure function, e.g. in `lib/cards/publish-status.ts` or inline at each render site (board-panel.tsx already inlines simpler badge logic like `card.channel === "planejamento" ? "info" : "neutral"` — either is consistent with existing style; a named function is preferred if used in 2+ places, per `packageRollupLabel`'s own precedent):
```typescript
// Source: pattern from lib/cards/package-rollup.ts's "never stored" doc comment
export function isReadyToPublish(card: { stage: CardStage | null; publish_at: string | null }): boolean {
  return card.stage === "agendamento" && card.publish_at !== null;
}
```
Rendered as `<StatusBadge tone="success">Pronto para publicar</StatusBadge>` wherever a card in `agendamento` stage is shown — both the PM board and the Client's own history view.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Backward stage transition | A generic "move to any stage" primitive in `lib/cards/stages.ts` | Hardcoded target in `requestAdjustment`'s payload builder | Single call site, single direction — see Pattern 3 |
| Checklist reset on re-entry to `revisao_interna` | A new "reset checklist on bounce-back" function | Nothing — `snapshotChecklistForCard`'s existing idempotency already handles this correctly (items persist, not reset) | Already shipped in Phase 3, explicitly anticipating this exact phase (see Pitfall 2) |
| Client authorization check | A new `is_client()` SQL helper function | Inline predicate, same as `is_editor()` was deliberately NOT added in `0031` | Zero other call sites would exist for it — the codebase's own stated convention ("if a future feature needs it, add it then") |
| Column-level write restriction for the Client role | A database trigger enforcing "Client may only write stage/comment" | The Server Action's hardcoded update payload (`buildClientApprovePayload`/`buildClientAdjustPayload`) | Explicit precedent + explicit prior user decision (`260811-oe0-CONTEXT.md`: "explicit decision from the user not to use a reinforcement trigger in the database, only the Server Action as the column boundary") |

**Key insight:** Every mechanic this phase needs already has a shipped precedent in this exact codebase (Editor role for RLS-branch-plus-column-restriction, Phase 3's package-rollup for "computed badge, never stored", Phase 3's checklist-snapshot for "idempotent re-entry"). The risk in this phase is not designing something novel — it is *forgetting* one of these precedents and reintroducing a class of bug already fixed once (see Pitfalls below).

## Common Pitfalls

### Pitfall 1: Assuming a new `cards_update_scoped` OR-branch re-authorizes existing PM/Admin actions for a Client caller

**What goes wrong:** The `260811-oe0` postmortem (Editor role) found exactly this bug: widening `cards_update_scoped` silently re-authorized `updateCardDetails`/`advanceStage`/`moveCard` for a caller who should never have reached them, because those three actions relied on RLS alone with no role check of their own.

**Verified status for THIS phase (checked directly against current code, not assumed):** This is now **already fixed**, and the fix generalizes correctly to a Client caller without any further change. `assertPmOrAdminCaller` (`app/pm/board/actions.ts` lines 98-109) delegates to `isBoardWriteAuthorized` (`lib/security/board-write-authz.ts`):
```typescript
export function isBoardWriteAuthorized(
  profile: { role: string | null; status: string | null } | null
): boolean {
  return (
    profile?.status === "approved" &&
    (profile.role === "admin" || profile.role === "pm")
  );
}
```
A caller with `role === 'client'` returns `false` here regardless of what RLS's `cards_update_scoped` policy would otherwise permit. `updateCardDetails`, `advanceStage`, and `moveCard` all call this guard as their FIRST authorization step, before any read or write — so adding a Client OR-branch to `cards_update_scoped` in this phase does **not** reopen the `260811-oe0` class of gap for these three actions.

**Why it happens (generalized lesson for THIS phase's new code):** The gap only exists for actions that (a) touch a table whose RLS policy gets widened, AND (b) have no role check of their own. `toggleChecklistItem`, `addAttachment`, `removeAttachment`, `createCard`, `createPiece`, `removePiece`, `proposePackagePieces` all fit (b) — but none of them touch a policy this phase widens (`cards_select_scoped`/`cards_update_scoped`/`card_attachments_select_scoped` only), so none are newly exposed. **Verify this explicitly during planning/execution**, the same way this research did — do not assume based on this document alone; re-run the check if the plan ends up touching any additional policy.

**How to avoid:** Keep the new Client-only actions (`approveCard`/`requestAdjustment`) in their own file with their own hardcoded payload builders (Pattern 2) — never let them, or any future action, call `updateCardDetails`/`advanceStage`/`moveCard` internally, and never widen `cards_update_scoped` further than the two columns (`stage`, `client_adjustment_comment`) this phase actually needs a Client to write.

**Warning signs:** Any new Server Action added to `app/pm/board/actions.ts` or `app/client/actions.ts` that writes to `cards` without either (a) an explicit role/status check, or (b) being scoped to a single hardcoded, narrow payload.

### Pitfall 2: Building a checklist-reset mechanism for the bounce-back that isn't needed (and wasn't asked for)

**What goes wrong:** KAN-04's wording ("must pass revisão interna again") could be misread as "checklist items must be un-checked and re-verified." Building that would touch `snapshotChecklistForCard`, which CONTEXT's canonical refs explicitly say this phase must not disturb ("the checklist gate rules this phase must not disturb").

**Why it happens:** The requirement wording sounds like a fresh review is mandated, but the actual mechanism already shipped in Phase 3 is idempotent-by-design specifically for this case — `checklist-snapshot.ts`'s own doc comment (written during Phase 3, before this phase existed) says: *"Idempotent... so a card can re-enter revisão interna (Phase 4's adjustment loop)... without duplicating or clobbering its original snapshot and audit trail."* This means: on a second round, `card_checklist_items` rows from round 1 are preserved AS-IS (including their `completed_at`/`completed_by`). If the PM wants a genuinely fresh review, they must manually uncheck items themselves via the existing `toggleChecklistItem` — no new mechanism is provided or required, and building one is a scope violation of the CONTEXT's own boundary.

**How to avoid:** Do not touch `checklist-snapshot.ts`, `advanceStage`'s snapshot-trigger logic, or `card_checklist_items` in this phase's migration at all. "Passing revisão interna again" is satisfied purely by the stage machine requiring the card to go through `producao` → `revisao_interna` → `aprovacao_cliente` a second time — a real re-traversal of the stage machine, even if the checklist rows themselves are unchanged.

**Warning signs:** A migration or Server Action in this phase's plan that writes to `card_checklist_items` or calls `snapshotChecklistForCard` a second time with reset semantics.

### Pitfall 3: Assuming the two new columns need their own RLS/GRANT statements

**What goes wrong:** Writing a redundant RLS policy or GRANT specifically for `client_adjustment_comment`/`publish_at`.

**Why it happens:** New-column additions in this codebase have repeatedly needed NO new RLS/GRANT — confirmed precedent across `0025_clients_tag.sql`, `0027_clients_briefing_text.sql`, `0028_cards_channel.sql`, `0029_cards_media_assignee.sql`, and `0031`'s own `due_date` addition (all documented as "row-level policies auto-cover new columns"). A plain `ALTER TABLE ... ADD COLUMN` is automatically covered by the existing table-level policies and the existing `grant select, insert, update on public.cards to authenticated` (`0015_cards.sql`).

**How to avoid:** The migration for this phase's two new columns needs zero new GRANT statements — only the RLS *policy body* changes (Pattern 1) need new OR-branches, and that is because this phase is adding a NEW ROLE branch, not because of the new columns. Confirm this explicitly in the migration's own header comment (matching every prior migration's practice of stating why no GRANT/RLS change is needed for a column add).

### Pitfall 4: Assuming a 2-migration enum-split is needed, like the Editor role required

**What goes wrong:** Copying the Editor role's `0030`/`0031` two-migration pattern (a strict Postgres 55P04 rule: a new enum value cannot be referenced in the same transaction it is added in) when it doesn't apply here.

**Why it happens:** The Editor precedent is the most recent and most detailed role-addition example in this codebase, making it tempting to copy wholesale. But that 2-migration split was needed ONLY because Editor added a new `user_role` enum VALUE (`'editor'`). This phase adds **no new enum value** — `'client'` already exists in `user_role` since `0001_profiles.sql`, and D-04 explicitly avoids adding a new `card_stage` value. A single migration, mirroring `0031`'s RLS-branch mechanics but WITHOUT its enum-split preamble, is correct and sufficient.

**How to avoid:** Read D-04's own stated rationale before planning the migration: "Avoids the 2-migration enum-split ceremony the Editor role... needed, since nothing here requires Postgres to treat it as a distinct enum value anywhere."

### Pitfall 5: Forgetting `clients_select_scoped`'s Client branch has no `status = 'approved'` check — and confirming it doesn't matter for this phase

**What goes wrong:** A defense-in-depth audit might flag that the Client branch on `clients_select_scoped` (0004, unchanged since Phase 1) checks only `id = profile.client_id`, with no accompanying `profile.status = 'approved'` check — unlike `pm_assigned_clients()`, which was hardened in `0021` specifically to re-verify `role='pm' and status='approved'` independent of `middleware.ts`.

**Why it's not exploitable today (verified):** `middleware.ts` is the actual primary gate for this class of check — a deactivated Client (`profiles.status = 'deactivated'`) is redirected to `/rejected` on every request, including the POST request a Server Action makes to its own page's URL, before any Server Action code or RLS-scoped query ever executes (confirmed by reading `middleware.ts`'s matcher, which covers all non-static paths). This mirrors the exact reasoning already recorded in `0021`'s own migration header for the PM case ("This is NOT a live exploit fix... the real motivator is out-of-band manual SQL... bypassing the app layer entirely").

**Recommendation:** For consistency with `0021`'s own stated philosophy ("the database layer independently correct, not relying solely on the application-layer invariant"), this phase's new `cards_select_scoped`/`cards_update_scoped` Client branches SHOULD include an explicit re-check, mirroring `is_admin()`'s/`pm_assigned_clients()`'s own pattern — e.g. join through `profiles` and require `status = 'approved'` on the Client's own profile row, not just a `client_id` match. This is optional hardening, not a blocking requirement (middleware already covers the live-exploit case), but it is cheap and matches the established convention. Include it in the migration if the planner agrees; document explicitly if descoped.

## Code Examples

### The stage-filtered RLS branch (full context)
```sql
-- Source: supabase/migrations/0031_editor_role_rls_and_due_date.sql (branch
-- mechanics) + supabase/migrations/0004_rls_policies.sql (Client predicate)
or (
  client_id = (select client_id from public.profiles where id = (select auth.uid()))
  and stage in ('aprovacao_cliente', 'agendamento')
)
```

### The read-only attachment branch (mirrors Editor's `card_attachments_select_scoped` extension exactly)
```sql
-- Source: supabase/migrations/0031_editor_role_rls_and_due_date.sql, section 4
drop policy "card_attachments_select_scoped" on public.card_attachments;
create policy "card_attachments_select_scoped"
on public.card_attachments for select to authenticated
using (
  (select public.is_admin())
  or card_id in (
    select id from public.cards
    where client_id in (select public.pm_assigned_clients())
  )
  or card_id in (
    select id from public.cards
    where media_assignee_id = (select auth.uid())
  )
  or card_id in (
    select id from public.cards
    where client_id = (select client_id from public.profiles where id = (select auth.uid()))
      and stage in ('aprovacao_cliente', 'agendamento')
  )
);
-- card_attachments_insert_scoped/_delete_scoped (0018) stay UNTOUCHED —
-- Client never writes an attachment, mirrors Editor's own read-only branch.
```

### New columns migration fragment
```sql
alter table public.cards
  add column client_adjustment_comment text,
  add column publish_at timestamptz;

create index idx_cards_publish_at on public.cards (publish_at);
-- No index needed on client_adjustment_comment (never filtered/sorted on).
-- No GRANT change needed (Pitfall 3) — existing grant on public.cards covers
-- new columns automatically.
```

## State of the Art

Not applicable — this phase uses no external library or framework whose "state of the art" could have shifted; it is a pure extension of this codebase's own, already-established internal patterns.

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | Recommended column names `client_adjustment_comment`/`publish_at` — CONTEXT explicitly leaves exact naming to the planner | Pattern 2, Code Examples | Low — purely cosmetic, any consistent name works; no code outside this phase's own new files references these names |
| A2 | Recommended optional hardening (`status = 'approved'` re-check) in the Client RLS branches, mirroring `0021`'s precedent | Pitfall 5 | Low — omitting it does not create a live exploit (middleware already blocks the only real path), only a theoretical defense-in-depth gap identical in class to the one `0021` closed for PM |

**If this table is empty:** N/A — see above, both entries are low-risk naming/hardening choices, not unverified factual claims. No claim in this research about existing code behavior is tagged `[ASSUMED]` — every RLS predicate, authorization guard, and idempotency claim was read directly from the current repository state.

## Open Questions

1. **Should the ROADMAP.md Phase 4 deadline (`2026-08-07`, already past) be flagged during `/gsd:plan-phase 4`?**
   - What we know: CONTEXT.md's `<specifics>` section explicitly calls this out, referencing the same pattern already used for Phase 3's own past deadline.
   - What's unclear: Nothing — this is a planning-process note, not a research gap.
   - Recommendation: The planner should surface this the same way Phase 3's was surfaced; no research action needed.

2. **Exact UI copy/flow for the approve vs. adjust action (one-click vs. confirm dialog)** — explicitly left to the planner's discretion by CONTEXT.md; no research-level ambiguity, just an implementation choice.

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework (JS/TS) | Node's built-in test runner (`node --test`), already covers `lib/cards/*.test.ts`, `lib/security/*.test.ts` |
| Framework (DB/RLS) | pgTAP via `npx supabase test db` |
| Config file | `package.json`'s `"test"` script (glob-based, no separate config file) |
| Quick run command | `npm test` (JS/TS pure-module tests only, ~seconds) |
| Full suite command | `npm test && npx supabase test db` |

### Phase Requirements → Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| KAN-04 | Adjustment bounces `aprovacao_cliente` → `producao`, card must re-pass `revisao_interna` | unit (pure payload builder) + pgTAP (RLS write scope) | `node --test lib/security/client-card-write-scope.test.ts`; `npx supabase test db` | ❌ Wave 0 |
| APR-01 | Client sees only `aprovacao_cliente`/`agendamento` stage cards for their own client, nothing else | pgTAP | `npx supabase test db` (new `0018_rls_client_card_scoping_test.sql`) | ❌ Wave 0 |
| APR-02 | Client can approve — RLS + app-layer both permit, target stage correct | pgTAP + unit | same as above; `node --test lib/security/client-card-write-scope.test.ts` | ❌ Wave 0 |
| APR-03 | Client can request adjustment with comment; card lands in `producao` with comment set | pgTAP + unit | same as above | ❌ Wave 0 |
| APR-04 | Comment visible to PM (existing read path) | manual/live-verify (UI rendering) | N/A — covered by checkpoint | — |
| SCH-01 | PM can register `publish_at`, only after approval | unit (schema) | `node --test` (extend existing `lib/validation/cards.ts` coverage if any exists, else manual/live-verify) | ❌ Wave 0 (if adding schema-level unit coverage) |
| SCH-02 | "Pronto para publicar" badge computed correctly | unit | `node --test lib/cards/publish-status.test.ts` (or wherever the pure function lands) | ❌ Wave 0 |
| Security (260811-oe0 class regression) | A Client caller invoking `updateCardDetails`/`advanceStage`/`moveCard` directly is still rejected after this phase's RLS widening | unit/pgTAP | Extend `board-write-authz.test.ts` with a `role: 'client'` case (cheap, high-value regression guard) | ❌ Wave 0 |

### Sampling Rate
- **Per task commit:** `npm test`
- **Per wave merge:** `npm test && npx supabase test db`
- **Phase gate:** Full suite green before `/gsd:verify-work`

### Wave 0 Gaps
- [ ] `lib/security/client-card-write-scope.test.ts` — covers APR-02/APR-03 (pure payload-shape assertions, mirrors `editor-card-write-scope.test.ts`)
- [ ] `supabase/tests/0018_rls_client_card_scoping_test.sql` — covers APR-01/APR-02/APR-03/KAN-04 (RLS row/stage scoping), reuses `rls_helpers.sql`'s existing `client_a_user` fixture (already has `role='client'`, `client_id=client_a`, `status='approved'`) — no new fixture actor needed
- [ ] A `role: 'client'` regression case added to `lib/security/board-write-authz.test.ts` — proves the 260811-oe0 fix generalizes (Pitfall 1)
- [ ] `lib/cards/publish-status.test.ts` (or equivalent) — covers SCH-02's pure computation

## Security Domain

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | no (unchanged — existing Supabase Auth session) | — |
| V3 Session Management | no (unchanged) | — |
| V4 Access Control | **yes** | RLS row-scoping (Pattern 1) + app-layer role re-check (Pattern 2) — the exact "two independent layers" discipline already established by every prior role in this codebase |
| V5 Input Validation | yes | Zod schemas (`approveCardSchema`/`requestAdjustmentSchema`) mirroring `updateCardDescriptionAsEditorSchema`'s trim/max conventions |
| V6 Cryptography | no | — |

### Known Threat Patterns for this stack

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| RLS-widening silently re-authorizing an unrelated existing action (the `260811-oe0` class of bug) | Elevation of Privilege | Verify EVERY existing action touching `cards`/`card_attachments` still has an independent role check OR is unaffected by the new policy branches (Pitfall 1) — done for this phase, must be re-verified at plan-check/execution time if scope changes |
| Client caller bypassing the stage gate by calling `requestAdjustment`/`approveCard` on a card not in `aprovacao_cliente` | Tampering | Server-side re-read + explicit stage check BEFORE any write (Pattern 2) — never trust a stage claim from the browser, same discipline as `advanceStage`'s own `nextStage(card.stage)` re-derivation |
| Cross-client data leak via the new Client RLS branch (e.g. predicate typo matching all clients) | Information Disclosure | pgTAP test with TWO client fixtures (`client_a_user`, and a second Client-role actor scoped to `client_b`) proving cross-client isolation — `rls_helpers.sql` currently only has one Client actor; the new pgTAP file should add a `client_b_user` fixture row (or a local one scoped to the test file) to prove the negative case, matching `0002_rls_client_scoping_test.sql`'s own cross-client isolation pattern for `clients` |
| A deactivated Client's still-valid session reaching a Client-only action | Elevation of Privilege | Covered by `middleware.ts` (primary gate) + the new actions' own explicit `status === 'approved'` re-check (Pattern 2, mirrors `0021`'s defense-in-depth philosophy) |

## Sources

### Primary (HIGH confidence — read directly from this repository)
- `app/pm/board/actions.ts` — `assertPmOrAdminCaller`, `updateCardDetails`, `advanceStage`, `moveCard`
- `app/editor/actions.ts`, `lib/security/editor-card-write-scope.ts` — the direct template for the Client's own write actions
- `lib/security/board-write-authz.ts` — the exact guard proven to reject a non-admin/pm caller
- `lib/cards/stages.ts`, `lib/cards/move-rules.ts`, `lib/cards/checklist-gate.ts`, `lib/cards/checklist-snapshot.ts`, `lib/cards/package-rollup.ts`, `lib/cards/channel.ts`
- `supabase/migrations/0001_profiles.sql`, `0004_rls_policies.sql`, `0015_cards.sql`, `0016_card_checklist_items.sql`, `0018_card_attachments.sql`, `0021_pm_assigned_clients_status_check.sql`, `0031_editor_role_rls_and_due_date.sql`
- `supabase/tests/rls_helpers.sql` — confirms an existing `client_a_user` fixture (`role='client'`, `client_id=client_a`, `status='approved'`) is already available for the new pgTAP test file
- `middleware.ts` — confirms the deactivated-account gate covers Server Action requests too
- `app/pm/board/page.tsx`, `app/editor/page.tsx`, `app/pm/board/board-panel.tsx`, `components/ui/status-badge.tsx`, `components/ui/data-card.tsx` — rendering primitives and RSC-loader pattern to reuse for `app/client/page.tsx`
- `lib/validation/cards.ts` — schema conventions (`updateCardDescriptionAsEditorSchema`'s deliberately-narrow shape) to mirror for `approveCardSchema`/`requestAdjustmentSchema`
- `.planning/phases/04-client-approval-scheduling/04-CONTEXT.md`, `.planning/REQUIREMENTS.md`, `.planning/STATE.md` — locked decisions, requirement wording, and the `260811-oe0` postmortem narrative

### Secondary (MEDIUM confidence)
None used — every claim in this document was verified directly against the current repository state.

### Tertiary (LOW confidence)
None.

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — no new libraries; every pattern cited was read from this exact codebase's current files
- Architecture: HIGH — every RLS predicate, payload builder, and stage-machine claim was verified against current migrations/source, not inferred from training knowledge
- Pitfalls: HIGH — Pitfall 1 (the highest-stakes one) was verified by reading `assertPmOrAdminCaller`'s actual implementation and confirming it rejects `role='client'`, not assumed from the Editor precedent alone

**Research date:** 2026-08-12
**Valid until:** Effectively indefinite for the architectural claims (internal code, doesn't drift like an external library) — re-verify only if `app/pm/board/actions.ts`'s authorization guards or `cards_update_scoped`/`cards_select_scoped` change again before this phase is planned/executed.
