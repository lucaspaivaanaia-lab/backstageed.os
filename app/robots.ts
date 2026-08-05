import type { MetadataRoute } from "next";

// App ainda em construção, antes do primeiro deploy de produção — manter
// fora de buscadores enquanto isso. O login já protege os dados (Auth +
// RLS desde a Fase 1); isto é só anti-indexação, não controle de acesso.
export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      disallow: "/",
    },
  };
}
