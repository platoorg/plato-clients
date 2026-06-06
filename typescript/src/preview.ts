/**
 * Preview-mode middleware for Plato-backed frontends.
 *
 * When an editor clicks "Preview" in Plato, Plato mints a short-lived
 * HMAC-signed token and opens this frontend with
 * `?_plato_preview=<token>`. This module verifies the token locally
 * (no callback to Plato — fast and DoS-safe), then exposes the
 * resolved snapshot SHA so the frontend's Plato API calls can read at
 * that snapshot for the duration of the session.
 *
 * Wire format (must match Plato's preview_token.go):
 *
 *   token   = base64url(payload) + "." + base64url(sig)
 *   payload = JSON.stringify({ ns, sha, uid, iat, exp })
 *   sig     = HMAC-SHA256(PLATO_PREVIEW_SECRET, payload_b64url)
 *
 * Crypto: uses Web Crypto (`globalThis.crypto.subtle`) so the same
 * code works in Node, the Next.js Edge runtime, and any modern
 * browser. As a consequence verify+resolve are async — callers in
 * Next middleware / Server Components await them.
 */

/** Claims encoded in the token payload. */
export interface PreviewClaims {
  /** Source namespace slug being previewed (e.g. "site@alice"). */
  ns: string;
  /**
   * Snapshot SHA the frontend should pin to. **Optional**: when
   * omitted, the preview follows the namespace's live HEAD — editor
   * edits in Plato become visible on the frontend's next page load.
   * Present only when the mint caller asked for a pinned historical
   * preview.
   */
  sha?: string;
  /** Editor's user id at the time of mint — audit only; not enforced. */
  uid?: string;
  /** Issued-at, unix seconds. */
  iat: number;
  /** Expiry, unix seconds. */
  exp: number;
}

/** Result of `verifyPreviewToken`. */
export type VerifyResult =
  | { ok: true; claims: PreviewClaims }
  | { ok: false; reason: 'malformed' | 'bad_signature' | 'expired' };

/**
 * Verify a preview token's HMAC and expiry. Returns the claims on
 * success or a discriminated-union failure tag on rejection.
 *
 * Async because Web Crypto's SubtleCrypto APIs are async. Negligible
 * overhead — the HMAC is computed once per request entry point and
 * the resolved SHA is cached in the preview cookie.
 */
