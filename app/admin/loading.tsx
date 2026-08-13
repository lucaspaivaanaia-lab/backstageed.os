import { Skeleton } from "@/components/ui/skeleton";
import { TableRowsSkeleton } from "@/components/ui/skeletons";
import { PageShell } from "@/components/layout/page-shell";

/**
 * Loading state for the `/admin` segment — mirrors the page shell width/
 * structure so there's no layout shift once data arrives. No data, no
 * fetch.
 *
 * Deliberately ONE table skeleton, not two: `loading.tsx` at `app/admin/`
 * is Next.js's fallback for every nested Admin route that has none of its
 * own (`/admin/cards`, `/admin/approvals`, `/admin/checklist-templates`,
 * `/admin/editors`, `/admin/shared-knowledge` — only `/admin/clients` has
 * its own), and all of those are single-table screens, so a phantom second
 * table block would regress them.
 */
export default function AdminLoading() {
  return (
    <PageShell width="wide">
      <Skeleton className="mb-section h-8 w-40" />
      <TableRowsSkeleton rows={6} columns={5} />
    </PageShell>
  );
}
