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
 * Claude (not Tropicalia) is always the response generator — Tropicalia
 * is retrieval/upload only, called with `generate_answer: false`
 * (see lib/tropicalia/client.ts).
 */

let cached: Anthropic | null = null;

export function getAnthropicClient(): Anthropic {
  if (!cached) {
    cached = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  }
  return cached;
}
