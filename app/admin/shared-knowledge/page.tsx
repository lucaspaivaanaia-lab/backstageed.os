import { listSharedKnowledgeFiles } from "@/lib/actions/shared-knowledge";
import { PageShell, PageTitle } from "@/components/layout/page-shell";
import { SharedKnowledgeSection } from "@/components/admin/shared-knowledge-section";

/**
 * Admin-only "base de conhecimento comum" screen (quick task 260811-imw,
 * item 9 do plano de acao de 2026-08-05). `listSharedKnowledgeFiles()` is
 * itself admin-gated (returns `[]` for any unauthorized caller), and
 * `middleware.ts` already blocks non-admin roles from `/admin/*` — this
 * page adds no extra authorization logic of its own, matching every other
 * Admin Server Component page in this codebase.
 */
export default async function SharedKnowledgePage() {
  const files = await listSharedKnowledgeFiles();

  return (
    <PageShell>
      <PageTitle>Base de conhecimento</PageTitle>
      <SharedKnowledgeSection initialFiles={files} />
    </PageShell>
  );
}
