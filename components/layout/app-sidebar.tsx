"use client";

import type { ReactNode } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useSyncExternalStore } from "react";
import { LogOutIcon } from "lucide-react";

import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { signOut } from "@/lib/actions/auth";
import {
  getLastSelectedClientId,
  subscribeLastSelectedClientId,
  getLastSelectedClientIdServerSnapshot,
} from "@/lib/client-selection";

export type SidebarNavItem = {
  href: string;
  label: string;
  icon: ReactNode;
  // P2 pivot 2026-08-04 (client-scoped navigation): when true, this item
  // is hidden from the sidebar until a client has been selected at least
  // once (lib/client-selection.ts). Only /pm/chat and /pm/board set this —
  // Admin's nav items never do, since Admin has no client-scoped screens.
  requiresActiveClient?: boolean;
  // Navigation-flow correction 2026-08-05: when true, this item's `href`
  // is ignored and rebuilt as `/pm/clients/${activeClientId}` at render
  // time — used by the one "Editar briefing" item, whose target depends
  // on WHICH client is active, not a fixed route. Implies
  // requiresActiveClient (no point rendering it with no client to point
  // at) — set both on the item.
  linksToActiveClientDetail?: boolean;
};

type AppSidebarProps = {
  items: SidebarNavItem[];
};

/**
 * Persistent vertical nav shell for /pm/* and /admin/* (replaces the prior
 * horizontal header nav). Fixed width, always visible, desktop-first (D-01
 * — no expand/shrink interaction, no saved-preference persistence, no
 * hamburger). Highlights the active route and exposes the logout Server
 * Action at the footer — same mechanics as before, just repositioned.
 *
 * `useSyncExternalStore` (not a setState-in-effect — this project's
 * react-hooks/set-state-in-effect lint rule blocks that pattern, and this
 * hook is also the hydration-safe way to read localStorage) drives which
 * items with `requiresActiveClient` actually render. A PM with no active
 * client yet sees only the items without that flag (e.g. "Clientes");
 * once a client is selected — from the client list (ClientListLink) or
 * from Chat/Produção's own switcher — those items appear too, on every
 * /pm/* page, without a reload.
 */
export function AppSidebar({ items }: AppSidebarProps) {
  const pathname = usePathname();
  const activeClientId = useSyncExternalStore(
    subscribeLastSelectedClientId,
    getLastSelectedClientId,
    getLastSelectedClientIdServerSnapshot
  );
  const visibleItems = items.filter(
    (item) => !item.requiresActiveClient || Boolean(activeClientId)
  );

  return (
    <aside className="flex h-screen w-sidebar shrink-0 flex-col border-r border-sidebar-border bg-sidebar text-sidebar-foreground">
      <div className="px-page py-stack">
        <span className="text-sm font-semibold tracking-tight text-sidebar-primary">
          BackstageEd.OS
        </span>
      </div>
      <nav className="flex flex-1 flex-col gap-1 px-3">
        {visibleItems.map((item) => {
          const href =
            item.linksToActiveClientDetail && activeClientId
              ? `/pm/clients/${activeClientId}`
              : item.href;
          const isActive =
            pathname === href || pathname.startsWith(`${href}/`);
          return (
            <Link
              key={item.href}
              href={href}
              className={cn(
                "flex items-center gap-2 rounded-md px-3 py-2 text-body transition-colors",
                isActive
                  ? "bg-sidebar-accent font-medium text-sidebar-accent-foreground"
                  : "text-muted-foreground hover:bg-sidebar-accent/50 hover:text-sidebar-foreground"
              )}
            >
              <span className="size-4">{item.icon}</span>
              {item.label}
            </Link>
          );
        })}
      </nav>
      <div className="border-t border-sidebar-border p-3">
        <form action={signOut}>
          <Button
            variant="ghost"
            type="submit"
            className="w-full justify-start"
          >
            <LogOutIcon className="size-4" />
            Sair
          </Button>
        </form>
      </div>
    </aside>
  );
}
