"use client";

import { useState, useTransition } from "react";
import { useForm, useFieldArray } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";
import { PlusIcon, XIcon } from "lucide-react";

import {
  checklistTemplateSchema,
  type ChecklistTemplateInput,
} from "@/lib/validation/checklist";
import {
  createTemplate,
  updateTemplate,
} from "@/lib/actions/checklist-templates";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ErrorBox } from "@/components/ui/error-box";
import {
  Form,
  FormField,
  FormItem,
  FormLabel,
  FormControl,
  FormMessage,
} from "@/components/ui/form";
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

type TemplateFormProps = {
  mode: "create" | "edit";
  templateId?: string;
  defaultValues?: ChecklistTemplateInput;
  onSuccess: () => void;
};

/**
 * Create/edit form for a checklist template: name input + an ordered,
 * add/remove item list (no drag-to-reorder — D-05's no-DnD stance applies
 * project-wide). Reused as-is by both the "Criar checklist" trigger and
 * each row's edit action (03-01-PLAN.md Task 3).
 */
export function TemplateForm({
  mode,
  templateId,
  defaultValues,
  onSuccess,
}: TemplateFormProps) {
  const [isPending, startTransition] = useTransition();
  const [serverError, setServerError] = useState<string | null>(null);

  const form = useForm<ChecklistTemplateInput>({
    resolver: zodResolver(checklistTemplateSchema),
    defaultValues: defaultValues ?? { name: "", items: [{ label: "" }] },
  });

  const { fields, append, remove } = useFieldArray({
    control: form.control,
    name: "items",
  });

  function onSubmit(values: ChecklistTemplateInput) {
    setServerError(null);
    startTransition(async () => {
      const result =
        mode === "create"
          ? await createTemplate(values)
          : await updateTemplate(templateId as string, values);

      if ("error" in result && result.error) {
        setServerError(result.error);
        return;
      }

      if (mode === "create") {
        toast.success("Checklist criado.");
      }
      onSuccess();
    });
  }

  return (
    <Form {...form}>
      <form
        onSubmit={form.handleSubmit(onSubmit)}
        className="flex flex-col gap-4"
      >
        <FormField
          control={form.control}
          name="name"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Nome</FormLabel>
              <FormControl>
                <Input {...field} disabled={isPending} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <div className="flex flex-col gap-2">
          <FormLabel>Itens</FormLabel>
          {fields.map((fieldItem, index) => (
            <div key={fieldItem.id} className="flex items-start gap-2">
              <FormField
                control={form.control}
                name={`items.${index}.label`}
                render={({ field }) => (
                  <FormItem className="flex-1">
                    <FormControl>
                      <Input {...field} disabled={isPending} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button
                    type="button"
                    variant="outline"
                    size="icon"
                    disabled={isPending}
                    aria-label="Remover item"
                  >
                    <XIcon className="size-4" />
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>Remover item</AlertDialogTitle>
                    <AlertDialogDescription>
                      Este item será removido do checklist. Cards já em revisão interna não são afetados (o checklist deles já foi copiado).
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>Cancelar</AlertDialogCancel>
                    <AlertDialogAction
                      variant="destructive"
                      onClick={() => remove(index)}
                    >
                      Remover
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            </div>
          ))}
          {typeof form.formState.errors.items?.message === "string" ? (
            <p className="text-body text-destructive">
              {form.formState.errors.items.message}
            </p>
          ) : null}
          <Button
            type="button"
            variant="outline"
            className="w-fit"
            disabled={isPending}
            onClick={() => append({ label: "" })}
          >
            <PlusIcon className="size-4" />
            Adicionar item
          </Button>
        </div>

        {serverError ? <ErrorBox>{serverError}</ErrorBox> : null}

        <Button type="submit" disabled={isPending} className="w-fit">
          {isPending ? "Salvando..." : "Salvar"}
        </Button>
      </form>
    </Form>
  );
}
