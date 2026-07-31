"use client";

import type { ReactNode } from "react";
import { useDraggable } from "@dnd-kit/core";
import type {
  DraggableAttributes,
  DraggableSyntheticListeners,
} from "@dnd-kit/core";
import { CSS } from "@dnd-kit/utilities";
import { GripVerticalIcon } from "lucide-react";

import { cn } from "@/lib/utils";

/**
 * Board-local dnd-kit draggable wrapper (D-12). `components/ui/data-card.tsx`
 * is a generic primitive shared with `/pm/clients` and `/admin/*` and is
 * deliberately NOT modified here -- D-02 of the 260728-uab design-system
 * task locked DataCard as board-agnostic, and 03-CONTEXT.md's Existing Code
 * Insights repeats that only the interaction layer AROUND DataCard changes.
 * All drag behaviour therefore lives in this board-local file, never inside
 * the primitive itself.
 */
export function cardDraggableId(cardId: string): string {
  return `card:${cardId}`;
}

/** Mirror of `cardDraggableId` -- returns `null` for anything not prefixed
 * `card:`, so `onDragStart`/`onDragEnd` can no-op instead of casting blindly
 * (T-03-46). */
export function cardIdFromDraggableId(id: string): string | null {
  if (!id.startsWith("card:")) return null;
  return id.slice("card:".length);
}

/**
 * Accessible drag handle: a dedicated small icon-button, not the card body
 * itself. Two details are deliberate: (1) `onClick` is declared AFTER the
 * `{...attributes}`/`{...listeners}` spreads -- dnd-kit's `listeners` never
 * includes `onClick`, so this suppresses a stray click without clobbering
 * any pointer/keyboard sensor; (2) `size-8` matches the project's existing
 * icon-button minimum touch target (03-UI-SPEC.md Spacing, "size-8
 * icon-sm minimum").
 */
export function CardDragHandle({
  title,
  attributes,
  listeners,
}: {
  title: string;
  attributes: DraggableAttributes;
  listeners: DraggableSyntheticListeners;
}) {
  return (
    <button
      type="button"
      aria-label={`Mover card: ${title}`}
      className="absolute bottom-1 right-1 inline-flex size-8 items-center justify-center rounded-md text-muted-foreground opacity-60 transition-opacity hover:opacity-100 focus-visible:opacity-100 focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
      {...attributes}
      {...listeners}
      onClick={(event) => {
        event.preventDefault();
        event.stopPropagation();
      }}
    >
      <GripVerticalIcon className="size-4" aria-hidden="true" />
    </button>
  );
}

/**
 * Wraps a card's rendered content (the existing `DialogTrigger`-wrapped
 * `role="button"` div around `DataCard`) with dnd-kit's draggable behaviour.
 * The handle is rendered as a SIBLING of `children`, never nested inside
 * it -- that keeps the card body free of a nested interactive element and
 * keeps the two keyboard interactions (open dialog vs. pick up to drag)
 * from fighting over the same key events. `touch-none` is required for the
 * pointer sensor to work correctly on touch devices.
 */
export function DraggableCard({
  cardId,
  title,
  disabled,
  children,
}: {
  cardId: string;
  title: string;
  disabled?: boolean;
  children: ReactNode;
}) {
  const { attributes, listeners, setNodeRef, transform, isDragging } =
    useDraggable({ id: cardDraggableId(cardId), disabled });

  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Translate.toString(transform) }}
      className={cn("relative touch-none", isDragging && "opacity-40")}
    >
      {children}
      {!disabled && (
        <CardDragHandle title={title} attributes={attributes} listeners={listeners} />
      )}
    </div>
  );
}
