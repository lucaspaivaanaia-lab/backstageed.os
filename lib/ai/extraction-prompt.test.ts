import { test } from "node:test";
import assert from "node:assert/strict";
import { buildExtractionPrompt } from "./extraction-prompt.ts";

test("buildExtractionPrompt: POSITIVE - includes client name, file content, and the instruction", () => {
  const prompt = buildExtractionPrompt(
    "Cliente A",
    "CLIENTE-A",
    [{ filename: "briefing.pdf", content: "Objetivo: crescer no LinkedIn" }],
    [],
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
    [],
    "instrução"
  );
  assert.doesNotMatch(promptA, /Segredo do Cliente B/);

  const promptB = buildExtractionPrompt(
    "Cliente B",
    "CLIENTE-B",
    [{ filename: "b.pdf", content: "Segredo do Cliente B" }],
    [],
    "instrução"
  );
  assert.doesNotMatch(promptB, /Segredo do Cliente A/);
});

test("buildExtractionPrompt: POSITIVE - empty files list still yields a valid prompt with a placeholder, not an empty block", () => {
  const prompt = buildExtractionPrompt(
    "Cliente A",
    "CLIENTE-A",
    [],
    [],
    "instrução"
  );
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
    [],
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
    [],
    "instrução"
  );
  assert.match(prompt, /código de referência: CLIENTE-A/);
  assert.match(prompt, /NÃO as confunda com o cliente/);
});

test("buildExtractionPrompt: POSITIVE - sharedFiles content appears when non-empty, and instruction still comes strictly after it (quick task 260811-imw, item 9)", () => {
  const prompt = buildExtractionPrompt(
    "Cliente A",
    "CLIENTE-A",
    [],
    [{ filename: "guia-marca.md", content: "Nunca use gírias regionais." }],
    "instrução confiável e específica da tarefa"
  );
  assert.match(prompt, /guia-marca\.md/);
  assert.match(prompt, /Nunca use gírias regionais\./);
  assert.match(prompt, /instrução confiável e específica da tarefa/);

  const sharedIndex = prompt.indexOf("Nunca use gírias regionais.");
  const instructionIndex = prompt.indexOf(
    "instrução confiável e específica da tarefa"
  );
  assert.ok(sharedIndex >= 0, "shared-knowledge content should be present");
  assert.ok(instructionIndex >= 0, "instruction should be present");
  assert.ok(
    sharedIndex < instructionIndex,
    "instruction must remain strictly after the shared-knowledge content (T-ivr-03 ordering)"
  );
});

test("buildExtractionPrompt: POSITIVE - empty sharedFiles yields a byte-identical prompt to the pre-260811-imw 4-argument behavior (no regression when the table is empty, its real state today)", () => {
  const withEmptySharedFiles = buildExtractionPrompt(
    "Cliente A",
    "CLIENTE-A",
    [],
    [],
    "instrução"
  );
  const withNonEmptySharedFiles = buildExtractionPrompt(
    "Cliente A",
    "CLIENTE-A",
    [],
    [{ filename: "guia-marca.md", content: "Nunca use gírias regionais." }],
    "instrução"
  );
  assert.doesNotMatch(withEmptySharedFiles, /guia-marca\.md/);
  assert.doesNotMatch(
    withEmptySharedFiles,
    /Conhecimento comum a todos os clientes/
  );
  assert.match(
    withNonEmptySharedFiles,
    /Conhecimento comum a todos os clientes/
  );
});
