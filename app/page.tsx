import Link from "next/link";

export default function Home() {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-4 bg-background p-8 text-center">
      <h1 className="text-2xl font-semibold text-foreground">
        BackstageEd.OS
      </h1>
      <p className="max-w-md text-base text-muted-foreground">
        Plataforma de produção e gestão de conteúdo para redes sociais.
      </p>
      <Link
        href="/signup"
        className="text-sm font-medium text-primary underline-offset-4 hover:underline"
      >
        Criar conta
      </Link>
    </div>
  );
}
