# Phase 4: Client Approval & Scheduling - Pattern Map

**Mapped:** 2026-08-12
**Files analyzed:** 12 (7 new, 5 modified)
**Analogs found:** 12 / 12

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|--------------------|------|-----------|-----------------|----------------|
| `app/client/page.tsx` (rewrite) | route/page (RSC loader) | request-response (CRUD read) | `app/editor/page.tsx` | exact — same "RSC reads through role-scoped RLS, no separate client-side fetch" shape |
| `app/client/client-board-panel.tsx` (new) | component | request-response | `app/pm/board/board-panel.tsx` (`BoardCardItem`/`CardDetailDialogBody`/`StatusBadge`/`DataCard` usage) | role-match — client component rendering cards + dialog, reused primitives |
| `app/client/actions.ts` (new) | route (Server Action) | request-response / CRUD write | `app/editor/actions.ts` (`updateCardDescriptionAsEditor`) | exact — identical "re-read via RLS, hardcoded payload, revalidatePath" shape |
| `lib/security/client-card-write-scope.ts` (new) | utility (pure payload builder) | transform | `lib/security/editor-card-write-scope.ts` | exact — pure, no I/O, hardcoded-keys payload builder |
| `lib/security/client-card-write-scope.test.ts` (new) | test | transform | `lib/security/editor-card-write-scope.test.ts` | exact — POSITIVE/NEGATIVE forbidden-key assertions |
| `lib/cards/publish-status.ts` (new) | utility (pure computed value) | transform | `lib/cards/package-rollup.ts` | exact — "computed at render time, never stored" precedent |
| `lib/cards/publish-status.test.ts` (new) | test | transform | `lib/cards/package-rollup.test.ts` | exact |
| `lib/validation/cards.ts` (extend) | utility (Zod schemas) | transform | same file, `updateCardDescriptionAsEditorSchema` / `updateCardDetailsSchema` | exact — extend in place |
| `app/pm/board/actions.ts` (`updateCardDetails`, extend) | route (Server Action) | CRUD | same file, existing `updateCardDetails` | exact — extend in place |
| `app/pm/board/board-panel.tsx` (extend: publish-date field + adjustment-comment display + badge) | component | request-response | same file, `CardDetailDialogBody`'s "Prazo" field (lines 1296-1318) + `BoardCardItem`'s meta segments | exact — extend in place |
| `supabase/migrations/0032_client_approval_scheduling.sql` (new) | migration | CRUD (schema) | `supabase/migrations/0031_editor_role_rls_and_due_date.sql` | exact — RLS-branch + nullable-column mirror, minus the enum-split preamble |
| `supabase/tests/0018_rls_client_card_scoping_test.sql` (new) | test (pgTAP) | CRUD | `supabase/tests/0016_rls_editor_scoping_test.sql` | exact — same fixture/assertion shape, different predicate |
| `lib/security/board-write-authz.test.ts` (extend: add `role: 'client'` regression case) | test | transform | same file, existing NEGATIVE cases | exact — extend in place |

## Pattern Assignments

### `app/client/page.tsx` (route/page, request-response)

**Analog:** `app/editor/page.tsx` (full file, 109 lines — small enough for one read)

**Current placeholder to replace** (`app/client/page.tsx`, current 29 lines):
```tsx
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

export default function ClientPage() {
  return (
    <div className="flex flex-1 items-center justify-center p-4">
      <Card className="w-full max-w-sm">
        <CardHeader>
          <CardTitle>Área do Cliente</CardTitle>
        </CardHeader>
        <CardContent>
          <CardDescription className="text-base">
            Em construção — o conteúdo desta área será adicionado nas próximas fases.
          </CardDescription>
        </CardContent>
      </Card>
    </div>
  );
}
```

