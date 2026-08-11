import { test } from "node:test";
import assert from "node:assert/strict";
import {
  planningDocToExtractionFile,
  PLANNING_DOC_FILENAME,
} from "./package-proposal.ts";

test("planningDocToExtractionFile: wraps trimmed text under the fixed filename", () => {
  const result = planningDocToExtractionFile(
    "  Semana 1: tema X\nSemana 2: tema Y  "
  );
  assert.equal(result.filename, PLANNING_DOC_FILENAME);
  assert.equal(result.content, "Semana 1: tema X\nSemana 2: tema Y");
});

test("planningDocToExtractionFile: empty/whitespace-only text becomes an empty content string, never crashes", () => {
  const result = planningDocToExtractionFile("   \n\t  ");
  assert.equal(result.content, "");
});

test("planningDocToExtractionFile: preserves internal blank lines and formatting, only trims the outer edges", () => {
  const input = "\n\nTítulo\n\nParágrafo 1\n\nParágrafo 2\n\n";
  const result = planningDocToExtractionFile(input);
  assert.equal(result.content, "Título\n\nParágrafo 1\n\nParágrafo 2");
});
