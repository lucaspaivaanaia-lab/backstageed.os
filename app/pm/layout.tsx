import { UsersIcon, MessageSquareIcon } from "lucide-react";

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
          { href: "/pm/chat", label: "Chat", icon: <MessageSquareIcon /> },
        ]}
      />
      <main className="flex min-w-0 flex-1 flex-col overflow-y-auto">
        {children}
      </main>
    </div>
  );
}
