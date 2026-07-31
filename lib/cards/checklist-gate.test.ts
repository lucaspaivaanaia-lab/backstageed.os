import { test } from "node:test";
import assert from "node:assert/strict";
import {
  checklistProgress,
  isGateBlocked,
  GATE_BLOCKED_MESSAGE,
} from "./checklist-gate.ts";

test("checklistProgress: EMPTY - no items returns total 0, checked 0", () => {
  assert.deepEqual(checklistProgress([]), { total: 0, checked: 0 });
});

test("checklistProgress: MIXED - one checked, one unchecked returns total 2, checked 1", () => {
  assert.deepEqual(
    checklistProgress([
      { completed_at: null },
      { completed_at: "2026-07-31T00:00:00Z" },
    ]),
    { total: 2, checked: 1 }
  );
});

test("isGateBlocked: EMPTY - no items is not blocked (fail-safe for no-template clients)", () => {
  assert.equal(isGateBlocked([]), false);
});

test("isGateBlocked: ALL CHECKED - single checked item is not blocked", () => {
  assert.equal(
    isGateBlocked([{ completed_at: "2026-07-31T00:00:00Z" }]),
    false
  );
});

test("isGateBlocked: UNCHECKED - single unchecked item is blocked", () => {
  assert.equal(isGateBlocked([{ completed_at: null }]), true);
});

test("isGateBlocked: MIXED - one checked, one unchecked is blocked", () => {
  assert.equal(
    isGateBlocked([
      { completed_at: "2026-07-31T00:00:00Z" },
      { completed_at: null },
    ]),
    true
  );
});

test("GATE_BLOCKED_MESSAGE: EXACT - matches the verbatim UI-SPEC copy", () => {
  assert.equal(
    GATE_BLOCKED_MESSAGE,
    "Existem itens do checklist não concluídos. Marque todos os itens antes de avançar."
  );
});
