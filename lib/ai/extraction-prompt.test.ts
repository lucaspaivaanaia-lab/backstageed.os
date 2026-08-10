import { test } from "node:test";
import assert from "node:assert/strict";
import { buildExtractionPrompt } from "./extraction-prompt.ts";

test("buildExtractionPrompt: POSITIVE - includes client name, file content, and the instruction", () => {
  const prompt = buildExtractionPrompt(
    "Cliente A",
    "CLIENTE-A",
    [{ filename: "briefing.pdf", content: "Objetivo: crescer no LinkedIn" }],
    "Extraia o briefing estratégico."
  );
  assert.match(prompt, /Cliente A/);
  assert.match(prompt, /briefing\.pdf/);
  assert.match(prompt, /crescer no LinkedIn/);
  assert.match(prompt, /Extraia o briefing estratégico\./);
});

test("buildExtractionPrompt: NEGATIVE - never includes another client's file content (leakage guard, mirrors assemble-prompt.ts)", () => {
  const promptA = buildExtractionPrompt(
    "Cliente A",
    "CLIENTE-A",
    [{ filename: "a.pdf", content: "Segredo do Cliente A" }],
    "instrução"
  );
  assert.doesNotMatch(promptA, /Segredo do Cliente B/);

  const promptB = buildExtractionPrompt(
    "Cliente B",
    "CLIENTE-B",
    [{ filename: "b.pdf", content: "Segredo do Cliente B" }],
    "instrução"
  );
  assert.doesNotMatch(promptB, /Segredo do Cliente A/);
});

test("buildExtractionPrompt: POSITIVE - empty files list still yields a valid prompt with a placeholder, not an empty block", () => {
  const prompt = buildExtractionPrompt("Cliente A", "CLIENTE-A", [], "instrução");
  assert.match(prompt, /Cliente A/);
  assert.match(prompt, /nenhum arquivo de referência disponível/);
  assert.match(prompt, /instrução/);
});

test("buildExtractionPrompt: POSITIVE - multiple files are all included with their own filename label", () => {
  const prompt = buildExtractionPrompt(
    "Cliente A",
    "CLIENTE-A",
    [
      { filename: "um.md", content: "Conteúdo um" },
      { filename: "dois.md", content: "Conteúdo dois" },
    ],
    "instrução"
  );
  assert.match(prompt, /um\.md/);
  assert.match(prompt, /Conteúdo um/);
  assert.match(prompt, /dois\.md/);
  assert.match(prompt, /Conteúdo dois/);
});

test("buildExtractionPrompt: POSITIVE - tag renders as a labeled reference code, and the anti-confusion instruction is present", () => {
  const prompt = buildExtractionPrompt(
    "Cliente A",
    "CLIENTE-A",
    [],
    "instrução"
  );
  assert.match(prompt, /código de referência: CLIENTE-A/);
  assert.match(prompt, /Cliente A/);
  assert.match(prompt, /NÃO as confunda com o cliente/);
});

test("buildExtractionPrompt: POSITIVE - tag remains the labeled identifier even when a file mentions another client's name in full", () => {
  const prompt = buildExtractionPrompt(
    "Cliente A",
    "CLIENTE-A",
    [
      {
        filename: "ata-reuniao.md",
        content:
          "A reunião também citou o Cliente B e sua estratégia de skincare.",
      },
    ],
    "instrução"
  );
  assert.match(prompt, /código de referência: CLIENTE-A/);
  assert.match(prompt, /NÃO as confunda com o cliente/);
});
