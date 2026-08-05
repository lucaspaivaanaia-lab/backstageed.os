import { test } from "node:test";
import assert from "node:assert/strict";
import {
  remainingSlots,
  splitBySlots,
  summarizeUploadOutcomes,
} from "./multi-upload.ts";

test("remainingSlots: POSITIVE - counts down from FILE_LIMIT and never goes negative", () => {
  assert.equal(remainingSlots(0), 3);
  assert.equal(remainingSlots(2), 1);
  assert.equal(remainingSlots(3), 0);
  assert.equal(remainingSlots(5), 0);
});

test("splitBySlots: POSITIVE - cuts items at the remaining slots, preserving selection order", () => {
  const result = splitBySlots(["a", "b", "c", "d"], 1);
  assert.deepEqual(result, { accepted: ["a", "b"], skipped: ["c", "d"] });
});

test("splitBySlots: NEGATIVE - client already at the ceiling accepts nothing", () => {
  const result = splitBySlots(["a"], 3);
  assert.deepEqual(result, { accepted: [], skipped: ["a"] });
});

test("splitBySlots: EDGE - empty selection with zero current count returns both empty", () => {
  const result = splitBySlots([], 0);
  assert.deepEqual(result, { accepted: [], skipped: [] });
});

test("summarizeUploadOutcomes: POSITIVE - full success produces no message", () => {
  const result = summarizeUploadOutcomes(
    [{ filename: "a.pdf" }, { filename: "b.pdf" }],
    []
  );
  assert.deepEqual(result, { successCount: 2, message: null });
});

test("summarizeUploadOutcomes: NEGATIVE - partial failure names only the failed file, not the successful one", () => {
  const result = summarizeUploadOutcomes(
    [
      { filename: "a.pdf" },
      { filename: "b.pdf", error: "Arquivo muito grande. O limite é 5MB." },
    ],
    []
  );
  assert.equal(result.successCount, 1);
  assert.ok(result.message);
  assert.match(result.message, /b\.pdf/);
  assert.match(result.message, /Arquivo muito grande\. O limite é 5MB\./);
  assert.doesNotMatch(result.message, /a\.pdf/);
});

test("summarizeUploadOutcomes: NEGATIVE - total failure still returns a non-null message", () => {
  const result = summarizeUploadOutcomes(
    [{ filename: "a.pdf", error: "X" }],
    []
  );
  assert.equal(result.successCount, 0);
  assert.ok(result.message);
});

test("summarizeUploadOutcomes: EDGE - skipped files (over the slot limit) are named alongside the ceiling number", () => {
  const result = summarizeUploadOutcomes(
    [{ filename: "a.pdf" }],
    ["c.pdf", "d.pdf"]
  );
  assert.equal(result.successCount, 1);
  assert.ok(result.message);
  assert.match(result.message, /c\.pdf/);
  assert.match(result.message, /d\.pdf/);
  assert.match(result.message, /3/);
});
