---
phase: 05-access-roles
reviewed: 2026-07-14T00:00:00Z
depth: standard
files_reviewed: 32
files_reviewed_list:
  - app/(auth)/change-password/actions.ts
  - app/(auth)/change-password/page.tsx
  - app/(auth)/login/actions.ts
  - app/(auth)/pending/page.tsx
  - app/(auth)/rejected/page.tsx
  - app/(auth)/signup/actions.ts
  - app/(auth)/signup/page.tsx
  - app/admin/approvals/actions.ts
  - app/admin/approvals/page.tsx
  - app/admin/clients/[id]/access/page.tsx
  - app/admin/page.tsx
  - app/client/page.tsx
  - app/pm/clients/[id]/access/actions.ts
  - app/pm/clients/[id]/access/page.tsx
  - app/pm/page.tsx
  - components/approvals/approval-queue.tsx
  - components/clients/client-access-panel.tsx
  - lib/security/password.ts
  - lib/supabase/admin.ts
  - lib/supabase/client.ts
  - lib/supabase/middleware.ts
  - lib/supabase/server.ts
  - lib/validation/auth.ts
  - lib/validation/client-access.ts
  - supabase/migrations/0001_profiles.sql
  - supabase/migrations/0002_clients_stub.sql
  - supabase/migrations/0003_pm_clients.sql
  - supabase/migrations/0004_rls_policies.sql
  - supabase/migrations/0005_fix_handle_new_user_status_cast.sql
  - supabase/tests/0001_rls_pm_scoping_test.sql
  - supabase/tests/0002_rls_client_scoping_test.sql
  - supabase/tests/0003_rls_admin_unrestricted_test.sql
  - supabase/tests/rls_helpers.sql
findings:
  critical: 2
  warning: 4
  info: 4
  total: 10
status: issues_found
---

# Phase 5: Code Review Report

**Reviewed:** 2026-07-14T00:00:00Z
**Depth:** standard
**Files Reviewed:** 32
**Status:** issues_found

## Summary

Reviewed the Phase 5 (Access & Roles) auth flow, admin-approval flow, and PM/Admin
Client-access-provisioning flow, plus the RLS migrations and pgTAP test suite that back
them.

The RLS layer itself (migrations 0001-0005, `is_admin()`/`pm_assigned_clients()`, the
`prevent_profile_privilege_escalation` trigger) is well-reasoned and the pgTAP tests
genuinely exercise the row-level scoping and privilege-escalation guarantees they claim
to prove (AUTH-06/07/08, Blocker 1).

However, `app/pm/clients/[id]/access/actions.ts` — the only file in this phase that talks
to the Supabase **service-role (admin)** client from a Server Action — completely
bypasses that RLS layer, and the code does not replace it with an equivalent
application-layer authorization check. `createClientLogin` and `deactivateClientAccess`
trust the `clientId`/`userId` arguments at face value with no verification that the
calling PM is actually assigned to the target client (`pm_clients`), or that the target
`userId` even belongs to a `client`-role account scoped to that client. Combined with the
fact the page component derives `activeUserId` from a URL param and passes it straight
through as a Server Action argument, this is a real IDOR/broken-access-control gap: any
authenticated PM can create or kill a Client login for a client outside their assignment,
and can plausibly deactivate/ban an arbitrary user account (including another PM or an
Admin) by supplying an arbitrary UUID. These are flagged as Critical below.

A handful of secondary issues (silently swallowed query errors, a "defense-in-depth" call
whose result is never used, fragile string-matching for duplicate-account detection, and
one piece of dead/duplicated validation code) round out the Warning/Info findings.

## Critical Issues

### CR-01: PM can create/deactivate a Client login for a client outside their `pm_clients` assignment

**File:** `app/pm/clients/[id]/access/actions.ts:59-104` (also exercised via
`app/pm/clients/[id]/access/page.tsx:26-40` and its mirror
`app/admin/clients/[id]/access/page.tsx:35-49`)

