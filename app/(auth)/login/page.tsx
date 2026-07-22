"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
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
import { signIn } from "./actions";

export default function LoginPage() {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [emailError, setEmailError] = useState<string | null>(null);
  const [passwordError, setPasswordError] = useState<string | null>(null);
  const [serverError, setServerError] = useState<string | null>(null);

  function handleSubmit(formData: FormData) {
    setEmailError(null);
    setPasswordError(null);
    setServerError(null);

    const email = String(formData.get("email") ?? "");
    const password = String(formData.get("password") ?? "");

    let hasClientError = false;
    if (!email || !email.includes("@")) {
      setEmailError("E-mail inválido.");
      hasClientError = true;
    }
    if (!password) {
      setPasswordError("Senha é obrigatória.");
      hasClientError = true;
    }
    if (hasClientError) return;

    startTransition(async () => {
      const result = await signIn(formData);
      if ("error" in result) {
        setServerError(result.error);
        return;
      }
      router.push("/");
    });
  }

  return (
    <div className="flex flex-1 items-center justify-center p-4">
      <div className="flex w-full max-w-sm flex-col gap-6">
        <div className="flex flex-col items-center gap-1 text-center">
          <span className="text-lg font-semibold tracking-tight text-primary">
            BackstageEd.OS
          </span>
          <p className="text-sm text-muted-foreground">
            Produção e gestão de conteúdo, num só lugar.
          </p>
        </div>
        <Card>
          <CardHeader>
            <CardTitle>Entrar</CardTitle>
            <CardDescription>
              Acesse a plataforma com seu e-mail e senha.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form action={handleSubmit} className="flex flex-col gap-4">
              <div className="flex flex-col gap-2">
                <Label htmlFor="email">E-mail</Label>
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
                  <p className="text-sm text-destructive">{emailError}</p>
                ) : null}
              </div>
              <div className="flex flex-col gap-2">
                <Label htmlFor="password">Senha</Label>
                <Input
                  id="password"
                  name="password"
                  type="password"
                  autoComplete="current-password"
                  required
                  disabled={isPending}
                  aria-invalid={passwordError ? true : undefined}
                />
                {passwordError ? (
                  <p className="text-sm text-destructive">{passwordError}</p>
                ) : null}
              </div>
              {serverError ? (
                <p className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">
                  {serverError}
                </p>
              ) : null}
              <Button type="submit" disabled={isPending} className="w-full">
                {isPending ? "Entrando..." : "Entrar"}
              </Button>
            </form>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
