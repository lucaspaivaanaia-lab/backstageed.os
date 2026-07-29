import { Skeleton } from "@/components/ui/skeleton";
import { TableRowsSkeleton } from "@/components/ui/skeletons";
import { PageShell } from "@/components/layout/page-shell";

/**
 * Loading state for /pm/clients — mirrors the page shell width/structure
 * so there's no layout shift once data arrives. No data, no fetch.
 */
export default function PmClientsLoading() {
  return (
    <PageShell width="wide">
      <Skeleton className="mb-section h-8 w-40" />
      <TableRowsSkeleton rows={5} columns={3} />
    </PageShell>
  );
}
