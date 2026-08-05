import { test } from "node:test";
import assert from "node:assert/strict";
import {
  cardFieldsFromChatText,
  IMPORTED_TITLE_FALLBACK,
} from "./chat-import.ts";

test("cardFieldsFromChatText: multiline text -> first line is title, full text is description", () => {
  const result = cardFieldsFromChatText("Título do post\n\nCorpo do post");
  assert.equal(result.title, "Título do post");
  assert.equal(result.description, "Título do post\n\nCorpo do post");
});

test("cardFieldsFromChatText: leading/trailing whitespace and blank lines are trimmed first", () => {
  const result = cardFieldsFromChatText("\n\n  Olá\nmundo  \n");
  assert.equal(result.title, "Olá");
  assert.equal(result.description, "Olá\nmundo");
});

test("cardFieldsFromChatText: CRLF line endings never leave a dangling \\r on the title", () => {
  const result = cardFieldsFromChatText("Título\r\nCorpo");
  assert.equal(result.title, "Título");
});

test("cardFieldsFromChatText: empty/whitespace-only text falls back to the fixed title and empty description", () => {
  const empty = cardFieldsFromChatText("");
  assert.equal(empty.title, IMPORTED_TITLE_FALLBACK);
  assert.equal(empty.description, "");

  const whitespaceOnly = cardFieldsFromChatText("   \n\t  ");
  assert.equal(whitespaceOnly.title, IMPORTED_TITLE_FALLBACK);
  assert.equal(whitespaceOnly.description, "");
});

test("cardFieldsFromChatText: first line longer than 200 chars is truncated to exactly 200", () => {
  const longLine = "a".repeat(250);
  const result = cardFieldsFromChatText(longLine);
  assert.equal(result.title.length, 200);
  assert.equal(result.title, "a".repeat(200));
});

test("cardFieldsFromChatText: text longer than 5000 chars is truncated to exactly 5000 in description", () => {
  const longText = "b".repeat(6000);
  const result = cardFieldsFromChatText(longText);
  assert.equal(result.description.length, 5000);
  assert.equal(result.description, "b".repeat(5000));
});

test("cardFieldsFromChatText: single-line text has title === description", () => {
  const result = cardFieldsFromChatText("Só uma linha aqui");
  assert.equal(result.title, result.description);
  assert.equal(result.title, "Só uma linha aqui");
});
