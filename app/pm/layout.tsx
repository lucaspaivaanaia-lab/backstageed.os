import { UsersIcon, FileEditIcon } from "lucide-react";

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
          { href: "/pm/clients", label: "Clientes", icon: <UsersIcon /> },
          // Navigation-flow correction 2026-08-05: "Chat" and "Produção"
          // removed from the sidebar — each page now carries an explicit
          // button to the other (board-panel.tsx's "Chat" button,
          // chat-panel.tsx's "Produção" button), so the sidebar no longer
          // needs to duplicate that navigation. "Clientes" and "Editar
          // briefing" remain the only sidebar-level entry points.
          {
            // href is a placeholder — AppSidebar rebuilds it as
            // /pm/clients/${activeClientId} at render time
            // (linksToActiveClientDetail).
            href: "/pm/clients",
            label: "Editar briefing",
            icon: <FileEditIcon />,
            requiresActiveClient: true,
            linksToActiveClientDetail: true,
          },
        ]}
      />
      <main className="flex min-w-0 flex-1 flex-col overflow-y-auto">
        {children}
      </main>
    </div>
  );
}
