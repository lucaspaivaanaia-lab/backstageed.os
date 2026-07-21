import { test } from "node:test";
import assert from "node:assert/strict";
import { searchTropicaliaProject } from "./client.ts";

const originalFetch = global.fetch;
const originalApiKey = process.env.TROPICALIA_API_KEY;

test.beforeEach(() => {
  process.env.TROPICALIA_API_KEY = "dummy-test-key";
});

test.afterEach(() => {
  global.fetch = originalFetch;
  process.env.TROPICALIA_API_KEY = originalApiKey;
});

test("searchTropicaliaProject: body ALWAYS sends generate_answer: false, regardless of query", async () => {
  let capturedBody: unknown = null;

  global.fetch = (async (
    _url: string | URL | Request,
    init?: RequestInit
  ) => {
    capturedBody = JSON.parse(init?.body as string);
    return new Response(
      JSON.stringify({ retrieval_contents: [{ id: "chunk-1" }] }),
      { status: 200 }
    );
  }) as typeof fetch;

  await searchTropicaliaProject("proj", "anything");

  assert.equal(typeof capturedBody, "object");
  assert.equal((capturedBody as Record<string, unknown>).generate_answer, false);
  assert.equal((capturedBody as Record<string, unknown>).query, "anything");
});

test("searchTropicaliaProject: returns data.retrieval_contents", async () => {
  global.fetch = (async () =>
    new Response(
      JSON.stringify({ retrieval_contents: [{ id: "chunk-1" }] }),
      { status: 200 }
    )) as typeof fetch;

  const result = await searchTropicaliaProject("proj", "query");
  assert.deepEqual(result, [{ id: "chunk-1" }]);
});

test("searchTropicaliaProject: returns [] when retrieval_contents absent", async () => {
  global.fetch = (async () =>
    new Response(JSON.stringify({}), { status: 200 })) as typeof fetch;

  const result = await searchTropicaliaProject("proj", "query");
  assert.deepEqual(result, []);
});

test("uploadTropicaliaDocument: sends no manual Content-Type header (multipart boundary set by fetch)", async () => {
  const { uploadTropicaliaDocument } = await import("./client.ts");
  let capturedHeaders: Record<string, string> | null = null;
  let capturedBody: unknown = null;

  global.fetch = (async (
    _url: string | URL | Request,
    init?: RequestInit
  ) => {
    capturedHeaders = (init?.headers ?? {}) as Record<string, string>;
    capturedBody = init?.body;
    return new Response(
      JSON.stringify({ document_id: "doc-1", filename: "brief.md" }),
      { status: 200 }
    );
  }) as typeof fetch;

  const file = new Blob(["hello"], { type: "text/markdown" });
  const result = await uploadTropicaliaDocument("proj", file, "brief.md");

  assert.ok(capturedBody instanceof FormData);
  assert.ok(capturedHeaders !== null);
  const headerKeys = Object.keys(capturedHeaders as Record<string, string>).map((k) =>
    k.toLowerCase()
  );
  assert.ok(!headerKeys.includes("content-type"));
  assert.deepEqual(result, { document_id: "doc-1", filename: "brief.md" });
});
