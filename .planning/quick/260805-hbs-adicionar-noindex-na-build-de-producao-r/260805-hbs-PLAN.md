---
phase: quick-260805-hbs
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - app/robots.ts
  - app/layout.tsx
autonomous: true
requirements: [QUICK-260805-hbs]

must_haves:
  truths:
    - "Uma requisição a /robots.txt na aplicação rodando retorna um robots.txt válido que proíbe todo crawling (User-Agent: * / Disallow: /)"
    - "Qualquer página HTML servida pelo app (incluindo /login, pública) contém a meta tag robots com noindex e nofollow"
    - "O comportamento vale em qualquer ambiente (dev e produção) — nenhuma ramificação por NODE_ENV/VERCEL_ENV é introduzida"
    - "Os metadados existentes (title 'BackstageEd.OS' e description) continuam intactos e renderizando normalmente"
    - "tsc, lint e build continuam verdes"
  artifacts:
    - path: "app/robots.ts"
      provides: "Metadata Route do Next que gera /robots.txt com disallow total"
      exports: ["default"]
      contains: "MetadataRoute.Robots"
    - path: "app/layout.tsx"
      provides: "Campo robots no objeto metadata do root layout (index: false, follow: false)"
      contains: "robots"
  key_links:
    - from: "app/robots.ts"
      to: "/robots.txt"
      via: "convenção de Metadata Files do App Router (export default retornando MetadataRoute.Robots)"
      pattern: "MetadataRoute\\.Robots"
    - from: "app/layout.tsx"
      to: "<meta name=\"robots\" content=\"noindex, nofollow\">"
      via: "campo robots do objeto Metadata exportado pelo root layout, herdado por todas as rotas"
      pattern: "index:\\s*false"
---

<objective>
Manter o app fora da indexação de buscadores antes do primeiro deploy de produção na Vercel, via dois mecanismos padrão do Next.js App Router: um `app/robots.ts` que proíbe todo crawling e um campo `robots` no `metadata` do root layout que emite `noindex, nofollow` em toda página.

Purpose: decisão de produto já tomada pelo dono da operação e **não aberta a debate neste plano** — como o app já exige login (auth/RLS construídos desde a Fase 1), uma URL pública não expõe dado de ninguém; só quem tem conta entra. A única proteção necessária agora é não aparecer em buscador enquanto o app ainda está em construção. Sem camada extra de senha.

Por que os dois mecanismos (cinto e suspensório): alguns crawlers ignoram `robots.txt` mas respeitam a meta tag, e vice-versa. `robots.txt` pede para não rastrear; a meta tag pede para não indexar. São complementares, não redundantes.

Output: um arquivo novo (`app/robots.ts`) e uma adição de um campo em um objeto existente (`app/layout.tsx`). Ambas as mudanças são puramente aditivas.

**Decisões já fechadas (implementar como está, não re-derivar):**
- Vale em TODOS os ambientes, dev e produção — sem `NODE_ENV`/`VERCEL_ENV`. Já verificado no codebase: não existe nenhuma ramificação por ambiente em `app/` nem em `next.config.ts`, então introduzir uma aqui seria criar um padrão novo sem motivo. O app não tem nenhuma página pública de marketing que algum dia queira ser indexada, e noindex em dev local não custa nada.
- Não existe `app/robots.ts`, `app/sitemap.ts` nem `public/robots.txt` hoje — verificado. Este é o primeiro e único produtor de `/robots.txt`, sem risco de conflito de rota.

**Fora de escopo (não tocar):**
- Qualquer gate de autenticação/senha além do login existente — o usuário já decidiu contra.
- Deployment Protection no nível da plataforma Vercel — mencionado pelo usuário como possível escalação futura, não faz parte desta tarefa.
- Os campos `title` e `description` do `metadata` existente — permanecem exatamente como estão.
- `next.config.ts`, headers HTTP (`X-Robots-Tag`), `app/sitemap.ts` — nada disso é necessário aqui.
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
@$HOME/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/STATE.md

Stack relevante: Next.js **16.2.9** (App Router), TypeScript. Scripts disponíveis em `package.json`: `dev`, `build`, `start`, `lint` (`eslint`), `test` (`node --test` sobre módulos puros de `lib/`).

<interfaces>
<!-- Contratos que o executor precisa. Extraídos do codebase e da API do Next. Não é preciso explorar. -->

