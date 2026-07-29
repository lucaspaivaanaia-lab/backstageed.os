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
import { ErrorBox } from "@/components/ui/error-box";
import { signUp } from "./actions";

export default function SignupPage() {
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
    if (!password || password.length < 8) {
      setPasswordError("A senha deve ter no mínimo 8 caracteres.");
      hasClientError = true;
    }
    if (hasClientError) return;

    startTransition(async () => {
      const result = await signUp(formData);
      if ("error" in result) {
        setServerError(result.error);
        return;
      }
      router.push("/pending");
    });
  }

  return (
    <div className="flex flex-1 items-center justify-center p-4">
      <Card className="w-full max-w-sm">
        <CardHeader>
          <CardTitle>Criar conta</CardTitle>
          <CardDescription>
            Cadastre-se para produzir conteúdo na plataforma.
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
                <p className="text-meta text-destructive">{emailError}</p>
              ) : null}
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="password">Senha</Label>
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
            {serverError ? <ErrorBox>{serverError}</ErrorBox> : null}
            <Button type="submit" disabled={isPending} className="w-full">
              {isPending ? "Criando conta..." : "Criar conta"}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