**RSC-reads-through-RLS pattern** (`app/editor/page.tsx` lines 47-60):
```tsx
export default async function EditorQueuePage() {
  const supabase = await createClient();

  const { data: cards } = await supabase
    .from("cards")
    .select("id, title, stage, description, client_id, due_date, created_at")
    .order("due_date", { ascending: true, nullsFirst: false });

  const clientIds = Array.from(new Set((cards ?? []).map((c) => c.client_id)));
  const { data: clients } =
    clientIds.length > 0
      ? await supabase.from("clients").select("id, name").in("id", clientIds)
      : { data: [] as { id: string; name: string }[] };
```
Apply this shape to `app/client/page.tsx`, but note the Client's RLS branch is ALREADY `client_id`-scoped (via `profiles.client_id`) so there is no cross-client `.in("id", clientIds)` join needed for `clients` the way Editor needs it — the Client board only ever needs its own single client's name, if displayed at all. The `select(...)` should split into two disjoint reads driven by D-01 (queue vs. history):
```tsx
const { data: queueCards } = await supabase
  .from("cards")
  .select("id, title, stage, description, ..., client_adjustment_comment")
  .eq("stage", "aprovacao_cliente")
  .order("created_at", { ascending: true });

const { data: historyCards } = await supabase
  .from("cards")
  .select("id, title, stage, description, ..., publish_at")
  .eq("stage", "agendamento")
  .order("updated_at", { ascending: false });
```
Both reads rely entirely on the new Client RLS branch (Pattern below) — no extra `.eq("client_id", ...)` needed client-side, mirrors Editor's own "RLS is the entire filter" comment (`app/editor/page.tsx` lines 44-46).

**Attachments-join pattern** (`app/editor/page.tsx` lines 73-99) — reuse verbatim for the Client's attachment reads (via the new read-only `card_attachments_select_scoped` Client branch), including the `Map<string, T[]>` grouping-by-`card_id` idiom.

---

### `app/client/client-board-panel.tsx` (component, request-response)

**Analog:** `app/pm/board/board-panel.tsx` — do NOT copy the whole 78K-line file; copy only these excerpts.

**`"use client"` + imports header** (`board-panel.tsx` lines 1-97, trimmed to what Client needs):
```tsx
"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { STAGE_LABELS, type CardStage } from "@/lib/cards/stages";
import { CHANNEL_LABELS, type CardChannel } from "@/lib/cards/channel";
import { isReadyToPublish } from "@/lib/cards/publish-status";
import { DataCard } from "@/components/ui/data-card";
import { StatusBadge } from "@/components/ui/status-badge";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { approveCard, requestAdjustment } from "./actions";
```
Client's panel needs a small fraction of PM's imports — no `@dnd-kit/*`, no `react-hook-form` (only one free-text comment field, not a full form), no `createCard`/`moveCard`/etc.

**Card rendering primitive** (`board-panel.tsx` `BoardCardItem`, lines 1404-1487) — reuse `DataCard` + `StatusBadge` composition exactly:
```tsx
<DataCard
  title={card.title}
  meta={cardMeta}
  badge={
    <StatusBadge tone={card.channel === "planejamento" ? "info" : "neutral"}>
      {CHANNEL_LABELS[card.channel]}
    </StatusBadge>
  }
/>
```
For the history view, add the SCH-02 badge next to it: `isReadyToPublish(card) ? <StatusBadge tone="success">Pronto para publicar</StatusBadge> : null`.

**Date formatting helpers to reuse verbatim** (`board-panel.tsx` lines 199-216, copy into the new file or a shared `lib/format/dates.ts` if the planner prefers — CONTEXT does not mandate extraction):
```tsx
function formatCreatedAt(iso: string): string {
  return new Intl.DateTimeFormat("pt-BR", { dateStyle: "medium" }).format(new Date(iso));
}
function formatDueDateShort(iso: string): string {
  return new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short" }).format(new Date(iso));
}
```

**Detail-dialog pattern for approve/adjust actions** — mirror `CardDetailDialogBody`'s `useTransition` + inline error state idiom (`board-panel.tsx` lines 1012-1013, 1136-1144):
```tsx
const [isPending, startTransition] = useTransition();
const [error, setError] = useState<string | null>(null);

function handleApprove() {
  setError(null);
  startTransition(async () => {
    const result = await approveCard({ cardId: card.id });
    if (result.error) setError(result.error);
  });
}

function handleAdjust() {
  setError(null);
  startTransition(async () => {
    const result = await requestAdjustment({ cardId: card.id, comment: draftComment });
    if (result.error) setError(result.error);
  });
}
```
On success, both actions already call `revalidatePath` server-side (Pattern in `app/client/actions.ts` below) — no client-side `router.refresh()` needed, matching `handleAdvance`'s own convention (`board-panel.tsx` lines 1136-1144, no manual refresh call).