**Issue:** `createClientLogin(clientId, email)` and the page that calls
`findActiveClientLogin(client_id)` both use `createAdminClient()` — the service-role
client that bypasses RLS entirely (see `lib/supabase/admin.ts`). Nothing in this file (or
the page component) checks that the *authenticated caller* is a PM actually assigned to
`clientId` via `public.pm_clients` — the exact scoping the RLS `clients_select_scoped`
policy and `pm_assigned_clients()` helper (`supabase/migrations/0004_rls_policies.sql`)
were built to enforce for every other read/write path in this phase.

`middleware.ts` (repo root) only checks that `profile.role === 'pm'` before letting a
request reach `/pm/clients/[id]/access` — it has no notion of *which* client that PM may
act on. A PM whose only assignment is `client_a` can navigate (or POST the Server Action
directly) to `/pm/clients/<client_b_id>/access` and:
- see whether `client_b` already has an active Client login (`findActiveClientLogin`
  leaks this to a PM who has no legitimate visibility into `client_b` at all, since
  `clients_select_scoped` would otherwise hide `client_b` from that PM), and
- provision a brand-new Client login for `client_b`, an out-of-scope client, entirely
  bypassing the RLS boundary the rest of the phase relies on.

The code comment even states the design intent explicitly: *"authorization comes from the
service-role admin client + middleware path routing, not a caller-role check here"* — but
middleware only checks role, never per-resource assignment, so this is a real gap, not a
documented non-issue.

**Fix:** Before doing anything with `clientId`, verify the caller is authorized for that
specific client — e.g. resolve the caller via `supabase.auth.getUser()` (RLS-scoped
client) and confirm `is_admin()` OR that `clientId` is in `pm_assigned_clients()` for that
caller, either via a scoped query against the RLS-protected tables or an explicit
`pm_clients` membership check, before falling through to the admin-client calls:

```ts
export async function createClientLogin(
  clientId: string,
  email: string
): Promise<CreateClientLoginResult> {
  const parsed = createClientLoginSchema.safeParse({ email, client_id: clientId });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? GENERIC_ERROR };
  }

  // Authorize against the caller's actual scope, not just their route.
  const scoped = await createClient(); // RLS-scoped client
  const { data: { user } } = await scoped.auth.getUser();
  if (!user) return { error: "Não autenticado." };

  const { data: allowed } = await scoped
    .from("clients")
    .select("id")
    .eq("id", parsed.data.client_id)
    .maybeSingle();
  if (!allowed) return { error: "Cliente inválido ou fora do seu escopo." };

  // ... existing admin-client logic continues only after this passes
}
```

---

### CR-02: `deactivateClientAccess` bans/deactivates an arbitrary `userId` with no ownership or role check

**File:** `app/pm/clients/[id]/access/actions.ts:121-138`,
invoked from `components/clients/client-access-panel.tsx:74-85`

**Issue:** `deactivateClientAccess(userId)` calls
`admin.auth.admin.updateUserById(userId, { ban_duration: "876000h" })` and then sets
`profiles.status = 'deactivated'` for that `userId` — using the service-role client, with
**zero validation** that:
1. `userId` corresponds to a `role='client'` profile at all (an Admin or another PM's
   `userId` would be accepted identically), or
2. that account is associated with the `clientId` the caller is even nominally scoped to.

