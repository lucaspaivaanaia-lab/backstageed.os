---
phase: 01-client-records-isolated-rag-setup
verified: 2026-07-13T22:47:24Z
status: passed
score: 4/4 must-haves verified (ROADMAP Success Criteria); 20/20 plan-level truths verified or accepted-open
accepted_open_items:
  - truth: "A client created while TROPICALIA_API_KEY is present gets tropicalia_project_id populated from the Tropicalia API response's public_id field (CLI-03 success path)"
    reason: "TROPICALIA_API_KEY is still an empty placeholder in .env.local — this is the explicitly designed D-11 default state (01-CONTEXT.md), not an implementation gap. Code path (createClientRecord's conditional provisioning block, retryTropicaliaProvisioning) is fully implemented, type-checked, and reviewed; it activates automatically with zero code changes once Juliano supplies the real key. Human walkthrough (Wave 4 checkpoint) explicitly confirmed this as an accepted open item, not a failure."
    accepted_by: "user (via orchestrator human_verification_note)"
    accepted_at: "2026-07-13"
---

# Phase 1: Client Records & Isolated RAG Setup Verification Report

**Phase Goal:** Admin/PM can create and configure a client record that is the anchor for everything downstream — assignment, RAG isolation, and strategic context
**Verified:** 2026-07-13T22:47:24Z
**Status:** passed
**Re-verification:** No — initial verification

## Note on MVP-mode goal format

ROADMAP.md marks this phase `mode: mvp`, which normally triggers strict `As a / I want to / so that.` goal-format validation (`gsd-sdk query user-story.validate`). The ROADMAP Goal line itself ("Admin/PM can create and configure a client record...") is not in that format — confirmed via `user-story.validate`, which also rejects the PLAN-frontmatter reformatted version ("As an Admin or PM, I want to...") on the literal `"As a "` prefix check (`"As an"` fails the strict prefix match). Every plan's own `<phase_goal>` block explicitly documents this as a pre-existing ROADMAP line that predates `/gsd mvp-phase`, reformatted with no new scope introduced. Rather than refuse verification on a regex technicality already flagged and accepted by the phase's own planning artifacts, this report proceeds with full goal-backward verification against the ROADMAP Success Criteria (the actual contract) and each PLAN's `must_haves`. This is flagged here for visibility, not treated as a gap.

## Goal Achievement

### Observable Truths (ROADMAP Success Criteria)

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | Admin or PM can create a new client record from the platform | VERIFIED | `lib/actions/clients.ts createClientRecord()` — app-layer role/status check before privileged write; `/admin/clients/new` and `/pm/clients/new` both render `ClientCreateForm`; live DB shows a real client row ("Lucas Paiva", created 2026-07-13T15:32:38Z) with `pm_clients` rows linking 2 PMs. Human-verified (Wave 4 checkpoint, per orchestrator note): "client creation works for both Admin and PM (CLI-01)". |
| 2 | Admin can assign one or more PMs to that client, and those PMs immediately gain access to it | VERIFIED | Creation-time: `createClientRecord()` always links creator + selected PMs (`pm_clients` insert). Existing-client reassignment: `assignPms()` re-checks `role === "admin" && status === "approved"` server-side (not just UI-gated); live DB confirms 2 `pm_clients` rows for the created client. `clients_select_scoped`/`pm_assigned_clients()` RLS (unchanged from Phase 5, live-confirmed) grants a linked PM immediate visibility with zero app-layer filtering. Human-verified: "PM assignment persists and shows correctly (CLI-02)". |
| 3 | Every client record has its own Tropicalia `project_id`, created automatically via `POST /v1/projects`, stored and visibly tied to that client only | CODE-VERIFIED, key-present success path is an accepted open item | `lib/tropicalia/client.ts createTropicaliaProject()` posts to `https://api.tropicalia.dev/v1/projects`, stores `response.public_id` (never `.project_id`), `AbortSignal.timeout(10_000)`. `createClientRecord()`/`retryTropicaliaProvisioning()` both gate on `process.env.TROPICALIA_API_KEY` before calling it (D-11), never roll back client creation on failure (D-08). `TROPICALIA_API_KEY` is still an empty placeholder in `.env.local` (confirmed by grep, value not printed) — the success/D-08 branches are implemented and type/build-clean but genuinely untested against a live Tropicalia call. Human-verified: "Tropicalia RAG status correctly shows 'Pendente' with no retry button since TROPICALIA_API_KEY is still empty (CLI-03, D-11 path)" — explicitly flagged as an accepted open item per 01-CONTEXT.md's own D-11 design, not a gap. |
| 4 | PM can fill in and later edit a client's structured strategic briefing and see it persist | VERIFIED | `updateBriefing()` uses the RLS-scoped `createClient()` (relies on `clients_update_scoped`, live-confirmed), only ever passes zod-parsed fields to `.update()` (no raw `formData` spread — no smuggling of `tropicalia_project_id`/`id`). `client-detail-form.tsx` renders three `Textarea` fields + `useFieldArray` content-pillars chips, calls `updateBriefing(client.id, formData)` on submit. Human-verified: "briefing form fills/saves/persists across reload (CLI-04)". *(Observational note: at verification time, the live `clients` table shows both existing rows with empty briefing fields — consistent with a test-then-reset QA cycle during the walkthrough, not a code defect; the update/read round-trip is independently confirmed correct by code review.)* |