---

### `app/client/actions.ts` (route/Server Action, CRUD write)

**Analog:** `app/editor/actions.ts` (full file, 73 lines)

**Full pattern to mirror** (`app/editor/actions.ts` lines 1-72):
```ts
"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import {
  updateCardDescriptionAsEditorSchema,
  type UpdateCardDescriptionAsEditorInput,
} from "@/lib/validation/cards";
import { buildEditorCardUpdatePayload } from "@/lib/security/editor-card-write-scope";

const CARD_NOT_FOUND_ERROR = "Card não encontrado.";
const NOT_AUTHENTICATED_ERROR = "Não autenticado.";
const CARD_SAVE_ERROR = "Não foi possível salvar a descrição. Tente novamente.";

export type UpdateCardDescriptionAsEditorResult = { error?: string };

export async function updateCardDescriptionAsEditor(
  input: UpdateCardDescriptionAsEditorInput
): Promise<UpdateCardDescriptionAsEditorResult> {
  const parsed = updateCardDescriptionAsEditorSchema.safeParse(input);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Dados inválidos." };
  }

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: NOT_AUTHENTICATED_ERROR };

  const { data: card } = await supabase
    .from("cards")
    .select("id")
    .eq("id", parsed.data.cardId)
    .single();
  if (!card) return { error: CARD_NOT_FOUND_ERROR };

  const { error } = await supabase
    .from("cards")
    .update(buildEditorCardUpdatePayload(parsed.data.description))
    .eq("id", parsed.data.cardId);

  if (error) return { error: CARD_SAVE_ERROR };

  revalidatePath("/editor");
  return {};
}
```

