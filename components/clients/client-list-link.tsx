"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import { setLastSelectedClientId } from "@/lib/client-selection";

/**
 * P2 pivot 2026-08-04 (client-scoped navigation): wraps the client-list
 * row link so clicking INTO a client also marks it as the active client —
 * the same localStorage handoff Chat/Produção's own switchers already use
 * (lib/client-selection.ts). This is what makes "Chat"/"Produção" appear
 * in the sidebar right after entering a client's context, without the PM
 * having to separately pick that client again once inside either screen.
 * Admin's client list does NOT use this — Admin's sidebar has no Chat/
 * Produção items to unlock, so there's nothing for Admin's list to set.
 */
export function ClientListLink({
  clientId,
  href,
  className,
  children,
}: {
  clientId: string;
  href: string;
  className?: string;
  children: ReactNode;
}) {
  return (
    <Link
      href={href}
      className={className}
      onClick={() => setLastSelectedClientId(clientId)}
    >
      {children}
    </Link>
  );
}
