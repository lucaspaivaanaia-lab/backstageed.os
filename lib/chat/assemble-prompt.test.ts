import { test } from "node:test";
import assert from "node:assert/strict";
import { assembleSystemPrompt } from "./assemble-prompt.ts";

const CLIENT_A = {
  name: "Cliente A",
  objective: "Crescer no LinkedIn",
  tone_of_voice: "Formal e direto",
  target_audience: "Gestores de RH",
  content_pillars: ["Carreira", "Liderança"],
};

const CLIENT_B = {
  name: "Cliente B",
  objective: "Vender produtos de skincare",
  tone_of_voice: "Descontraído",
  target_audience: "Consumidoras 20-35",
  content_pillars: ["Beleza", "Autocuidado"],
};

test("assembleSystemPrompt: POSITIVE - includes the client's own name and briefing fields", () => {
  const prompt = assembleSystemPrompt(CLIENT_A, []);
  assert.match(prompt, /Cliente A/);
  assert.match(prompt, /Crescer no LinkedIn/);
  assert.match(prompt, /Formal e direto/);
  assert.match(prompt, /Gestores de RH/);
  assert.match(prompt, /Carreira/);
});

test("assembleSystemPrompt: NEGATIVE - never includes another client's name/fields (CTX-01/CTX-02 leakage guard)", () => {
  const promptA = assembleSystemPrompt(CLIENT_A, []);
  assert.doesNotMatch(promptA, /Cliente B/);
  assert.doesNotMatch(promptA, /Vender produtos de skincare/);
  assert.doesNotMatch(promptA, /Descontraído/);
  assert.doesNotMatch(promptA, /Consumidoras 20-35/);
  assert.doesNotMatch(promptA, /Beleza/);

  const promptB = assembleSystemPrompt(CLIENT_B, []);
  assert.doesNotMatch(promptB, /Cliente A/);
  assert.doesNotMatch(promptB, /Crescer no LinkedIn/);
});

test("assembleSystemPrompt: POSITIVE - empty retrievedChunks still yields a briefing-inclusive prompt (degraded mode, D-07)", () => {
  const prompt = assembleSystemPrompt(CLIENT_A, []);
  assert.match(prompt, /Cliente A/);
  assert.match(prompt, /Crescer no LinkedIn/);
});

test("assembleSystemPrompt: POSITIVE - non-empty chunk list appends the chunk text (same code path, no separate branch)", () => {
  const withChunks = assembleSystemPrompt(CLIENT_A, [{ document: "Trecho recuperado X" }]);
  const withoutChunks = assembleSystemPrompt(CLIENT_A, []);
  assert.match(withChunks, /Trecho recuperado X/);
  assert.doesNotMatch(withoutChunks, /Trecho recuperado X/);
});

test("assembleSystemPrompt: POSITIVE - null briefing fields are omitted cleanly, not rendered as 'null'", () => {
  const prompt = assembleSystemPrompt(
    {
      name: "Cliente C",
      objective: null,
      tone_of_voice: null,
      target_audience: null,
      content_pillars: [],
    },
    []
  );
  assert.match(prompt, /Cliente C/);
  assert.doesNotMatch(prompt, /null/);
});