The only thing standing between an authenticated PM and banning an arbitrary account
(including an Admin's) is the client-side React state `activeUserId` in
`client-access-panel.tsx`, which is trivially replayable/tamperable — a PM can call this
Server Action directly (matching Next.js's action-invocation POST, which only needs to
land on a `/pm/...`-prefixed route to clear the middleware role gate) with any UUID they
can obtain (e.g. another PM's id, scraped from any page that exposes profile ids, or
simply guessed/enumerated since ids are otherwise unauthenticated inputs here).

**Fix:** Re-derive the target user's expected identity server-side instead of trusting
the caller-supplied `userId` in isolation — e.g. require the `clientId` as well and
verify `userId` is the *currently active* client login for that specific `clientId`
(re-run the same `findActiveClientLogin(clientId)` lookup server-side and compare), and
reject if it doesn't match, in addition to the CR-01 fix that scopes `clientId` itself to
the caller:

```ts
export async function deactivateClientAccess(
  clientId: string,
  userId: string
): Promise<DeactivateClientAccessResult> {
  // ... CR-01-style caller/clientId authorization check first ...

  const active = await findActiveClientLogin(clientId);
  if (!active || active.userId !== userId) {
    return { error: GENERIC_ERROR };
  }

  const admin = createAdminClient();
  // ... existing ban + status update ...
}
```

## Warnings

### WR-01: `findActiveClientLogin` silently swallows query errors

**File:** `app/pm/clients/[id]/access/actions.ts:28-37`

**Issue:** `const { data } = await admin.from("profiles").select("id")...maybeSingle();`
discards the `error` value entirely. If the query fails for any reason (permissions
change, transient network/DB error, or an actual "more than one row" violation that
`maybeSingle()` would raise), the function silently returns `null` — indistinguishable
from "no active login exists." Both the PM and Admin access pages, and
`createClientLogin`'s own pre-check, rely on this function, so a swallowed error would
make a page render the "create login" form (and let a new provisioning attempt proceed)
even though an active login may already exist, relying entirely on the DB-level unique
index as an undetected/unlogged backstop.

**Fix:** Check and surface/log the error instead of ignoring it:
```ts
const { data, error } = await admin
  .from("profiles")
  .select("id")
  .eq("client_id", client_id)
  .eq("role", "client")
  .neq("status", "rejected")
  .neq("status", "deactivated")
  .maybeSingle();
if (error) {
  console.error("findActiveClientLogin query failed", error);
  return null; // or throw, depending on desired caller behavior
}
return data ? { userId: data.id } : null;
```

### WR-02: `approveSignup`/`rejectSignup` report success even when RLS silently filters the update to zero rows

**File:** `app/admin/approvals/actions.ts:20-62`

**Issue:** Both actions call `.update(...).eq("id", profileId)` on the RLS-scoped client
(good — `profiles_update_own_or_admin` + the `prevent_profile_privilege_escalation`
trigger are the real authorization boundary here) but never check how many rows were
actually affected. If the RLS `using` clause filters out the target row (e.g. `profileId`
doesn't exist, or belongs to a row the caller can't touch), Supabase returns `error: null`
with no matched rows — and the action still returns `{}` (success), triggering a "PM
aprovado com sucesso." toast in `approval-queue.tsx` even though nothing changed. This is
not an authorization bypass (RLS/trigger still block the actual write), but it is a
misleading success signal that could mask an admin trying to approve a signup that
already left the `pending` state (e.g., a race with another admin, or a stale
`profileId`).

**Fix:** Request the updated row back and treat zero rows as a failure:
```ts
const { data, error } = await supabase
  .from("profiles")
  .update({ status: 'approved', role })
  .eq("id", profileId)
  .select("id");
if (error) return { error: error.message };
if (!data || data.length === 0) return { error: "Cadastro não encontrado ou já processado." };
```

### WR-03: Dead/unused `getUser()` call presented as a defense-in-depth check

**File:** `app/admin/approvals/page.tsx:15-18`

**Issue:** `await supabase.auth.getUser();` is called and its result is discarded — no
`user` variable is checked against anything. The comment above it claims this is
"Defense-in-depth read of the caller," but as written it performs no check at all; it's
effectively a no-op network round-trip. This is misleading to future maintainers who may
believe an authorization check exists here when it doesn't — the real (and only)
protection for this page's data is the `profiles_select_own_or_admin` RLS policy.

**Fix:** Either remove the call (RLS already fully protects the `select`), or make it a
real check:
```ts
const { data: { user } } = await supabase.auth.getUser();
if (!user) redirect("/login");
```

### WR-04: Inconsistent/fragile duplicate-account detection via error-message substring matching

**File:** `app/pm/clients/[id]/access/actions.ts:90-101`

**Issue:** `createClientLogin` detects an "already registered" duplicate purely by
lower-casing `error.message` and checking for substrings (`"already registered"`,
`"already exists"`, `"duplicate"`, `"unique"`). This is fragile — any change in Supabase
Auth's error wording (or localization) silently breaks the duplicate-detection branch,
silently falling through to the generic error instead. Contrast with
`app/(auth)/signup/actions.ts:39-43`, which prefers the stable `error.code` values
(`"user_already_exists"`, `"email_exists"`) and only falls back to substring matching —
the two call sites in the same codebase use inconsistent, unequally robust strategies for
what is functionally the same problem.

**Fix:** Check `error.code` first, matching the pattern already established in
`signup/actions.ts`:
```ts
const duplicate =
  error?.code === "email_exists" ||
  error?.code === "user_already_exists" ||
  message.includes("already registered") ||
  message.includes("duplicate") ||
  message.includes("unique");
```

## Info

### IN-01: Dead/duplicated schema — `clientLoginSchema` in `lib/validation/auth.ts` is never imported

**File:** `lib/validation/auth.ts:21-26`

**Issue:** `clientLoginSchema`/`ClientLoginInput` are exported but not referenced by any
file in this phase (confirmed via repo-wide search) — the actual client-login validation
used in `app/pm/clients/[id]/access/actions.ts` is `createClientLoginSchema` from
`lib/validation/client-access.ts`, a near-identical duplicate schema. The comment on
`clientLoginSchema` ("reused by later plans") never materialized; it now just sits as
dead, duplicated validation logic that can drift out of sync with the schema actually in
use.

**Fix:** Remove `clientLoginSchema`/`ClientLoginInput` from `lib/validation/auth.ts`, or
if a future plan genuinely needs it, have `createClientLoginSchema` import/re-export it
instead of redefining the same shape twice.

### IN-02: Magic string for ban duration

**File:** `app/pm/clients/[id]/access/actions.ts:127`

**Issue:** `ban_duration: "876000h"` is an inline magic string with no named constant,
requiring the reader to do the ~100-year math themselves (the accompanying comment does
explain it, but the value itself isn't self-documenting in code).

**Fix:**
```ts
const PERMANENT_BAN_DURATION = "876000h"; // ~100 years; reactivation is out of v1 scope
// ...
await admin.auth.admin.updateUserById(userId, { ban_duration: PERMANENT_BAN_DURATION });
```

### IN-03: Non-null assertions on env vars produce cryptic failures if misconfigured

**File:** `lib/supabase/admin.ts:14-15`, `lib/supabase/client.ts:10-11`,
`lib/supabase/server.ts:13-14`, `lib/supabase/middleware.ts:15-16`

**Issue:** All four Supabase client factories use `process.env.X!` non-null assertions.
If any of `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`, or
`SUPABASE_SECRET_KEY` is unset/misspelled in a given environment, the failure surfaces as
an opaque low-level error deep inside the Supabase SDK rather than a clear "missing env
var" message at the call site.

**Fix:** Fail fast with a clear message, e.g.:
```ts
const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
if (!url) throw new Error("Missing NEXT_PUBLIC_SUPABASE_URL");
```

### IN-04: Provisional-password generation has a small modulo bias (acknowledged, low-severity)

**File:** `lib/security/password.ts:26-33`

**Issue:** `bytes[i] % ALPHABET.length` over a 56-character alphabet against a 0-255 byte
range introduces a small non-uniform bias toward the first `256 % 56 = 32` characters of
`ALPHABET`. The in-file comment already acknowledges and accepts this trade-off given the
password is one-time, immediately rotated on first login, and still comfortably exceeds
the 12+ char entropy floor — noted here only for completeness, not as a blocking concern.

**Fix (optional, if ever revisited):** Use rejection sampling instead of modulo to
eliminate the bias entirely, e.g. drawing bytes and discarding values `>= 256 - (256 %
ALPHABET.length)`.

---

_Reviewed: 2026-07-14T00:00:00Z_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
