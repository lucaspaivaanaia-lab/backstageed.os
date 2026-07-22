---
phase: quick-260721-wqd
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - app/globals.css
  - components/layout/page-shell.tsx
  - app/(auth)/login/page.tsx
  - app/pm/page.tsx
  - app/pm/clients/page.tsx
  - app/pm/clients/new/page.tsx
  - components/clients/client-create-form.tsx
  - app/pm/clients/[id]/page.tsx
  - components/clients/client-detail-form.tsx
  - app/pm/clients/[id]/access/page.tsx
  - components/clients/client-access-panel.tsx
  - app/pm/chat/chat-panel.tsx
autonomous: false
requirements: [UI-CONSISTENCY]
must_haves:
  truths:
    - "All four screen areas (login, pm/clients, pm/clients/[id]/access, pm/chat) share one color palette, one type scale, and one page-container width convention."
    - "A single shared design foundation (color tokens + presentational shell components) is the source of consistency — screens consume it instead of inventing per-screen values."
    - "The chat screen never renders a raw error, blank screen, or infinite spinner when clicked live; every empty/loading/error branch has polished graceful fallback markup."
    - "Zero business-logic, Server Action, Route Handler, Supabase query, RLS, or auth/session code was modified — only JSX/TSX markup, Tailwind classes, and style tokens changed."
  artifacts:
    - path: "app/globals.css"
      provides: "Brand color palette + typography/spacing tokens consumed app-wide"
      contains: "--primary"
    - path: "components/layout/page-shell.tsx"
      provides: "Shared PageShell / PageTitle / SectionTitle / EmptyState presentational components"
      exports: ["PageShell", "PageTitle", "SectionTitle", "EmptyState"]
  key_links:
    - from: "app/pm/clients/page.tsx"
      to: "components/layout/page-shell.tsx"
      via: "import + render PageShell/PageTitle/EmptyState"
      pattern: "page-shell"
    - from: "components/clients/client-detail-form.tsx"
      to: "components/layout/page-shell.tsx"
      via: "import + render SectionTitle"
      pattern: "page-shell"
---

<objective>
A consistent visual/design pass across the four already-built screen areas ahead of a
presentation tomorrow: **login**, **/pm/clients** (list + create + briefing), **/pm/clients/[id]/access**,
and **/pm/chat**. Establish one brand palette, one typography scale, one spacing/container
convention, and professional empty states + forms — all built on shadcn/ui components already
present in the project.

Purpose: The screens are functionally built but visually inconsistent — each invents its own
container width and inline heading styles, and the palette is the default pure-neutral shadcn
gray with no brand identity. This pass makes the product look intentional and cohesive for the
demo.

Output: A shared design foundation (color tokens in `globals.css` + presentational shell
components) that all four screen areas consume, plus a defensive polish of the chat screen's
non-happy-path states.

## HARD SCOPE CONSTRAINT (read before any edit)

This is a **pure visual/styling pass**. You may ONLY touch:
- JSX/TSX **markup** (element structure, className strings, presentational wrapper components)
- Tailwind utility classes
- Shared style **tokens** (`app/globals.css`) and new **presentational** components

You may NOT touch, under any circumstance:
- Any `actions.ts` Server Action logic (`app/(auth)/login/actions.ts`, `app/pm/chat/actions.ts`,
  `app/pm/clients/[id]/access/actions.ts`, `lib/actions/**`)
- Route Handlers (`app/api/chat/route.ts`)
- Supabase queries / client construction (`lib/supabase/**`), RLS, migrations (`supabase/**`)
- Auth / session / middleware (`middleware.ts`)
- Validation schemas (`lib/validation/**`), fetch/streaming/AbortController logic in
  `chat-panel.tsx`, or any `useState`/`useTransition`/data-flow wiring

Do not rename props, change state shape, alter event-handler behavior, or reorder data flow.
Only the rendered markup and its classes change. When in doubt, leave the logic byte-for-byte
identical and only wrap/restyle the output.

## No networked web font (deliberate)

Do NOT add `next/font/google` or any package that fetches a font at build time — a failed
font fetch could break the build the night before the demo. Refine typography using the
existing system font stack (weights, sizes, tracking, line-height) via tokens/shared
components only.
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
</execution_context>

<context>
@.planning/STATE.md
@./CLAUDE.md

<interfaces>
<!-- Current shared design surface. Executor should build on these, not re-explore. -->

