import { createClient } from "@/lib/supabase/server";
import { ChatPanel } from "./chat-panel";

/**
 * PM chat roster loader (CTX-01, CTX-02, CTX-05). RLS already scopes this
 * read to the PM's assigned clients (`clients_select_scoped`) — this IS the
 * client-switcher roster, no separate unscoped query (mirrors
 * app/pm/clients/page.tsx's "zero additional app-layer filtering" comment).
 *
 * The `"use client"` panel cannot read server env, so RAG availability is
 * computed HERE, on the server, exactly like the `canRetry` prop in
 * components/clients/client-detail-form.tsx. This server-resolved `hasRag`
 * is the ONLY data path that drives the degraded-mode badge — it must never
 * be re-derived client-side from `process.env` (T-2-04).
 */
export default async function PmChatPage() {
  const supabase = await createClient();

  const { data: clients } = await supabase
    .from("clients")
    .select("id, name, tropicalia_project_id")
    .order("name", { ascending: true });

  const hasTropicaliaKey = Boolean(process.env.TROPICALIA_API_KEY);

  const roster = (clients ?? []).map((c) => ({
    id: c.id,
    name: c.name,
    hasRag: hasTropicaliaKey && Boolean(c.tropicalia_project_id),
  }));

  return <ChatPanel clients={roster} />;
}
