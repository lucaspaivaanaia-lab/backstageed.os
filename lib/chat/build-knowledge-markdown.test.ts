import { test } from "node:test";
import assert from "node:assert/strict";
import { buildKnowledgeMarkdown } from "./build-knowledge-markdown.ts";

const MSG_1 = {
  id: "11111111-1111-1111-1111-111111111111",
  role: "user" as const,
  content: "Qual o melhor horário para postar no LinkedIn?",
  created_at: "2026-07-20T10:00:00Z",
};

const MSG_2 = {
  id: "22222222-2222-2222-2222-222222222222",
  role: "assistant" as const,
  content: "Terças e quintas entre 8h e 10h costumam ter melhor alcance.",
  created_at: "2026-07-20T10:00:05Z",
};

// NOT included in the input list passed to buildKnowledgeMarkdown below —
// must never appear in the output.
const MSG_3_EXCLUDED = {
  id: "33333333-3333-3333-3333-333333333333",
  role: "user" as const,
  content: "Essa mensagem NAO foi selecionada e nao deve aparecer no markdown.",
  created_at: "2026-07-20T10:00:10Z",
};

test("buildKnowledgeMarkdown: POSITIVE - includes only the provided messages' content", () => {
  const markdown = buildKnowledgeMarkdown("Cliente A", [MSG_1, MSG_2]);
  assert.match(markdown, /Qual o melhor horário para postar no LinkedIn\?/);
  assert.match(markdown, /Terças e quintas entre 8h e 10h costumam ter melhor alcance\./);
});

test("buildKnowledgeMarkdown: NEGATIVE - a message not in the input list never appears in the output", () => {
  const markdown = buildKnowledgeMarkdown("Cliente A", [MSG_1, MSG_2]);
  assert.doesNotMatch(markdown, /NAO foi selecionada/);
});

test("buildKnowledgeMarkdown: POSITIVE - renders messages in chronological (created_at ascending) order regardless of input order", () => {
  // Passed out of order (MSG_2 before MSG_1) to prove sorting happens.
  const markdown = buildKnowledgeMarkdown("Cliente A", [MSG_2, MSG_1]);
  const indexOfFirst = markdown.indexOf(MSG_1.content);
  const indexOfSecond = markdown.indexOf(MSG_2.content);
  assert.ok(indexOfFirst >= 0, "MSG_1 content should be present");
  assert.ok(indexOfSecond >= 0, "MSG_2 content should be present");
  assert.ok(
    indexOfFirst < indexOfSecond,
    "MSG_1 (earlier created_at) should render before MSG_2 (later created_at)"
  );
});

test("buildKnowledgeMarkdown: POSITIVE - includes the client name and labels turns by role", () => {
  const markdown = buildKnowledgeMarkdown("Cliente A", [MSG_1, MSG_2]);
  assert.match(markdown, /Cliente A/);
  // PM question vs. AI answer labeling (role-based).
  assert.match(markdown, /Pergunta/i);
  assert.match(markdown, /Resposta/i);
});
