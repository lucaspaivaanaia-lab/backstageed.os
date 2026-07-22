import { AppNav } from "@/components/layout/app-nav";

/**
 * Persistent nav shell for the PM area (Task 2). Includes the previously
 * missing link to /pm/chat.
 */
export default function PmLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <div className="flex min-h-full flex-1 flex-col">
      <AppNav
        links={[
          { href: "/pm/clients", label: "Clientes" },
          { href: "/pm/chat", label: "Chat" },
        ]}
      />
      {children}
    </div>
  );
}