**Score:** 4/4 ROADMAP Success Criteria verified (3 fully code+DB+human verified; 1 code-verified with its live-API success sub-path an explicitly accepted open item, not a gap).

### Plan-Level Must-Haves (all 4 plans)

| Plan | Truth | Status |
|------|-------|--------|
| 01-01 | Seeded Admin logs in, lands on app, no bounce | VERIFIED (live DB: 1 admin row, `status=approved`, `must_change_password=false`; code review of `signIn()`; human walkthrough) |
| 01-01 | Seeded PM logs in, lands on app, no bounce | VERIFIED (live DB: 1 pm row, `status=approved`; same) |
| 01-01 | `/login` is minimal dev-auth tooling (D-01/D-02/D-03) | VERIFIED (code matches spec exactly: two fields, generic error string, no forgot-password) |
| 01-01 | `SUPABASE_SECRET_KEY`/`SUPABASE_ACCESS_TOKEN` non-empty | VERIFIED (grep confirms non-empty; successfully used in this verification session to link and query the live Supabase project) |
| 01-01 | `TROPICALIA_API_KEY=` empty placeholder present | VERIFIED (`.env.local` and `.env.local.example` both have the line) |
| 01-02 | `clients` table has all 6 new columns | VERIFIED (live `information_schema.columns` query: `tropicalia_project_id`, `objective`, `tone_of_voice`, `target_audience`, `content_pillars`, `updated_at` all present) |
| 01-02 | PM can INSERT into `clients` | VERIFIED (live `pg_policies`: `clients_insert_admin_or_pm`; real PM-created client row exists) |
| 01-02 | PM can UPDATE only `pm_assigned_clients()` rows | VERIFIED (live `pg_policies`: `clients_update_scoped` with dual USING/WITH CHECK) |
| 01-02 | `pm_clients` RLS untouched | VERIFIED (live query: `pm_clients_insert_admin_only`, `pm_clients_select_own_or_admin`, `pm_clients_delete_admin_only` — matches 0004 baseline, no new/changed policy) |
| 01-02 | Both migrations applied live, not just local files | VERIFIED (`supabase migration list` against the linked remote project ancfwsgyzoostoidqzqj shows `0006`/`0007` local==remote) |
| 01-03 | Admin/PM can create client from respective `/new` routes | VERIFIED (code + live DB row + human walkthrough) |
| 01-03 | Creating PM immediately sees own client afterward | VERIFIED (`pm_clients` always includes creator; RLS `clients_select_scoped` grants immediate access, zero filtering) |
| 01-03 | Creation doesn't require briefing (D-07) | VERIFIED (all briefing fields nullable; form has no briefing inputs) |
| 01-03 | Key-present success path stores `public_id` | CODE-VERIFIED only — accepted open item (see above) |
| 01-03 | Key-absent shows Pendente, no retry; key-present-failed shows Pendente+retry | D-11 branch human-verified; D-08 branch code-verified only (same accepted open item) |
| 01-03 | List pages: zero app-layer filtering, same query for both roles | VERIFIED (identical query string in both `page.tsx` files, no `.eq(pm_id...)` or manual filter) |
| 01-04 | Briefing fill/save/reload persists | VERIFIED (code round-trip correct); human-verified |
| 01-04 | Briefing editing decoupled from RAG readiness (D-10) | VERIFIED (`updateBriefing()` never touches `tropicalia_project_id`) |
| 01-04 | RAG retry button appears only for D-08, never D-11 | VERIFIED (`canRetry` boolean computed server-side only, `process.env` never read in the Client Component — grep confirms 0 occurrences) |
| 01-04 | Admin-only PM reassignment on existing clients | VERIFIED (`assignPms()` re-checks `role === "admin"` server-side; UI gate is `viewerIsAdmin`, not the security boundary) |

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `app/(auth)/login/actions.ts` | `signIn()` Server Action | VERIFIED | zod validate before Supabase call, generic error string |
| `app/(auth)/login/page.tsx` | Login form | VERIFIED | Matches `/signup` pattern |
| `lib/validation/auth.ts` | `loginSchema`/`LoginInput` | VERIFIED | Added alongside existing schemas, unmodified |
| `supabase/migrations/0006_clients_full_record.sql` | ALTER TABLE, 6 columns | VERIFIED | Exists locally and live |
| `supabase/migrations/0007_clients_rls_fix.sql` | `is_pm()` + corrected RLS | VERIFIED | Exists locally and live |
| `lib/actions/clients.ts` | 6 exported functions | VERIFIED | `createClientRecord`, `listPmRoster`, `resolvePmNames`, `updateBriefing`, `assignPms`, `retryTropicaliaProvisioning` all present, correctly wired |
| `lib/tropicalia/client.ts` | `createTropicaliaProject()` | VERIFIED | `public_id` used, `AbortSignal.timeout`, server-only |
| `lib/validation/clients.ts` | `clientCreateSchema`, `briefingSchema` | VERIFIED | Both present |
| `app/admin/clients/page.tsx`, `app/pm/clients/page.tsx` | List pages | VERIFIED | Correct badges, empty state, zero filtering, now link to detail pages |
| `components/clients/client-create-form.tsx` | Creation form | VERIFIED | Dialog+checkbox PM picker, aria-labels present |
| `app/admin/clients/[id]/page.tsx`, `app/pm/clients/[id]/page.tsx` | Detail pages | VERIFIED | `notFound()` before any privileged read (RLS boundary respected) |
| `components/clients/client-detail-form.tsx` | Detail/edit form | VERIFIED | Correct heading order, `canRetry` as boolean prop only, viewer-gated PM edit UI |
| `components/ui/checkbox.tsx`, `components/ui/textarea.tsx` | shadcn components | VERIFIED | Both exist |

