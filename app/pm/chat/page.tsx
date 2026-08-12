import { createClient } from "@/lib/supabase/server";
import { ChatPanel } from "./chat-panel";

/**
 * PM chat roster loader (CTX-01, CTX-02, CTX-05). RLS already scopes this
 * read to the PM's assigned clients (`clients_select_scoped`) — this IS the
 * client-switcher roster, no separate unscoped query (mirrors
 * app/pm/clients/page.tsx's "zero additional app-layer filtering" comment).
 *
 * The `"use client"` panel never computes context availability itself —
 * `hasRag` is resolved HERE, on the server, from the EXISTENCE of at least
 * one row in `public.client_files` per client (quick task 260722-hnm — no
 * external RAG service, no env var). This server-resolved `hasRag` is the
 * ONLY data path that drives the degraded-mode badge (T-2-04).
 */
export default async function PmChatPage() {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const [{ data: clients }, { data: fileRows }, { data: profile }] = await Promise.all([
    supabase
      .from("clients")
      .select("id, name")
      // P1 pivot 2026-08-04: excludes soft-deleted ("Excluir cliente")
      // clients from the chat switcher roster.
      .is("archived_at", null)
      .order("name", { ascending: true }),
    supabase.from("client_files").select("client_id"),
    user
      ? supabase.from("profiles").select("role").eq("id", user.id).single()
      : Promise.resolve({ data: null as { role: string } | null }),
  ]);

  const viewerIsAdmin = profile?.role === "admin";

  const clientIdsWithFiles = new Set((fileRows ?? []).map((f) => f.client_id));

  const roster = (clients ?? []).map((c) => ({
    id: c.id,
    name: c.name,
    hasRag: clientIdsWithFiles.has(c.id),
  }));

  return <ChatPanel clients={roster} viewerIsAdmin={viewerIsAdmin} />;
}
