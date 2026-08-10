# GSD Debug Knowledge Base

Resolved debug sessions. Used by `gsd-debugger` to surface known-pattern hypotheses at the start of new investigations.

---

## card-dialog-trava-nao-rola — Card detail dialog "freezes" with unreachable top/bottom content
- **Date:** 2026-08-10
- **Error patterns:** dialog, trava, não rola, freeze, overflow, scroll, DialogContent, card detail, checklist longo, viewport, Revalidar com IA
- **Root cause:** components/ui/dialog.tsx's shared DialogContent primitive had no max-height or overflow-y-auto, so a Dialog with content taller than the viewport (long checklist, attachments, AI-revalidated description) overflowed above the top and below the bottom of the screen with no scrollbar to reach the cut-off parts.
- **Fix:** Added `max-h-[85vh] overflow-y-auto` to the shared DialogContent primitive's className in components/ui/dialog.tsx.
- **Files changed:** components/ui/dialog.tsx
---
