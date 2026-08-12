import { NextResponse, type NextRequest } from "next/server";
import { updateSession } from "@/lib/supabase/middleware";

const PUBLIC_PATHS = [
  "/login",
  "/signup",
  "/pending",
  "/rejected",
  "/change-password",
  "/forgot-password",
  "/reset-password",
  "/auth/callback",
];

function isPublicPath(pathname: string) {
  return PUBLIC_PATHS.some(
    (path) => pathname === path || pathname.startsWith(`${path}/`)
  );
}

/**
 * Session refresh + pending/rejected/must-change-password gate + role
 * routing. Uses the verified-JWT user lookup (never the unverified session
 * cookie alone) for the authorization decision (01-RESEARCH.md Pattern 3).
 */
export async function middleware(request: NextRequest) {
  const { supabase, supabaseResponse } = await updateSession(request);

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { pathname } = request.nextUrl;

  if (!user) {
    if (isPublicPath(pathname) || pathname === "/") {
      return supabaseResponse;
    }
    return NextResponse.redirect(new URL("/login", request.url));
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("role, status, must_change_password")
    .eq("id", user.id)
    .single();

  if (!profile || profile.status === 'pending') {
    if (pathname.startsWith("/pending")) return supabaseResponse;
    return NextResponse.redirect(new URL("/pending", request.url));
  }

  // A deactivated Client sees the same blocked-access screen as a rejected
  // PM signup — both route to /rejected.
  if (profile.status === 'rejected' || profile.status === 'deactivated') {
    if (pathname.startsWith("/rejected")) return supabaseResponse;
    return NextResponse.redirect(new URL("/rejected", request.url));
  }

  if (profile.must_change_password && !pathname.startsWith("/change-password")) {
    return NextResponse.redirect(new URL("/change-password", request.url));
  }

  const roleRoot: Record<string, string> = {
    admin: "/admin",
    pm: "/pm",
    client: "/client",
    editor: "/editor",
  };

  // Allow-list aditivo, fechado e explicito -- NAO um segundo roleRoot. Cada
  // prefixo aqui e uma sub-arvore de rota completa (proprio page.tsx + proprias
  // actions.ts), nunca um prefixo parcial/ambiguo (ex.: nunca "/pm/c", que
  // tambem bateria em "/pm/clients"). Quick task 260812-k6c: Admin ganha
  // acesso as MESMAS telas de Produção/Chat que o PM ja tem, sem abrir
  // /pm/clients nem /pm/editors (Admin ja tem /admin/clients, /admin/editors
  // proprios).
  const extraAllowedPrefixes: Record<string, string[]> = {
    admin: ["/pm/board", "/pm/chat"],
  };

  const ownRoot = roleRoot[profile.role];

  if (ownRoot) {
    const otherRoots = Object.values(roleRoot).filter((r) => r !== ownRoot);
    const allowedExtras = extraAllowedPrefixes[profile.role] ?? [];
    const isAllowedExtra = allowedExtras.some(
      (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`)
    );
    if (
      !isAllowedExtra &&
      (pathname === "/" ||
        otherRoots.some((root) => pathname === root || pathname.startsWith(`${root}/`)))
    ) {
      return NextResponse.redirect(new URL(ownRoot, request.url));
    }
  }

  return supabaseResponse;
}

export const config = {
  matcher: [
    /*
     * Match all request paths except:
     * - _next/static, _next/image (static assets)
     * - favicon.ico, robots.txt (Next.js Metadata Route — must stay
     *   reachable by anonymous crawlers, or an auth redirect makes Google
     *   treat it as "no robots.txt found" and default to full crawl
     *   permission, inverting the intended block-all behavior)
     * - common static file extensions
     */
    "/((?!_next/static|_next/image|favicon.ico|robots.txt|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
