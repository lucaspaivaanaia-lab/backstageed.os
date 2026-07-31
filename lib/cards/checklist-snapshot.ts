import type { createClient } from "@/lib/supabase/server";

/**
 * The ONE place the D-04 checklist snapshot is performed (CHK-03, CHK-04).
 * A plain module (no `"use server"`, no route coupling) that receives an
 * already-constructed RLS-scoped Supabase client as its first argument, so
 * `advanceStage` (Task 2 of this plan) and `moveCard`/`createCard` (plan
 * 03-07's drag-triggered transition, D-13, and direct-creation path, D-15)
 * all share a single implementation. Any future transition path (drag,
 * direct creation in a later column, Phase 4's adjustment loop) MUST call
 * this function rather than reimplementing the copy — a second copy of
 * this logic is a CHK-04 regression.
 *
 * This module never constructs its own Supabase client and must never
 * reach for the service-role client — the caller's existing RLS-scoped
 * client is always passed in, so the snapshot inherits the same
 * per-client scoping as every other write in this codebase.
 */
type ScopedSupabaseClient = Awaited<ReturnType<typeof createClient>>;

export const SNAPSHOT_FAILED_MESSAGE =
  "Não foi possível preparar o checklist deste card. Tente novamente.";

export type SnapshotResult =
  | { ok: true; itemsCreated: number }
  | { ok: false; error: string };

/**
 * Copies the client's currently-assigned checklist template onto `cardId`
 * as its own `card_checklist_items` rows, exactly once. Idempotent (step 1
 * below) so a card can re-enter revisão interna (Phase 4's adjustment
 * loop) or be dragged back and forth (D-12) without duplicating or
 * clobbering its original snapshot and audit trail.
 */
export async function snapshotChecklistForCard(
  supabase: ScopedSupabaseClient,
  cardId: string,
  clientId: string
): Promise<SnapshotResult> {
  // 1. Idempotency check: if this card already has checklist rows (e.g. a
  //    prior entry into revisão interna, or Phase 4's adjustment loop
  //    sending it back a second time), never re-snapshot — the original
  //    items and their audit trail (completed_at/completed_by) are
  //    preserved as-is.
  const { data: existing } = await supabase
    .from("card_checklist_items")
    .select("id")
    .eq("card_id", cardId)
    .limit(1);

  if (existing && existing.length > 0) {
    return { ok: true, itemsCreated: 0 };
  }

  // 2. A client with no assigned template must not be blocked from
  //    advancing (03-RESEARCH.md Pitfall 3 fail-safe) — the UI surfaces
  //    this as an informational notice, not an error.
  const { data: client } = await supabase
    .from("clients")
    .select("checklist_template_id")
    .eq("id", clientId)
    .single();

  if (!client?.checklist_template_id) {
    return { ok: true, itemsCreated: 0 };
  }

  // 3. Read the live template's items — this is the only place this
  //    module reads `checklist_template_items`.
  const { data: templateItems } = await supabase
    .from("checklist_template_items")
    .select("label, sort_order")
    .eq("template_id", client.checklist_template_id)
    .order("sort_order");

  if (!templateItems || templateItems.length === 0) {
    return { ok: true, itemsCreated: 0 };
  }

  // 4. Insert the copy — completed_at/completed_by left null. No
  //    template_id/template_item_id is ever written (D-04: this is a
  //    one-time copy, never a live binding).
  const { error: insertError } = await supabase
    .from("card_checklist_items")
    .insert(
      templateItems.map((item) => ({
        card_id: cardId,
        label: item.label,
        sort_order: item.sort_order,
      }))
    );

  if (insertError) {
    return { ok: false, error: SNAPSHOT_FAILED_MESSAGE };
  }

  return { ok: true, itemsCreated: templateItems.length };
}
