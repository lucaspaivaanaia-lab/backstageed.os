"use client";

import type { ReactNode } from "react";
import { useDroppable } from "@dnd-kit/core";

import { cn } from "@/lib/utils";
import { STAGE_ORDER, type CardStage } from "@/lib/cards/stages";

/**
 * Per-stage drop target (KAN-03, D-12). The droppable id is namespaced with
 * a `column:` prefix so `active.id` (a card, prefixed `card:` by
 * draggable-card.tsx) and `over.id` (a column) can never collide inside the
 * same `DndContext` in `board-panel.tsx` -- dnd-kit itself does not enforce
 * any distinction between draggable and droppable id spaces, so this
 * project draws that line itself.
 */
export function columnDroppableId(stage: CardStage): string {
  return `column:${stage}`;
}

/**
 * Mirror of `columnDroppableId`. Returns `null` for anything that is not a
 * `column:`-prefixed id whose remainder is a known `CardStage` -- an
 * `onDragEnd` handler must never cast a raw droppable id, it must no-op on
 * `null` instead of writing to an unintended stage (T-03-46).
 */
export function stageFromDroppableId(id: string): CardStage | null {
  if (!id.startsWith("column:")) return null;
  const candidate = id.slice("column:".length);
  return (STAGE_ORDER as readonly string[]).includes(candidate)
    ? (candidate as CardStage)
    : null;
}

/**
 * Renders a single stage column's drop area. `min-h-24` is load-bearing: a
 * column holding zero cards must still present a droppable region, or a
 * card can never be dragged into an empty stage. The `bg-muted` over-state
 * reuses the existing secondary surface token -- no new hue or border
 * colour is introduced (03-UI-SPEC.md Color: no new hue this phase).
 */
export function DroppableColumn({
  stage,
  children,
}: {
  stage: CardStage;
  children: ReactNode;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: columnDroppableId(stage) });

  return (
    <div
      ref={setNodeRef}
      className={cn(
        "flex min-h-24 flex-col gap-4 rounded-md p-2 transition-colors",
        isOver && "bg-muted"
      )}
    >
      {children}
    </div>
  );
}
