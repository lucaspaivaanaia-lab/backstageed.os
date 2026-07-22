import { test } from "node:test";
import assert from "node:assert/strict";
import { extractDocumentText, UnreadableFileError, MIN_CHARS } from "./extract-text.ts";

test("extractDocumentText: POSITIVE - TXT/MD passthrough returns trimmed text when >= MIN_CHARS", async () => {
  const buffer = Buffer.from("Este e um texto de teste com bastante conteudo legivel.", "utf-8");
  const result = await extractDocumentText(buffer, "txt");
  assert.equal(result, "Este e um texto de teste com bastante conteudo legivel.");
});

test("extractDocumentText: POSITIVE - MD passthrough behaves the same as TXT", async () => {
  const buffer = Buffer.from("# Titulo\n\nConteudo em markdown com bastante texto legivel aqui.", "utf-8");
  const result = await extractDocumentText(buffer, "md");
  assert.match(result, /Titulo/);
  assert.match(result, /Conteudo em markdown/);
});

test("extractDocumentText: NEGATIVE - whitespace-only input below MIN_CHARS throws UnreadableFileError", async () => {
  const buffer = Buffer.from("    \n\n   \t  ", "utf-8");
  await assert.rejects(
    () => extractDocumentText(buffer, "txt"),
    UnreadableFileError
  );
});

test("extractDocumentText: NEGATIVE - text shorter than MIN_CHARS throws UnreadableFileError (never returns empty/short string as success)", async () => {
  const shortText = "a".repeat(MIN_CHARS - 1);
  const buffer = Buffer.from(shortText, "utf-8");
  await assert.rejects(
    () => extractDocumentText(buffer, "txt"),
    UnreadableFileError
  );
});

test("extractDocumentText: POSITIVE - UnreadableFileError is an instanceof Error", () => {
  const err = new UnreadableFileError("test");
  assert.ok(err instanceof Error);
  assert.ok(err instanceof UnreadableFileError);
});