app/globals.css (Tailwind v4, CSS-based config — NO tailwind.config file):
- shadcn "new-york", baseColor "neutral". All :root color tokens are pure-neutral
  (oklch chroma = 0). Key tokens: --primary, --primary-foreground, --secondary, --muted,
  --muted-foreground, --accent, --ring, --border, --radius (0.625rem), --font-sans,
  --font-heading (currently aliased to --font-sans).
- @theme inline maps --color-* to the vars; a .dark block mirrors every token.

shadcn/ui components available (components/ui/): alert-dialog, badge, button, card, checkbox,
dialog, form, input, label, select, separator, skeleton, sonner, table, textarea.

Repeated inline patterns to replace with shared components:
- Page container: max-w-{4xl|3xl|xl|2xl} mx-auto px-6 py-8 (inconsistent width per screen)
- Page title: text-[28px] font-semibold leading-[1.2]
- Section title: text-xl font-semibold leading-[1.2]
- Empty state: flex flex-col items-center gap-2 py-12 text-center + h2 + muted p

Shared form components (also rendered by /admin routes — restyling them improves admin too):
- components/clients/client-create-form.tsx
- components/clients/client-detail-form.tsx  (briefing form: heading + 3 sections)
- components/clients/client-access-panel.tsx  (Card-based create/deactivate access)

Utility: cn() lives at @/lib/utils (safe to import in presentational components).
</interfaces>
</context>

<tasks>

<task type="auto">
  <name>Task 1: Shared design foundation — palette tokens + presentational shell components</name>
  <files>app/globals.css, components/layout/page-shell.tsx</files>
  <action>
Establish the single source of design consistency the other tasks consume.

1. In `app/globals.css`, give the palette a professional brand identity by replacing the
   pure-neutral (zero-chroma) `--primary` in the :root block with a single deep, restrained
   brand hue — an indigo/blue around `oklch(0.45 0.15 265)` (tune lightness/chroma for a muted,
   professional look, not a saturated one). Set `--primary-foreground` to a near-white that
   meets contrast. Nudge `--ring` and `--accent`/`--accent-foreground` so focus rings and hover
   accents read as the same brand family (keep them subtle). Mirror the SAME changes in the
   .dark block so dark mode stays coherent. Leave surface neutrals (background, card, muted,
   border) as the existing grays — only the brand/interactive tokens gain hue. Do NOT change
   --radius structure, the @theme inline mapping keys, or token names — only token VALUES. This
   is the one place the brand color is defined; everything else inherits via the existing
   --color-primary etc. mappings.

2. Keep the system font stack (no web-font dependency). Optionally refine --font-heading / base
   tracking only via existing token values if it improves polish — no new imports.

3. Create `components/layout/page-shell.tsx` — a new PURE presentational file (no data/logic, no
   "use client" needed) exporting:
   - PageShell — a mx-auto w-full px-6 py-8 container accepting children, optional className
     (merged via cn from @/lib/utils), and an optional width prop: "default" = max-w-3xl,
     "wide" = max-w-4xl, "narrow" = max-w-xl. Screens pick from this fixed set instead of
     inventing arbitrary widths.
   - PageTitle — the standardized page heading (replaces inline text-[28px] font-semibold
     leading-[1.2]): an h1 accepting children + optional className, plus an optional action
     slot rendered to the right (flex row, items-center justify-between) for the "Criar cliente"
     button pattern.
   - SectionTitle — an h2 with class text-xl font-semibold leading-[1.2] (replaces the repeated
     inline section heading).
   - EmptyState — the standardized empty-state block (flex flex-col items-center gap-3 py-12
     text-center) with props title (string), description (ReactNode), and optional action
     (ReactNode) slot; title at SectionTitle size, description as text-sm text-muted-foreground.
   Use only Tailwind classes and existing tokens. No imports from lib/actions or supabase.
  </action>
  <verify>
    <automated>npx tsc --noEmit 2>&1 | tail -5; git diff --stat -- 'app/**/actions.ts' 'app/api/**' 'lib/**' 'supabase/**' middleware.ts</automated>
  </verify>
  <done>globals.css has a non-zero-chroma brand --primary in both :root and .dark; components/layout/page-shell.tsx exists and exports PageShell, PageTitle, SectionTitle, EmptyState; the logic-file git diff is empty; typecheck passes.</done>
</task>

<task type="auto">
  <name>Task 2: Login + PM landing — consistent auth entry styling</name>
  <files>app/(auth)/login/page.tsx, app/pm/page.tsx</files>
  <action>
Restyle only the markup of the login and PM-landing screens for a polished, consistent entry.

