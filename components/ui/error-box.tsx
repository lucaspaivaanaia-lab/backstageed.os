import type { ReactNode } from "react";
import { AlertCircleIcon } from "lucide-react";

import { cn } from "@/lib/utils";

type ErrorBoxProps = {
  children: ReactNode;
  action?: ReactNode;
  className?: string;
};

/**
 * Shared error container — replaces the repeated inline
 * `rounded-md bg-destructive/10 p-3 text-sm text-destructive` markup.
 * Presentation-only, no state.
 */
export function ErrorBox({ children, action, className }: ErrorBoxProps) {
  return (
    <div
      role="alert"
      className={cn(
        "flex gap-2 rounded-md border border-destructive/20 bg-destructive/10 p-3 text-body text-destructive",
        className
      )}
    >
      <AlertCircleIcon className="mt-0.5 size-4 shrink-0" />
      <div className="flex flex-col gap-2">
        <div>{children}</div>
        {action}
      </div>
    </div>
  );
}
