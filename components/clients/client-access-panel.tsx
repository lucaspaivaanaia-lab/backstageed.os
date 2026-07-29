"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { DataCard } from "@/components/ui/data-card";
import { StatusBadge } from "@/components/ui/status-badge";
import { ErrorBox } from "@/components/ui/error-box";
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
import {
  createClientLogin,
  deactivateClientAccess,
} from "@/app/pm/clients/[id]/access/actions";

type ClientAccessPanelProps = {
  clientId: string;
  existingLoginUserId: string | null;
};

/**
 * Shared create-Client-login panel, rendered by BOTH
 * app/pm/clients/[id]/access/page.tsx and its Admin mirror
 * (app/admin/clients/[id]/access/page.tsx, Task 4) — no forked JSX,
 * following the Phase 1 admin/pm client-detail-form precedent. Imports the
 * role-agnostic createClientLogin Server Action from the PM route's
 * actions.ts (the canonical, non-duplicated implementation).
 *
 * Locked UI-SPEC copy (verbatim): CTA "Criar acesso do cliente"; success
 * toast "Acesso do cliente criado. Compartilhe o e-mail e a senha
 * provisória com segurança."; one-time callout "Senha provisória:
 * `{password}` — anote e compartilhe com o cliente com segurança. Esta
 * senha não será mostrada novamente."; deactivate confirmation
 * "Desativar acesso: O cliente não conseguirá mais fazer login na
 * plataforma até que o acesso seja reativado. Confirmar desativação?"
 * (buttons "Cancelar" / "Desativar acesso"), destructive-styled per
 * UI-SPEC Color.
 */
export function ClientAccessPanel({
  clientId,
  existingLoginUserId,
}: ClientAccessPanelProps) {
  const [isCreatePending, startCreateTransition] = useTransition();
  const [emailError, setEmailError] = useState<string | null>(null);
  const [createServerError, setCreateServerError] = useState<string | null>(
    null
  );
  const [createdPassword, setCreatedPassword] = useState<string | null>(null);
  const [activeUserId, setActiveUserId] = useState<string | null>(
    existingLoginUserId
  );

  const [isDeactivatePending, startDeactivateTransition] = useTransition();
  const [deactivateServerError, setDeactivateServerError] = useState<
    string | null
  >(null);
  const [deactivated, setDeactivated] = useState(false);

  function handleDeactivate() {
    if (!activeUserId) return;
    setDeactivateServerError(null);
    startDeactivateTransition(async () => {
      const result = await deactivateClientAccess(clientId, activeUserId);
      if ("error" in result) {
        setDeactivateServerError(result.error);
        return;
      }
      setDeactivated(true);
    });
  }

  function handleCreateSubmit(formData: FormData) {
    setEmailError(null);
    setCreateServerError(null);

    const email = String(formData.get("email") ?? "");
    if (!email || !email.includes("@")) {
      setEmailError("E-mail inválido.");
      return;
    }

    startCreateTransition(async () => {
      const result = await createClientLogin(clientId, email);
      if ("error" in result) {
        setCreateServerError(result.error);
        return;
      }
      setCreatedPassword(result.password);
      setActiveUserId(result.userId);
      toast.success(
        "Acesso do cliente criado. Compartilhe o e-mail e a senha provisória com segurança."
      );
    });
  }

  if (deactivated) {
    return (
      <DataCard
        title="Acesso desativado"
        description="O cliente não consegue mais fazer login na plataforma."
        badge={<StatusBadge tone="neutral">Desativado</StatusBadge>}
      />
    );
  }

  return (
    <div className="flex flex-col gap-6">
      {!activeUserId ? (
        <DataCard
          title="Criar acesso do cliente"
          description="Crie o login do cliente com uma senha provisória gerada pelo sistema."
        >
          <form action={handleCreateSubmit} className="flex flex-col gap-4">
            <div className="flex flex-col gap-2">
              <Label htmlFor="email">E-mail do cliente</Label>
              <Input
                id="email"
                name="email"
                type="email"
                autoComplete="email"
                required
                disabled={isCreatePending}
                aria-invalid={emailError ? true : undefined}
              />
              {emailError ? (
                <p className="text-meta text-destructive">{emailError}</p>
              ) : null}
            </div>
            {createServerError ? <ErrorBox>{createServerError}</ErrorBox> : null}
            <Button
              type="submit"
              disabled={isCreatePending}
              className="w-fit"
            >
              {isCreatePending ? "Criando..." : "Criar acesso do cliente"}
            </Button>
          </form>
        </DataCard>
      ) : null}

      {createdPassword ? (
        <DataCard title="Senha provisória" className="border-primary/30">
          <p className="text-sm leading-relaxed">
            Senha provisória:{" "}
            <code className="rounded bg-muted px-1.5 py-0.5 font-mono">
              {createdPassword}
            </code>{" "}
            — anote e compartilhe com o cliente com segurança. Esta senha
            não será mostrada novamente.
          </p>
        </DataCard>
      ) : null}

      {activeUserId ? (
        <DataCard
          title="Acesso do cliente"
          description="Este cliente já possui um login ativo."
          badge={<StatusBadge tone="success">Ativo</StatusBadge>}
        >
          <div className="flex flex-col gap-4">
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button
                  type="button"
                  variant="destructive"
                  disabled={isDeactivatePending}
                  className="w-fit"
                >
                  Desativar acesso
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Desativar acesso</AlertDialogTitle>
                  <AlertDialogDescription>
                    Desativar acesso: O cliente não conseguirá mais fazer
                    login na plataforma até que o acesso seja reativado.
                    Confirmar desativação?
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Cancelar</AlertDialogCancel>
                  <AlertDialogAction onClick={handleDeactivate}>
                    Desativar acesso
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
            {deactivateServerError ? (
              <ErrorBox>{deactivateServerError}</ErrorBox>
            ) : null}
          </div>
        </DataCard>
      ) : null}
    </div>
  );
}
