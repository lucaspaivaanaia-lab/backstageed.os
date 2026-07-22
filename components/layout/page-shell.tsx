import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

type PageShellWidth = "default" | "wide" | "narrow";

const WIDTH_CLASSES: Record<PageShellWidth, string> = {
  default: "max-w-3xl",
  wide: "max-w-4xl",
  narrow: "max-w-xl",
};

type PageShellProps = {
  children: ReactNode;
  className?: string;
  width?: PageShellWidth;
};

/**
 * Shared page container — a single fixed set of widths so screens pick from
 * this instead of inventing arbitrary max-w-* values inline.
 */
export function PageShell({
  children,
  className,
  width = "default",
}: PageShellProps) {
  return (
    <div
      className={cn(
        "mx-auto w-full px-6 py-8",
        WIDTH_CLASSES[width],
        className
      )}
    >
      {children}
    </div>
  );
}

type PageTitleProps = {
  children: ReactNode;
  className?: string;
  action?: ReactNode;
};

/**
 * Standardized page heading — replaces the repeated inline
 * `text-[28px] font-semibold leading-[1.2]` h1, with an optional action
 * slot (e.g. a "Criar cliente" button) rendered to the right.
 */
export function PageTitle({ children, className, action }: PageTitleProps) {
  if (action) {
    return (
      <div className="mb-8 flex items-center justify-between gap-4">
        <h1
          className={cn(
            "text-[28px] font-semibold leading-[1.2] tracking-tight",
            className
          )}
        >
          {children}
        </h1>
        {action}
      </div>
    );
  }

  return (
    <h1
      className={cn(
        "mb-8 text-[28px] font-semibold leading-[1.2] tracking-tight",
        className
      )}
    >
      {children}
    </h1>
  );
}

type SectionTitleProps = {
  children: ReactNode;
  className?: string;
};

/**
 * Standardized section heading — replaces the repeated inline
 * `text-xl font-semibold leading-[1.2]` h2.
 */
export function SectionTitle({ children, className }: SectionTitleProps) {
  return (
    <h2 className={cn("text-xl font-semibold leading-[1.2]", className)}>
      {children}
    </h2>
  );
}

type EmptyStateProps = {
  title: string;
  description: ReactNode;
  action?: ReactNode;
  className?: string;
};

/**
 * Standardized empty-state block — replaces the repeated inline
 * `flex flex-col items-center gap-2 py-12 text-center` + h2 + muted p
 * pattern.
 */
export function EmptyState({
  title,
  description,
  action,
  className,
}: EmptyStateProps) {
  return (
    <div
      className={cn(
        "flex flex-col items-center gap-3 py-12 text-center",
        className
      )}
    >
      <div className="flex flex-col gap-2">
        <SectionTitle>{title}</SectionTitle>
        <div className="text-sm text-muted-foreground">{description}</div>
      </div>
      {action}
    </div>
  );
}
