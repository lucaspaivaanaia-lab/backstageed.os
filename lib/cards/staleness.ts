import type { StatusTone } from "@/components/ui/status-badge";

/**
 * Pure staleness module (ADM-02, D-02). Intentionally free of any
 * Supabase/React import or I/O so this module can be imported by its
 * sibling `staleness.test.ts` via a relative path and exercised with
 * Node's built-in test runner -- no live DB, no Docker (mirrors
 * lib/cards/stages.ts's convention).
 *
 * Source of truth for thresholds and copy: 06-UI-SPEC.md's "Staleness
 * Computation (D-02)" table and Copywriting Contract. `updated_at` resets
 * on any edit, not just a stage transition -- this is an approximation of
 * "stalled," an already-accepted tradeoff (D-02), not a precise
 * time-in-current-stage measure.
 */
export type StalenessTier = "fresh" | "stalled" | "overdue";

/**
 * Computes whole days elapsed between `updatedAt` and `now`, floored and
 * clamped to never go negative (a future `updated_at` from clock skew
 * clamps to 0). The injectable `now` default parameter (not an inline
 * `new Date()` in the body) is what makes tier boundaries assertable
 * against a fixed clock in tests.
 */
export function daysSinceUpdate(updatedAt: string, now: Date = new Date()): number {
  const elapsedMs = now.getTime() - new Date(updatedAt).getTime();
  return Math.max(0, Math.floor(elapsedMs / 86400000));
}

/**
 * Buckets a day count into one of three staleness tiers per the UI-SPEC
 * table: fresh (<3 days), stalled (3-6 days), overdue (7+ days).
 */
export function stalenessTier(days: number): StalenessTier {
  if (days < 3) return "fresh";
  if (days < 7) return "stalled";
  return "overdue";
}

/**
 * Verbatim UI-SPEC copy -- never paraphrased. Locked copy contract from
 * 06-UI-SPEC.md's Copywriting Contract table.
 */
export function stalenessBadgeCopy(days: number): string {
  if (days === 0) return "Atualizado hoje";
  if (days === 1) return "Atualizado ontem";
  if (days === 2) return `Atualizado há ${days} dias`;
  return `Parado há ${days} dias`;
}

/**
 * Maps a staleness tier to its StatusBadge tone. Imports StatusTone as a
 * type-only import so this module stays I/O-free while the tone union can
 * never drift from the badge component.
 */
export function stalenessTone(tier: StalenessTier): StatusTone {
  if (tier === "fresh") return "neutral";
  if (tier === "stalled") return "warning";
  return "danger";
}
