import { test } from "node:test";
import assert from "node:assert/strict";
import { isEditorProvisionAuthorized } from "./editor-access-authz.ts";

test("isEditorProvisionAuthorized: POSITIVE - admin is authorized", () => {
  assert.equal(isEditorProvisionAuthorized({ isAdmin: true, isPm: false }), true);
});

test("isEditorProvisionAuthorized: POSITIVE - any approved PM is authorized", () => {
  assert.equal(isEditorProvisionAuthorized({ isAdmin: false, isPm: true }), true);
});

test("isEditorProvisionAuthorized: NEGATIVE - neither admin nor pm is not authorized", () => {
  assert.equal(isEditorProvisionAuthorized({ isAdmin: false, isPm: false }), false);
});
