import { getAnthropicClient, AI_MODEL } from "@/lib/anthropic/client";
import { buildExtractionPrompt, type ExtractionFile } from "./extraction-prompt";

/**
 * SERVER-ONLY. Never import this file from a Client Component — it calls
 * getAnthropicClient() (lib/anthropic/client.ts), whose own SERVER-ONLY
 * contract this module inherits.
 *
 * Shared one-shot structured-extraction engine (P0 pivot 2026-08-04),
 * reused by every "AI reads client_files and proposes structured data"
 * feature in this codebase — checklist generation, briefing auto-fill, and
 * card-vs-checklist validation — so there is exactly ONE place that calls
 * the Anthropic API in tool-forced mode, never a second copy per feature.
 *
 * Uses forced tool-use (`tool_choice: { type: "tool", name }`) rather than
 * asking the model to emit JSON in free text and parsing it — the SDK
 * guarantees the response is a single `tool_use` block whose `input`
 * already matches `inputSchema`'s shape, no markdown-fence stripping or
 * best-effort JSON.parse needed. The caller still re-validates the result
 * with its own Zod schema (never trusts the model's output as pre-shaped
 * for a database write, matching Security Domain V5 input validation).
 */

export type StructuredExtractionParams = {
  clientName: string;
  clientTag: string;
  files: ExtractionFile[];
  sharedFiles: ExtractionFile[];
  instruction: string;
  toolName: string;
  toolDescription: string;
  /** JSON Schema (Anthropic's `Tool.InputSchema` shape) describing the expected structured output. */
  inputSchema: Record<string, unknown>;
};

export type StructuredExtractionResult =
  | { ok: true; data: unknown }
  | { ok: false; error: string };

const EXTRACTION_FAILED_ERROR =
  "Não foi possível gerar a sugestão da IA agora. Tente novamente em instantes.";

export async function runStructuredExtraction(
  params: StructuredExtractionParams
): Promise<StructuredExtractionResult> {
  const prompt = buildExtractionPrompt(
    params.clientName,
    params.clientTag,
    params.files,
    params.sharedFiles,
    params.instruction
  );

  const anthropic = getAnthropicClient();

  let message;
  try {
    message = await anthropic.messages.create({
      model: AI_MODEL,
      max_tokens: 2048,
      tools: [
        {
          name: params.toolName,
          description: params.toolDescription,
          input_schema: params.inputSchema as {
            type: "object";
            [key: string]: unknown;
          },
        },
      ],
      tool_choice: { type: "tool", name: params.toolName },
      messages: [{ role: "user", content: prompt }],
    });
  } catch (err) {
    console.error("[structured-extraction] Anthropic call failed", err);
    return { ok: false, error: EXTRACTION_FAILED_ERROR };
  }

  const toolUse = message.content.find(
    (block): block is Extract<typeof message.content[number], { type: "tool_use" }> =>
      block.type === "tool_use"
  );

  if (!toolUse) {
    console.error(
      "[structured-extraction] no tool_use block in response",
      message.stop_reason
    );
    return { ok: false, error: EXTRACTION_FAILED_ERROR };
  }

  return { ok: true, data: toolUse.input };
}
