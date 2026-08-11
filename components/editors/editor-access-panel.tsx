"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { DataCard } from "@/components/ui/data-card";
import { ErrorBox } from "@/components/ui/error-box";
import { createEditorLogin } from "@/app/pm/editors/actions";

/**
 * Shared create-Editor-login panel (item 3, 260811-oe0-CONTEXT.md),
 * rendered by BOTH app/pm/editors/page.tsx and its Admin mirror
 * (app/admin/editors/page.tsx) -- mirrors ClientAccessPanel's structure
 * (components/clients/client-access-panel.tsx), simplified: unlike a
 * Client login, an Editor has no "one active login" constraint and no
 * clientId-scoped deactivate control here -- multiple Editors can be
 * created, one submission at a time, each rendering its own one-time
 * password callout.
 */
export function EditorAccessPanel() {
  const [isPending, startTransition] = useTransition();
  const [emailError, setEmailError] = useState<string | null>(null);
  const [serverError, setServerError] = useState<string | null>(null);
  const [created, setCreated] = useState<{ email: string; password: string } | null>(
    null
  );

  function handleSubmit(formData: FormData) {
    setEmailError(null);
    setServerError(null);

    const email = String(formData.get("email") ?? "");
    if (!email || !email.includes("@")) {
      setEmailError("E-mail inválido.");
      return;
    }

    startTransition(async () => {
      const result = await createEditorLogin(email);
      if ("error" in result) {
        setServerError(result.error);
        return;
      }
      setCreated({ email, password: result.password });
      toast.success(
        "Acesso do Editor criado. Compartilhe o e-mail e a senha provisória com segurança."
      );
    });
  }

  return (
    <div className="flex flex-col gap-6">
      <DataCard
        title="Criar acesso de Editor"
        description="Crie o login de um Editor com uma senha provisória gerada pelo sistema. O Editor vê apenas os cards onde é o Designer/Mídia."
      >
        <form action={handleSubmit} className="flex flex-col gap-4">
          <div className="flex flex-col gap-2">
            <Label htmlFor="email">E-mail do Editor</Label>
            <Input
              id="email"
              name="email"
              type="email"
              autoComplete="email"
              required
              disabled={isPending}
              aria-invalid={emailError ? true : undefined}
            />
            {emailError ? (
              <p className="text-meta text-destructive">{emailError}</p>
            ) : null}
          </div>
          {serverError ? <ErrorBox>{serverError}</ErrorBox> : null}
          <Button type="submit" disabled={isPending} className="w-fit">
            {isPending ? "Criando..." : "Criar acesso de Editor"}
          </Button>
        </form>
      </DataCard>

      {created ? (
        <DataCard title="Senha provisória" className="border-primary/30">
          <p className="text-sm leading-relaxed">
            Editor:{" "}
            <code className="rounded bg-muted px-1.5 py-0.5 font-mono">
              {created.email}
            </code>
            <br />
            Senha provisória:{" "}
            <code className="rounded bg-muted px-1.5 py-0.5 font-mono">
              {created.password}
            </code>{" "}
            — anote e compartilhe com o Editor com segurança. Esta senha não
            será mostrada novamente.
          </p>
        </DataCard>
      ) : null}
    </div>
  );
}
