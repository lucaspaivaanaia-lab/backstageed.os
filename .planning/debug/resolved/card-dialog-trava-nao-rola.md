---
status: resolved
trigger: "Ao clicar num card no Kanban (/pm/board), o diálogo de detalhe do card trava e não dá pra ver o conteúdo todo."
created: 2026-08-10
updated: 2026-08-10
---

## Symptoms

- **Expected behavior:** Ao clicar num card no Kanban, o diálogo de detalhe abre e o usuário consegue ver e interagir com todo o conteúdo (descrição, responsável, anexos, checklist, botão "Avançar").
- **Actual behavior:** O diálogo "trava" — não dá pra ver o conteúdo todo.
- **Error messages:** Nenhum reportado (não é um crash/exceção — sintoma visual/interativo).
- **Timeline:** Reportado pelo usuário numa call de status (2026-08-05), depois de sessões recentes que adicionaram a feature de autocorreção de IA (quick task 260808-ci5) ao mesmo diálogo.
- **Reproduction:** Clicar em qualquer card no Kanban que tenha bastante conteúdo (checklist longo, vários anexos, ou uma descrição longa — especialmente após usar "Revalidar com IA", que pode inserir até 5000 caracteres na textarea).

## Current Focus

hypothesis: `components/ui/dialog.tsx`'s `DialogContent` (primitiva Radix compartilhada por todo Dialog do app) não define `max-height`/`overflow-y-auto`. `CardDetailDialogBody` (`app/pm/board/board-panel.tsx`) empilha conteúdo sem limite (badge, painel de validação de IA, aviso de "Desfazer revisão", textarea de descrição, responsável, lista de anexos, checklist inteiro). Quando a soma ultrapassa a viewport, o diálogo (posicionado via `top-[50%]`/`translate-y-[-50%]`) fica com uma ponta acima do topo e outra abaixo do rodapé, sem nenhuma forma de rolar até lá — "trava" é na verdade "não rola". Confirmada.

test: Abrir um card com checklist longo/vários anexos numa viewport normal (ex: 1366x768 ou uma janela de browser redimensionada) e verificar se o topo/rodapé do diálogo ficam inacessíveis, sem scrollbar em lugar nenhum. Também testar depois de clicar "Revalidar com IA" (produz uma descrição mais longa).

expecting: Se a hipótese estiver certa, o `DialogContent` renderizado terá altura maior que a viewport e `overflow: visible` computado (confirmável via DevTools), com o topo/rodapé fora da área visível e sem scrollbar.

next_action: Nenhuma — sessão resolvida e confirmada ao vivo pelo usuário.

reasoning_checkpoint:
  hypothesis: "DialogContent (components/ui/dialog.tsx) has no max-height/overflow-y, so CardDetailDialogBody's unbounded content stack (AI panel, textarea, attachments, full checklist) overflows the viewport top and bottom with no way to scroll, presenting as a 'frozen' dialog."
  confirming_evidence:
    - "Read DialogContent's full className string byte-for-byte: no max-h, no overflow-y, no overflow utility present at all."
    - "Read CardDetailDialogBody's entire JSX body (lines 902-1066): single flex-col stack with no scroll wrapper, containing conditional AI-validation panel, conditional undo banner, description textarea, assignee select, attachments loop, and full checklist loop."
  falsification_test: "If DialogContent already had overflow-y-auto/max-h somewhere (e.g. via a Tailwind plugin default, or if CardDetailDialogBody wrapped its content in an internal scroll div), the hypothesis would be wrong. Neither was found in direct source inspection."
  fix_rationale: "Adding max-h-[85vh] overflow-y-auto to the shared DialogContent primitive addresses the root cause at its source (the primitive every Dialog in the app depends on) rather than patching only CardDetailDialogBody — the same unbounded-height defect also affects the package 'Ver peças' dialog (unbounded pieces.map) and any future Dialog with long content. Grep confirmed zero existing call sites pass a conflicting className, so this is safe to apply globally."
  blind_spots: "Static inspection only within the agent session (no browser tool available) — resolved by requesting live human verification, which the user has now provided (confirmed scrolling works after opening a card with a long checklist and using 'Revalidar com IA')."

## Evidence

- timestamp: 2026-08-10T00:00:00Z
  checked: components/ui/dialog.tsx — DialogContent className string (full)
  found: 'fixed top-[50%] left-[50%] z-50 grid w-full max-w-[calc(100%-2rem)] translate-x-[-50%] translate-y-[-50%] gap-4 rounded-lg border bg-background p-6 shadow-lg ... sm:max-w-lg' — no max-height, no overflow-y, no overflow-x utility anywhere in the class list. Content height is fully unconstrained.
  implication: Confirms the primitive itself has zero built-in mechanism to cap height or scroll. Any content taller than the viewport minus 50% offset will overflow both top and bottom with no scrollbar.

- timestamp: 2026-08-10T00:00:05Z
  checked: app/pm/board/board-panel.tsx CardDetailDialogBody (lines 902-1066, the JSX rendered inside the card detail DialogContent)
  found: Single unbroken `<div className="flex flex-col gap-4">` stacking — StatusBadge, conditional AI-validation panel (loops over checklist results), conditional "Desfazer revisão" banner, Descrição Textarea (rows=5, can hold up to ~5000 chars post-AI-revalidate per symptom description), Responsável Select + Save button, Anexos section (loops over card.attachments, each an AttachmentRow, plus an attach-link form), and conditionally a full Checklist section (OverrideHistory + loop over ALL card.checklistItems as ChecklistItemRow). No wrapping div anywhere in this function sets max-height, overflow-y-auto, or any scroll container. DialogFooter (Avançar button) sits after this div, still inside the same unbounded DialogContent.
  implication: For any card with a real checklist + a few attachments + a non-trivial description, the combined content height routinely exceeds a standard viewport (1366x768 and smaller). Confirms the CardDetailDialogBody itself does nothing to compensate for DialogContent's lack of scroll handling — the two problems compound.

