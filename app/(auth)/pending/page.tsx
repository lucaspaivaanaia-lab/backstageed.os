import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

export default function PendingPage() {
  return (
    <div className="flex flex-1 items-center justify-center p-4">
      <Card className="w-full max-w-sm text-center">
        <CardHeader>
          <CardTitle>Cadastro pendente</CardTitle>
        </CardHeader>
        <CardContent>
          <CardDescription className="text-base">
            Seu cadastro está pendente de aprovação. Você será avisado quando for liberado.
          </CardDescription>
        </CardContent>
      </Card>
    </div>
  );
}
