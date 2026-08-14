---
phase: 05-access-roles
plan: 05
subsystem: auth
tags: [authorization, server-actions, node-test, supabase-rpc, idor]

# Dependency graph
requires:
  - phase: 05-access-roles
    provides: "05-01 RLS scaffold (is_admin()/pm_assigned_clients() SECURITY DEFINER RPCs), 05-04 createClientLogin/deactivateClientAccess Server Actions"
provides:
  - "lib/security/client-access-authz.ts pure authorization predicates (isClientActionAuthorized, isActiveLoginMatch)"
  - "Caller-scope authorization gate on createClientLogin and deactivateClientAccess, enforced before any service-role call"
  - "deactivateClientAccess(clientId, userId) signature with server-side IDOR guard"
  - "Docker-free node:test regression suite proving the authorization decision"
affects: [05-access-roles gap closure, future admin-oversight phases touching client-access Server Actions]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Pure, dependency-free authorization predicate modules under lib/security/ testable with node:test, no mocking of Supabase clients required"
    - "assertCallerManagesClient() gate pattern: build RLS-scoped client, call is_admin()/pm_assigned_clients() RPCs, authorize BEFORE constructing the service-role admin client"

key-files:
  created:
    - lib/security/client-access-authz.ts
    - lib/security/client-access-authz.test.ts
  modified:
    - app/pm/clients/[id]/access/actions.ts
    - components/clients/client-access-panel.tsx
    - package.json
    - tsconfig.json

key-decisions:
  - "Authorization is sourced solely from is_admin()/pm_assigned_clients() RPCs, never from clients_select_scoped row visibility (a client-role caller can see their own client row, which must never authorize them for createClientLogin/deactivateClientAccess)"
  - "assertCallerManagesClient() fails closed on any RPC error (console.error + unauthorized), no fallback query"
  - "deactivateClientAccess signature changed to (clientId, userId); the userId is never trusted directly and is re-verified against findActiveClientLogin(clientId) via isActiveLoginMatch()"

patterns-established:
  - "Pattern: authorization predicates as pure functions in lib/security/, tested with node's built-in test runner (Node 24 native TS stripping), zero new dependencies"

requirements-completed: [AUTH-06, AUTH-09, AUTH-11]

# Metrics
duration: ~35min
completed: 2026-07-16
---

# Phase 05 Plan 05: Client-access authorization gate closure Summary

**Added a caller-scope authorization gate (is_admin()/pm_assigned_clients() RPCs) in front of createClientLogin and deactivateClientAccess, changed deactivateClientAccess to verify its target userId server-side against the live active login, and proved both with a Docker-free node:test suite — closing 05-VERIFICATION.md gap 1 / 05-REVIEW.md CR-01/CR-02.**

## Performance

- **Duration:** ~35 min
- **Completed:** 2026-07-16T02:47:07Z
- **Tasks:** 2
- **Files modified:** 6 (2 created, 4 modified)

## Accomplishments

- `lib/security/client-access-authz.ts` exports two pure, dependency-free predicates (`isClientActionAuthorized`, `isActiveLoginMatch`) encoding the CR-01/CR-02 rules literally.
- `createClientLogin` now calls `assertCallerManagesClient(clientId)` — built on the RLS-scoped client's `is_admin()`/`pm_assigned_clients()` RPCs — and returns an authorization error before `generateProvisionalPassword()`/`createAdminClient()`/`auth.admin.createUser` are ever reached.
- `deactivateClientAccess` now takes `(clientId, userId)`, authorizes the caller for `clientId`, then re-derives the currently-active login via `findActiveClientLogin(clientId)` and rejects any `userId` that doesn't match via `isActiveLoginMatch()` — before constructing the admin client or calling `updateUserById`.
- Fixed WR-01: `findActiveClientLogin` now destructures and logs the Supabase query `error` instead of silently discarding it, failing closed (returns `null`) since `deactivateClientAccess` depends on this lookup for its ownership check.
- `components/clients/client-access-panel.tsx`'s `handleDeactivate` updated to call `deactivateClientAccess(clientId, activeUserId)`.
- Added a Docker-free `node --test lib/security/*.test.ts` regression suite (7 assertions, all passing) — no live DB, no service-role key, no new dependency.

## Task Commits

Each task was committed atomically:

1. **Task 1: Define pure authorization predicates + node:test regression suite** - `ad73876` (feat)
2. **Task 2: Enforce caller-scope authorization in createClientLogin + deactivateClientAccess and update the call-site** - `fd8b8aa` (feat)

**Plan metadata:** (this commit, docs)

## Files Created/Modified

- `lib/security/client-access-authz.ts` - Pure predicates `isClientActionAuthorized`, `isActiveLoginMatch`
- `lib/security/client-access-authz.test.ts` - node:test suite covering negative/positive authorization cases
- `app/pm/clients/[id]/access/actions.ts` - `assertCallerManagesClient()` gate wired into `createClientLogin`/`deactivateClientAccess`; `deactivateClientAccess(clientId, userId)` signature; WR-01 fix in `findActiveClientLogin`
- `components/clients/client-access-panel.tsx` - `handleDeactivate` passes `clientId` through
- `package.json` - Added `"test": "node --test lib/security/*.test.ts"` script (no dependency changes)
- `tsconfig.json` - Added `allowImportingTsExtensions: true` (see Deviations)

## Decisions Made

