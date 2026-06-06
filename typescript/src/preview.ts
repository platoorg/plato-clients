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
 * Security stance:
 *
 *   - HMAC verified locally; expiry enforced against the system clock.
 *   - URL token TTL is short (~5 min on the Plato side); when valid,
 *     the middleware persists the resolved SHA in an httpOnly cookie
 *     so navigation works without re-passing the param.
 *   - The cookie name carries the namespace slug so two simultaneous
 *     preview sessions for different namespaces don't collide.
 *   - The middleware is purely opt-in — a frontend that never imports
 *     this module continues to read live HEAD.
 */

import { createHmac, timingSafeEqual } from 'node:crypto';

/** Claims encoded in the token payload. */
export interface PreviewClaims {
  /** Source namespace slug being previewed (e.g. "site@alice"). */
  ns: string;
  /** Snapshot SHA the frontend should read at. */
  sha: string;
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
 * success or a discriminated-union failure tag on rejection. Pure
 * function — safe to call from any runtime (Node, edge, browser with
 * the WebCrypto polyfill replacing node:crypto).
 */
export function verifyPreviewToken(token: string, secret: string): VerifyResult {
  if (!token || !token.includes('.')) return { ok: false, reason: 'malformed' };
  const [payloadB64, sigB64] = token.split('.', 2);
  if (!payloadB64 || !sigB64) return { ok: false, reason: 'malformed' };

  const expected = createHmac('sha256', secret).update(payloadB64).digest();
  const got = b64urlToBuffer(sigB64);
  if (got.length !== expected.length) return { ok: false, reason: 'bad_signature' };
  if (!timingSafeEqual(got, expected)) return { ok: false, reason: 'bad_signature' };

  let claims: PreviewClaims;
  try {
    claims = JSON.parse(b64urlToBuffer(payloadB64).toString('utf-8')) as PreviewClaims;
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

function b64urlToBuffer(s: string): Buffer {
  // node:Buffer accepts base64url since Node 16.
  return Buffer.from(s, 'base64url');
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
      sha: string;
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
 * request already established a session). The function returns
 * `mode: 'preview'` only when at least one of them validates.
 *
 * Wiring example (Next.js middleware):
 *
 *   import { resolvePreview, previewCookieName, PREVIEW_QUERY_PARAM }
 *     from '@platoorg/ts-client/preview';
 *
 *   export function middleware(req: NextRequest) {
 *     const ns = process.env.PLATO_NS!;
 *     const urlToken = req.nextUrl.searchParams.get(PREVIEW_QUERY_PARAM);
 *     const cookieName = previewCookieName(ns);
 *     const cookieToken = req.cookies.get(cookieName)?.value;
 *
 *     const r = resolvePreview({
 *       urlToken,
 *       cookieToken,
 *       secret: process.env.PLATO_PREVIEW_SECRET!,
 *     });
 *
 *     const res = NextResponse.next();
 *     if (r.mode === 'preview') {
 *       res.headers.set('x-plato-preview-sha', r.sha);
 *       if (r.tokenToPersist) {
 *         res.cookies.set(cookieName, r.tokenToPersist, {
 *           httpOnly: true,
 *           sameSite: 'lax',
 *           secure: true,
 *           maxAge: r.exp - Math.floor(Date.now() / 1000),
 *         });
 *       }
 *     }
 *     return res;
 *   }
 */
export function resolvePreview(input: ResolvePreviewInput): ResolvePreviewResult {
  const { urlToken, cookieToken, secret } = input;
  if (!secret) return { mode: 'live', reason: 'no secret configured' };

  // URL token wins — it's the freshest signal and indicates the editor
  // just arrived from Plato.
  if (urlToken) {
    const v = verifyPreviewToken(urlToken, secret);
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
    const v = verifyPreviewToken(cookieToken, secret);
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
