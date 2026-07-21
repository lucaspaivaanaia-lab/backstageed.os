import { test } from "node:test";
import assert from "node:assert/strict";
import { shouldAppendChunk } from "./stale-response-guard.ts";

test("shouldAppendChunk: POSITIVE - same client id as the active client is appendable", () => {
  assert.equal(shouldAppendChunk("A", "A"), true);
});

test("shouldAppendChunk: NEGATIVE - a different active client (switched mid-stream) is not appendable", () => {
  assert.equal(shouldAppendChunk("A", "B"), false);
});