- Authorization is derived **only** from `is_admin()`/`pm_assigned_clients()` RPC results on the RLS-scoped client, never from a `clients` table row-visibility read — `clients_select_scoped` also grants a `client`-role caller visibility into their own client row, which would incorrectly authorize a client-role caller for their own `clientId` (violates D-01: no self-provisioning). This is enforced structurally: `grep -n 'from("clients")' app/pm/clients/[id]/access/actions.ts` returns no matches.
- The RPC path is unconditional with no fallback: both `is_admin()` and `pm_assigned_clients()` are `SECURITY DEFINER` functions with no explicit `REVOKE` in `0004_rls_policies.sql`, so they are PostgREST-exposed by default. Confirmed via `npx tsc --noEmit` (RPC calls typecheck against the generic Supabase client) and the working `node --test` suite exercising the predicates the RPC results feed into.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Added `allowImportingTsExtensions` to tsconfig.json**
- **Found during:** Task 2 (`npx tsc --noEmit` verification step)
- **Issue:** The plan's Task 1 instructs `client-access-authz.test.ts` to import the sibling module via a relative path ending in `.ts` (`./client-access-authz.ts`) so `node --test` can run it directly with Node 24's native TypeScript stripping. `npx tsc --noEmit` (the Task 2 verify command) failed with `TS5097: An import path can only end with a '.ts' extension when 'allowImportingTsExtensions' is enabled` — a hard blocker for the plan's own verification step, since the `.ts`-extension import is required for the `node --test` half of the same command to work.
- **Fix:** Added `"allowImportingTsExtensions": true` to `tsconfig.json` `compilerOptions`. Safe under `noEmit: true` (a documented precondition for this flag) — no emit behavior changes for the rest of the codebase, which uses `moduleResolution: "bundler"` and does not use `.ts`-extension imports anywhere else.
- **Files modified:** `tsconfig.json`
- **Verification:** `npx tsc --noEmit` now exits clean with no diagnostics; `node --test lib/security/*.test.ts` still passes (7/7).
- **Committed in:** `fd8b8aa` (Task 2 commit)

**2. [Rule 1 - Bug] Fixed implicit `any` on RPC row-mapping parameter**
- **Found during:** Task 2 (`npx tsc --noEmit` verification step)
- **Issue:** `(assignedResult.data ?? []).map((row) => ...)` triggered `TS7006: Parameter 'row' implicitly has an 'any' type` under `strict: true`.
- **Fix:** Explicitly typed the callback parameter as `string | { client_id: string }` (PostgREST returns a scalar array for `setof uuid` in the normal case; the object-shape branch is defensive in case that shape ever changes).
- **Files modified:** `app/pm/clients/[id]/access/actions.ts`
- **Verification:** `npx tsc --noEmit` exits clean.
- **Committed in:** `fd8b8aa` (Task 2 commit)

---

**Total deviations:** 2 auto-fixed (1 blocking type-check fix required by the plan's own verify command, 1 strict-mode type bug)
**Impact on plan:** Both fixes were required to satisfy the plan's own stated verification commands (`npx tsc --noEmit && node --test lib/security/*.test.ts`). No scope creep — no behavior changed beyond what the plan specified.

## Issues Encountered

None beyond the two auto-fixed type-check issues documented above.

## Working test command

```
node --test lib/security/*.test.ts
```

Ran cleanly with only a benign Node `MODULE_TYPELESS_PACKAGE_JSON` warning (no `"type": "module"` in `package.json`) — not a failure, and out of scope to fix here since it doesn't affect `node --test`'s exit code or the TAP output. No `--experimental-strip-types` flag was needed; Node 24.12.0's built-in TypeScript stripping handled the `.ts` files directly. Also available via `npm test`.

## Line-order evidence (guard precedes every service-role call)

`createClientLogin` (`app/pm/clients/[id]/access/actions.ts`):
```
148:  const authz = await assertCallerManagesClient(parsed.data.client_id);
...
159:  const admin = createAdminClient();
161:  const { data, error } = await admin.auth.admin.createUser({
```
The `assertCallerManagesClient` call and its early return (immediately following, not shown above) appear before the first `createAdminClient()`/`auth.admin.createUser` reference inside `createClientLogin`.

`deactivateClientAccess` (`app/pm/clients/[id]/access/actions.ts`):
```
214:  const authz = await assertCallerManagesClient(clientId);
...
219:  const active = await findActiveClientLogin(clientId);
220:  if (!isActiveLoginMatch(active, userId)) {
...
224:  const admin = createAdminClient();
```
Both the `assertCallerManagesClient` guard and the `isActiveLoginMatch` IDOR guard precede the first `createAdminClient()`/`updateUserById` reference inside `deactivateClientAccess`.

Row-visibility fallback check: `grep -n 'from("clients")' "app/pm/clients/[id]/access/actions.ts"` returns no matches — authorization is sourced solely from the `is_admin()`/`pm_assigned_clients()` RPCs.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- `createClientLogin` and `deactivateClientAccess` now structurally enforce caller-scope authorization and IDOR protection, closing 05-VERIFICATION.md gap 1 (AUTH-06 write-path half) and 05-REVIEW.md CR-01/CR-02.
- **Residual manual-verification item, explicitly out of this plan's scope per its `<output>` note:** the live two-real-PM/two-real-client browser click-through (05-VERIFICATION.md human_verification item 3 / 05-REVIEW.md CR-01/CR-02 manual confirmation) is NOT covered by this plan's automated `node:test` suite nor by 05-06 (whose scope is the pgTAP suite, human_verification item 1). It remains an accepted residual manual-verification item to be spot-checked ad hoc post-deploy, or explicitly noted by the phase as accepted residual manual verification.
- Both PM and Admin routes reach the identical, now-authorized `actions.ts` implementation (no separate Admin-mirror code path to update).

## Self-Check: PASSED

All created/modified files confirmed present on disk; all task commits (`ad73876`, `fd8b8aa`) and the docs commit (`57b8e27`) confirmed present in `git log --oneline --all`.

---
*Phase: 05-access-roles*
*Completed: 2026-07-16*
