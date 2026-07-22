"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
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
import { requestPasswordReset } from "./actions";

export default function ForgotPasswordPage() {
  const [isPending, startTransition] = useTransition();
  const [emailError, setEmailError] = useState<string | null>(null);
  const [submitted, setSubmitted] = useState(false);

  function handleSubmit(formData: FormData) {
    setEmailError(null);

    const email = String(formData.get("email") ?? "");
    if (!email || !email.includes("@")) {
      setEmailError("E-mail inválido.");
      return;
    }

    startTransition(async () => {
      await requestPasswordReset(formData);
      // Sempre exibir sucesso genérico — nunca revelar se o e-mail existe.
      setSubmitted(true);
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
            <CardTitle>Esqueceu sua senha?</CardTitle>
            <CardDescription>
              Informe seu e-mail para receber um link de redefinição.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {submitted ? (
              <p className="text-sm text-muted-foreground">
                Se existir uma conta com esse e-mail, enviamos um link para
                redefinir a senha.
              </p>
            ) : (
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
                <Button type="submit" disabled={isPending} className="w-full">
                  {isPending ? "Enviando..." : "Enviar link de recuperação"}
                </Button>
              </form>
            )}
            <Link
              href="/login"
              className="mt-4 block text-center text-sm text-muted-foreground hover:underline"
            >
              Voltar para o login
            </Link>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
