import { NextResponse, type NextRequest } from "next/server";
import { updateSession } from "@/lib/supabase/middleware";

const PUBLIC_PATHS = [
  "/login",
  "/signup",
  "/pending",
  "/rejected",
  "/change-password",
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
  };
  const ownRoot = roleRoot[profile.role];

  if (ownRoot) {
    const otherRoots = Object.values(roleRoot).filter((r) => r !== ownRoot);
    if (
      pathname === "/" ||
      otherRoots.some((root) => pathname === root || pathname.startsWith(`${root}/`))
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
     * - favicon.ico, and common static file extensions
     */
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