Estado atual completo de `app/layout.tsx` (23 linhas — é este arquivo inteiro):

```tsx
import type { Metadata } from "next";
import "./globals.css";
import { Toaster } from "@/components/ui/sonner";

export const metadata: Metadata = {
  title: "BackstageEd.OS",
  description: "Plataforma de produção e gestão de conteúdo para redes sociais",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="pt-BR" className="h-full antialiased">
      <body className="min-h-full flex flex-col font-sans">
        {children}
        <Toaster />
      </body>
    </html>
  );
}
```

Tipos do Next relevantes (importáveis de `"next"`):

```ts
import type { Metadata, MetadataRoute } from "next";

// Metadata["robots"] aceita, na forma de objeto:
//   { index?: boolean; follow?: boolean; nocache?: boolean; googleBot?: ... }
// { index: false, follow: false } renderiza:
//   <meta name="robots" content="noindex, nofollow">

// MetadataRoute.Robots (retorno do export default de app/robots.ts):
//   { rules: { userAgent?: string | string[]; allow?: string | string[]; disallow?: string | string[] }
//            | Array<...>;
//     sitemap?: string | string[]; host?: string }
```
</interfaces>
</context>

<tasks>

<task type="auto">
  <name>Task 1: Criar app/robots.ts e adicionar robots ao metadata do root layout</name>
  <files>app/robots.ts, app/layout.tsx</files>
  <action>
Duas mudanças aditivas, ambas pequenas.

**1. Criar `app/robots.ts`** (arquivo novo, não existe hoje). Deve seguir a convenção de Metadata Files do App Router: um `export default` de uma função sem parâmetros cujo tipo de retorno é `MetadataRoute.Robots`, importado como `import type { MetadataRoute } from "next"`. O retorno é um objeto com a chave `rules` contendo `userAgent: "*"` e `disallow: "/"`. Não incluir `sitemap` nem `host` — não há sitemap neste projeto e nenhum host canônico a declarar. Não adicionar nenhuma entrada `allow`: a intenção é bloqueio total, e um `allow` conviveria mal com o `disallow: "/"`. Não envolver nada em condicional de ambiente — nenhuma leitura de `process.env` neste arquivo.

Incluir um comentário curto no topo explicando o porquê (app em construção, primeiro deploy de produção, mantê-lo fora de buscadores; o login já protege os dados, isto é só anti-indexação) — consistente com o estilo de comentários explicativos já usado em `next.config.ts`.

**2. Editar `app/layout.tsx`**: adicionar UM campo ao objeto `metadata` já exportado — `robots: { index: false, follow: false }`. Não alterar `title`, `description`, o import de `Metadata`, o componente `RootLayout`, o `<html lang="pt-BR">`, o `<body>` nem o `<Toaster />`. O `import type { Metadata } from "next"` já existente cobre a tipagem do novo campo — nenhum import novo é necessário neste arquivo.

Nada além destes dois arquivos deve ser tocado. Se `git diff --stat` mostrar qualquer terceiro arquivo modificado ao final, algo saiu do escopo.
  </action>
  <verify>
    <automated>
