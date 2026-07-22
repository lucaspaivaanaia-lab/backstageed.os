"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { XIcon } from "lucide-react";
import {
  clientCreateSchema,
  type ClientCreateInput,
} from "@/lib/validation/clients";
import { createClientRecord } from "@/lib/actions/clients";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Form,
  FormField,
  FormItem,
  FormLabel,
  FormControl,
  FormMessage,
} from "@/components/ui/form";
import {
  Dialog,
  DialogTrigger,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";

type PmRosterEntry = { id: string; email: string };

type ClientCreateFormProps = {
  pmRoster: PmRosterEntry[];
  currentUserId: string;
  basePath: string;
};

/**
 * Shared client creation form (Admin + PM route wrappers below pass
 * `basePath` so this component never hardcodes a role root). Performs no
 * data fetching itself — `pmRoster` is fetched server-side by the caller.
 */
export function ClientCreateForm({
  pmRoster,
  currentUserId,
  basePath,
}: ClientCreateFormProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [serverError, setServerError] = useState<string | null>(null);
  const [pickerOpen, setPickerOpen] = useState(false);

  const form = useForm<ClientCreateInput>({
    resolver: zodResolver(clientCreateSchema),
    defaultValues: { name: "", pmIds: [currentUserId] },
  });

  function onSubmit(values: ClientCreateInput) {
    setServerError(null);

    const formData = new FormData();
    formData.append("name", values.name);
    for (const id of values.pmIds) {
      formData.append("pmIds", id);
    }

    startTransition(async () => {
      const result = await createClientRecord(formData);
      if ("error" in result) {
        setServerError(result.error);
        return;
      }
      router.push(`${basePath}/${result.clientId}`);
    });
  }

  const selectedPmIds = form.watch("pmIds");

  function togglePm(pmId: string, checked: boolean) {
    const current = form.getValues("pmIds");
    if (checked) {
      form.setValue("pmIds", Array.from(new Set([...current, pmId])));
    } else {
      form.setValue(
        "pmIds",
        current.filter((id) => id !== pmId)
      );
    }
  }

  function removePm(pmId: string) {
    const current = form.getValues("pmIds");
    form.setValue(
      "pmIds",
      current.filter((id) => id !== pmId)
    );
  }

  return (
    <Form {...form}>
      <form
        onSubmit={form.handleSubmit(onSubmit)}
        className="flex flex-col gap-6"
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

        <div className="flex flex-col gap-3">
          <FormLabel>PMs atribuídos</FormLabel>
          <div>
            <Dialog open={pickerOpen} onOpenChange={setPickerOpen}>
              <DialogTrigger asChild>
                <Button type="button" variant="outline" disabled={isPending}>
                  Adicionar PM
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Selecionar PMs</DialogTitle>
                </DialogHeader>
                <div className="flex flex-col gap-3">
                  {pmRoster.map((pm) => (
                    <label
                      key={pm.id}
                      className="flex items-center gap-2 text-sm"
                    >
                      <Checkbox
                        checked={selectedPmIds.includes(pm.id)}
                        onCheckedChange={(checked) =>
                          togglePm(pm.id, checked === true)
                        }
                      />
                      {pm.email}
                    </label>
                  ))}
                </div>
                <DialogFooter>
                  <Button type="button" onClick={() => setPickerOpen(false)}>
                    Concluir
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          </div>
          {selectedPmIds.length > 0 ? (
            <div className="flex flex-wrap gap-2">
              {selectedPmIds.map((pmId) => {
                const email =
                  pmRoster.find((pm) => pm.id === pmId)?.email ?? pmId;
                return (
                  <Badge key={pmId} variant="secondary" className="gap-1">
                    {email}
                    <button
                      type="button"
                      aria-label={`Remover ${email}`}
                      onClick={() => removePm(pmId)}
                      disabled={isPending}
                      className="ml-1"
                    >
                      <XIcon className="size-3" />
                    </button>
                  </Badge>
                );
              })}
            </div>
          ) : null}
        </div>

        {serverError ? (
          <p className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">
            {serverError}
          </p>
        ) : null}

        <Button type="submit" disabled={isPending} className="w-full">
          {isPending ? "Criando..." : "Criar cliente"}
        </Button>
      </form>
    </Form>
  );
}
