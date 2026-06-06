import { describe, it, expect } from 'vitest';
import { createHmac } from 'node:crypto';
import {
  verifyPreviewToken,
  resolvePreview,
  withSnapshotSha,
  previewCookieName,
  PREVIEW_QUERY_PARAM,
  type PreviewClaims,
} from '../src/preview';

const SECRET = 'test-secret-do-not-use';

/** Mint helper that mirrors Plato's preview_token.go wire format. */
function mintToken(claims: PreviewClaims, secret = SECRET): string {
  const payload = Buffer.from(JSON.stringify(claims), 'utf-8').toString('base64url');
  const sig = createHmac('sha256', secret).update(payload).digest('base64url');
  return `${payload}.${sig}`;
}

function nowSecs(): number {
  return Math.floor(Date.now() / 1000);
}

describe('verifyPreviewToken', () => {
  it('round-trips a freshly minted token', () => {
    const token = mintToken({ ns: 'site@alice', sha: 'abc12345', iat: nowSecs(), exp: nowSecs() + 300 });
    const r = verifyPreviewToken(token, SECRET);
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.claims.ns).toBe('site@alice');
      expect(r.claims.sha).toBe('abc12345');
    }
  });

  it('rejects a wrong-secret signature', () => {
    const token = mintToken({ ns: 'x', sha: 'y', iat: nowSecs(), exp: nowSecs() + 60 });
    const r = verifyPreviewToken(token, 'other-secret');
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe('bad_signature');
  });

  it('rejects an expired token', () => {
    const token = mintToken({ ns: 'x', sha: 'y', iat: nowSecs() - 600, exp: nowSecs() - 1 });
    const r = verifyPreviewToken(token, SECRET);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe('expired');
  });

  it('rejects malformed tokens', () => {
    expect(verifyPreviewToken('', SECRET).ok).toBe(false);
    expect(verifyPreviewToken('no-dot', SECRET).ok).toBe(false);
    expect(verifyPreviewToken('a.', SECRET).ok).toBe(false);
    expect(verifyPreviewToken('.b', SECRET).ok).toBe(false);
  });

  it('rejects tampered payload', () => {
    const token = mintToken({ ns: 'x', sha: 'y', iat: nowSecs(), exp: nowSecs() + 60 });
    // Flip a character in the payload (before the dot).
    const idx = token.indexOf('.');
    const tampered = (token[0] === 'a' ? 'b' : 'a') + token.slice(1, idx) + token.slice(idx);
    const r = verifyPreviewToken(tampered, SECRET);
    expect(r.ok).toBe(false);
  });
});

describe('resolvePreview', () => {
  it('prefers a valid URL token', () => {
    const token = mintToken({ ns: 'site', sha: 'sha1', iat: nowSecs(), exp: nowSecs() + 300 });
    const r = resolvePreview({ urlToken: token, secret: SECRET });
    expect(r.mode).toBe('preview');
    if (r.mode === 'preview') {
      expect(r.sha).toBe('sha1');
      expect(r.tokenToPersist).toBe(token);
    }
  });

  it('falls back to cookie when URL token is invalid', () => {
    const validCookie = mintToken({ ns: 'site', sha: 'sha-cookie', iat: nowSecs(), exp: nowSecs() + 300 });
    const r = resolvePreview({ urlToken: 'garbage.token', cookieToken: validCookie, secret: SECRET });
    expect(r.mode).toBe('preview');
    if (r.mode === 'preview') {
      expect(r.sha).toBe('sha-cookie');
      // No tokenToPersist when the URL token didn't validate.
      expect(r.tokenToPersist).toBeUndefined();
    }
  });

  it('falls back to live when both tokens are missing', () => {
    const r = resolvePreview({ secret: SECRET });
    expect(r.mode).toBe('live');
  });

  it('falls back to live when secret is empty', () => {
    const token = mintToken({ ns: 'x', sha: 'y', iat: nowSecs(), exp: nowSecs() + 60 });
    const r = resolvePreview({ urlToken: token, secret: '' });
    expect(r.mode).toBe('live');
  });

  it('falls back to live when both tokens are expired', () => {
    const expired = mintToken({ ns: 'x', sha: 'y', iat: nowSecs() - 10, exp: nowSecs() - 1 });
    const r = resolvePreview({ urlToken: expired, cookieToken: expired, secret: SECRET });
    expect(r.mode).toBe('live');
  });
});

describe('withSnapshotSha', () => {
  it('appends the snapshot param', () => {
    const u = withSnapshotSha('https://plato.example.com/api/namespaces/site/content/post', 'sha123');
    expect(u).toContain('content_snapshot_sha=sha123');
  });

  it('replaces an existing snapshot param (no duplication)', () => {
    const u = withSnapshotSha(
      'https://plato.example.com/api/x?content_snapshot_sha=old',
      'new',
    );
    expect(u).toContain('content_snapshot_sha=new');
    expect(u).not.toContain('content_snapshot_sha=old');
  });

  it('preserves other query params', () => {
    const u = withSnapshotSha('https://plato.example.com/api/x?locale=de', 'sha');
    expect(u).toContain('locale=de');
    expect(u).toContain('content_snapshot_sha=sha');
  });
});

describe('previewCookieName', () => {
  it('namespaces the cookie by slug', () => {
    expect(previewCookieName('site')).toBe('__plato_preview__site');
    expect(previewCookieName('site@alice')).toBe('__plato_preview__site@alice');
  });

  it('sanitises hostile characters', () => {
    expect(previewCookieName('site evil cookie')).toBe('__plato_preview__site_evil_cookie');
  });
});

describe('PREVIEW_QUERY_PARAM', () => {
  it('matches the Plato server constant', () => {
    expect(PREVIEW_QUERY_PARAM).toBe('_plato_preview');
  });
});
