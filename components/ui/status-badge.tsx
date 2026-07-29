import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/lib/utils";

export type StatusTone = "neutral" | "success" | "warning" | "danger" | "info";

export const statusBadgeVariants = cva(
  "inline-flex w-fit shrink-0 items-center gap-1 rounded-full border border-transparent px-2 py-0.5 text-meta font-medium whitespace-nowrap [&>svg]:size-3",
  {
    variants: {
      tone: {
        neutral: "bg-muted text-muted-foreground",
        success: "bg-success/10 text-success",
        warning: "bg-warning/12 text-warning",
        danger: "bg-destructive/10 text-destructive",
        info: "bg-accent text-accent-foreground",
      },
    },
    defaultVariants: {
      tone: "neutral",
    },
  }
);

type StatusBadgeProps = React.ComponentProps<"span"> &
  VariantProps<typeof statusBadgeVariants> & {
    icon?: React.ReactNode;
  };

/**
 * Standardized status pill — soft/minimalist tones over Badge's base
 * visual shape. Presentation-only, no state/effects.
 */
export function StatusBadge({
  className,
  tone = "neutral",
  icon,
  children,
  ...props
}: StatusBadgeProps) {
  return (
    <span
      data-slot="status-badge"
      data-tone={tone}
      className={cn(statusBadgeVariants({ tone }), className)}
      {...props}
    >
      {icon}
      {children}
    </span>
  );
}
