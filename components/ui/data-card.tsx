import type { ReactNode } from "react";

import { cn } from "@/lib/utils";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
} from "@/components/ui/card";

type DataCardProps = {
  title: ReactNode;
  description?: ReactNode;
  badge?: ReactNode;
  meta?: ReactNode;
  actions?: ReactNode;
  children?: ReactNode;
  className?: string;
};

/**
 * General-purpose card with generic slots (title, badge, meta, actions).
 * Reusable visual base for list/grid screens — per D-02, this stays
 * production-board-agnostic (no drag/drop, no board-position props). The
 * production-board-specific card design belongs to Phase 3's own
 * discuss-phase.
 */
export function DataCard({
  title,
  description,
  badge,
  meta,
  actions,
  children,
  className,
}: DataCardProps) {
  return (
    <Card className={cn(className)}>
      <CardHeader>
        <div className="flex items-center justify-between gap-2">
          <div className="text-title font-semibold">{title}</div>
          {badge}
        </div>
        {description && <CardDescription>{description}</CardDescription>}
        {meta && <div className="text-meta text-muted-foreground">{meta}</div>}
      </CardHeader>
      {children && <CardContent>{children}</CardContent>}
      {actions && <CardFooter>{actions}</CardFooter>}
    </Card>
  );
}
