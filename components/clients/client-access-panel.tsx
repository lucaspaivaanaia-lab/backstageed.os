"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { createClientLogin } from "@/app/pm/clients/[id]/access/actions";

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
 * senha não será mostrada novamente."
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

  return (
    <div className="flex flex-col gap-6">
      {!activeUserId ? (
        <Card>
          <CardHeader>
            <CardTitle>Criar acesso do cliente</CardTitle>
            <CardDescription>
              Crie o login do cliente com uma senha provisória gerada pelo
              sistema.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form
              action={handleCreateSubmit}
              className="flex flex-col gap-4"
            >
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
                  <p className="text-sm text-destructive">{emailError}</p>
                ) : null}
              </div>
              {createServerError ? (
                <p className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">
                  {createServerError}
                </p>
              ) : null}
              <Button
                type="submit"
                disabled={isCreatePending}
                className="w-fit"
              >
                {isCreatePending ? "Criando..." : "Criar acesso do cliente"}
              </Button>
            </form>
          </CardContent>
        </Card>
      ) : null}

      {createdPassword ? (
        <Card>
          <CardHeader>
            <CardTitle>Senha provisória</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm">
              Senha provisória:{" "}
              <code className="rounded bg-muted px-1.5 py-0.5 font-mono">
                {createdPassword}
              </code>{" "}
              — anote e compartilhe com o cliente com segurança. Esta senha
              não será mostrada novamente.
            </p>
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}
