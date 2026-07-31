import { test } from "node:test";
import assert from "node:assert/strict";
import { STAGE_ORDER, STAGE_LABELS, nextStage } from "./stages.ts";

test("nextStage: briefing advances to producao", () => {
  assert.equal(nextStage("briefing"), "producao");
});

test("nextStage: revisao_interna advances to aprovacao_cliente", () => {
  assert.equal(nextStage("revisao_interna"), "aprovacao_cliente");
});

test("nextStage: agendamento (last stage) returns null", () => {
  assert.equal(nextStage("agendamento"), null);
});

test("STAGE_ORDER: has exactly 5 entries in the fixed order", () => {
  assert.deepEqual(STAGE_ORDER, [
    "briefing",
    "producao",
    "revisao_interna",
    "aprovacao_cliente",
    "agendamento",
  ]);
});

test("STAGE_LABELS: has a Portuguese label for every STAGE_ORDER entry, no extra keys", () => {
  const labelKeys = Object.keys(STAGE_LABELS).sort();
  const stageKeys = [...STAGE_ORDER].sort();
  assert.deepEqual(labelKeys, stageKeys);
  for (const stage of STAGE_ORDER) {
    assert.equal(typeof STAGE_LABELS[stage], "string");
    assert.ok(STAGE_LABELS[stage].length > 0);
  }
});