- timestamp: 2026-08-10T00:00:10Z
  checked: Every other DialogContent usage in the app (app/pm/board/board-panel.tsx:337 create-card form, :1134 standalone card detail, :1169 PieceDetailDialog, :1318 package "Ver peças" list; plus grep across app/admin/checklist-templates/template-form.tsx, app/admin/cards/card-audit-panel.tsx, app/admin/checklist-templates/template-list.tsx, components/clients/client-access-panel.tsx, components/clients/client-create-form.tsx, components/clients/client-checklist-section.tsx, components/clients/client-detail-form.tsx, components/approvals/approval-queue.tsx, components/ui/alert-dialog.tsx)
  found: `grep -rn "<DialogContent" --include="*.tsx" -A2 | grep -B2 "className"` returned NO results anywhere in the codebase — no call site passes a custom className to DialogContent, and none independently already implements max-height/overflow-y scrolling.
  implication: A fix applied to the shared DialogContent primitive in components/ui/dialog.tsx is safe to apply globally — no existing usage relies on unbounded height, and no usage would conflict with an added max-h/overflow-y-auto utility. This is the correct fix location (the shared primitive), not a one-off wrapper inside CardDetailDialogBody, since the same unbounded-height defect affects the package "Ver peças" list dialog too (unbounded `pieces.map(...)`) and would affect any future Dialog with long content.

- timestamp: 2026-08-10T00:00:15Z
  checked: Whether this is reproducible live (Playwright/browser) per next_action
  found: No browser automation tool is available in this session (dev server confirmed running on :3000 via `lsof`/`curl`, but no Playwright/browser tool is registered for this agent to drive it). Proceeding on static evidence: the CSS class list is definitive (verified byte-for-byte, no max-height/overflow present) and the content stacking is definitive (full function body read, no scroll wrapper present) — this is direct code inspection, not inference from behavior, so it meets the evidence-quality bar even without a live screenshot.
  implication: Root cause confirmed via direct code inspection (strong evidence: unambiguous, directly observable in source, not hearsay). Proceeding to fix_and_verify; will ask user to visually confirm in their real browser at the human-verify checkpoint since live browser driving isn't available here.

- timestamp: 2026-08-10T00:00:20Z
  checked: `npx tsc --noEmit` and `npx eslint components/ui/dialog.tsx` after applying the fix (added `max-h-[85vh] overflow-y-auto` to DialogContent's className in components/ui/dialog.tsx)
  found: Both commands completed with zero errors/warnings and no output.
  implication: Fix compiles cleanly and doesn't violate lint rules. No self-verifiable automated check remains (no live-browser tool available); real visual confirmation must come from the user at the human-verify checkpoint.

- timestamp: 2026-08-10T00:10:00Z
  checked: Human-verify checkpoint — user tested live in their own browser
  found: User opened a card with a long checklist and used "Revalidar com IA" (which inserts a long AI-generated description), then confirmed with "sim" that the dialog now scrolls internally to reach the "Avançar" button, instead of freezing with inaccessible top/bottom content.
  implication: Fix confirmed working end-to-end in the real environment, closing the loop the earlier static-only evidence couldn't complete on its own.

## Eliminated

(nenhuma hipótese alternativa foi necessária — a primeira hipótese, formada por leitura estática antes desta sessão, foi confirmada diretamente pela leitura completa do componente e da primitiva compartilhada, sem contradição)

## Resolution

root_cause: "components/ui/dialog.tsx's shared DialogContent primitive has no max-height or overflow-y-auto — it renders 'fixed top-[50%] ... translate-y-[-50%]' with fully unconstrained height. app/pm/board/board-panel.tsx's CardDetailDialogBody stacks unbounded content (AI validation panel, description textarea, attachments list, full checklist) inside it with no internal scroll wrapper either. When combined content height exceeds the viewport, the dialog overflows above the top and below the bottom of the screen with literally no scrollbar anywhere to reach the cut-off parts — this reads to the user as the dialog 'freezing' when it is actually just non-scrollable overflow. Content got more likely to trigger this after the AI autocorreção feature (260808-ci5) started inserting up to ~5000 chars into the description textarea and added a new AI-validation panel section, but the defect exists in the base primitive independent of that feature."
fix: "Added `max-h-[85vh] overflow-y-auto` to the shared DialogContent primitive's className in components/ui/dialog.tsx, alongside the existing `max-w-[calc(100%-2rem)]`. This caps the dialog at 85% of viewport height and makes the whole dialog (header + body + footer, since DialogContent is a single `grid` container) scroll internally instead of overflowing past the top/bottom of the screen. Applied at the primitive level (not inside CardDetailDialogBody) because grep confirmed no DialogContent call site anywhere in the app passes a conflicting className, and the same unbounded-height defect also affects the package 'Ver peças' dialog — a primitive-level fix protects every current and future Dialog usage."
verification: "User confirmed live in their own browser (2026-08-10): opened a card with a long checklist and used 'Revalidar com IA' to produce a long description, and the dialog now scrolls internally to reach the 'Avançar' button — no more top/bottom cutoff. Response: 'sim' (confirmed fixed)."
files_changed:
  - components/ui/dialog.tsx
