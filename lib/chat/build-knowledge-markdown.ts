/**
 * Pure, I/O-free Q/A transcript -> markdown packaging for the save-to-
 * knowledge Server Action (app/pm/chat/actions.ts, 02-05). Intentionally
 * free of any Supabase client import so this module can be
 * imported by its sibling `build-knowledge-markdown.test.ts` via a
 * relative path and exercised with Node's built-in test runner — no live
 * DB, no service-role key (02-RESEARCH.md Pattern 3, CTX-03/CTX-04).
 *
 * The caller (saveKnowledge Server Action) is responsible for re-fetching
 * only the checked message rows via an RLS-scoped Supabase query before
 * calling this function — this module never trusts message content passed
 * raw from the browser; it only renders whatever it is given, in
 * chronological order, into ONE new markdown file per curation action
 * (D-05: no preview/edit step, straight upload).
 */

type KnowledgeMessage = {
  id: string;
  role: "user" | "assistant";
  content: string;
  created_at: string;
};

export function buildKnowledgeMarkdown(
  clientName: string,
  messages: KnowledgeMessage[]
): string {
  const sorted = [...messages].sort(
    (a, b) => Date.parse(a.created_at) - Date.parse(b.created_at)
  );

  const turns = sorted.map((message) => {
    const label = message.role === "user" ? "PM pergunta" : "Resposta IA";
    return `### ${label}\n\n${message.content}`;
  });

  return (
    `# Conhecimento salvo — ${clientName}\n\n` +
    `Conversa curada manualmente pelo PM (checkbox por mensagem, sem edição ` +
    `automática).\n\n` +
    turns.join("\n\n")
  );
}
