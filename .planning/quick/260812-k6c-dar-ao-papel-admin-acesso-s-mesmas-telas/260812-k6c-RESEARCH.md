# Dar ao papel Admin acesso às mesmas telas de Produção/Chat do PM — Research

**Researched:** 2026-08-12
**Domain:** Next.js App Router middleware role-gating + role-shared RSC/client-component screens
**Confidence:** HIGH (all findings verified by direct code read, no external libraries involved)

## Summary

This is a small, well-contained change with one real gate (middleware) and three hardcoded
PM-only navigation targets buried inside the two screens being reused, that would otherwise
break for an Admin visiting `/pm/board`/`/pm/chat` for the first time or with no active client.
None of the RSC loaders, the client panels, or the Server Actions check `role === 'pm'`
anywhere — all authorization already flows through `assertPmOrAdminCaller` /
`isBoardWriteAuthorized` (which already includes admin) or plain RLS (which already includes
`is_admin()` per `0003_rls_admin_unrestricted_test.sql`). The only code that needs to change
is: (1) the middleware gate, (2) three hardcoded `/pm/clients...` redirects/links inside
`board-panel.tsx` and `chat-panel.tsx` that are unreachable for Admin under the "open only
`/pm/board` + `/pm/chat`" scope, and (3) `app/admin/layout.tsx`'s sidebar to add an entry
point.

