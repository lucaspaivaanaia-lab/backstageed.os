/**
 * Pure filter-parsing module for the `/admin` oversight table's ?client= /
 * ?pm= query params (D-03). Intentionally free of any Supabase/React/Next
 * import or I/O so this module can be imported by its sibling
 * `oversight-filters.test.ts` via a relative path and exercised with Node's
 * built-in test runner -- no live DB, no Docker (mirrors
 * lib/cards/stages.ts's convention).
 *
 * `parseOversightFilters`'s UUID validation is a SECURITY control, not
 * cosmetic (T-06-06): the parsed `pmId` is interpolated into a PostgREST
 * `.or("assignee_id.eq.<pmId>,media_assignee_id.eq.<pmId>")` filter STRING
 * whose contents are not parameterized (unlike `.eq()`, which binds a
 * value). An unvalidated `pmId` would let a URL author append or rewrite
 * PostgREST filter operators in that string. Only a strict UUID pattern is
 * ever accepted -- anything else, including the "all" Select sentinel, an
 * empty/whitespace string, or a crafted filter-injection payload, becomes
 * `null` and is silently dropped rather than forwarded.
 */

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export type OversightFilters = {
  clientId: string | null;
  pmId: string | null;
  hasActiveFilter: boolean;
};

function parseUuidParam(value: string | undefined): string | null {
  if (value === undefined) return null;
  const trimmed = value.trim();
  return UUID_PATTERN.test(trimmed) ? trimmed : null;
}

export function parseOversightFilters(params: {
  client?: string;
  pm?: string;
}): OversightFilters {
  const clientId = parseUuidParam(params.client);
  const pmId = parseUuidParam(params.pm);

  return {
    clientId,
    pmId,
    hasActiveFilter: clientId !== null || pmId !== null,
  };
}

export function buildOversightHref(filters: {
  clientId: string | null;
  pmId: string | null;
}): string {
  const search = new URLSearchParams();
  // client appended before pm so the produced URL is deterministic.
  if (filters.clientId) {
    search.set("client", filters.clientId);
  }
  if (filters.pmId) {
    search.set("pm", filters.pmId);
  }

  const query = search.toString();
  return query.length > 0 ? `/admin?${query}` : "/admin";
}