**Adapt for `approveCard`/`requestAdjustment`** per RESEARCH.md's Pattern 2 (already-verified against this codebase, reproduce directly):
- Add an explicit role/status re-check (`profile.role !== "client" || profile.status !== "approved"`) BEFORE the re-read — this is new relative to the Editor template, because the Editor action has no equivalent app-layer check of its own (RLS's `media_assignee_id` branch alone is sufficient there; the Client branch additionally needs the stage-gate re-check below).
- Re-read must select `id, stage` (not just `id`) and reject with a `WRONG_STAGE_ERROR` unless `card.stage === "aprovacao_cliente"` — never trust a stage claim from the browser (RESEARCH.md Pattern 2, Security Domain table).
- `revalidatePath("/client")` instead of `/editor`.

**Payload builders to call** — see `lib/security/client-card-write-scope.ts` below.

---

### `lib/security/client-card-write-scope.ts` (utility, transform)

**Analog:** `lib/security/editor-card-write-scope.ts` (full file, 25 lines)

**Full pattern to mirror:**
```ts
export const EDITOR_CARD_UPDATE_KEYS = ["description", "updated_at"] as const;

export function buildEditorCardUpdatePayload(description: string | null): {
  description: string | null;
  updated_at: string;
} {
  return { description, updated_at: new Date().toISOString() };
}
```

**Adapted shape (from RESEARCH.md, already verified against this codebase's `nextStage`/`STAGE_ORDER`):**
```ts
import { nextStage } from "@/lib/cards/stages";

export const CLIENT_APPROVE_UPDATE_KEYS = ["stage", "updated_at"] as const;
export const CLIENT_ADJUST_UPDATE_KEYS = ["stage", "client_adjustment_comment", "updated_at"] as const;

export function buildClientApprovePayload(currentStage: "aprovacao_cliente"): {
  stage: ReturnType<typeof nextStage>;
  updated_at: string;
} {
  return { stage: nextStage(currentStage), updated_at: new Date().toISOString() };
}

export function buildClientAdjustPayload(comment: string): {
  stage: "producao";
  client_adjustment_comment: string;
  updated_at: string;
} {
  return { stage: "producao", client_adjustment_comment: comment, updated_at: new Date().toISOString() };
}
```
Free of Supabase/React imports (only pulls the pure `lib/cards/stages.ts` module) — same "no I/O" discipline as the Editor analog.

---

### `lib/security/client-card-write-scope.test.ts` (test)

**Analog:** `lib/security/editor-card-write-scope.test.ts` (full file, 37 lines)

**Pattern to mirror exactly** — POSITIVE key-shape assertion + a `FORBIDDEN_KEYS` NEGATIVE loop:
```ts
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  buildClientApprovePayload,
  buildClientAdjustPayload,
} from "./client-card-write-scope.ts";

const FORBIDDEN_KEYS = ["client_id", "channel", "assignee_id", "media_assignee_id", "due_date", "publish_at"];

test("buildClientApprovePayload: payload keys are EXACTLY stage + updated_at", () => {
  const payload = buildClientApprovePayload("aprovacao_cliente");
  assert.deepEqual(Object.keys(payload).sort(), ["stage", "updated_at"]);
});

test("buildClientApprovePayload: resolves to 'agendamento'", () => {
  assert.equal(buildClientApprovePayload("aprovacao_cliente").stage, "agendamento");
});

for (const forbidden of FORBIDDEN_KEYS) {
  test(`buildClientAdjustPayload: NEGATIVE - payload never includes '${forbidden}'`, () => {
    const payload = buildClientAdjustPayload("ajuste") as Record<string, unknown>;
    assert.equal(forbidden in payload, false);
  });
}
```

---

### `lib/cards/publish-status.ts` (utility, transform)

**Analog:** `lib/cards/package-rollup.ts` (full file, 62 lines — "computed, never stored" doc-comment precedent)

**Doc-comment convention to mirror** (`package-rollup.ts` lines 1-17):
```ts
/**
 * Pure [X] module (D-XX). Intentionally free of any Supabase/React import
 * or I/O so this module can be imported by its sibling `*.test.ts` via a
 * relative path and exercised with Node's built-in test runner -- no live
 * DB, no Docker.
 *
 * [X] is COMPUTED at render time from [inputs] and is NEVER stored as a
 * column (D-04's own precedent, mirroring D-02's "a stored rollup drifts").
 */
```

**Function to write** (already fully specified in RESEARCH.md Pattern 5, reproduce directly):
```ts
import type { CardStage } from "./stages.ts";

export function isReadyToPublish(card: { stage: CardStage | null; publish_at: string | null }): boolean {
  return card.stage === "agendamento" && card.publish_at !== null;
}
```

---

### `lib/cards/publish-status.test.ts` (test)

**Analog:** `lib/cards/package-rollup.test.ts` (full file, 45 lines)

**Pattern to mirror** — plain `node:test` + `node:assert/strict`, one `test()` per case, TRUE/FALSE/EDGE naming convention (`package-rollup.test.ts` lines 6-45 use `EMPTY`/`UNANIMOUS`/`MAJORITY`/`TIE` style names):
```ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { isReadyToPublish } from "./publish-status.ts";

test("isReadyToPublish: TRUE - agendamento stage with publish_at set", () => {
  assert.equal(isReadyToPublish({ stage: "agendamento", publish_at: "2026-09-01T10:00:00Z" }), true);
});

test("isReadyToPublish: FALSE - agendamento stage but publish_at null", () => {
  assert.equal(isReadyToPublish({ stage: "agendamento", publish_at: null }), false);
});

test("isReadyToPublish: FALSE - publish_at set but stage not yet agendamento", () => {
  assert.equal(isReadyToPublish({ stage: "aprovacao_cliente", publish_at: "2026-09-01T10:00:00Z" }), false);
});
```

---

### `lib/validation/cards.ts` (extend — Zod schemas)

**Analog:** same file, `updateCardDescriptionAsEditorSchema` (lines 131-147) for the narrow-schema convention; `updateCardDetailsSchema`'s `dueDate` field (lines 100-128) for the new `publishAt` field on the SAME schema (SCH-01 is PM-registered, reuses `updateCardDetailsSchema`, does NOT need its own schema).

**Narrow-schema doc-comment + shape convention to mirror** (lines 131-147):
```ts
/**
 * [approveCard/requestAdjustment]'s input (Phase 4, APR-02/APR-03).
 * Deliberately has ONLY cardId[/comment] -- stage/description/assigneeId/
 * channel/etc. are structurally ABSENT, not merely ignored, so a Client
 * caller has no field to even attempt to set them through.
 */
export const approveCardSchema = z.object({
  cardId: z.string().uuid(),
});
export type ApproveCardInput = z.infer<typeof approveCardSchema>;

export const requestAdjustmentSchema = z.object({
  cardId: z.string().uuid(),
  comment: z.string().trim().min(1).max(2000),
});
export type RequestAdjustmentInput = z.infer<typeof requestAdjustmentSchema>;
```

**`dueDate`-field convention to mirror for `publishAt`** (lines 122-127, extend `updateCardDetailsSchema` in place):
```ts
dueDate: z
  .string()
  .refine((value) => !Number.isNaN(Date.parse(value)), { message: "Data inválida." })
  .nullable(),
```
`publishAt` should be added as a sibling field with the identical refine-shape, both nullable ISO-datetime strings, per D-03's "structurally distinct new column, same input-validation shape" framing.

---

### `app/pm/board/actions.ts` — `updateCardDetails` (extend, CRUD)

**Analog:** same function, current body (lines 496-555)

**Exact extension point** — add `publish_at: parsed.data.publishAt` to the `.update({...})` payload (line 538 sibling), mirroring how `due_date` was added:
```ts
const { error } = await supabase
  .from("cards")
  .update({
    description: /* ... */,
    assignee_id: parsed.data.assigneeId,
    media_assignee_id: parsed.data.mediaAssigneeId,
    channel: parsed.data.channel,
    due_date: parsed.data.dueDate,
    publish_at: parsed.data.publishAt,   // NEW
    updated_at: new Date().toISOString(),
  })
  .eq("id", parsed.data.cardId);
```
No authorization change needed — `assertPmOrAdminCaller` (lines 98-109) already gates this whole function; `publish_at` is just one more PM/Admin-writable column, never touched by the Client's own actions (`lib/security/client-card-write-scope.ts` payload builders never include it — verified by the NEGATIVE test above).

---

### `app/pm/board/board-panel.tsx` (extend — publish-date field, adjustment-comment display, badge)

**Analog:** same file, the "Prazo" field block (lines 1296-1318) — copy this exact structure for a new "Data de publicação" field, gated to render only when `card.stage === "agendamento"` (RESEARCH.md's recommended gating condition):
```tsx
{card.stage === "agendamento" ? (
  <div className="flex flex-col gap-2">
    <SectionTitle>Data de publicação</SectionTitle>
    <div className="flex items-center gap-2">
      <Input
        type="datetime-local"
        value={draftPublishAt}
        onChange={(event) => setDraftPublishAt(event.target.value)}
        disabled={isSavingDetails}
        className="w-fit"
      />
      {draftPublishAt ? (
        <Button type="button" variant="ghost" size="sm" onClick={() => setDraftPublishAt("")} disabled={isSavingDetails}>
          Limpar
        </Button>
      ) : null}
    </div>
  </div>
) : null}
```
Requires a sibling `draftPublishAt` state seeded via `toDatetimeLocalValue(card.publish_at)` (line 1030's `draftDueDate` pattern) and inclusion in `hasDetailChanges`/`handleSaveDetails`'s payload (lines 1079-1085, 1146-1165), exactly like `dueDate` today.

**Adjustment-comment read-only display** — per RESEARCH.md Pattern 4, add a read-only block near the stage badge (line 1173-1175 `StatusBadge` block) when `card.stage === "producao" && card.client_adjustment_comment`:
```tsx
{card.stage === "producao" && card.client_adjustment_comment ? (
  <div className="flex flex-col gap-1 rounded-md border p-3">
    <span className="text-body font-medium">Ajuste solicitado pelo cliente</span>
    <span className="text-body text-muted-foreground">{card.client_adjustment_comment}</span>
  </div>
) : null}
```
No new Server Action — this is pure display of an already-selected column (add `client_adjustment_comment`, `publish_at` to `app/pm/board/page.tsx`'s existing `cards` `.select(...)` and the `BoardCard` type it exports, mirroring how `due_date`/`channel` were added there).

**"Pronto para publicar" badge on the PM board too** — reuse `isReadyToPublish` (new `lib/cards/publish-status.ts`) at `BoardCardItem`'s badge composition (lines 1455-1471), same `<StatusBadge tone="success">` idiom used elsewhere in the file (e.g. line 1173).

---

### `supabase/migrations/0032_client_approval_scheduling.sql` (migration)

**Analog:** `supabase/migrations/0031_editor_role_rls_and_due_date.sql` (full file, 315 lines) — mirror its structure (numbered sections, header comment explaining scope and explicitly stating what is NOT touched) but WITHOUT the 2-migration enum-split preamble (Pitfall 4 — no new enum value this phase).

**RLS branch pattern to mirror** (`0031` lines 79-104, adapted per RESEARCH.md Pattern 1 — already fully drafted and verified there):
```sql
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
```
(Full `cards_update_scoped` + `card_attachments_select_scoped` branches, and the two-column `ALTER TABLE`, are already fully drafted in RESEARCH.md's "Code Examples" section — copy from there, they were derived directly from this exact migration's own mechanics.)

**Column-add pattern to mirror** (`0031` lines 311-314):
```sql
alter table public.cards
  add column due_date timestamptz;

create index idx_cards_due_date on public.cards (due_date);
```
Adapt to two columns per RESEARCH.md's Code Examples section (`client_adjustment_comment text`, `publish_at timestamptz` + index on `publish_at` only — no index on the comment).

**Header-comment convention to mirror** (`0031` lines 1-75) — numbered scope list, explicit "Deliberately NOT added" callout (this phase's equivalent: no `is_client()` helper, no 2-migration split, no checklist-reset logic — Pitfalls 2/4 from RESEARCH.md).

---

### `supabase/tests/0018_rls_client_card_scoping_test.sql` (pgTAP test)

**Analog:** `supabase/tests/0016_rls_editor_scoping_test.sql` (full file, 258 lines)

**Fixture + assertion structure to mirror:**
- `begin; select plan(N); \ir rls_helpers.sql` header (lines 21-24).
- Local fixture actors inserted directly in this file (not in `rls_helpers.sql`) — lines 38-59's `auth.users` insert pattern, adapted to a SECOND Client actor (`client_b_user`, scoped to a different `client_id`) since `rls_helpers.sql` only ships one Client fixture (`client_a_user`) — RESEARCH.md's Security Domain table explicitly calls this out as needed for the cross-client negative-case proof.
- `select tests.set_auth(...)` / `select ok(...)` / `select results_eq(...)` / `select throws_like(...)` idioms (lines 129-254) — reuse verbatim, only the predicate and table names change.
- Cross-client isolation proof idiom, mirrored from `0002_rls_client_scoping_test.sql` per RESEARCH.md's own citation — worth reading that file too if the isolation-proof shape in `0016` (lines 137-142, "editor_a NAO ve card de outro editor no mesmo cliente") needs a second reference point; not read in this pass since `0016` alone is sufficient as the primary template.
- Final `reset role; select set_config('request.jwt.claims', '', true); select * from finish(); rollback;` footer (lines 252-257) — copy verbatim.

**Key assertions this file needs (not in the Editor analog, specific to this phase):**
1. `client_a_user` sees own `aprovacao_cliente`/`agendamento` cards, not `briefing`/`producao`/`revisao_interna` cards of the same client (the stage filter, absent from Editor's predicate).
2. `client_a_user` does NOT see `client_b`'s cards even in `aprovacao_cliente` (cross-client isolation, the `client_id` predicate).
3. `client_a_user` CAN update a card's `stage`/`client_adjustment_comment` while in `aprovacao_cliente` (`cards_update_scoped` `using` clause).
4. `client_a_user` CANNOT update a card NOT in `aprovacao_cliente` even if it's their own client's card (`using` clause's stage filter).
5. `card_attachments`: read-only Client branch, same shape as `0016`'s assertions 12-14 (see, cannot insert).

---

### `lib/security/board-write-authz.test.ts` (extend — regression case)

**Analog:** same file, existing NEGATIVE cases (lines 13-19)

**Pattern to mirror exactly, add one more case:**
```ts
test("isBoardWriteAuthorized: NEGATIVE - approved client is rejected", () => {
  assert.equal(isBoardWriteAuthorized({ role: "client", status: "approved" }), false);
});
```
This case ALREADY EXISTS in the current file (line 17-19) — RESEARCH.md's Wave 0 Gaps table asks for it as a "regression guard," but it is already present and passing. **No new test needed here** — confirm during planning that this line already covers the 260811-oe0-class regression for a Client caller; do not duplicate it.

## Shared Patterns

### RLS row-scoping + GRANT discipline
**Source:** `supabase/migrations/0031_editor_role_rls_and_due_date.sql` (all 5 policy-touching sections) + `supabase/migrations/0004_rls_policies.sql` line 126 (`or id = (select client_id from public.profiles where id = (select auth.uid()))` — the exact Client-scoping predicate origin)
**Apply to:** `supabase/migrations/0032_client_approval_scheduling.sql`
```sql
-- 0004_rls_policies.sql, line 126 — verified predicate source
or id = (select client_id from public.profiles where id = (select auth.uid()))
```
No new GRANT statements needed for the two new columns (Pitfall 3, confirmed precedent across 0025/0027/0028/0029/0031) — only the policy BODY changes, because this phase adds a new ROLE branch, not because of new columns.

### "RLS decides rows, a Server Action decides columns"
**Source:** `app/editor/actions.ts` + `lib/security/editor-card-write-scope.ts` (doc comments on both files state this explicitly)
**Apply to:** `app/client/actions.ts` + `lib/security/client-card-write-scope.ts`
```ts
// app/editor/actions.ts, lines 51-53
// Re-read the card through RLS -- never trust that cardId is one of the
// caller's assigned cards; cards_select_scoped's media_assignee_id
// branch is the real boundary.
```

### App-layer role guard as the PRIMARY authorization boundary
**Source:** `lib/security/board-write-authz.ts` (`isBoardWriteAuthorized`) + `app/pm/board/actions.ts`'s `assertPmOrAdminCaller` (lines 98-109)
**Apply to:** `app/client/actions.ts`'s `approveCard`/`requestAdjustment` — both need their own equivalent inline check (`profile.role === "client" && profile.status === "approved"`), following the exact "fails closed: any error reading the profile (including 'no row') is treated as unauthorized" discipline stated in `assertPmOrAdminCaller`'s doc comment.

### Computed-at-render-time badge, never stored
**Source:** `lib/cards/package-rollup.ts` (D-02's own doc-comment rationale, lines 10-16)
**Apply to:** `lib/cards/publish-status.ts`'s `isReadyToPublish` — same "a stored rollup drifts" justification applies verbatim to D-04's "Pronto para publicar" badge.

### Backward-transition-as-hardcoded-literal (no generic primitive)
**Source:** `lib/cards/stages.ts`'s `nextStage` (forward-only, unchanged) + `lib/cards/move-rules.ts`'s `evaluateMove` comment ("Everything else (including every BACKWARD move) is allowed", line ~49)
**Apply to:** `requestAdjustment`'s payload builder — hardcode `{ stage: "producao" }`, do NOT add a `previousStage()` function to `lib/cards/stages.ts`. Zero changes to `lib/cards/stages.ts`/`lib/cards/move-rules.ts` in this phase.

## No Analog Found

None — every file this phase touches has a direct, recently-shipped precedent in this codebase (the Editor role addition, `260811-oe0`, is structurally the closest possible analog for nearly every file).

## Metadata

**Analog search scope:** `app/editor/`, `app/pm/board/`, `app/client/`, `lib/security/`, `lib/cards/`, `lib/validation/`, `supabase/migrations/`, `supabase/tests/`
**Files scanned:** 19 (7 fully read, 12 targeted grep+range reads)
**Pattern extraction date:** 2026-08-12
