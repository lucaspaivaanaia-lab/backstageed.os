import { test } from "node:test";
import assert from "node:assert/strict";
import { parseOversightFilters, buildOversightHref } from "./oversight-filters.ts";

const VALID_UUID = "3f2b1c8e-6a4d-4e3a-9c2b-1a2b3c4d5e6f";
const OTHER_UUID = "a1b2c3d4-e5f6-4a1b-8c2d-3e4f5a6b7c8d";
const UPPERCASE_UUID = "3F2B1C8E-6A4D-4E3A-9C2B-1A2B3C4D5E6F";

test("parseOversightFilters: no params returns null filters, no active filter", () => {
  assert.deepEqual(parseOversightFilters({}), {
    clientId: null,
    pmId: null,
    hasActiveFilter: false,
  });
});

test("parseOversightFilters: a valid client UUID is accepted and marks hasActiveFilter", () => {
  const result = parseOversightFilters({ client: VALID_UUID });
  assert.equal(result.clientId, VALID_UUID);
  assert.equal(result.hasActiveFilter, true);
});

test("parseOversightFilters: the 'all' Select sentinel is never treated as a filter", () => {
  const result = parseOversightFilters({ client: "all" });
  assert.equal(result.clientId, null);
});

test("parseOversightFilters: a PostgREST filter-injection payload in ?pm= is rejected", () => {
  const result = parseOversightFilters({
    pm: "abc,media_assignee_id.not.is.null",
  });
  assert.equal(result.pmId, null);
});

test("parseOversightFilters: an empty ?pm= string is rejected", () => {
  const result = parseOversightFilters({ pm: "" });
  assert.equal(result.pmId, null);
});

test("parseOversightFilters: a whitespace-only ?pm= string is rejected", () => {
  const result = parseOversightFilters({ pm: "   " });
  assert.equal(result.pmId, null);
});

test("parseOversightFilters: an uppercase-hex UUID is accepted unchanged", () => {
  const result = parseOversightFilters({ pm: UPPERCASE_UUID });
  assert.equal(result.pmId, UPPERCASE_UUID);
  assert.equal(result.hasActiveFilter, true);
});

test("parseOversightFilters: both client and pm valid sets hasActiveFilter true", () => {
  const result = parseOversightFilters({ client: VALID_UUID, pm: OTHER_UUID });
  assert.equal(result.clientId, VALID_UUID);
  assert.equal(result.pmId, OTHER_UUID);
  assert.equal(result.hasActiveFilter, true);
});

test("buildOversightHref: no filters returns the bare /admin path", () => {
  assert.equal(buildOversightHref({ clientId: null, pmId: null }), "/admin");
});

test("buildOversightHref: client only", () => {
  assert.equal(
    buildOversightHref({ clientId: VALID_UUID, pmId: null }),
    `/admin?client=${VALID_UUID}`
  );
});

test("buildOversightHref: pm only", () => {
  assert.equal(
    buildOversightHref({ clientId: null, pmId: VALID_UUID }),
    `/admin?pm=${VALID_UUID}`
  );
});

test("buildOversightHref: both client and pm, client first, deterministic order", () => {
  assert.equal(
    buildOversightHref({ clientId: VALID_UUID, pmId: OTHER_UUID }),
    `/admin?client=${VALID_UUID}&pm=${OTHER_UUID}`
  );
});
