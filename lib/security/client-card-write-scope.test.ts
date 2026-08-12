import { test } from "node:test";
import assert from "node:assert/strict";
import {
  CLIENT_APPROVE_UPDATE_KEYS,
  CLIENT_ADJUST_UPDATE_KEYS,
  buildClientApprovePayload,
  buildClientAdjustPayload,
} from "./client-card-write-scope.ts";

const FORBIDDEN_KEYS = [
  "client_id",
  "channel",
  "assignee_id",
  "media_assignee_id",
  "due_date",
  "publish_at",
];

test("buildClientApprovePayload: payload keys are EXACTLY stage + updated_at", () => {
  const payload = buildClientApprovePayload("aprovacao_cliente");
  assert.deepEqual(Object.keys(payload).sort(), ["stage", "updated_at"]);
});

test("buildClientApprovePayload: stage resolves to agendamento", () => {
  const payload = buildClientApprovePayload("aprovacao_cliente");
  assert.equal(payload.stage, "agendamento");
});

test("buildClientAdjustPayload: payload keys are EXACTLY stage + client_adjustment_comment + updated_at", () => {
  const payload = buildClientAdjustPayload("ajuste");
  assert.deepEqual(Object.keys(payload).sort(), [
    "client_adjustment_comment",
    "stage",
    "updated_at",
  ]);
});

test("buildClientAdjustPayload: stage is always producao", () => {
  const payload = buildClientAdjustPayload("ajuste");
  assert.equal(payload.stage, "producao");
});

test("buildClientAdjustPayload: comment is preserved verbatim", () => {
  const payload = buildClientAdjustPayload("Ajustar o CTA");
  assert.equal(payload.client_adjustment_comment, "Ajustar o CTA");
});

for (const forbidden of FORBIDDEN_KEYS) {
  test(`buildClientAdjustPayload: NEGATIVE - payload never includes '${forbidden}'`, () => {
    const payload = buildClientAdjustPayload("ajuste") as Record<string, unknown>;
    assert.equal(forbidden in payload, false);
  });
}

for (const forbidden of FORBIDDEN_KEYS) {
  test(`buildClientApprovePayload: NEGATIVE - payload never includes '${forbidden}'`, () => {
    const payload = buildClientApprovePayload("aprovacao_cliente") as Record<
      string,
      unknown
    >;
    assert.equal(forbidden in payload, false);
  });
}

test("CLIENT_APPROVE_UPDATE_KEYS/CLIENT_ADJUST_UPDATE_KEYS: NEGATIVE - the allowed key lists never include a forbidden column", () => {
  for (const forbidden of FORBIDDEN_KEYS) {
    assert.equal(
      (CLIENT_APPROVE_UPDATE_KEYS as readonly string[]).includes(forbidden),
      false
    );
    assert.equal(
      (CLIENT_ADJUST_UPDATE_KEYS as readonly string[]).includes(forbidden),
      false
    );
  }
});