1. `app/(auth)/login/page.tsx`: keep ALL logic (handleSubmit, useTransition, error state, signIn
   import, field names, form action wiring) byte-for-byte. Improve the visual shell only: add a
   small product wordmark / title ("BackstageEd.OS") above the Card, tighten the centered layout
   spacing, and ensure the Card, Inputs, Labels, and full-width Button use spacing consistent
   with the rest of the app. Error-text markup (text-sm text-destructive and the
   destructive-tinted server-error box) may keep its classes.

2. `app/pm/page.tsx`: this is a placeholder landing Card. Restyle it to visually match the login
   Card (same wordmark treatment / spacing) so the two entry screens feel like one product. Pure
   markup only.

Note: the sibling (auth) pages (signup, pending, rejected, change-password) are OUT of scope —
do not edit them; just ensure your login changes do not add a shared (auth) layout that would
alter their rendering.
  </action>
  <verify>
    <automated>npx tsc --noEmit 2>&1 | tail -5; git diff --stat -- 'app/(auth)/login/actions.ts' 'app/**/actions.ts' 'lib/**' 'supabase/**' middleware.ts</automated>
  </verify>
  <done>Login and PM-landing render a shared wordmark + consistent Card/spacing; no field names, action wiring, or actions imports changed; sibling (auth) pages untouched; logic-file diff empty; typecheck passes.</done>
</task>

<task type="auto">
  <name>Task 3: PM clients list + create — adopt shared shell + polished empty state</name>
  <files>app/pm/clients/page.tsx, app/pm/clients/new/page.tsx, components/clients/client-create-form.tsx</files>
  <action>
Migrate the clients list and create screens onto the Task 1 shared components. Do NOT touch the
Supabase select, resolvePmNames call, RLS comment, or any data flow.

1. `app/pm/clients/page.tsx`: replace the inline max-w-4xl mx-auto px-6 py-8 container with
   PageShell (width="wide"), replace the inline h1 + button row with PageTitle carrying the
   "Criar cliente" Button in its action slot (text "Clientes"), and replace the hand-rolled
   empty-state block with EmptyState (same exact Portuguese copy: title "Nenhum cliente
   cadastrado ainda", the existing description, and the "Criar cliente" Button in the action
   slot). The Table and Badge markup stay; only tidy spacing to sit consistently inside
   PageShell. The .map over clients and all conditional logic stay identical.

2. `app/pm/clients/new/page.tsx`: replace max-w-3xl mx-auto px-6 py-8 + inline h1 with PageShell
   + PageTitle ("Novo cliente"). Keep the listPmRoster() / supabase.auth.getUser() server calls
   and the ClientCreateForm props unchanged.

3. `components/clients/client-create-form.tsx`: visual polish only — consistent field spacing,
   the PM-picker Dialog, selected-PM Badges, and submit Button. Keep react-hook-form wiring, the
   createClientRecord call, togglePm/removePm, and all props identical. You may replace the bare
   "x" remove glyph with a lucide XIcon (size-3) to match the detail form's Badge remove
   pattern — markup only.
  </action>
  <verify>
    <automated>npx tsc --noEmit 2>&1 | tail -5; git diff --stat -- 'lib/actions/**' 'lib/validation/**' 'lib/supabase/**' 'app/**/actions.ts'</automated>
  </verify>
  <done>List, create page, and create form render via PageShell/PageTitle/EmptyState with identical copy; no data-fetch, validation, or action code changed; logic-file diff empty; typecheck passes.</done>
</task>

<task type="auto">
  <name>Task 4: Client detail + briefing form — consistent sections</name>
  <files>app/pm/clients/[id]/page.tsx, components/clients/client-detail-form.tsx</files>
  <action>
Restyle the client detail wrapper and the briefing form. Touch NO Server Action, validation, or
data-fetch code.

1. `app/pm/clients/[id]/page.tsx`: replace the inline max-w-3xl mx-auto px-6 py-8 container with
   PageShell. Keep the two-query Promise.all, createAdminClient, notFound(), the canRetry
   computation, and every ClientDetailForm prop exactly as-is.

