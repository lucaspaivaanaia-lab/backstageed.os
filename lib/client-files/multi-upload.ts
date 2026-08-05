// Quick task 260805-dkr: permitir selecionar e enviar múltiplos arquivos de
// uma vez em "Arquivos do cliente". Helpers puros (sem I/O), usados pela UI
// (components/clients/client-files-section.tsx) para cortar a seleção pelas
// vagas restantes e resumir o resultado de um lote de uploads. `uploadClientFile`
// continua sendo chamada uma vez por arquivo — nada aqui faz I/O.

import { FILE_LIMIT } from "./limit.ts";

/** Vagas restantes até o teto de FILE_LIMIT, nunca negativo. */
export function remainingSlots(currentCount: number): number {
  return Math.max(0, FILE_LIMIT - currentCount);
}

/**
 * Corta `items` nas vagas restantes (calculadas a partir de `currentCount`),
 * preservando a ordem da seleção original. Os itens que não cabem vão para
 * `skipped`.
 */
export function splitBySlots<T>(
  items: T[],
  currentCount: number
): { accepted: T[]; skipped: T[] } {
  const slots = remainingSlots(currentCount);
  return {
    accepted: items.slice(0, slots),
    skipped: items.slice(slots),
  };
}

export type UploadOutcome = { filename: string; error?: string };

/**
 * Resume o resultado de um lote de uploads: `successCount` conta os itens
 * sem `error`. `message` é `null` somente quando não há nenhuma falha e
 * nenhum item pulado por falta de vaga — caso contrário monta um texto em
 * pt-BR, uma linha por falha (`"<filename>: <error>"`), seguido (se houver
 * pulados) de uma linha final citando os nomes pulados e o limite de
 * FILE_LIMIT arquivos por cliente. Nunca silencioso.
 */
export function summarizeUploadOutcomes(
  outcomes: UploadOutcome[],
  skippedNames: string[]
): { successCount: number; message: string | null } {
  const failures = outcomes.filter(
    (outcome): outcome is UploadOutcome & { error: string } =>
      Boolean(outcome.error)
  );
  const successCount = outcomes.length - failures.length;

  if (failures.length === 0 && skippedNames.length === 0) {
    return { successCount, message: null };
  }

  const lines = failures.map(
    (failure) => `${failure.filename}: ${failure.error}`
  );

  if (skippedNames.length > 0) {
    const verb = skippedNames.length === 1 ? "não foi enviado" : "não foram enviados";
    lines.push(
      `${skippedNames.join(", ")} ${verb} — limite de ${FILE_LIMIT} arquivos por cliente.`
    );
  }

  return { successCount, message: lines.join("\n") };
}