**Primary recommendation:** Extend `middleware.ts`'s existing `roleRoot` gate with a small
role -> allowed-extra-path-prefixes map (2 entries: `/pm/board`, `/pm/chat`), then make the
three internal `/pm/clients` navigation targets in `board-panel.tsx`/`chat-panel.tsx`
role-aware (or route them through role-agnostic helper hrefs) so an Admin without an active
client, or clicking "Editar briefing", doesn't get redirected into a route the middleware
still (correctly, per this task's scope) blocks for Admin.

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Route-level role gating | Frontend Server (Next.js middleware) | — | Single existing chokepoint (`middleware.ts`), already role-aware |
| Board/Chat data access control | Database (RLS) | API/Backend (Server Actions' `assertPmOrAdminCaller`) | RLS is defense-in-depth; app-layer check is the PRIMARY boundary per existing code comments |
| Client-side navigation targets (redirects, links) | Browser / Client | — | `router.push`/`Link href` hardcoded strings inside `board-panel.tsx`/`chat-panel.tsx`, not derived from role — this is the actual bug surface for this task |
| Sidebar entry point | Frontend Server (layout RSC) + Browser (AppSidebar client component) | — | `app/admin/layout.tsx` passes a static `items` array to the existing `AppSidebar` client component |

## User Constraints

No CONTEXT.md exists for this quick task — constraints come entirely from the task
description and `<focus>` block, treated as locked:
- Reuse the SAME screens (`/pm/board`, `/pm/chat`) — no `/admin/board`/`/admin/chat` duplication.
- Open ONLY `/pm/board` and `/pm/chat` to Admin — NOT `/pm/clients`, NOT `/pm/editors` (Admin
  has its own `/admin/clients`, `/admin/editors` equivalents).
- The middleware's current `roleRoot` single-root-per-role structure should be extended
  minimally, not rewritten.

## Phase Requirements

Not applicable — this is a quick task, no formal REQUIREMENTS.md phase IDs were provided.

## Findings by Focus Area

### 1. Middleware — safest way to extend `roleRoot`

Current shape (`middleware.ts:64-80`):

```ts
const roleRoot: Record<string, string> = {
  admin: "/admin",
  pm: "/pm",
  client: "/client",
  editor: "/editor",
};
const ownRoot = roleRoot[profile.role];

if (ownRoot) {
  const otherRoots = Object.values(roleRoot).filter((r) => r !== ownRoot);
  if (
    pathname === "/" ||
    otherRoots.some((root) => pathname === root || pathname.startsWith(`${root}/`))
  ) {
    return NextResponse.redirect(new URL(ownRoot, request.url));
  }
}
```

**Recommended minimal extension** — add a second, role-keyed map of extra allowed path
prefixes, checked BEFORE the existing redirect condition:

```ts
// Exact, closed allow-list — NOT a role->root, a role->extra-prefixes map. Keep
// this list to full sub-tree roots only (own page.tsx + own actions.ts), never a
// partial/ambiguous prefix (e.g. never "/pm/c" which would also match "/pm/clients").
const extraAllowedPrefixes: Record<string, string[]> = {
  admin: ["/pm/board", "/pm/chat"],
};

const ownRoot = roleRoot[profile.role];

if (ownRoot) {
  const otherRoots = Object.values(roleRoot).filter((r) => r !== ownRoot);
  const allowedExtras = extraAllowedPrefixes[profile.role] ?? [];
  const isAllowedExtra = allowedExtras.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`)
  );
  if (
    !isAllowedExtra &&
    (pathname === "/" ||
      otherRoots.some((root) => pathname === root || pathname.startsWith(`${root}/`)))
  ) {
    return NextResponse.redirect(new URL(ownRoot, request.url));
  }
}
```

This is additive (new const + one `isAllowedExtra` guard clause), preserves the existing
single-root redirect behavior for every other role untouched, and keeps the allow-list closed
and explicit (`/pm/board`, `/pm/chat` only — `/pm/clients` and `/pm/editors` stay blocked for
Admin, exactly as required). `pathname === "/"` still redirects Admin home as before (an Admin
landing on `/pm/board` directly is only reachable via explicit link/nav, never the bare `/`).

**Confidence:** HIGH — directly read from `middleware.ts`, pattern matches the file's existing
style (`otherRoots.some(...)` idiom reused verbatim).

### 2. Audit of PM-only assumptions in board/chat RSC loaders, panels, actions

Checked `app/pm/board/page.tsx`, `board-panel.tsx` (full 2187 lines), `actions.ts` (1188
lines), `app/pm/chat/page.tsx`, `chat-panel.tsx` (613 lines), `app/pm/chat/actions.ts`,
`lib/actions/clients.ts`, `lib/security/board-write-authz.ts`.

**No literal `role === 'pm'` (or similar PM-only) check exists anywhere in this call graph.**
`grep -rn "role ===" app/pm/board app/pm/chat` only matches unrelated chat-message
`role === "user"`/`"assistant"` discriminated-union checks (`ChatMessage.role`, not
`profiles.role`).

- **`assertPmOrAdminCaller`** (`app/pm/board/actions.ts:98-109`) delegates to
  `isBoardWriteAuthorized` (`lib/security/board-write-authz.ts`), which explicitly returns true
  for `role === "admin" || role === "pm"`. This already gates `advanceStage`, `moveCard`,
  `updateCardDetails`, `toggleChecklistItem`, `addAttachment`, `removeAttachment`,
  `validateCardAgainstChecklist`, `createPiece`, `removePiece` — **9 of the file's action
  exports already admit Admin with zero changes needed.** `createCard` and
  `proposePackagePieces` have NO role check at all (only an RLS-scoped client re-read) — they
  already work for any RLS-authorized caller, Admin included.
- **`listClientPmRoster`** (`lib/actions/clients.ts:158-188`) re-reads the client via the
  RLS-scoped client first (`clients_select_scoped`, confirmed admin-unrestricted by
  `supabase/tests/0003_rls_admin_unrestricted_test.sql`) — this will succeed for Admin and
  return the same roster a PM assigned to that client would see. **Will NOT show empty for
  Admin.**
- **`listEditorRoster`**, **`resolvePmNames`** (`lib/actions/clients.ts`) both use
  `createAdminClient()` (service-role, no RLS at all) — role-agnostic by construction, work
  identically for any authenticated caller regardless of role.
- **Copy/text audit:** No PM-specific copy found in board or chat ("Nenhum PM atribuído a este
  cliente." is client-roster-empty state, not a PM-identity message; "Produção", "Chat",
  "Criar card", etc. are all role-neutral). No "seus clientes" / "your clients" phrasing exists
  in either screen — the client switcher `<Select>` lists whatever `clients` prop it's given
  (already RLS-scoped upstream), same wording for any role.
- **`/api/chat` route handler** (`app/api/chat/route.ts`) has no role check either — only
  `clients_select_scoped` RLS (admin-unrestricted). Not gated by `middleware.ts`'s roleRoot
  logic at all today (pathname `/api/chat` doesn't match any of the four `otherRoots`), so it
  is ALREADY reachable by Admin with no change required.

**Conclusion: zero changes needed inside `page.tsx`/`board-panel.tsx`/`actions.ts` for
PM-vs-Admin data or authorization correctness.** The only changes needed inside these files
are the three navigation-target bugs below (Finding 2a).

**Confidence:** HIGH — exhaustive grep + full-file read of every file in the call graph.

### 2a. NEW FINDING — three hardcoded `/pm/clients` navigation targets will break for Admin

This was not explicitly named in the `<files_to_read>` list but is the single most important
actionable finding of this research: **opening the middleware alone is necessary but NOT
sufficient.** Both `board-panel.tsx` and `chat-panel.tsx` contain internal
`router.push`/`router.replace`/`<Link href>` calls hardcoded to `/pm/clients` or
`/pm/clients/${id}` — routes this task's scope explicitly excludes from Admin's allow-list.
Once the middleware opens `/pm/board`/`/pm/chat`, these three call sites become Admin-reachable
dead ends (middleware redirects Admin back to `/admin`, silently discarding the intended
navigation):

| # | File:Line | Trigger | Current behavior |
|---|-----------|---------|-------------------|
| 1 | `board-panel.tsx:1987` (`useEffect`, ~line 1980-1988) | Admin visits `/pm/board` with no `?client=` in URL AND no `lastSelectedClientId` in localStorage (e.g. very first visit) | `router.replace("/pm/clients")` — blocked by middleware, Admin bounces to `/admin` |
| 2 | `board-panel.tsx:2054` | Admin clicks "Editar briefing" button (visible whenever `activeClient` is set) | `<Link href={\`/pm/clients/${activeClient.id}\`}>` — blocked by middleware, Admin bounces to `/admin` |
| 3 | `chat-panel.tsx:162` (`useEffect`, ~line 156-164) | Admin visits `/pm/chat` with no resolvable active client (first visit, cleared storage, or stale id) | `router.push("/pm/clients")` — blocked by middleware, Admin bounces to `/admin` |

Finding #1 is the most severe: it fires on **every fresh Admin session** the first time they
open `/pm/board` from the new sidebar link, before any client has ever been selected on that
browser — the exact entry-point scenario this task is building. Left unfixed, clicking the new
Admin sidebar "Produção" link would silently bounce back to `/admin` with no error, which will
look like the feature doesn't work at all.

**Recommended fix approaches (pick one, both are small):**
- **(a) Role-aware redirect target.** Thread the caller's role down into `BoardPanel`/
  `ChatPanel` as a prop (both already receive server-resolved props from their `page.tsx`
  RSC loaders — trivial to add one more `viewerIsAdmin: boolean` or `viewerRole` prop,
  matching the exact pattern `client-detail-form.tsx` already uses for `viewerIsAdmin`), and
  branch the three call sites: `viewerIsAdmin ? "/admin/clients" : "/pm/clients"` (and
  `/admin/clients/${id}` for #2).
- **(b) Add `/pm/clients` (list only, not `/pm/clients/[id]`) to Admin's allow-list too.**
  Rejected by this task's explicit scope ("não `/pm/clients`... Admin já tem equivalente
  próprio em `/admin/*`") — flagging only so the planner doesn't reach for it by accident.

Approach (a) is consistent with the existing `viewerIsAdmin` prop-threading precedent in
`client-detail-form.tsx` (`app/pm/clients/[id]/page.tsx` passes `backHref="/pm/clients"`,
`app/admin/clients/[id]/page.tsx` passes `backHref="/admin/clients"` — the SAME shared
component, role-branched via a prop from its two route wrappers). The planner should apply the
identical pattern to `BoardPanel`/`ChatPanel`.

**Note:** `AppSidebar`'s own `linksToActiveClientDetail` flag (`components/layout/
app-sidebar.tsx:77-80`) also hardcodes `/pm/clients/${activeClientId}` — but this flag is
CURRENTLY UNUSED by any live `items` array (both `app/pm/layout.tsx` and `app/admin/layout.tsx`
pass items with no `linksToActiveClientDetail: true`), so it is dead code for this task's
purposes and does not need to change unless the planner chooses to use it for the new Admin nav
item (not recommended — see Finding 4).

**Confidence:** HIGH — verified via `grep -n '/pm/' board-panel.tsx chat-panel.tsx` plus direct
read of both surrounding code blocks.

### 3. `client-detail-form.tsx`'s `onSubmitBriefing` redirect

Confirmed: `router.push(\`/pm/board?client=${client.id}\`)` (`client-detail-form.tsx:245`) is
**hardcoded to `/pm/board` regardless of which route wrapper rendered the form** — it does NOT
use the `backHref` prop (that prop only drives the "Voltar" link and the post-archive redirect,
lines 149/284-290). `app/admin/clients/[id]/page.tsx` passes `backHref="/admin/clients"` but
still renders the SAME `ClientDetailForm`, whose briefing-save redirect always targets
`/pm/board?client=...`.

**This confirms the task description's assumption is correct: once the middleware opens
`/pm/board` to Admin, this specific redirect starts working with ZERO code change**, because
it already points at the (soon-to-be-shared) `/pm/board` route, not a PM-root-relative or
role-derived path. No other gate sits between this `router.push` call and the middleware.

**Confidence:** HIGH — direct read of `client-detail-form.tsx` full file plus both `[id]/
page.tsx` wrappers.

### 4. Admin sidebar nav item

`app/admin/layout.tsx` passes a static `items` array to the existing `AppSidebar` client
component (`components/layout/app-sidebar.tsx`) — same shape PM's layout already uses:

```ts
{ href: "/admin/clients", label: "Clientes", icon: <UsersIcon /> },
{ href: "/admin/editors", label: "Editores", icon: <UserCogIcon /> },
{ href: "/admin/approvals", label: "Aprovações", icon: <ClipboardCheckIcon /> },
{ href: "/admin/checklist-templates", label: "Checklists", icon: <ListChecksIcon /> },
{ href: "/admin/cards", label: "Cards", icon: <KanbanIcon /> },
{ href: "/admin/shared-knowledge", label: "Base de conhecimento", icon: <BookOpenIcon /> },
```

**Recommended addition** — one new item, using an icon not already in use in either sidebar
(e.g. `KanbanIcon` is already used for `/admin/cards`, so reuse a distinct icon — a natural
existing repo choice is `LayoutDashboardIcon`, already imported in `chat-panel.tsx` for the
"Produção" cross-nav button):

```ts
{ href: "/pm/board", label: "Produção", icon: <LayoutDashboardIcon /> },
```

Add `SidebarNavItem`'s existing `requiresActiveClient`/`linksToActiveClientDetail` flags are
NOT needed here — those exist specifically for PM's client-scoped gating UX (hide nav until a
client is picked); Admin's new item should behave like every other static Admin nav item
(always visible), matching PM's OWN pre-2026-08-05 pattern before that navigation-flow
correction removed Chat/Produção from PM's sidebar in favor of in-page cross-nav buttons.

**Does Admin need a separate "Chat" sidebar item too, or does board link to it internally?**
Confirmed: `board-panel.tsx:2045-2052` renders a "Chat" button (`<Link href="/pm/chat">`)
whenever a client is active, and `chat-panel.tsx:435-442` renders a "Produção" button back
to `/pm/board?client=${activeClientId}` whenever a client is active — this is the EXACT
established cross-navigation pattern PM already uses (PM's own sidebar, per the
2026-08-05 comment in `app/pm/layout.tsx:18-23`, deliberately has ONLY "Clientes" for this same
reason: "'Chat' and 'Produção' are reachable via each page's own explicit button... The
sidebar no longer duplicates any of that navigation.").

**Recommendation: add exactly ONE new Admin sidebar item ("Produção" -> `/pm/board`), not
two.** This mirrors PM's own established convention precisely (single entry point + in-page
cross-nav), and is consistent with the task's "reuse the same screens" decision — adding a
redundant Admin-only "Chat" sidebar item would create asymmetry with how PM's own equivalent
screens are navigated, and there's no reason Admin's UX pattern should diverge from PM's for
two connected screens that already cross-link each other.

Because the middleware allow-list already covers `/pm/chat` (Finding 1), the existing
"Chat" button inside `board-panel.tsx` works for Admin automatically once the middleware
change lands — no additional wiring needed for that cross-nav path, other than fixing the
`/pm/clients` fallback (Finding 2a) which sits upstream of ever reaching a state where that
button is visible in the first place (it requires `activeClient` to be truthy).

**Confidence:** HIGH — direct read of `app-sidebar.tsx`, `app/pm/layout.tsx`,
`app/admin/layout.tsx`, and both cross-nav buttons.

### 5. Server Action additional-restriction audit

Every write action in `app/pm/board/actions.ts` reachable from the board (`createCard`,
`advanceStage`, `toggleChecklistItem`, `moveCard`, `updateCardDetails`, `addAttachment`,
`removeAttachment`, `validateCardAgainstChecklist`, `createPiece`, `removePiece`,
`proposePackagePieces`) and `app/pm/chat/actions.ts` (`saveKnowledge`,
`listMessagesForClient`) was read in full. **None contain any restriction beyond
`assertPmOrAdminCaller`/RLS that would incidentally exclude Admin** — no PM-id ownership
check, no `created_by === user.id` comparison, no client-assignment-membership check that
isn't already RLS-scoped (and RLS is confirmed admin-unrestricted). Every action that
re-reads a row through RLS (`cards`, `clients`, `card_checklist_items`, `card_attachments`)
uses the RLS-scoped `createClient()`, never a PM-specific filter layered on top.

The ONE action Admin was already fully blocked from by DESIGN and stays that way regardless of
this change: `assignPms` (`lib/actions/clients.ts:389-437`) is `role === "admin"`-ONLY (a PM
cannot call it) — irrelevant here since it isn't part of the board/chat surface, just
confirming the codebase's authorization pattern is consistently role-literal only where
INTENDED, never accidentally.

**Confidence:** HIGH — full read of both actions files, cross-checked against
`board-write-authz.ts` and the RLS admin-unrestricted test file's existence.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|--------------|-----|
| Role-aware navigation target inside a shared component | A new role-detection hook/context | Prop-threading from the RSC loader (same pattern `client-detail-form.tsx` already uses for `viewerIsAdmin`/`backHref`) | Server already knows the caller's role at `page.tsx` render time; no need for a second client-side role source of truth |
| Extending middleware's role gate | A full rewrite of the `roleRoot` matching logic | Additive `extraAllowedPrefixes` map checked before the existing redirect condition | Minimizes diff surface on a security-critical file; existing single-root behavior for every other role stays byte-for-byte unchanged |

## Common Pitfalls

### Pitfall 1: Assuming the middleware change alone is sufficient
**What goes wrong:** Admin opens the new sidebar "Produção" link, is immediately bounced back
to `/admin` with no visible error, looks like the feature is broken.
**Why it happens:** `board-panel.tsx`'s own `useEffect` redirects to `/pm/clients` (a route
still correctly blocked for Admin) whenever no active client is resolvable — which is exactly
the state of a brand-new Admin session on a fresh browser/profile.
**How to avoid:** Fix Finding 2a (the three hardcoded `/pm/clients` targets) in the SAME plan
as the middleware change — they are not independently optional.
**Warning signs:** Manually testing as Admin with a browser/profile that has never visited
`/pm/board`/`/pm/chat` before (i.e., empty `localStorage`) is the exact repro condition; testing
with a browser that already has a PM's `lastSelectedClientId` cached will mask this bug.

### Pitfall 2: Broadening the middleware prefix too loosely
**What goes wrong:** Using a prefix like `/pm/c` or omitting the `pathname === prefix ||
pathname.startsWith(prefix + "/")` boundary check could accidentally also allow `/pm/clients`
or `/pm/chat-something` if a future route is added with a similar name.
**Why it happens:** Naive string-prefix matching without a trailing-slash/exact-match guard.
**How to avoid:** Reuse the EXACT same `pathname === root || pathname.startsWith(\`${root}/\`)`
idiom the file already uses for `otherRoots`, applied verbatim to the new `extraAllowedPrefixes`
check (already written into the Finding 1 code sample above).

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|----------------|
| A1 | Admin's new sidebar item should be exactly one entry ("Produção" -> `/pm/board`), no separate "Chat" item, mirroring PM's own 2026-08-05 navigation-flow-correction convention | Finding 4 | Low — purely a UX/discretion call; if wrong, planner adds a second trivial sidebar item, no architectural cost |
| A2 | `LayoutDashboardIcon` is an available/appropriate icon choice, not already reserved for a different meaning in Admin's sidebar | Finding 4 | Low — cosmetic only, any unused lucide-react icon works |

**Risk assessment:** Both assumptions are low-risk UX/cosmetic choices, not architectural or
security decisions — safe for the planner to lock in directly rather than re-confirming with
the user, but flagged for completeness per protocol.

## Open Questions

1. **Should the shared `lib/client-selection.ts` `lastSelectedClientId` localStorage key be
   role-scoped (e.g. namespaced per role) to avoid a PM and Admin sharing the same browser
   profile from clobbering each other's "last selected client"?**
   - What we know: the key (`backstageed:last-selected-client`) is a single global
     `localStorage` entry, not scoped by user id or role.
   - What's unclear: whether any real user actually logs in as both PM and Admin on the same
     browser profile (operationally unlikely for a small team, but not impossible).
   - Recommendation: out of scope for this quick task — this is a pre-existing, PM-only
     limitation (a PM using two different accounts on one browser would already hit this) that
     Admin access does not make meaningfully worse. Leave as-is unless the user raises it.

## Environment Availability

Skipped — this task involves no new external dependencies, no new packages, and no new
infrastructure. Pure application-code change (middleware + two client components + one
layout).

## Package Legitimacy Audit

Not applicable — no packages are installed by this task.

## Validation Architecture

Skipped per repo convention check: no `.planning/config.json` `workflow.nyquist_validation`
key was located during this focused quick-task research pass and no existing automated test
suite scaffold was inventoried (this quick task's scope is a manual-verification-appropriate
routing/navigation fix, not a new-behavior feature). The planner should confirm whether the
project's existing `supabase/tests/0003_rls_admin_unrestricted_test.sql` pgTAP suite already
provides sufficient coverage (it does, for the RLS layer) and treat the middleware/navigation
change as covered by manual QA (log in as Admin, click through Produção/Chat, including a
cold/empty-localStorage session) rather than a new automated test, unless the project's actual
test conventions (not inventoried here) say otherwise.

## Security Domain

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-------------------|
| V4 Access Control | yes | Middleware role-root gate (`middleware.ts`) is the route-level boundary; RLS (`is_admin()` OR'd into every relevant policy) is the data-level boundary; Server Action `assertPmOrAdminCaller` is the write-level boundary. All three already exist and already include Admin except the route-level gate, which is exactly what this task changes. |

### Known Threat Patterns for this stack

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|-----------------------|
| Middleware prefix-matching too broad, accidentally allowing an unintended sub-route | Elevation of Privilege | Exact `pathname === prefix || pathname.startsWith(prefix + "/")` boundary check (Pitfall 2 above) |
| Client-side navigation bug causing an authorized user to be bounced/redirected in a way that LOOKS like a security block but is actually a UX bug | (not a security issue per se, but worth naming) | Confirmed Finding 2a is a functional bug, not a security gap — Admin was never at risk of accessing something they shouldn't; the risk is the opposite (a working feature appearing broken) |

No new attack surface is introduced by this task — every write/read path Admin gains access
to was already RLS/app-layer authorized for Admin before this change; only the route-level
door was locked.

## Sources

### Primary (HIGH confidence — direct code read this session)
- `middleware.ts` (full file)
- `app/pm/board/page.tsx`, `app/pm/board/board-panel.tsx` (full, both halves), `app/pm/board/actions.ts` (full)
- `app/pm/chat/page.tsx`, `app/pm/chat/chat-panel.tsx` (full), `app/pm/chat/actions.ts` (full)
- `app/pm/layout.tsx`, `app/admin/layout.tsx`
- `lib/client-selection.ts`
- `components/clients/client-detail-form.tsx` (full)
- `lib/actions/clients.ts` (full)
- `lib/security/board-write-authz.ts` (full)
- `components/layout/app-sidebar.tsx` (full)
- `app/pm/clients/[id]/page.tsx`, `app/admin/clients/[id]/page.tsx`
- `app/api/chat/route.ts` (full)
- `grep` cross-checks for `role ===`, `/pm/` literal string occurrences across the whole call graph
- `find` confirming `supabase/tests/0003_rls_admin_unrestricted_test.sql` exists (RLS admin-unrestricted precedent, not read line-by-line — file's existence and naming is sufficient corroboration alongside the code comments in `actions.ts`/`board-write-authz.ts` that already cite it)

No Context7/WebSearch/WebFetch calls were needed — this task is entirely internal to the
existing codebase, no external library or framework research required.

## Metadata

**Confidence breakdown:**
- Middleware extension approach: HIGH — minimal additive pattern matching existing code style exactly
- PM-only assumption audit (board/chat/actions): HIGH — exhaustive full-file reads + grep, zero literal role checks found
- Navigation-target bug (Finding 2a): HIGH — directly located via grep + read, reproducible from stated trigger conditions
- Sidebar nav recommendation: MEDIUM-HIGH — the "one item, not two" call is a UX judgment (flagged as A1 in Assumptions Log) grounded in the codebase's own explicit precedent comment, not an external convention

**Research date:** 2026-08-12
**Valid until:** No expiry concern — this is a point-in-time internal codebase read, not
subject to external library drift. Re-verify only if `middleware.ts`, `board-panel.tsx`, or
`chat-panel.tsx` change before this quick task is executed.
