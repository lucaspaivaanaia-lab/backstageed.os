import { Skeleton } from "@/components/ui/skeleton";
import { CardSkeleton } from "@/components/ui/skeletons";
import { PageShell } from "@/components/layout/page-shell";

/**
 * Loading state for /pm/clients/[id] — mirrors the client-detail-form
 * shape (title + DataCard-like blocks) so there's no layout shift once
 * data arrives. No data, no fetch.
 */
export default function ClientDetailLoading() {
  return (
    <PageShell>
      <Skeleton className="mb-section h-8 w-56" />
      <div className="flex flex-col gap-section">
        <CardSkeleton />
        <CardSkeleton />
      </div>
    </PageShell>
  );
}
