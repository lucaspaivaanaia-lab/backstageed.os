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
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { ErrorBox } from "@/components/ui/error-box";
import { changePassword } from "./actions";

/**
 * Forced first-login password-change screen (AUTH-10). Reachable via the
 * EXISTING 05-01 middleware.ts must_change_password redirect — this plan
 * does not edit middleware.ts, only provides the screen + action that
 * satisfy and clear that gate (D-09).
 */
export default function ChangePasswordPage() {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [passwordError, setPasswordError] = useState<string | null>(null);
  const [confirmError, setConfirmError] = useState<string | null>(null);
  const [serverError, setServerError] = useState<string | null>(null);

  function handleSubmit(formData: FormData) {
    setPasswordError(null);
    setConfirmError(null);
    setServerError(null);

    const password = String(formData.get("password") ?? "");
    const confirmPassword = String(formData.get("confirmPassword") ?? "");

    let hasClientError = false;
    if (!password || password.length < 8) {
      setPasswordError("A senha deve ter no mínimo 8 caracteres.");
      hasClientError = true;
    }
    if (password !== confirmPassword) {
      setConfirmError("As senhas não coincidem.");
      hasClientError = true;
    }
    if (hasClientError) return;

    startTransition(async () => {
      const result = await changePassword(formData);
      if ("error" in result) {
        setServerError(result.error);
        return;
      }
      toast.success("Senha alterada com sucesso.");
      router.push("/");
    });
  }

  return (
    <div className="flex flex-1 items-center justify-center p-4">
      <Card className="w-full max-w-sm">
        <CardHeader>
          <CardTitle>Defina sua nova senha</CardTitle>
          <CardDescription>
            Por segurança, você precisa criar uma nova senha antes de
            continuar.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form action={handleSubmit} className="flex flex-col gap-4">
            <div className="flex flex-col gap-2">
              <Label htmlFor="password">Nova senha</Label>
              <Input
                id="password"
                name="password"
                type="password"
                autoComplete="new-password"
                required
                disabled={isPending}
                aria-invalid={passwordError ? true : undefined}
              />
              {passwordError ? (
                <p className="text-meta text-destructive">{passwordError}</p>
              ) : null}
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="confirmPassword">Confirmar nova senha</Label>
              <Input
                id="confirmPassword"
                name="confirmPassword"
                type="password"
                autoComplete="new-password"
                required
                disabled={isPending}
                aria-invalid={confirmError ? true : undefined}
              />
              {confirmError ? (
                <p className="text-meta text-destructive">{confirmError}</p>
              ) : null}
            </div>
            {serverError ? <ErrorBox>{serverError}</ErrorBox> : null}
            <Button type="submit" disabled={isPending} className="w-full">
              {isPending ? "Salvando..." : "Salvar nova senha"}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