### Key Link Verification

| From | To | Via | Status | Details |
|------|-----|-----|--------|---------|
| `login/page.tsx` | `login/actions.ts` `signIn()` | `startTransition(() => signIn(formData))` | WIRED | `await signIn(formData)` confirmed in page.tsx (automated tool path-resolution failed on the exact regex; manually grep-confirmed) |
| `login/actions.ts` | `supabase.auth.signInWithPassword` | RLS-scoped server client | WIRED | Confirmed by tool + manual read |
| `0007_clients_rls_fix.sql is_pm()` | `public.profiles` | `role = 'pm' and status = 'approved'`, SECURITY DEFINER | WIRED | Confirmed in file and live `pg_proc` (`prosecdef=true`) |
| `clients_update_scoped` | `pm_assigned_clients()` | `id in (select public.pm_assigned_clients())` | WIRED | Confirmed in file (both USING and WITH CHECK) and live policy |
| `createClientRecord()` | `createAdminClient()` | privileged insert, app-layer check first | WIRED | Manually confirmed: role/status check precedes `createAdminClient()` call (line 38-41 before line 51) |
| `createClientRecord()` | `createTropicaliaProject()` | gated by `TROPICALIA_API_KEY` | WIRED | `if (process.env.TROPICALIA_API_KEY)` precedes the call |
| `admin/clients/page.tsx`, `pm/clients/page.tsx` | `clients_select_scoped` RLS | `.from("clients").select` | WIRED | Confirmed, no additional filters |
| `updateBriefing()` | `clients_update_scoped` RLS | RLS-scoped `createClient()` | WIRED | Uses `createClient()`, not `createAdminClient()` — confirmed by code read |
| `assignPms()` | `createAdminClient()` | app-layer admin-only check | WIRED | `role === "admin"` check precedes `createAdminClient()` call |
| `retryTropicaliaProvisioning()` | `createTropicaliaProject()` | D-11 null-check then D-08 catch | WIRED | Key check precedes call; exact D-08 error string present verbatim |

