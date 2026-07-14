import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

export default function RejectedPage() {
  return (
    <div className="flex flex-1 items-center justify-center p-4">
      <Card className="w-full max-w-sm text-center">
        <CardHeader>
          <CardTitle>Acesso não liberado</CardTitle>
        </CardHeader>
        <CardContent>
          <CardDescription className="text-base">
            Seu cadastro não foi aprovado. Entre em contato com o administrador para mais informações.
          </CardDescription>
        </CardContent>
      </Card>
    </div>
  );
}