2. `components/clients/client-detail-form.tsx`: this component owns the page h1 (client name) and
   three h2 sections (Briefing estratégico / PMs atribuídos / RAG). Replace the inline
   text-[28px] h1 with PageTitle and each inline text-xl h2 with SectionTitle. Polish field
   spacing, the content-pillars Badge row, the PM Dialog picker, and the RAG status
   Badges/retry button for consistency with the shared scale. The "Nenhum PM atribuído ainda."
   and "RAG setup pendente." lines keep the muted-text treatment. Keep ALL logic: react-hook-form,
   useFieldArray, updateBriefing, assignPms, retryTropicaliaProvisioning, every handler, every
   prop, and the locked section ORDER (name -> Briefing -> PMs -> RAG). Do not change form field
   names or submit wiring.
  </action>
  <verify>
    <automated>npx tsc --noEmit 2>&1 | tail -5; git diff --stat -- 'lib/actions/**' 'lib/validation/**' 'lib/supabase/**'</automated>
  </verify>
  <done>Detail page uses PageShell; briefing form uses PageTitle/SectionTitle with unchanged section order and copy; no action/validation/fetch code changed; logic-file diff empty; typecheck passes.</done>
</task>

<task type="auto">
  <name>Task 5: Client access screen — consistent Card layout</name>
  <files>app/pm/clients/[id]/access/page.tsx, components/clients/client-access-panel.tsx</files>
  <action>
Polish the client-access screen. This screen renders locked UI-SPEC copy verbatim — DO NOT alter
any Portuguese copy string, and touch NO Server Action logic.

1. `app/pm/clients/[id]/access/page.tsx`: replace the inline max-w-xl mx-auto px-6 py-8 container
   with PageShell (width="narrow"). Keep findActiveClientLogin(client_id), notFound(), and the
   ClientAccessPanel props exactly as-is.

2. `components/clients/client-access-panel.tsx`: visual polish only of the Card-based states
   (create-access form, provisional-password callout, active-access/deactivate Card, and the
   deactivated confirmation Card). Ensure consistent Card spacing, keep the code-styled
   provisional password legible, and make the destructive "Desativar acesso" button +
   AlertDialog read consistently. Keep EVERY copy string byte-for-byte (locked UI-SPEC copy),
   keep createClientLogin/deactivateClientAccess calls, all useState/useTransition, the toast
   calls, and all props identical.
  </action>
  <verify>
    <automated>npx tsc --noEmit 2>&1 | tail -5; git diff --stat -- 'app/**/actions.ts' 'lib/**' 'supabase/**'</automated>
  </verify>
  <done>Access page uses PageShell(narrow); access panel Cards restyled consistently with all locked copy and action calls unchanged; logic-file diff empty; typecheck passes.</done>
</task>

<task type="auto">
  <name>Task 6: Chat screen — defensive visual polish of non-happy-path states</name>
  <files>app/pm/chat/chat-panel.tsx</files>
  <action>
DEFENSIVE POLISH ONLY. The chat's live end-to-end behavior (real streaming, cross-client
isolation) has NOT yet passed its human-verify checkpoint — this task must NOT attempt to
finish or fix that. Do NOT touch: the fetch("/api/chat") call, AbortController wiring,
shouldAppendChunk gating, streamResponse/loadHistory/handleSend/handleRetry logic, the
saveKnowledge/listMessagesForClient calls, or any useState/useRef/useTransition data flow.

The ONLY goal: the screen must never render a visually broken state (raw/uncaught error, blank
white screen, or infinite bare spinner) if clicked live during the presentation. Restrict edits
to className strings and the presentational markup of the existing branches in the render tree:

1. Audit every already-present render branch and give each a polished, graceful appearance,
   reusing the shared type scale where it fits (SectionTitle for empty-state headings):
   - No-client-selected empty state ("Nenhum cliente selecionado")
   - No-messages empty state ("Nenhuma mensagem ainda ... Faça uma pergunta sobre {name}")
   - The degraded-mode Badge (DEGRADED_NOTICE) — ensure it reads as an intentional, styled notice
   - The streaming typing-dots indicator — confirm it renders as a tidy animated affordance, not
     a jarring artifact
   - sendError box, interrupted box + "Tentar novamente" link — consistent destructive styling
   - The checked-messages selection bar and composer footer — consistent spacing
2. Confirm message bubbles, the client-switcher Select header (sticky), and the composer footer
   (sticky) sit consistently within the shared palette/type scale.
3. Do not introduce new loading branches or new state — only restyle what already renders. If a
   branch already exists it must look intentional; if a branch does not exist, do NOT add data
   logic to create one.

