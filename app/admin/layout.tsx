import {
  UsersIcon,
  ClipboardCheckIcon,
  ListChecksIcon,
  KanbanIcon,
} from "lucide-react";

import { AppSidebar } from "@/components/layout/app-sidebar";

/**
 * Persistent two-column shell for the Admin area: fixed sidebar + scrollable
 * main content.
 */
export default function AdminLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <div className="flex h-screen">
      <AppSidebar
        items={[
          { href: "/admin/clients", label: "Clientes", icon: <UsersIcon /> },
          {
            href: "/admin/approvals",
            label: "Aprovações",
            icon: <ClipboardCheckIcon />,
          },
          {
            href: "/admin/checklist-templates",
            label: "Checklists",
            icon: <ListChecksIcon />,
          },
          { href: "/admin/cards", label: "Cards", icon: <KanbanIcon /> },
        ]}
      />
      <main className="flex min-w-0 flex-1 flex-col overflow-y-auto">
        {children}
      </main>
    </div>
  );
}
