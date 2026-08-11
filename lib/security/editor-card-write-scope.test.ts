import { test } from "node:test";
import assert from "node:assert/strict";
import {
  EDITOR_CARD_UPDATE_KEYS,
  buildEditorCardUpdatePayload,
} from "./editor-card-write-scope.ts";

const FORBIDDEN_KEYS = [
  "stage",
  "assignee_id",
  "media_assignee_id",
  "channel",
  "due_date",
];

test("buildEditorCardUpdatePayload: payload keys are EXACTLY description + updated_at", () => {
  const payload = buildEditorCardUpdatePayload("texto");
  assert.deepEqual(Object.keys(payload).sort(), ["description", "updated_at"]);
});

test("buildEditorCardUpdatePayload: null description is preserved, not coerced", () => {
  const payload = buildEditorCardUpdatePayload(null);
  assert.equal(payload.description, null);
});

for (const forbidden of FORBIDDEN_KEYS) {
  test(`buildEditorCardUpdatePayload: NEGATIVE - payload never includes '${forbidden}'`, () => {
    const payload = buildEditorCardUpdatePayload("texto") as Record<string, unknown>;
    assert.equal(forbidden in payload, false);
  });
}

test("EDITOR_CARD_UPDATE_KEYS: NEGATIVE - the allowed key list itself never includes a forbidden column", () => {
  for (const forbidden of FORBIDDEN_KEYS) {
    assert.equal((EDITOR_CARD_UPDATE_KEYS as readonly string[]).includes(forbidden), false);
  }
});
