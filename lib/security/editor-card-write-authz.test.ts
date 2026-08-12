import { test } from "node:test";
import assert from "node:assert/strict";
import { isEditorCardWriteAuthorized } from "./editor-card-write-authz.ts";

test("isEditorCardWriteAuthorized: POSITIVE - approved editor is authorized", () => {
  assert.equal(
    isEditorCardWriteAuthorized({ role: "editor", status: "approved" }),
    true
  );
});

test("isEditorCardWriteAuthorized: NEGATIVE - approved client is REJECTED -- closes the live write-boundary bypass migration 0032's Client branch on cards_update_scoped would otherwise open on updateCardDescriptionAsEditor", () => {
  assert.equal(
    isEditorCardWriteAuthorized({ role: "client", status: "approved" }),
    false
  );
});

test("isEditorCardWriteAuthorized: NEGATIVE - approved admin is rejected", () => {
  assert.equal(
    isEditorCardWriteAuthorized({ role: "admin", status: "approved" }),
    false
  );
});

test("isEditorCardWriteAuthorized: NEGATIVE - approved pm is rejected", () => {
  assert.equal(
    isEditorCardWriteAuthorized({ role: "pm", status: "approved" }),
    false
  );
});

test("isEditorCardWriteAuthorized: NEGATIVE - editor not yet approved (status pending) is rejected", () => {
  assert.equal(
    isEditorCardWriteAuthorized({ role: "editor", status: "pending" }),
    false
  );
});

test("isEditorCardWriteAuthorized: NEGATIVE - null profile (profile read failed) fails closed", () => {
  assert.equal(isEditorCardWriteAuthorized(null), false);
});
