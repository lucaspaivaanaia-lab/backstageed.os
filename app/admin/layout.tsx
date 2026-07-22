import { AppNav } from "@/components/layout/app-nav";

/**
 * Persistent nav shell for the Admin area (Task 2).
 */
export default function AdminLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <div className="flex min-h-full flex-1 flex-col">
      <AppNav
        links={[
          { href: "/admin/clients", label: "Clientes" },
          { href: "/admin/approvals", label: "Aprovações" },
        ]}
      />
      {children}
    </div>
  );
}
