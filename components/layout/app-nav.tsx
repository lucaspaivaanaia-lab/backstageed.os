"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { signOut } from "@/lib/actions/auth";

type AppNavLink = {
  href: string;
  label: string;
};

type AppNavProps = {
  links: AppNavLink[];
};

/**
 * Persistent nav shell for /pm/* and /admin/* (Task 2). Highlights the
 * active route and exposes a logout button wired to the signOut Server
 * Action (lib/actions/auth.ts) via a form action — Client Components can
 * pass a Server Action reference straight into a form's `action` prop.
 */
export function AppNav({ links }: AppNavProps) {
  const pathname = usePathname();

  return (
    <header className="flex items-center justify-between border-b bg-background px-6 py-3">
      <span className="text-sm font-semibold tracking-tight text-primary">
        BackstageEd.OS
      </span>
      <nav className="flex items-center gap-4">
        {links.map((link) => {
          const isActive =
            pathname === link.href || pathname.startsWith(`${link.href}/`);
          return (
            <Link
              key={link.href}
              href={link.href}
              className={cn(
                "text-sm",
                isActive
                  ? "font-medium text-primary"
                  : "text-muted-foreground hover:text-foreground"
              )}
            >
              {link.label}
            </Link>
          );
        })}
        <form action={signOut}>
          <Button variant="ghost" size="sm" type="submit">
            Sair
          </Button>
        </form>
      </nav>
    </header>
  );
}
