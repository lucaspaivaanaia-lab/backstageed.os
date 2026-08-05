import {
  UsersIcon,
  MessageSquareIcon,
  LayoutDashboardIcon,
  FileEditIcon,
} from "lucide-react";

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
          {
            href: "/pm/chat",
            label: "Chat",
            icon: <MessageSquareIcon />,
            requiresActiveClient: true,
          },
          {
            href: "/pm/board",
            label: "Produção",
            icon: <LayoutDashboardIcon />,
            requiresActiveClient: true,
          },
          {
            // Navigation-flow correction 2026-08-05: href is a placeholder
            // — AppSidebar rebuilds it as /pm/clients/${activeClientId} at
            // render time (linksToActiveClientDetail). Briefing editing is
            // reached from here now, not as the default landing screen.
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