Keep the file "use client" and every existing import/handler intact.
  </action>
  <verify>
    <automated>npx tsc --noEmit 2>&1 | tail -5; git diff -- app/pm/chat/chat-panel.tsx | grep -E '^\+' | grep -v '^+++' | grep -icE 'fetch\(|abortcontroller|shouldappendchunk|savekknowledge|listmessagesforclient|usestate|useref|usetransition|\.abort\(' || echo "0 logic additions"</automated>
    <human-check>Run `npm run dev`, open /pm/chat. Confirm: (1) initial load shows the styled "Nenhum cliente selecionado" empty state, not a blank/broken screen; (2) selecting a client shows either the styled "Nenhuma mensagem ainda" empty state or history — never a raw error or infinite bare spinner; (3) the degraded Badge and any error boxes look intentional. Do NOT exercise live streaming / client-switch-mid-stream (out of scope, unverified).</human-check>
  </verify>
  <done>Every chat render branch has polished graceful markup; the git-diff added-lines contain no data/streaming/state logic (grep count 0); typecheck passes; no blank/raw-error/infinite-spinner state reachable on load or client-select.</done>
</task>

<task type="checkpoint:human-verify" gate="blocking">
  <what-built>A consistent design pass across login, /pm/clients (list + create + detail/briefing), /pm/clients/[id]/access, and /pm/chat: one brand palette, one type scale, one container-width convention, polished empty states/forms, and defensive chat fallback states — all on shadcn/ui, with zero logic/RLS/auth changes.</what-built>
  <how-to-verify>
1. Run `npm run build` — it must complete with no type errors.
2. Run the scope gate: `git diff --stat -- 'app/**/actions.ts' 'app/api/**' 'lib/actions/**' 'lib/validation/**' 'lib/supabase/**' 'supabase/**' middleware.ts` — output MUST be empty (only markup/style files changed).
3. Run `npm run dev` and visually confirm each screen for the demo:
   - /login — branded wordmark, consistent Card/spacing.
   - /pm/clients — consistent title/container, polished empty state (if no clients) and table.
   - Open a client -> detail/briefing sections consistent; -> /access screen Cards consistent.
   - /pm/chat — loads to a styled empty state; selecting a client never shows a blank/raw-error/infinite-spinner. Do NOT test live streaming (out of scope).
4. Confirm the palette/typography feels cohesive across all four areas.
  </how-to-verify>
  <resume-signal>Type "approved" or describe visual issues to adjust.</resume-signal>
</task>

</tasks>

<threat_model>
## Trust Boundaries

This plan is a pure markup/style pass. It deliberately does NOT cross or modify any trust
boundary — no auth, session, RLS, Server Action, Route Handler, or Supabase query is touched.
The relevant risk is regression, not a new attack surface.

## STRIDE Threat Register

| Threat ID | Category | Component | Disposition | Mitigation Plan |
|-----------|----------|-----------|-------------|-----------------|
| T-wqd-01 | Tampering | Accidental edit to Server Action / RLS / auth logic while restyling | mitigate | Every task's `<verify>` runs a `git diff --stat` scope gate over actions/api/lib/supabase/middleware that MUST be empty; final human-verify checkpoint re-runs it before sign-off. |
| T-wqd-02 | Denial of Service | Build breakage before the presentation (e.g. networked web-font fetch) | mitigate | No new build-time dependencies; explicit prohibition on next/font/google; `npm run build` gate in the final checkpoint. |
| T-wqd-03 | Information Disclosure | Chat live-streaming / cross-client isolation exercised before its own checkpoint passes | accept | Chat task is defensive-visual-only and explicitly forbids touching fetch/stream/isolation logic; human-check instructs NOT to exercise live streaming. Isolation remains governed by its own pending Phase 02 checkpoint. |
| T-wqd-SC | Tampering | npm/pip/cargo installs | mitigate | No package installs in this plan; all components (shadcn/ui, lucide) already present. If any install is proposed, stop and treat as out of scope. |
</threat_model>

<verification>
- `npm run build` completes with no type errors.
- Scope gate is empty: `git diff --stat -- 'app/**/actions.ts' 'app/api/**' 'lib/actions/**' 'lib/validation/**' 'lib/supabase/**' 'supabase/**' middleware.ts`
- All four screen areas render with the shared palette, type scale, and container convention.
- `/pm/chat` reaches no blank / raw-error / infinite-spinner state on load or client-select.
</verification>

<success_criteria>
- One brand palette + typography/spacing scale defined in globals.css + components/layout/page-shell.tsx and consumed by every screen.
- login, /pm/clients (list, create, detail, briefing), /pm/clients/[id]/access, and /pm/chat all look visually consistent and presentation-ready.
- Chat non-happy-path states are polished and defensively safe.
- Only markup/style files changed — confirmed by the empty logic-file scope gate.
</success_criteria>

<output>
Create `.planning/quick/260721-wqd-passada-de-design-ui-consistente-login-p/260721-wqd-SUMMARY.md` when done.
</output>
