---
status: complete
---

# Quick Task 260812-jpi — Summary

Adicionado um indicador visual persistente de "não salvo" na tela de detalhe do cliente (`components/clients/client-detail-form.tsx`), derivado inteiramente de `form.formState.isDirty` já existente — sem novo estado, sem mudança de comportamento de persistência.

## O que mudou

- `StatusBadge tone="warning"` ("Alterações não salvas") no header do `DataCard` de briefing, visível quando `form.formState.isDirty && !isBriefingPending`.
- Borda/ring destacados (`border-warning ring-1 ring-warning/40`) no `Textarea` do briefing sob a mesma condição.
- Cobre os três gatilhos: edição manual, autofill via botão de upload, e autofill via redirect `?autofillBriefing=1` (o caso real que causou o bug relatado ao vivo — proposta da IA parecia salva mas nunca foi persistida).

## Causa raiz do bug original

`handleBriefingAutofilled` sempre chamou `form.setValue("briefing", ..., { shouldDirty: true })` — o `isDirty` já ficava `true` imediatamente após qualquer autofill. O problema nunca foi falta de dado, era falta de sinal visual: o único indicador existente era o texto do botão ("Salvar briefing" vs "Salvo"), fácil de não notar num Textarea de `min-h-[400px]`.

## Verificação

- `tsc --noEmit`, `eslint`, `npm run build` limpos.
- Checkpoint ao vivo aprovado pelo desenvolvedor, cobrindo os 3 gatilhos + reversão pós-save + confirmação de que o gate `briefingEmpty` de `app/pm/clients/page.tsx` não mudou.

## Commits

- `cbd46f9` — plan(260812-jpi)
- `a472073` — feat(260812-jpi): indicador visual de briefing não salvo
