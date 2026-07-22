// Quick task 260722-hnm: Migrar RAG de Tropicalia para Supabase.
//
// Helper de limite de arquivos por cliente, compartilhado entre o upload
// direto (lib/actions/client-files.ts, Task 5) e a curadoria manual do chat
// (app/pm/chat/actions.ts saveKnowledge, Task 7) -- ambos os fluxos
// escrevem em public.client_files e devem respeitar o MESMO teto.

export const FILE_LIMIT = 3;

export const FILE_LIMIT_MESSAGE =
  "Limite de 3 arquivos por cliente atingido. Remova um arquivo antes de enviar outro.";

/** Verdadeiro quando o cliente ja atingiu (ou ultrapassou) o teto de arquivos. */
export function atFileLimit(count: number): boolean {
  return count >= FILE_LIMIT;
}