# Gate 1 — o arquivo existe e usa a convenção certa (comentários filtrados para não contarem como match)
test -f app/robots.ts
grep -v '^\s*//' app/robots.ts | grep -v '^\s*\*' | grep -c 'MetadataRoute\.Robots' | grep -qv '^0$'
grep -v '^\s*//' app/robots.ts | grep -v '^\s*\*' | grep -c 'export default' | grep -qv '^0$'
grep -v '^\s*//' app/robots.ts | grep -v '^\s*\*' | grep -c 'disallow' | grep -qv '^0$'
# Gate 2 — nenhuma ramificação por ambiente foi introduzida (deve ser 0 ocorrências)
test "$(grep -c 'NODE_ENV\|VERCEL_ENV' app/robots.ts app/layout.tsx | awk -F: '{s+=$2} END {print s+0}')" = "0"
# Gate 3 — metadata do layout ganhou robots e manteve title/description
grep -v '^\s*//' app/layout.tsx | grep -c 'index: false' | grep -qv '^0$'
grep -v '^\s*//' app/layout.tsx | grep -c 'follow: false' | grep -qv '^0$'
grep -q 'BackstageEd.OS' app/layout.tsx
grep -q 'Plataforma de produção' app/layout.tsx
# Gate 4 — toolchain verde
npx tsc --noEmit
npm run lint
npm run build
# Gate 5 — comportamento real: sobe o build de produção numa porta livre e checa as duas saídas
PORT=3100 npm run start & SRV=$!
for i in $(seq 1 30); do curl -sf http://localhost:3100/robots.txt >/dev/null 2>&1 && break; sleep 1; done
curl -s http://localhost:3100/robots.txt | tee /dev/stderr | grep -qi 'Disallow: */'
curl -s http://localhost:3100/robots.txt | grep -qi 'User-Agent: *\*'
# /login é rota pública (sem auth) — serve para inspecionar o HTML renderizado
curl -s http://localhost:3100/login | grep -qi 'name="robots"'
curl -s http://localhost:3100/login | grep -qi 'noindex'
curl -s http://localhost:3100/login | grep -qi 'nofollow'
kill $SRV
# Gate 6 — escopo: exatamente 2 arquivos tocados
test "$(git diff --stat HEAD -- . | tail -1 | grep -oE '[0-9]+ files? changed' | grep -oE '[0-9]+')" = "2"
    </automated>
  </verify>
  <done>
- `app/robots.ts` existe, exporta default uma função tipada como `MetadataRoute.Robots` retornando `{ rules: { userAgent: "*", disallow: "/" } }`, sem lógica condicional de ambiente.
- `app/layout.tsx` tem `robots: { index: false, follow: false }` dentro do objeto `metadata`, com `title` e `description` inalterados.
- Com o build de produção rodando: `GET /robots.txt` responde 200 com `User-agent: *` e `Disallow: /`; o HTML de `/login` contém `<meta name="robots" content="noindex, nofollow">`.
- `tsc --noEmit`, `npm run lint` e `npm run build` verdes; `git diff --stat` mostra exatamente 2 arquivos alterados.
  </done>
</task>

</tasks>

<threat_model>
## Trust Boundaries

| Boundary | Description |
|----------|-------------|
| internet pública → app na Vercel | crawlers de buscadores e visitantes anônimos alcançam a URL de produção sem credencial |

## STRIDE Threat Register

| Threat ID | Category | Component | Disposition | Mitigation Plan |
|-----------|----------|-----------|-------------|-----------------|
| T-hbs-01 | Information Disclosure | superfície pública do app (rotas não autenticadas, ex. `/login`) indexada por buscadores enquanto ainda está em construção | mitigate | `app/robots.ts` com `disallow: "/"` + `robots: { index: false, follow: false }` no metadata do root layout — bloqueio de rastreamento e de indexação, aplicado a todas as rotas |
| T-hbs-02 | Information Disclosure | dados de cliente atrás do login | accept | fora do escopo desta mudança: o acesso já é protegido por Supabase Auth + RLS desde a Fase 1; decisão explícita do dono da operação de não adicionar camada extra de senha. `noindex` não é (e não pretende ser) controle de acesso |
| T-hbs-SC | Tampering | instalações via npm/pip/cargo | n/a | nenhuma dependência nova é adicionada por este plano — nenhum install ocorre |
</threat_model>

<verification>
Além dos gates automatizados da Task 1:

1. `curl -s http://localhost:3100/robots.txt` retorna exatamente as diretivas de bloqueio total, sem `Allow:` conflitante e sem linha de `Sitemap:`.
2. O HTML de qualquer rota (pública ou autenticada) herda a meta tag do root layout — a herança de `metadata` do App Router é automática, então não é preciso repetir o campo em nenhum layout ou página filha.
3. Nenhum arquivo além de `app/robots.ts` e `app/layout.tsx` aparece no diff.
</verification>

<success_criteria>
- `/robots.txt` servido pelo app proíbe todo crawling (`User-agent: *`, `Disallow: /`).
- Toda página renderiza `<meta name="robots" content="noindex, nofollow">`.
- Comportamento idêntico em dev e produção — zero lógica condicional por ambiente.
- `title`/`description` preservados; toolchain (`tsc`/`lint`/`build`) verde; escopo restrito a 2 arquivos.
</success_criteria>

<output>
Create `.planning/quick/260805-hbs-adicionar-noindex-na-build-de-producao-r/260805-hbs-SUMMARY.md` when done
</output>
</content>
</invoke>
