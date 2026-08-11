import Anthropic from "@anthropic-ai/sdk";

/**
 * Server-only Anthropic client factory.
 *
 * SERVER-ONLY. Never import this file from a Client Component — the
 * secret key must never reach the browser bundle. Only Server Actions
 * ('use server') and Route Handlers (app/api/**) may import this.
 *
 * `ANTHROPIC_API_KEY` must NOT carry a `NEXT_PUBLIC_` prefix.
 *
 * Claude is always the response generator — client context (files stored
 * in public.client_files) is injected directly into the system prompt
 * server-side (lib/chat/assemble-prompt.ts), no external RAG service.
 */

/**
 * Item 8 of the 2026-08-05 Juliano action plan: single source of truth for
 * the model used by every AI call in this codebase (chat streaming in
 * app/api/chat/route.ts, and the shared structured-extraction engine in
 * lib/ai/structured-extraction.ts) — previously the same
 * `process.env.ANTHROPIC_CHAT_MODEL ?? "claude-sonnet-4-5"` fallback was
 * duplicated in both files. No model change, no user-facing selector —
 * that's a future decision; this is purely deduplication.
 */
export const AI_MODEL = process.env.ANTHROPIC_CHAT_MODEL ?? "claude-sonnet-4-5";

let cached: Anthropic | null = null;

export function getAnthropicClient(): Anthropic {
  if (!cached) {
    cached = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  }
  return cached;
}
