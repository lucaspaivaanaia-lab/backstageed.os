import { test } from "node:test";
import assert from "node:assert/strict";
import { evaluateMove, MOVE_SKIPS_REVIEW_MESSAGE } from "./move-rules.ts";
import { GATE_BLOCKED_MESSAGE } from "./checklist-gate.ts";

const C = { completed_at: "2026-07-31T00:00:00Z" };
const U = { completed_at: null };

test("evaluateMove: no-op move (briefing -> briefing) is always allowed", () => {
  assert.deepEqual(evaluateMove("briefing", "briefing", []), {
    allowed: true,
  });
});

test("evaluateMove: forward move within the pre-review span is allowed", () => {
  assert.deepEqual(evaluateMove("briefing", "producao", []), {
    allowed: true,
  });
});

test("evaluateMove: landing ON revisão interna is always allowed", () => {
  assert.deepEqual(evaluateMove("producao", "revisao_interna", []), {
    allowed: true,
  });
});

test("evaluateMove: forward move jumping over revisão interna is rejected", () => {
  assert.deepEqual(evaluateMove("briefing", "aprovacao_cliente", []), {
    allowed: false,
    reason: MOVE_SKIPS_REVIEW_MESSAGE,
  });
});

test("evaluateMove: skip rule fires regardless of checklist state", () => {
  assert.deepEqual(evaluateMove("producao", "agendamento", [C]), {
    allowed: false,
    reason: MOVE_SKIPS_REVIEW_MESSAGE,
  });
});

test("evaluateMove: leaving revisão interna forward with an unchecked item is blocked (D-13)", () => {
  assert.deepEqual(evaluateMove("revisao_interna", "aprovacao_cliente", [U]), {
    allowed: false,
    reason: GATE_BLOCKED_MESSAGE,
  });
});

test("evaluateMove: leaving revisão interna forward with one unchecked among checked items is blocked", () => {
  assert.deepEqual(
    evaluateMove("revisao_interna", "aprovacao_cliente", [C, U]),
    { allowed: false, reason: GATE_BLOCKED_MESSAGE }
  );
});

test("evaluateMove: leaving revisão interna forward with all items checked is allowed", () => {
  assert.deepEqual(
    evaluateMove("revisao_interna", "aprovacao_cliente", [C, C]),
    { allowed: true }
  );
});

test("evaluateMove: leaving revisão interna forward with no checklist items is allowed (Pitfall 3 fail-safe)", () => {
  assert.deepEqual(evaluateMove("revisao_interna", "aprovacao_cliente", []), {
    allowed: true,
  });
});

test("evaluateMove: leaving revisão interna forward all the way to agendamento is blocked when unchecked", () => {
  assert.deepEqual(evaluateMove("revisao_interna", "agendamento", [U]), {
    allowed: false,
    reason: GATE_BLOCKED_MESSAGE,
  });
});

test("evaluateMove: BACKWARD move out of revisão interna is never gated", () => {
  assert.deepEqual(evaluateMove("revisao_interna", "producao", [U]), {
    allowed: true,
  });
});

test("evaluateMove: backward moves are unrestricted in general", () => {
  assert.deepEqual(evaluateMove("agendamento", "briefing", [U]), {
    allowed: true,
  });
});

test("MOVE_SKIPS_REVIEW_MESSAGE: exact string contract", () => {
  assert.equal(
    MOVE_SKIPS_REVIEW_MESSAGE,
    "Um card precisa passar pela revisão interna antes de seguir para as etapas seguintes."
  );
});
