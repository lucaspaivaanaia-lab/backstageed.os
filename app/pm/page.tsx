import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

/**
 * Role-scoped landing shell (placeholder). Proves the middleware's
 * `/`->role-root redirect and cross-role gating resolve to a real page
 * instead of a 404 (AUTH-05). Real PM content arrives in later phases.
 */
export default function PmPage() {
  return (
    <div className="flex flex-1 items-center justify-center p-4">
      <Card className="w-full max-w-sm">
        <CardHeader>
          <CardTitle>Área do PM</CardTitle>
        </CardHeader>
        <CardContent>
          <CardDescription className="text-base">
            Em construção — o conteúdo desta área será adicionado nas próximas fases.
          </CardDescription>
        </CardContent>
      </Card>
    </div>
  );
}
