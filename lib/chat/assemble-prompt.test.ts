import { test } from "node:test";
import assert from "node:assert/strict";
import { assembleSystemPrompt } from "./assemble-prompt.ts";

const CLIENT_A = {
  name: "Cliente A",
  tag: "CLIENTE-A",
  objective: "Crescer no LinkedIn",
  tone_of_voice: "Formal e direto",
  target_audience: "Gestores de RH",
  content_pillars: ["Carreira", "Liderança"],
};

const CLIENT_B = {
  name: "Cliente B",
  tag: "CLIENTE-B",
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

test("assembleSystemPrompt: POSITIVE - empty files list still yields a briefing-inclusive prompt (degraded mode, D-07)", () => {
  const prompt = assembleSystemPrompt(CLIENT_A, []);
  assert.match(prompt, /Cliente A/);
  assert.match(prompt, /Crescer no LinkedIn/);
});

test("assembleSystemPrompt: POSITIVE - non-empty files list appends filename + content (same code path, no separate branch)", () => {
  const withFiles = assembleSystemPrompt(CLIENT_A, [
    { filename: "notas.md", content: "Trecho recuperado X" },
  ]);
  const withoutFiles = assembleSystemPrompt(CLIENT_A, []);
  assert.match(withFiles, /notas\.md/);
  assert.match(withFiles, /Trecho recuperado X/);
  assert.doesNotMatch(withoutFiles, /Trecho recuperado X/);
});

test("assembleSystemPrompt: POSITIVE - null briefing fields are omitted cleanly, not rendered as 'null'", () => {
  const prompt = assembleSystemPrompt(
    {
      name: "Cliente C",
      tag: "CLIENTE-C",
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

test("assembleSystemPrompt: POSITIVE - tag renders as a labeled reference code, and the anti-confusion instruction is present", () => {
  const prompt = assembleSystemPrompt(CLIENT_A, []);
  assert.match(prompt, /código de referência: CLIENTE-A/);
  assert.match(prompt, /Cliente A/);
  assert.match(prompt, /NÃO as confunda com o cliente/);
});

test("assembleSystemPrompt: POSITIVE - tag remains the labeled identifier even when a client's own file mentions another client's name in full", () => {
  const prompt = assembleSystemPrompt(CLIENT_A, [
    {
      filename: "ata-reuniao.md",
      content:
        "A reunião também citou o Cliente B e sua estratégia de skincare.",
    },
  ]);
  assert.match(prompt, /código de referência: CLIENTE-A/);
  assert.match(prompt, /NÃO as confunda com o cliente/);
});

test("assembleSystemPrompt: POSITIVE - LinkedIn formatting rules are present (260811-du5, item 6 of the 2026-08-05 action plan)", () => {
  const prompt = assembleSystemPrompt(CLIENT_A, []);
  assert.match(prompt, /nunca use travessão/);
  assert.match(prompt, /nem asterisco/);
  assert.match(prompt, /parágrafos curtos/);
  assert.match(prompt, /no máximo 2 linhas/);
  assert.match(prompt, /uma linha em branco entre parágrafos/);
  assert.match(prompt, /otimize a formatação para leitura no LinkedIn/);
});

test("assembleSystemPrompt: POSITIVE - edit-in-place correction instruction is present (260811-du5)", () => {
  const prompt = assembleSystemPrompt(CLIENT_A, []);
  assert.match(prompt, /edite o conteúdo existente/);
  assert.match(prompt, /devolva a versão corrigida completa/);
  assert.match(prompt, /nunca recomece do zero/);
});

test("assembleSystemPrompt: POSITIVE - formatting/edit-in-place instructions appear before the client's briefing content (T-2-02 ordering, 260811-du5)", () => {
  const prompt = assembleSystemPrompt(CLIENT_A, []);
  const formattingIndex = prompt.indexOf("nunca use travessão");
  const briefingIndex = prompt.indexOf(CLIENT_A.name);
  assert.ok(formattingIndex >= 0, "formatting instruction should be present");
  assert.ok(briefingIndex >= 0, "client name should be present");
  assert.ok(
    formattingIndex < briefingIndex,
    "formatting instruction should appear before the client's briefing content"
  );
});
