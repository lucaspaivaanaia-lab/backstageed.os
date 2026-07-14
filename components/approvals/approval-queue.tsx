"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
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
import { Button } from "@/components/ui/button";
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
import { approveSignup, rejectSignup } from "@/app/admin/approvals/actions";

type Signup = {
  id: string;
  email: string | null;
  created_at: string;
};

type ApprovalQueueProps = {
  signups: Signup[];
};

const dateFormatter = new Intl.DateTimeFormat("pt-BR");

/**
 * Interactive queue: role Select + Aprovar/Rejeitar per row, reject
 * confirmation dialog, success toast, empty state — all copy locked
 * verbatim from 05-UI-SPEC.md.
 */
export function ApprovalQueue({ signups }: ApprovalQueueProps) {
  const router = useRouter();
  const [roleByRow, setRoleByRow] = useState<Record<string, "pm" | "admin">>(
    {}
  );
  const [pendingRowId, setPendingRowId] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  if (signups.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Nenhum cadastro pendente</CardTitle>
        </CardHeader>
        <CardContent>
          <CardDescription className="text-base">
            Não há novos PMs aguardando aprovação no momento. Novos cadastros aparecerão aqui automaticamente.
          </CardDescription>
        </CardContent>
      </Card>
    );
  }

  function handleApprove(signupId: string) {
    const role = roleByRow[signupId] ?? "pm";
    setPendingRowId(signupId);
    startTransition(async () => {
      const result = await approveSignup(signupId, role);
      setPendingRowId(null);
      if (result.error) {
        toast.error(result.error);
        return;
      }
      toast.success("PM aprovado com sucesso.");
      router.refresh();
    });
  }

  function handleReject(signupId: string) {
    setPendingRowId(signupId);
    startTransition(async () => {
      const result = await rejectSignup(signupId);
      setPendingRowId(null);
      if (result.error) {
        toast.error(result.error);
        return;
      }
      router.refresh();
    });
  }

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Email</TableHead>
          <TableHead>Data de cadastro</TableHead>
          <TableHead>Papel</TableHead>
          <TableHead>Ações</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {signups.map((signup) => {
          const rowPending = isPending && pendingRowId === signup.id;
          const selectedRole = roleByRow[signup.id] ?? "pm";

          return (
            <TableRow key={signup.id}>
              <TableCell>{signup.email}</TableCell>
              <TableCell>
                {dateFormatter.format(new Date(signup.created_at))}
              </TableCell>
              <TableCell>
                <Select
                  value={selectedRole}
                  onValueChange={(value) =>
                    setRoleByRow((prev) => ({
                      ...prev,
                      [signup.id]: value as "pm" | "admin",
                    }))
                  }
                  disabled={rowPending}
                >
                  <SelectTrigger className="w-[120px]">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="pm">PM</SelectItem>
                    <SelectItem value="admin">Admin</SelectItem>
                  </SelectContent>
                </Select>
              </TableCell>
              <TableCell className="flex gap-2">
                <Button
                  size="sm"
                  disabled={rowPending}
                  onClick={() => handleApprove(signup.id)}
                >
                  Aprovar
                </Button>
                <AlertDialog>
                  <AlertDialogTrigger asChild>
                    <Button size="sm" variant="destructive" disabled={rowPending}>
                      Rejeitar
                    </Button>
                  </AlertDialogTrigger>
                  <AlertDialogContent>
                    <AlertDialogHeader>
                      <AlertDialogTitle>Rejeitar cadastro</AlertDialogTitle>
                      <AlertDialogDescription>
                        Rejeitar cadastro: Esta conta será marcada como rejeitada e o usuário não terá acesso à plataforma. Você pode reverter isso depois, se necessário. Confirmar rejeição?
                      </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel>Cancelar</AlertDialogCancel>
                      <AlertDialogAction
                        onClick={() => handleReject(signup.id)}
                      >
                        Rejeitar cadastro
                      </AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
              </TableCell>
            </TableRow>
          );
        })}
      </TableBody>
    </Table>
  );
}