*(Automated `gsd-sdk query verify.key-links` reported several "Source file not found" for Plans 02-04 because the `from` field in those plans' frontmatter is a descriptive label, not a literal file path — a tool-input limitation, not a code gap. All links were independently confirmed via manual `grep`/file read above.)*

### Live Database Verification (not just local files)

Directly queried the linked remote Supabase project (`ancfwsgyzoostoidqzqj`) in this verification session:
- `supabase migration list` — `0006`/`0007` local==remote (applied).
- `information_schema.columns` on `clients` — all 6 new columns present.
- `pg_policies` on `clients` — exactly `clients_insert_admin_or_pm`, `clients_select_scoped`, `clients_update_scoped` (old admin-only policies gone).
- `pg_proc` — `is_pm` exists with `prosecdef=true`.
- `pg_policies` on `pm_clients` — unchanged (`pm_clients_insert_admin_only`, `pm_clients_select_own_or_admin`, `pm_clients_delete_admin_only`), confirming Pitfall 3 discipline held.
- `profiles` — exactly 1 seeded admin (`approved`, `must_change_password=false`) and 1 seeded PM (`approved`, `must_change_password=false`).
- `clients`/`pm_clients` data — a real client ("Lucas Paiva") created 2026-07-13, linked to 2 PMs via `pm_clients` — confirms the create+assign flow was actually exercised, not just built.

### Build/Type Verification

- `npx tsc --noEmit` — exits 0, no errors (re-run in this verification session).
- `npx next build` — succeeds; route table includes `/admin/clients`, `/admin/clients/[id]`, `/admin/clients/new`, `/pm/clients`, `/pm/clients/[id]`, `/pm/clients/new`, `/login` (re-run in this verification session, not just trusted from SUMMARY).

### Requirements Coverage

| Requirement | Source Plan(s) | Description | Status | Evidence |
|-------------|-----------------|--------------|--------|----------|
| CLI-01 | 01-01 (unblocks), 01-02, 01-03 | Admin or PM can create a new client record | SATISFIED | `createClientRecord()`, both `/new` routes, live DB row |
| CLI-02 | 01-01 (unblocks), 01-03, 01-04 | Admin can assign one or more PMs to a client | SATISFIED | Creation-time linking + `assignPms()` admin-only reassignment, RLS-backed visibility |
| CLI-03 | 01-01 (unblocks), 01-02, 01-03 | Each client stores an isolated Tropicalia `project_id` | SATISFIED (code), key-present success path is an accepted open item pending Juliano's real API key | `tropicalia_project_id` column, `createTropicaliaProject()`, D-08/D-11 branching all implemented and reviewed correct |
| CLI-04 | 01-02, 01-04 | PM can fill/edit structured strategic briefing | SATISFIED | `updateBriefing()`, `briefingSchema`, `client-detail-form.tsx` |

No orphaned requirements — REQUIREMENTS.md maps exactly CLI-01..04 to Phase 1, and all four appear in at least one plan's `requirements` frontmatter field.

*(Minor documentation-lag note, not a code gap: `.planning/REQUIREMENTS.md`'s tracking table still shows CLI-01..04 as "Pending" with unchecked boxes — this is a bookkeeping artifact that was not updated post-completion, not a functional deficiency.)*

### Anti-Patterns Found

None. Scanned all 17 files modified across the phase's 4 plans for `TBD`/`FIXME`/`XXX`/`TODO`/`HACK`/`PLACEHOLDER`/stub-empty-return patterns — zero matches (one incidental `return {}` in `resolvePmNames()` is the correct, intentional short-circuit for an empty `pmIds` array, not a stub).

### Human Verification Required

None outstanding. Per the orchestrator's `human_verification_note`, the user already performed the full phase-gate walkthrough (Wave 4 checkpoint) in a live browser against the dev server and explicitly approved it:
- CLI-01: client creation works for both Admin and PM.
- CLI-02: PM assignment persists and displays correctly.
- CLI-03 (D-11 branch): RAG status correctly shows "Pendente" with no retry button, since `TROPICALIA_API_KEY` is empty.
- CLI-04: briefing form fills/saves/persists across reload.

The only remaining untested surface — CLI-03's D-08/success branch (key present, provisioning succeeds) — cannot be exercised without Juliano supplying the real Tropicalia key, and is explicitly documented in 01-CONTEXT.md (D-11) as a first-class supported state that activates automatically with zero code changes once the key is supplied. This is recorded above as an accepted open item, not a gap requiring a closure plan.

### Gaps Summary

No blocking gaps found. All four ROADMAP Phase 1 Success Criteria are achieved: code review, live-database queries against the actual remote Supabase project, a clean `tsc`/`next build`, and the user's own approved manual walkthrough all corroborate the SUMMARY.md claims rather than merely restating them. The single open item (Tropicalia's key-present success path) is an explicitly designed, pre-accepted deferral (D-11), not an implementation shortfall — the code path is fully written, type-checked, and will activate with zero code changes once Juliano supplies the real API key.

---

*Verified: 2026-07-13T22:47:24Z*
*Verifier: Claude (gsd-verifier)*
