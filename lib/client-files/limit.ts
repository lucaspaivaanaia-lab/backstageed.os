// Quick task 260722-hnm: Migração do RAG para armazenamento direto em Supabase.
//
// Helper de limite de arquivos por cliente, compartilhado entre o upload
// direto (lib/actions/client-files.ts, Task 5) e a curadoria manual do chat
// (app/pm/chat/actions.ts saveKnowledge, Task 7) -- ambos os fluxos
// escrevem em public.client_files e devem respeitar o MESMO teto.
//
// Quick task 260805-i1m: por que o teto é finito (e não infinito). O RAG
// deste app não tem embeddings/busca vetorial -- o conteúdo extraído de
// TODOS os client_files do cliente ativo é injetado por inteiro no system
// prompt a cada turno de chat (lib/chat/assemble-prompt.ts). O número de
// arquivos aqui é, portanto, um limitador direto de tamanho de prompt,
// custo e janela de contexto do modelo -- não apenas um número arbitrário.

export const FILE_LIMIT = 20;

export const FILE_LIMIT_MESSAGE = `Limite de ${FILE_LIMIT} arquivos por cliente atingido. Remova um arquivo antes de enviar outro.`;

/** Verdadeiro quando o cliente ja atingiu (ou ultrapassou) o teto de arquivos. */
export function atFileLimit(count: number): boolean {
  return count >= FILE_LIMIT;
}
