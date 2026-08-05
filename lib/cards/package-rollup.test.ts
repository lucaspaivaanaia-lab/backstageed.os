import { test } from "node:test";
import assert from "node:assert/strict";
import { packageRollupLabel } from "./package-rollup.ts";
import { STAGE_LABELS } from "./stages.ts";

test("packageRollupLabel: EMPTY - a package with no pieces reports none", () => {
  assert.equal(packageRollupLabel([]), "Nenhuma peça");
});

test("packageRollupLabel: UNANIMOUS - all pieces in the same stage reports a full majority", () => {
  assert.equal(
    packageRollupLabel(["briefing", "briefing", "briefing"]),
    "3/3 em Briefing"
  );
});

test("packageRollupLabel: MAJORITY - a stage holding strictly more than half is the cluster", () => {
  assert.equal(
    packageRollupLabel(["briefing", "briefing", "producao"]),
    "2/3 em Briefing"
  );
});

test("packageRollupLabel: NO MAJORITY - one piece per stage claims no cluster", () => {
  assert.equal(
    packageRollupLabel(["briefing", "producao", "revisao_interna"]),
    "3 peças"
  );
});

test("packageRollupLabel: TIE - a 2/2 split is not a majority", () => {
  assert.equal(
    packageRollupLabel(["briefing", "briefing", "producao", "producao"]),
    "4 peças"
  );
});

test("packageRollupLabel: SINGLE PIECE - one piece is trivially its own majority", () => {
  assert.equal(packageRollupLabel(["agendamento"]), "1/1 em Agendamento");
});

test("packageRollupLabel: LABELS - the majority branch always reads STAGE_LABELS, never an inline string", () => {
  const label = packageRollupLabel(["revisao_interna", "revisao_interna"]);
  assert.equal(label, `2/2 em ${STAGE_LABELS.revisao_interna}`);
});
