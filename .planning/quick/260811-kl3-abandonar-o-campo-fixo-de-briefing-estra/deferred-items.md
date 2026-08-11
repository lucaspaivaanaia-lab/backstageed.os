# Deferred Items — 260811-kl3

## Stale comment reference in `lib/validation/checklist.ts` (out of scope)

`lib/validation/checklist.ts` (lines 8-16) has a doc comment referencing
`briefingSchema.contentPillars` as a precedent example for a zod
input/output type-identity pattern. Since Task 2 of this plan collapsed
`briefingSchema` to a single `briefing` field, `contentPillars` no longer
exists on that schema — the comment's reference is now stale.

Not fixed here: `lib/validation/checklist.ts` is not in this plan's
`files_modified` list (confirmed exhaustive by the plan's own baseline
research), and the comment is documentation-only — no functional/security
impact, does not fail any verification in this plan. Per the executor's
scope boundary ("only auto-fix issues DIRECTLY caused by the current task's
changes"), this is logged here rather than edited.

Suggested follow-up (separate quick task): reword the comment in
`lib/validation/checklist.ts` to reference `clientCreateSchema.pmIds` only,
or point to a still-existing array-typed field, dropping the now-inaccurate
`briefingSchema.contentPillars` mention.
