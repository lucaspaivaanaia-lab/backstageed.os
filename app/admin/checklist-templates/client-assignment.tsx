"use client";

import { useState, useTransition } from "react";

import { assignTemplateToClient } from "@/lib/actions/checklist-templates";
import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
} from "@/components/ui/table";
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from "@/components/ui/select";
import { ErrorBox } from "@/components/ui/error-box";

const NONE_VALUE = "none";

type ClientRow = {
  id: string;
  name: string;
  checklist_template_id: string | null;
};

type TemplateOption = {
  id: string;
  name: string;
};

type ClientAssignmentProps = {
  clients: ClientRow[];
  templates: TemplateOption[];
};

/**
 * Per-client checklist-template assignment (CHK-02, D-03: strict 1:1 — one
 * template per client, never multi-select). Each row is an independent
 * Select; Radix's `SelectItem` cannot carry an empty-string `value`, so the
 * "Nenhum" ("unassign") option uses the `NONE_VALUE` sentinel, mapped back
 * to `null` before calling the Server Action.
 */
export function ClientAssignment({ clients, templates }: ClientAssignmentProps) {
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Cliente</TableHead>
          <TableHead>Checklist</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {clients.map((client) => (
          <ClientAssignmentRow
            key={client.id}
            client={client}
            templates={templates}
          />
        ))}
      </TableBody>
    </Table>
  );
}

type ClientAssignmentRowProps = {
  client: ClientRow;
  templates: TemplateOption[];
};

function ClientAssignmentRow({ client, templates }: ClientAssignmentRowProps) {
  const [isPending, startTransition] = useTransition();
  const [value, setValue] = useState(client.checklist_template_id ?? NONE_VALUE);
  const [error, setError] = useState<string | null>(null);

  function handleChange(nextValue: string) {
    setValue(nextValue);
    setError(null);
    startTransition(async () => {
      const result = await assignTemplateToClient({
        clientId: client.id,
        templateId: nextValue === NONE_VALUE ? null : nextValue,
      });
      if (result.error) {
        setError(result.error);
      }
    });
  }

  return (
    <TableRow>
      <TableCell className="font-medium">{client.name}</TableCell>
      <TableCell>
        <div className="flex flex-col gap-1">
          <Select value={value} onValueChange={handleChange} disabled={isPending}>
            <SelectTrigger className="w-[220px]">
              <SelectValue placeholder="Nenhum checklist" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={NONE_VALUE}>Nenhum</SelectItem>
              {templates.map((template) => (
                <SelectItem key={template.id} value={template.id}>
                  {template.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {error ? <ErrorBox className="w-fit">{error}</ErrorBox> : null}
        </div>
      </TableCell>
    </TableRow>
  );
}
