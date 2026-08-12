import { PageShell, PageTitle } from "@/components/layout/page-shell";
import { EditorAccessPanel } from "@/components/editors/editor-access-panel";

export default function AdminEditorsPage() {
  return (
    <PageShell width="narrow">
      <PageTitle>Editores</PageTitle>
      <EditorAccessPanel />
    </PageShell>
  );
}
