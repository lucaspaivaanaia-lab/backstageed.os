"use client";

import { useState, useTransition } from "react";
import { PlusIcon } from "lucide-react";

import { deleteTemplate } from "@/lib/actions/checklist-templates";
import { Button } from "@/components/ui/button";
import { ErrorBox } from "@/components/ui/error-box";
import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
} from "@/components/ui/table";
import {
  Dialog,
  DialogTrigger,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogTrigger,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogCancel,
  AlertDialogAction,
} from "@/components/ui/alert-dialog";
import { EmptyState } from "@/components/layout/page-shell";
import { TemplateForm } from "@/app/admin/checklist-templates/template-form";

export type TemplateWithItems = {
  id: string;
  name: string;
  created_at: string;
  checklist_template_items: { id: string; label: string; sort_order: number }[];
};

type ClientRow = {
  id: string;
  name: string;
  checklist_template_id: string | null;
};

/**
 * "Criar checklist" trigger + Dialog, reused both as the PageTitle action
 * slot and as the EmptyState action — same TemplateForm underneath, per
 * 03-01-PLAN.md Task 3.
 */
export function CreateTemplateButton() {
  const [open, setOpen] = useState(false);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button type="button">
          <PlusIcon className="size-4" />
          Criar checklist
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Criar checklist</DialogTitle>
        </DialogHeader>
        <TemplateForm mode="create" onSuccess={() => setOpen(false)} />
      </DialogContent>
    </Dialog>
  );
}

type TemplateRowActionsProps = {
  template: TemplateWithItems;
};

function TemplateRowActions({ template }: TemplateRowActionsProps) {
  const [editOpen, setEditOpen] = useState(false);
  const [isDeleting, startDeleteTransition] = useTransition();
  const [deleteError, setDeleteError] = useState<string | null>(null);

  function handleDelete() {
    setDeleteError(null);
    startDeleteTransition(async () => {
      const result = await deleteTemplate(template.id);
      if (result.error) {
        setDeleteError(result.error);
      }
    });
  }

  return (
    <div className="flex items-center justify-end gap-2">
      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogTrigger asChild>
          <Button type="button" variant="outline" size="sm">
            Editar
          </Button>
        </DialogTrigger>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Editar checklist</DialogTitle>
          </DialogHeader>
          <TemplateForm
            mode="edit"
            templateId={template.id}
            defaultValues={{
              name: template.name,
              items: template.checklist_template_items.map((item) => ({
                label: item.label,
              })),
            }}
            onSuccess={() => setEditOpen(false)}
          />
        </DialogContent>
      </Dialog>

      <AlertDialog>
        <AlertDialogTrigger asChild>
          <Button
            type="button"
            variant="destructive"
            size="sm"
            disabled={isDeleting}
          >
            Remover
          </Button>
        </AlertDialogTrigger>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remover checklist</AlertDialogTitle>
            <AlertDialogDescription>
              O checklist &quot;{template.name}&quot; será removido
              permanentemente. Clientes atribuídos a ele ficarão sem
              checklist configurado.
            </AlertDialogDescription>
          </AlertDialogHeader>
          {deleteError ? <ErrorBox>{deleteError}</ErrorBox> : null}
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction variant="destructive" onClick={handleDelete}>
              Remover
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

type TemplateListProps = {
  templates: TemplateWithItems[];
  clients: ClientRow[];
};

/**
 * Checklist-template list (CHK-01): Nome / Itens / Clientes / actions.
 * Empty state offers the same "Criar checklist" trigger as the page title.
 */
export function TemplateList({ templates, clients }: TemplateListProps) {
  if (templates.length === 0) {
    return (
      <EmptyState
        title="Nenhum checklist criado ainda"
        description="Crie o primeiro checklist para definir o que precisa ser revisado antes de um card ir para o cliente."
        action={<CreateTemplateButton />}
      />
    );
  }

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Nome</TableHead>
          <TableHead>Itens</TableHead>
          <TableHead>Clientes</TableHead>
          <TableHead>
            <span className="sr-only">Ações</span>
          </TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {templates.map((template) => {
          const assignedClientCount = clients.filter(
            (client) => client.checklist_template_id === template.id
          ).length;

          return (
            <TableRow key={template.id}>
              <TableCell className="font-medium">{template.name}</TableCell>
              <TableCell>{template.checklist_template_items.length}</TableCell>
              <TableCell>{assignedClientCount}</TableCell>
              <TableCell>
                <TemplateRowActions template={template} />
              </TableCell>
            </TableRow>
          );
        })}
      </TableBody>
    </Table>
  );
}
