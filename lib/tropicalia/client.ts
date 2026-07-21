/**
 * Tropicalia server-only fetch wrapper.
 *
 * SERVER-ONLY. Never import this file from a Client Component —
 * `TROPICALIA_API_KEY` must never reach the browser bundle, matching the
 * existing `SUPABASE_SECRET_KEY` discipline in `lib/supabase/admin.ts`.
 * Only ever imported by `lib/actions/clients.ts` ('use server').
 *
 * Source: https://docs.tropicalia.dev/api-reference/projects/create-project.md
 * (request/response schema), https://docs.tropicalia.dev/openapi.json
 * (security scheme: BearerAuth).
 */

const TROPICALIA_BASE_URL = "https://api.tropicalia.dev";

export type TropicaliaProject = {
  public_id: string;
  name: string;
  description: string | null;
  created_at: string;
  modified_at: string;
};

/**
 * Creates a Tropicalia project (one project per client — the structural
 * RAG isolation boundary). The response field is `public_id`, NEVER
 * `project_id` (01-RESEARCH.md Common Pitfalls #1) — store
 * `response.public_id` into `clients.tropicalia_project_id`.
 *
 * The caller is responsible for the D-11 null-check on
 * `process.env.TROPICALIA_API_KEY` BEFORE ever invoking this function —
 * the throw below is a defensive backstop only, not the primary skip path.
 */
export async function createTropicaliaProject(
  name: string
): Promise<TropicaliaProject> {
  const apiKey = process.env.TROPICALIA_API_KEY;
  if (!apiKey) {
    throw new Error("TROPICALIA_API_KEY is not set");
  }

  const res = await fetch(`${TROPICALIA_BASE_URL}/v1/projects`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ name }),
    // No documented Tropicalia timeout SLA — 10s is a defensive default
    // (01-RESEARCH.md Pitfall 7: unbounded fetch can hang the Server Action).
    signal: AbortSignal.timeout(10_000),
  });

  if (!res.ok) {
    throw new Error(`Tropicalia project creation failed: ${res.status}`);
  }

  return res.json();
}

export type TropicaliaRetrievalChunk = {
  id: string;
  [key: string]: unknown;
};

/**
 * Retrieval-only search against a client's Tropicalia project.
 *
 * `generate_answer` is ALWAYS `false` — Tropicalia never generates the
 * answer here. Claude (via lib/anthropic/client.ts) is always the response
 * generator (CTX-05, 02-RESEARCH.md Pitfall #2). This invariant is pinned
 * by lib/tropicalia/client.test.ts and must never be made configurable.
 *
 * The caller is responsible for the D-11 null-check on
 * `process.env.TROPICALIA_API_KEY` BEFORE ever invoking this function —
 * the throw below is a defensive backstop only, not the primary skip path.
 */
export async function searchTropicaliaProject(
  projectId: string,
  query: string
): Promise<TropicaliaRetrievalChunk[]> {
  const apiKey = process.env.TROPICALIA_API_KEY;
  if (!apiKey) {
    throw new Error("TROPICALIA_API_KEY is not set");
  }

  const res = await fetch(
    `${TROPICALIA_BASE_URL}/v1/projects/${projectId}/search`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        query,
        retrieval_strategy: "hybrid",
        generate_answer: false,
        include_sources: true,
        limit: 10,
      }),
      // No documented Tropicalia timeout SLA — 10s is a defensive default
      // (01-RESEARCH.md Pitfall 7: unbounded fetch can hang the caller).
      signal: AbortSignal.timeout(10_000),
    }
  );

  if (!res.ok) {
    throw new Error(`Tropicalia project search failed: ${res.status}`);
  }

  const data = await res.json();
  return data.retrieval_contents ?? [];
}

/**
 * Uploads one curated document into a client's Tropicalia project.
 *
 * Multipart/form-data with the file under key "file". NO manual
 * Content-Type header is set — the runtime's fetch implementation must set
 * the multipart boundary itself, or Tropicalia will reject the upload.
 *
 * The caller is responsible for the D-11 null-check on
 * `process.env.TROPICALIA_API_KEY` BEFORE ever invoking this function —
 * the throw below is a defensive backstop only, not the primary skip path.
 */
export async function uploadTropicaliaDocument(
  projectId: string,
  file: Blob,
  filename: string
): Promise<{ document_id: string; filename: string }> {
  const apiKey = process.env.TROPICALIA_API_KEY;
  if (!apiKey) {
    throw new Error("TROPICALIA_API_KEY is not set");
  }

  const formData = new FormData();
  formData.append("file", file, filename);

  const res = await fetch(
    `${TROPICALIA_BASE_URL}/v1/projects/${projectId}/upload`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
      },
      body: formData,
      // Uploads can take longer than retrieval calls — 30s defensive default.
      signal: AbortSignal.timeout(30_000),
    }
  );

  if (!res.ok) {
    throw new Error(`Tropicalia document upload failed: ${res.status}`);
  }

  return res.json();
}
