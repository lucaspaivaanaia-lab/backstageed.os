/**
 * Shared Drive-URL validator + type inference for content-card attachments
 * (KAN-05, D-07/D-08/D-09). Intentionally free of any Supabase/React import
 * or I/O so this module can be imported by its sibling `drive-url.test.ts`
 * via a relative path and exercised with Node's built-in test runner -- no
 * live DB, no Docker (mirrors lib/chat/stale-response-guard.ts's convention).
 *
 * This single module is imported by BOTH the Client Component
 * (app/pm/board/board-panel.tsx, instant paste feedback) and the Server
 * Action (app/pm/board/actions.ts's `addAttachment`, never-trust-client
 * re-validation, 03-RESEARCH.md Pitfall 5) so the two can never drift apart
 * -- there is exactly one copy of the accept/reject rule in this codebase.
 *
 * D-09 scopes this as a paste-mistake catcher, not a hard security boundary
 * (a stored URL can still point anywhere Drive itself would let it), but
 * T-03-19 requires the match to be anchored at the parsed origin rather than
 * a substring/regex over the raw string -- `new URL()` + an exact `hostname`
 * comparison is what rejects a lookalike domain such as
 * `not-drive.google.com.evil.example`.
 */

export type DriveLinkType = "image" | "video" | "pdf" | "other";

const ALLOWED_HOSTNAMES = new Set(["drive.google.com", "docs.google.com"]);

/**
 * True only when `url` parses as a well-formed absolute URL whose protocol
 * is exactly `https:` and whose lowercased hostname is exactly
 * `drive.google.com` or `docs.google.com`. Compares the PARSED hostname for
 * equality -- never a regex/substring test over the raw string, which is
 * what would let a lookalike domain slip through (T-03-19).
 */
export function isLikelyDriveLink(url: string): boolean {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return false;
  }
  if (parsed.protocol !== "https:") return false;
  return ALLOWED_HOSTNAMES.has(parsed.hostname.toLowerCase());
}

/**
 * Infers an attachment's display type from the URL shape. Google-app paths
 * (Docs/Sheets/Slides/Forms) always report "other" -- they are documents,
 * not media files. Drive share links (`/file/d/<FILE_ID>/view`) carry an
 * opaque file id with no extension, so most real Drive links will fall
 * through to "other" too -- this is why the attach form lets the PM
 * override the inferred type rather than trusting inference alone
 * (03-RESEARCH.md's explicit recommendation).
 */
export function driveLinkType(url: string): DriveLinkType {
  if (/\/(document|spreadsheets|presentation|forms)\//.test(url)) {
    return "other";
  }
  if (/\.(png|jpe?g|gif|webp)(\?|$)/i.test(url)) return "image";
  if (/\.(mp4|mov|avi|webm)(\?|$)/i.test(url)) return "video";
  if (/\.pdf(\?|$)/i.test(url)) return "pdf";
  return "other";
}

/** Verbatim UI-SPEC copy (Copywriting Contract) -- never paraphrased. */
export const INVALID_DRIVE_LINK_MESSAGE =
  "Esse link não parece ser do Google Drive. Cole um link que comece com drive.google.com ou docs.google.com.";
