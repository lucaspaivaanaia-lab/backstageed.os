"use client";

/**
 * P2 pivot 2026-08-04: lets /pm/chat and /pm/board remember the
 * last-selected client so a PM doesn't have to reselect it every time they
 * switch pages. Pure client-side convenience via localStorage — NOT
 * server data, no RLS/auth concerns (worst case a stale/foreign id is
 * simply not found in the caller's own `clients` roster and is ignored,
 * see each page's own validation before using this value). Deliberately
 * does not touch routing structure — /pm/board keeps its `?client=`
 * query param as the source of truth when present, /pm/chat keeps its own
 * local component state; this module is only the handoff between them.
 */

const STORAGE_KEY = "backstageed:last-selected-client";

export function getLastSelectedClientId(): string | null {
  if (typeof window === "undefined") return null;
  try {
    return window.localStorage.getItem(STORAGE_KEY);
  } catch {
    return null;
  }
}

export function setLastSelectedClientId(clientId: string): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(STORAGE_KEY, clientId);
  } catch {
    // localStorage can throw in private-browsing/quota-exceeded contexts —
    // this is a pure UX convenience, never worth surfacing an error for.
  }
}

/**
 * useSyncExternalStore trio for reading the last-selected client without a
 * setState-in-effect (this project's `react-hooks/set-state-in-effect`
 * lint rule blocks that pattern outright). `getServerSnapshot` returns
 * null — matching what SSR renders, since localStorage doesn't exist there
 * — and React reconciles to the real client-side value right after
 * hydration, with no visible flash and no extra render-triggering effect.
 * `subscribeLastSelectedClientId` is a no-op subscription: this app never
 * needs to react to ANOTHER tab changing the value, only to read it once
 * per mount, so the callback is simply never invoked.
 */
export function subscribeLastSelectedClientId(): () => void {
  return () => {};
}

export function getLastSelectedClientIdServerSnapshot(): string | null {
  return null;
}
