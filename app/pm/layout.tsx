import { UsersIcon, UserCogIcon } from "lucide-react";

import { AppSidebar } from "@/components/layout/app-sidebar";

/**
 * Persistent two-column shell for the PM area: fixed sidebar + scrollable
 * main content.
 */
export default function PmLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <div className="flex h-screen">
      <AppSidebar
        items={[
          // Navigation-flow correction 2026-08-05: "Clientes" is the only
          // sidebar item now. "Chat" and "Produção" are reachable via each
          // page's own explicit button (board-panel.tsx's "Chat" button,
          // chat-panel.tsx's "Produção" button); "Editar briefing" is
          // reachable via the button on the Produção page. The sidebar no
          // longer duplicates any of that navigation.
          { href: "/pm/clients", label: "Clientes", icon: <UsersIcon /> },
          { href: "/pm/editors", label: "Editores", icon: <UserCogIcon /> },
        ]}
      />
      <main className="flex min-w-0 flex-1 flex-col overflow-y-auto">
        {children}
      </main>
    </div>
  );
}
