"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import {
  generateChecklistFromFiles,
  assignTemplateToClient,
  type ClientChecklistSummary,
} from "@/lib/actions/checklist-templates";
import type { ChecklistTemplateInput } from "@/lib/validation/checklist";
import { TemplateForm } from "@/app/admin/checklist-templates/template-form";
import { Button } from "@/components/ui/button";
import { DataCard } from "@/components/ui/data-card";
import { ErrorBox } from "@/components/ui/error-box";
import { EmptyState } from "@/components/layout/page-shell";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

type ClientChecklistSectionProps = {
  clientId: string;
  currentTemplate: ClientChecklistSummary | null;
};

/**
 * "Checklist de revisão" section (P0 pivot 2026-08-04, item 1). Admin-only
 * — gated by the caller (client-detail-form.tsx renders this only when
 * `viewerIsAdmin`), matching CHK-01/CHK-02's existing admin-only
 * authorization model for checklist management.
 *
 * "Gerar/Atualizar checklist com IA" calls generateChecklistFromFiles
 * (lib/actions/checklist-templates.ts), which re-reads this client's
 * CURRENT client_files every time — re-runnable at will when the base
 * file changes, no "has it changed" tracking needed here. The proposal is
 * never auto-saved: it opens inside the SAME `TemplateForm` the standalone
 * /admin/checklist-templates screen uses, pre-filled, so the Admin
 * reviews/edits every item before `createTemplate`/`updateTemplate`
 * actually persists it.
 */
export function ClientChecklistSection({
  clientId,
  currentTemplate,
}: ClientChecklistSectionProps) {
  const [template, setTemplate] = useState(currentTemplate);
  const [proposal, setProposal] = useState<ChecklistTemplateInput | null>(
    null
  );
  const [dialogOpen, setDialogOpen] = useState(false);
  const [isGenerating, startGenerateTransition] = useTransition();
  const [generateError, setGenerateError] = useState<string | null>(null);

  function handleGenerate() {
    setGenerateError(null);
    startGenerateTransition(async () => {
      const result = await generateChecklistFromFiles(clientId);
      if ("error" in result) {
        setGenerateError(result.error);
        return;
      }
      setProposal(result.proposal);
      setDialogOpen(true);
    });
  }

  function handleSaved(templateId: string) {
    setDialogOpen(false);
    const savedProposal = proposal;
    setProposal(null);

    // A client with no template yet: createTemplate only creates the row,
    // it never assigns it — that explicit second step happens here. A
    // client that already had one: updateTemplate edited it in place
    // (same id, echoed back by TemplateForm's onSuccess), so no new
    // assignment call is needed.
    if (!template) {
      startGenerateTransition(async () => {
        const assignResult = await assignTemplateToClient({
          clientId,
          templateId,
        });
        if (assignResult.error) {
          toast.error(assignResult.error);
          return;
        }
        toast.success("Checklist gerado e atribuído a este cliente.");
      });
    } else {
      toast.success("Checklist atualizado.");
    }

    // Optimistic local refresh of the summary below the button — the name
    // and item count are already known from the just-saved proposal, no
    // server round-trip needed just to redisplay them.
    if (savedProposal) {
      setTemplate({
        id: templateId,
        name: savedProposal.name,
        itemCount: savedProposal.items.length,
      });
    }
  }

  return (
    <DataCard
      title="Checklist de revisão"
      description="Regras que um card precisa cumprir antes de avançar de revisão interna — geradas pela IA a partir dos arquivos deste cliente, revisadas por você antes de salvar."
    >
      <div className="flex flex-col gap-4">
        {template ? (
          <p className="text-body">
            <span className="font-medium">{template.name}</span> —{" "}
            {template.itemCount} {template.itemCount === 1 ? "item" : "itens"}
          </p>
        ) : (
          <EmptyState
            title="Nenhum checklist atribuído"
            description="Gere um checklist com IA a partir dos arquivos deste cliente, ou atribua um checklist existente na tela de Checklists."
          />
        )}

        <Button
          type="button"
          variant="outline"
          onClick={handleGenerate}
          disabled={isGenerating}
          className="w-fit"
        >
          {isGenerating ? "Gerando..." : "Gerar/Atualizar checklist com IA"}
        </Button>
        {generateError ? <ErrorBox>{generateError}</ErrorBox> : null}
      </div>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Revisar checklist gerado pela IA</DialogTitle>
          </DialogHeader>
          {proposal ? (
            <TemplateForm
              mode={template ? "edit" : "create"}
              templateId={template?.id}
              defaultValues={proposal}
              onSuccess={handleSaved}
            />
          ) : null}
        </DialogContent>
      </Dialog>
    </DataCard>
  );
}
