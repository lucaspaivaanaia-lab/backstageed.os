import { test } from "node:test";
import assert from "node:assert/strict";
import { computeWorkload, type WorkloadPerson, type WorkloadCard } from "./workload.ts";

const PM: WorkloadPerson = { id: "pm-1", email: "pm@example.com", role: "pm" };
const EDITOR: WorkloadPerson = {
  id: "editor-1",
  email: "editor@example.com",
  role: "editor",
};

test("computeWorkload: a PM row counts only assignee_id, not media_assignee_id", () => {
  const cards: WorkloadCard[] = [
    { stage: "briefing", assignee_id: PM.id, media_assignee_id: null },
    { stage: "producao", assignee_id: null, media_assignee_id: PM.id },
  ];
  const rows = computeWorkload([PM], cards);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].total, 1);
});

test("computeWorkload: an Editor row counts only media_assignee_id, not assignee_id", () => {
  const cards: WorkloadCard[] = [
    { stage: "briefing", assignee_id: EDITOR.id, media_assignee_id: null },
    { stage: "producao", assignee_id: null, media_assignee_id: EDITOR.id },
  ];
  const rows = computeWorkload([EDITOR], cards);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].total, 1);
});

test("computeWorkload: asymmetric attribution when the same id appears in both columns across cards", () => {
  const samePerson: WorkloadPerson = {
    id: "shared-id",
    email: "shared@example.com",
    role: "pm",
  };
  const cards: WorkloadCard[] = [
    { stage: "briefing", assignee_id: samePerson.id, media_assignee_id: null },
    { stage: "producao", assignee_id: null, media_assignee_id: samePerson.id },
    { stage: "revisao_interna", assignee_id: samePerson.id, media_assignee_id: null },
  ];
  const rows = computeWorkload([samePerson], cards);
  assert.equal(rows.length, 1);
  // Only the two cards where they are `assignee_id` (PM role) count.
  assert.equal(rows[0].total, 2);
});

test("computeWorkload: a person with zero matching cards is omitted entirely", () => {
  const rows = computeWorkload([PM, EDITOR], []);
  assert.deepEqual(rows, []);
});

test("computeWorkload: byStage contains one entry per stage with count > 0, in STAGE_ORDER order, never a zero-count stage", () => {
  const cards: WorkloadCard[] = [
    { stage: "agendamento", assignee_id: PM.id, media_assignee_id: null },
    { stage: "briefing", assignee_id: PM.id, media_assignee_id: null },
    { stage: "briefing", assignee_id: PM.id, media_assignee_id: null },
  ];
  const rows = computeWorkload([PM], cards);
  assert.deepEqual(rows[0].byStage, [
    { stage: "briefing", count: 2 },
    { stage: "agendamento", count: 1 },
  ]);
});

test("computeWorkload: total equals the sum of byStage counts", () => {
  const cards: WorkloadCard[] = [
    { stage: "briefing", assignee_id: PM.id, media_assignee_id: null },
    { stage: "producao", assignee_id: PM.id, media_assignee_id: null },
    { stage: "producao", assignee_id: PM.id, media_assignee_id: null },
  ];
  const rows = computeWorkload([PM], cards);
  assert.equal(
    rows[0].total,
    rows[0].byStage.reduce((sum, entry) => sum + entry.count, 0)
  );
});

test("computeWorkload: rows sorted by total descending, ties broken by email ascending", () => {
  const alice: WorkloadPerson = { id: "a", email: "alice@example.com", role: "pm" };
  const bob: WorkloadPerson = { id: "b", email: "bob@example.com", role: "pm" };
  const carol: WorkloadPerson = { id: "c", email: "carol@example.com", role: "pm" };
  const cards: WorkloadCard[] = [
    { stage: "briefing", assignee_id: alice.id, media_assignee_id: null },
    { stage: "briefing", assignee_id: bob.id, media_assignee_id: null },
    { stage: "producao", assignee_id: bob.id, media_assignee_id: null },
    { stage: "briefing", assignee_id: carol.id, media_assignee_id: null },
    { stage: "producao", assignee_id: carol.id, media_assignee_id: null },
  ];
  const rows = computeWorkload([alice, bob, carol], cards);
  assert.deepEqual(
    rows.map((r) => r.email),
    ["bob@example.com", "carol@example.com", "alice@example.com"]
  );
});

test("computeWorkload: an empty people array returns an empty array", () => {
  const cards: WorkloadCard[] = [
    { stage: "briefing", assignee_id: "someone", media_assignee_id: null },
  ];
  assert.deepEqual(computeWorkload([], cards), []);
});

test("computeWorkload: an empty cards array returns an empty array", () => {
  assert.deepEqual(computeWorkload([PM, EDITOR], []), []);
});
