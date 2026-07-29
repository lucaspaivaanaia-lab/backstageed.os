import { cn } from "@/lib/utils";
import { Skeleton } from "@/components/ui/skeleton";

type TableRowsSkeletonProps = {
  rows?: number;
  columns?: number;
  className?: string;
};

const COLUMN_WIDTHS = ["w-32", "w-48", "w-24", "w-20", "w-16"];

/**
 * Loading placeholder that mimics the density of a data table — a header
 * row plus `rows` body rows, each cell a Skeleton with a width that varies
 * by column. No data, no fetch.
 */
export function TableRowsSkeleton({
  rows = 5,
  columns = 3,
  className,
}: TableRowsSkeletonProps) {
  const cols = Array.from({ length: columns });

  return (
    <div className={cn("flex flex-col", className)}>
      <div className="flex items-center gap-4 border-b py-3">
        {cols.map((_, i) => (
          <Skeleton
            key={i}
            className={cn("h-4", COLUMN_WIDTHS[i % COLUMN_WIDTHS.length])}
          />
        ))}
      </div>
      {Array.from({ length: rows }).map((_, rowIndex) => (
        <div
          key={rowIndex}
          className="flex items-center gap-4 border-b py-3 last:border-b-0"
        >
          {cols.map((_, colIndex) => (
            <Skeleton
              key={colIndex}
              className={cn(
                "h-4",
                COLUMN_WIDTHS[colIndex % COLUMN_WIDTHS.length]
              )}
            />
          ))}
        </div>
      ))}
    </div>
  );
}

type CardSkeletonProps = {
  lines?: number;
  className?: string;
};

const LINE_WIDTHS = ["w-full", "w-5/6", "w-4/6", "w-3/6", "w-2/6"];

/**
 * Loading placeholder for a DataCard-shaped block — title + `lines` body
 * lines of decreasing width. No data, no fetch.
 */
export function CardSkeleton({ lines = 3, className }: CardSkeletonProps) {
  return (
    <div className={cn("rounded-lg border p-6", className)}>
      <Skeleton className="mb-4 h-5 w-40" />
      <div className="flex flex-col gap-2">
        {Array.from({ length: lines }).map((_, i) => (
          <Skeleton
            key={i}
            className={cn("h-4", LINE_WIDTHS[i % LINE_WIDTHS.length])}
          />
        ))}
      </div>
    </div>
  );
}
