// Quick task 260722-hnm: Migração do RAG para armazenamento direto em Supabase -- CLI-03, T-hnm-03.
//
// Node runtime ONLY -- import apenas em Server Actions/Route Handlers que
// declarem `export const runtime = "nodejs"` (o mesmo runtime ja usado em
// app/api/chat/route.ts). unpdf usa Promise.withResolvers / APIs de Node e
// mammoth le Buffer diretamente; nenhum dos dois roda no Edge runtime nem em
// um Client Component.
//
// Sem servico externo (RESEARCH.md): unpdf (build serverless do PDF.js, sem
// dependencia nativa para extracao de texto -- @napi-rs/canvas e opcional e
// so necessario para render de imagem, deliberadamente NAO instalado) para
// PDF; mammoth.extractRawText para DOCX; passthrough utf-8 para TXT/MD.
//
// Pitfall 1 (RESEARCH.md): um PDF escaneado/vazio extrai para "" ou
// whitespace SEM lancar erro nenhum -- por isso todo resultado passa por um
// threshold minimo de caracteres (MIN_CHARS) apos trim/colapso de espacos;
// abaixo disso e tratado como falha de extracao (nunca persiste content
// vazio/lixo em client_files -- decisao travada em CONTEXT.md / T-hnm-03).
import { extractText, getDocumentProxy } from "unpdf";
import mammoth from "mammoth";

export const MIN_CHARS = 20;

export class UnreadableFileError extends Error {}

export type ClientFileType = "pdf" | "docx" | "txt" | "md";

/**
 * Extrai o texto puro de um Buffer de arquivo, de acordo com o fileType
 * declarado. Lanca UnreadableFileError se o texto extraido (apos trim +
 * colapso de whitespace) ficar abaixo de MIN_CHARS -- nunca retorna uma
 * string vazia/lixo com sucesso.
 */
export async function extractDocumentText(
  buffer: Buffer,
  fileType: ClientFileType
): Promise<string> {
  let text = "";

  if (fileType === "pdf") {
    const pdf = await getDocumentProxy(new Uint8Array(buffer));
    const { text: extracted } = await extractText(pdf, { mergePages: true });
    text = extracted;
  } else if (fileType === "docx") {
    const { value } = await mammoth.extractRawText({ buffer });
    text = value;
  } else {
    text = buffer.toString("utf-8");
  }

  const cleaned = text.replace(/\s+/g, " ").trim();
  if (cleaned.length < MIN_CHARS) {
    throw new UnreadableFileError("no usable text extracted");
  }
  return cleaned;
}
