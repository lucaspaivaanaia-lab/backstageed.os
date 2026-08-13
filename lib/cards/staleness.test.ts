import { test } from "node:test";
import assert from "node:assert/strict";
import {
  daysSinceUpdate,
  stalenessTier,
  stalenessBadgeCopy,
  stalenessTone,
} from "./staleness.ts";

const FIXED_NOW = new Date("2026-08-13T12:00:00.000Z");
const DAY_MS = 86400000;

function hoursAgo(hours: number): string {
  return new Date(FIXED_NOW.getTime() - hours * 60 * 60 * 1000).toISOString();
}

test("daysSinceUpdate: now exactly equal to the timestamp returns 0", () => {
  assert.equal(daysSinceUpdate(FIXED_NOW.toISOString(), FIXED_NOW), 0);
});

test("daysSinceUpdate: floors -- 47h59m ago returns 1", () => {
  assert.equal(daysSinceUpdate(hoursAgo(47.9833), FIXED_NOW), 1);
});

test("daysSinceUpdate: floors -- 48h ago returns 2", () => {
  assert.equal(daysSinceUpdate(hoursAgo(48), FIXED_NOW), 2);
});

test("daysSinceUpdate: clamps a future updated_at (clock skew) to 0", () => {
  const future = new Date(FIXED_NOW.getTime() + DAY_MS).toISOString();
  assert.equal(daysSinceUpdate(future, FIXED_NOW), 0);
});

test("stalenessTier: 2 days is fresh", () => {
  assert.equal(stalenessTier(2), "fresh");
});

test("stalenessTier: 3 days is stalled", () => {
  assert.equal(stalenessTier(3), "stalled");
});

test("stalenessTier: 6 days is stalled", () => {
  assert.equal(stalenessTier(6), "stalled");
});

test("stalenessTier: 7 days is overdue", () => {
  assert.equal(stalenessTier(7), "overdue");
});

test("stalenessTier: 0 days is fresh", () => {
  assert.equal(stalenessTier(0), "fresh");
});

test("stalenessBadgeCopy: 0 days is exactly 'Atualizado hoje'", () => {
  assert.equal(stalenessBadgeCopy(0), "Atualizado hoje");
});

test("stalenessBadgeCopy: 1 day is exactly 'Atualizado ontem'", () => {
  assert.equal(stalenessBadgeCopy(1), "Atualizado ontem");
});

test("stalenessBadgeCopy: 2 days is exactly 'Atualizado há 2 dias'", () => {
  assert.equal(stalenessBadgeCopy(2), "Atualizado há 2 dias");
});

test("stalenessBadgeCopy: 3 days is exactly 'Parado há 3 dias'", () => {
  assert.equal(stalenessBadgeCopy(3), "Parado há 3 dias");
});

test("stalenessBadgeCopy: 14 days is exactly 'Parado há 14 dias'", () => {
  assert.equal(stalenessBadgeCopy(14), "Parado há 14 dias");
});

test("stalenessTone: fresh maps to neutral", () => {
  assert.equal(stalenessTone("fresh"), "neutral");
});

test("stalenessTone: stalled maps to warning", () => {
  assert.equal(stalenessTone("stalled"), "warning");
});

test("stalenessTone: overdue maps to danger", () => {
  assert.equal(stalenessTone("overdue"), "danger");
});
