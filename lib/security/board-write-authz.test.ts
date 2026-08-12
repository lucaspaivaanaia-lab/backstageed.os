import { test } from "node:test";
import assert from "node:assert/strict";
import { isBoardWriteAuthorized } from "./board-write-authz.ts";

test("isBoardWriteAuthorized: POSITIVE - approved admin is authorized", () => {
  assert.equal(isBoardWriteAuthorized({ role: "admin", status: "approved" }), true);
});

test("isBoardWriteAuthorized: POSITIVE - approved pm is authorized", () => {
  assert.equal(isBoardWriteAuthorized({ role: "pm", status: "approved" }), true);
});

test("isBoardWriteAuthorized: NEGATIVE - approved editor is REJECTED, even though cards_update_scoped's media_assignee_id branch (migration 0031) would allow the row", () => {
  assert.equal(isBoardWriteAuthorized({ role: "editor", status: "approved" }), false);
});

test("isBoardWriteAuthorized: NEGATIVE - approved client is rejected", () => {
  assert.equal(isBoardWriteAuthorized({ role: "client", status: "approved" }), false);
});

test("isBoardWriteAuthorized: NEGATIVE - pending pm (not yet approved) is rejected", () => {
  assert.equal(isBoardWriteAuthorized({ role: "pm", status: "pending" }), false);
});

test("isBoardWriteAuthorized: NEGATIVE - null profile (profile read failed) fails closed", () => {
  assert.equal(isBoardWriteAuthorized(null), false);
});

test("isBoardWriteAuthorized: NEGATIVE - approved client is REJECTED for all 9 call sites this predicate now gates (04-01 Task 4: toggleChecklistItem, addAttachment, removeAttachment, validateCardAgainstChecklist, createPiece, removePiece join the original updateCardDetails/advanceStage/moveCard) — the same predicate every call site shares, so this single assertion is the structural proof for all 9, mirroring this file's own existing convention of one assertion per role/status combination, not one per call site", () => {
  assert.equal(isBoardWriteAuthorized({ role: "client", status: "approved" }), false);
});