export async function verifyPreviewToken(
  token: string,
  secret: string,
): Promise<VerifyResult> {
  if (!token || !token.includes('.')) return { ok: false, reason: 'malformed' };
  const [payloadB64, sigB64] = token.split('.', 2);
  if (!payloadB64 || !sigB64) return { ok: false, reason: 'malformed' };

  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey(
    'raw',
    enc.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const expected = new Uint8Array(
    await crypto.subtle.sign('HMAC', key, enc.encode(payloadB64)),
  );

  let got: Uint8Array;
  try {
    got = b64urlToBytes(sigB64);
  } catch {
    return { ok: false, reason: 'malformed' };
  }

  if (!constantTimeEqual(got, expected)) {
    return { ok: false, reason: 'bad_signature' };
  }

  let claims: PreviewClaims;
  try {
    const payloadBytes = b64urlToBytes(payloadB64);
    claims = JSON.parse(new TextDecoder().decode(payloadBytes)) as PreviewClaims;
  } catch {
    return { ok: false, reason: 'malformed' };
  }
  if (typeof claims.exp !== 'number' || claims.exp <= 0) {
    return { ok: false, reason: 'malformed' };
  }
  if (Math.floor(Date.now() / 1000) > claims.exp) {
    return { ok: false, reason: 'expired' };
  }
  return { ok: true, claims };
}

/**
 * Constant-time byte-array equality. Length-leak is fine (an attacker
 * already knows the SHA-256 output length); content comparison is
 * branch-free over the longer length.
 */
function constantTimeEqual(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a[i] ^ b[i];
  return diff === 0;
}

/**
 * Decode base64url to bytes. Pads to a multiple of 4 + maps the
 * URL-safe alphabet back to standard base64, then uses Buffer (Node)
 * or atob (Edge / browser) — whichever is available.
 */
function b64urlToBytes(s: string): Uint8Array {
  const b64 = s.replace(/-/g, '+').replace(/_/g, '/');
  const padded = b64 + '='.repeat((4 - (b64.length % 4)) % 4);
  // Prefer Buffer when available (Node) — faster than the polyfill loop.
  const g = globalThis as unknown as { Buffer?: { from(input: string, enc: string): Uint8Array } };
  if (g.Buffer && typeof g.Buffer.from === 'function') {
    return new Uint8Array(g.Buffer.from(padded, 'base64'));
  }
  const binary = atob(padded);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

/**
 * Default name of the URL query param Plato sets when opening the
 * frontend in preview mode. Matches preview_token.go's
 * `_plato_preview` constant.
 */
export const PREVIEW_QUERY_PARAM = '_plato_preview';

/**
 * Default cookie name template. Per-namespace so two simultaneous
 * preview sessions across different sites don't collide.
 */
export function previewCookieName(ns: string): string {
  return `__plato_preview__${slugifyForCookie(ns)}`;
}

function slugifyForCookie(s: string): string {
  return s.replace(/[^a-zA-Z0-9_@-]/g, '_');
}

/**
 * Options for `resolvePreview`. The caller decides cookie semantics
 * (Next.js middleware, an Express handler, etc.) and just hands us the
 * pre-extracted token + secret.
 */
export interface ResolvePreviewInput {
  /** Token from the URL query param, if any. Highest precedence. */
  urlToken?: string | null | undefined;
  /**
   * Stored cookie value, if any. Fallback for navigation within an
   * already-active preview session.
   */
  cookieToken?: string | null | undefined;
  /** Shared secret — same string Plato has in PLATO_PREVIEW_SECRET. */
  secret: string;
}

/**
 * Result of `resolvePreview`. The `mode` field is the easy switch
 * the frontend's data layer wires off.
 */
export type ResolvePreviewResult =
  | {
      mode: 'preview';
      /**
       * Pinned snapshot SHA. Undefined when the token follows HEAD —
       * the frontend should read live content for `ns` in that case.
       */
      sha?: string;
      ns: string;
      /** Token to persist as a session cookie (URL token, if it just arrived). */
      tokenToPersist?: string;
      /** When the session expires (unix seconds). */
      exp: number;
    }
  | { mode: 'live'; reason?: string };

/**
 * Resolve the request's preview state. Pass the URL token (if the
 * request just arrived from Plato) and the cookie token (if a prior
 * request already established a session).
 *
 * Wiring example (Next.js middleware — runs in the Edge runtime):
 *
 *   import { resolvePreview, previewCookieName, PREVIEW_QUERY_PARAM }
 *     from '@platoorg/ts-client/preview';
 *
 *   export async function middleware(req: NextRequest) {
 *     const ns = process.env.PLATO_NS!;
 *     const urlToken = req.nextUrl.searchParams.get(PREVIEW_QUERY_PARAM);
 *     const cookieName = previewCookieName(ns);
 *     const cookieToken = req.cookies.get(cookieName)?.value;
 *
 *     const r = await resolvePreview({
 *       urlToken,
 *       cookieToken,
 *       secret: process.env.PLATO_PREVIEW_SECRET!,
 *     });
 *
 *     const res = NextResponse.next();
 *     if (r.mode === 'preview' && r.tokenToPersist) {
 *       res.cookies.set(cookieName, r.tokenToPersist, {
 *         httpOnly: true,
 *         sameSite: 'lax',
 *         secure: true,
 *         maxAge: r.exp - Math.floor(Date.now() / 1000),
 *       });
 *     }
 *     return res;
 *   }
 */
export async function resolvePreview(
  input: ResolvePreviewInput,
): Promise<ResolvePreviewResult> {
  const { urlToken, cookieToken, secret } = input;
  if (!secret) return { mode: 'live', reason: 'no secret configured' };

  // URL token wins — it's the freshest signal and indicates the editor
  // just arrived from Plato.
  if (urlToken) {
    const v = await verifyPreviewToken(urlToken, secret);
    if (v.ok) {
      return {
        mode: 'preview',
        sha: v.claims.sha,
        ns: v.claims.ns,
        tokenToPersist: urlToken,
        exp: v.claims.exp,
      };
    }
    // Fall through to cookie — a stale URL token shouldn't kick the
    // user out if they have a valid session.
  }

  if (cookieToken) {
    const v = await verifyPreviewToken(cookieToken, secret);
    if (v.ok) {
      return {
        mode: 'preview',
        sha: v.claims.sha,
        ns: v.claims.ns,
        exp: v.claims.exp,
      };
    }
  }

  return { mode: 'live' };
}

/**
 * Append `?content_snapshot_sha=<sha>` to a Plato URL so the request
 * reads at the preview snapshot. Idempotent: replaces any existing
 * value. Use inside your `fetch` wrapper or per-call.
 */
export function withSnapshotSha(url: string, sha: string): string {
  const u = new URL(url);
  u.searchParams.set('content_snapshot_sha', sha);
  return u.toString();
}
