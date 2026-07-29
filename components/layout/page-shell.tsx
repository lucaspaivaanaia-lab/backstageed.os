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
        "mx-auto w-full px-page py-page",
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
      <div className="mb-section flex items-center justify-between gap-4">
        <h1 className={cn("text-display font-semibold", className)}>
          {children}
        </h1>
        {action}
      </div>
    );
  }

  return (
    <h1 className={cn("mb-section text-display font-semibold", className)}>
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
    <h2 className={cn("text-title font-semibold", className)}>{children}</h2>
  );
}

type EmptyStateProps = {
  title: string;
  description: ReactNode;
  action?: ReactNode;
  icon?: ReactNode;
  className?: string;
};

/**
 * Standardized empty-state block — replaces the repeated inline
 * `flex flex-col items-center gap-2 py-12 text-center` + h2 + muted p
 * pattern. Optional `icon` slot renders above the title inside a discreet
 * circular container; layout is unchanged when `icon` is omitted.
 */
export function EmptyState({
  title,
  description,
  action,
  icon,
  className,
}: EmptyStateProps) {
  return (
    <div
      className={cn(
        "flex flex-col items-center gap-3 py-12 text-center",
        className
      )}
    >
      {icon && (
        <div className="flex size-10 items-center justify-center rounded-full bg-muted text-muted-foreground">
          {icon}
        </div>
      )}
      <div className="flex flex-col gap-2">
        <SectionTitle>{title}</SectionTitle>
        <div className="text-sm text-muted-foreground">{description}</div>
      </div>
      {action}
    </div>
  );
}
