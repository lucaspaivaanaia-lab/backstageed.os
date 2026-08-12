import { test } from "node:test";
import assert from "node:assert/strict";
import { isReadyToPublish } from "./publish-status.ts";

test("isReadyToPublish: TRUE - agendamento stage with publish_at set", () => {
  assert.equal(
    isReadyToPublish({ stage: "agendamento", publish_at: "2026-08-20T12:00:00.000Z" }),
    true
  );
});

test("isReadyToPublish: FALSE - agendamento stage but publish_at null", () => {
  assert.equal(isReadyToPublish({ stage: "agendamento", publish_at: null }), false);
});

test("isReadyToPublish: FALSE - publish_at set but stage not yet agendamento", () => {
  assert.equal(
    isReadyToPublish({ stage: "aprovacao_cliente", publish_at: "2026-08-20T12:00:00.000Z" }),
    false
  );
});

test("isReadyToPublish: FALSE - null stage and null publish_at (e.g. a package parent)", () => {
  assert.equal(isReadyToPublish({ stage: null, publish_at: null }), false);
});
