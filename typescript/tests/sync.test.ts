import crypto from 'node:crypto';
import { vi, describe, test, afterEach, expect } from 'vitest';
import { syncManifest, exportManifest } from '../src/sync.js';
import type { SyncManifest, SyncResult } from '../src/sync.js';

// ── Helpers ───────────────────────────────────────────────────────────────────

const MANIFEST: SyncManifest = {
  schemas: [
    {
      name: 'Article',
      slug: 'article',
      fields: [
        { name: 'title', type: 'string', required: true },
        { name: 'body',  type: 'string' },
      ],
    },
  ],
  prune: false,
};

const OK_RESULT: SyncResult = {
  valid: true,
  errors: [],
  changes: [{ type: 'schema', action: 'create', schema: 'article' }],
  unchanged: [],
};

function mockFetch(body: unknown, status = 200): ReturnType<typeof vi.fn> {
  const fn = vi.fn().mockResolvedValue({
    ok: status >= 200 && status < 300,
    status,
    json: () => Promise.resolve(body),
    text: () => Promise.resolve(JSON.stringify(body)),
  });
  global.fetch = fn as unknown as typeof fetch;
  return fn;
}

afterEach(() => {
  vi.restoreAllMocks();
});

// ── Key resolution ────────────────────────────────────────────────────────────

describe('key resolution', () => {
  test('sends no Authorization header when neither apiKey nor secret is provided', async () => {
    const fetch = mockFetch(OK_RESULT);
    await syncManifest({ url: 'http://plato.test', namespace: 'ns', manifest: MANIFEST });
    const [, init] = fetch.mock.calls[0] as [string, RequestInit & { headers: Record<string, string> }];
    expect(init.headers).not.toHaveProperty('Authorization');
  });

  test('uses apiKey directly in Authorization header', async () => {
    const fetch = mockFetch(OK_RESULT);
    await syncManifest({
      url: 'http://plato.test',
      namespace: 'ns',
      apiKey: 'explicit-key',
      manifest: MANIFEST,
    });
    expect(fetch).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({
        headers: expect.objectContaining({ Authorization: 'Bearer explicit-key' }),
      })
    );
  });

  test('derives key from secret via HMAC-SHA256(namespace, secret)', async () => {
    const fetch = mockFetch(OK_RESULT);
    const namespace = 'my-app';
    const secret    = 'shared-secret';
    const expected  = crypto.createHmac('sha256', secret).update(namespace).digest('hex');

    await syncManifest({ url: 'http://plato.test', namespace, secret, manifest: MANIFEST });

    expect(fetch).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({
        headers: expect.objectContaining({ Authorization: `Bearer ${expected}` }),
      })
    );
  });

  test('apiKey takes precedence over secret', async () => {
    const fetch = mockFetch(OK_RESULT);
    await syncManifest({
      url: 'http://plato.test',
      namespace: 'ns',
      apiKey: 'explicit-key',
      secret: 'some-secret',
      manifest: MANIFEST,
    });
    expect(fetch).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({
        headers: expect.objectContaining({ Authorization: 'Bearer explicit-key' }),
      })
    );
  });
});

// ── syncManifest ──────────────────────────────────────────────────────────────

describe('syncManifest', () => {
  test('POSTs to /api/namespaces/:ns/sync', async () => {
    const fetch = mockFetch(OK_RESULT);
    await syncManifest({ url: 'http://plato.test', namespace: 'my-blog', apiKey: 'k', manifest: MANIFEST });

    expect(fetch).toHaveBeenCalledWith(
      'http://plato.test/api/namespaces/my-blog/sync',
      expect.objectContaining({ method: 'POST' })
    );
  });

  test('appends ?preview=true when preview is set', async () => {
    const fetch = mockFetch(OK_RESULT);
    await syncManifest({ url: 'http://plato.test', namespace: 'ns', apiKey: 'k', manifest: MANIFEST, preview: true });

    expect(fetch).toHaveBeenCalledWith(
      'http://plato.test/api/namespaces/ns/sync?preview=true',
      expect.anything()
    );
  });

  test('no ?preview param when preview is false/absent', async () => {
    const fetch = mockFetch(OK_RESULT);
    await syncManifest({ url: 'http://plato.test', namespace: 'ns', apiKey: 'k', manifest: MANIFEST });

    const [url] = fetch.mock.calls[0] as [string];
    expect(url).not.toContain('preview');
  });

  test('sends manifest as JSON body with Content-Type header', async () => {
    const fetch = mockFetch(OK_RESULT);
    await syncManifest({ url: 'http://plato.test', namespace: 'ns', apiKey: 'k', manifest: MANIFEST });

    const [, init] = fetch.mock.calls[0] as [string, RequestInit];
    expect((init.headers as Record<string, string>)['Content-Type']).toBe('application/json');
    expect(JSON.parse(init.body as string)).toEqual(MANIFEST);
  });

  test('returns the parsed SyncResult', async () => {
    mockFetch(OK_RESULT);
    const result = await syncManifest({ url: 'http://plato.test', namespace: 'ns', apiKey: 'k', manifest: MANIFEST });
    expect(result).toEqual(OK_RESULT);
  });

  test('strips trailing slash from base URL', async () => {
    const fetch = mockFetch(OK_RESULT);
    await syncManifest({ url: 'http://plato.test/', namespace: 'ns', apiKey: 'k', manifest: MANIFEST });

    const [url] = fetch.mock.calls[0] as [string];
    expect(url).toBe('http://plato.test/api/namespaces/ns/sync');
  });

  test('throws with status on non-2xx response', async () => {
    mockFetch({ message: 'Forbidden' }, 403);
    await expect(
      syncManifest({ url: 'http://plato.test', namespace: 'ns', apiKey: 'k', manifest: MANIFEST })
    ).rejects.toThrow('403');
  });
});

// ── exportManifest ────────────────────────────────────────────────────────────

describe('exportManifest', () => {
  test('GETs /api/namespaces/:ns/sync', async () => {
    const fetch = mockFetch(MANIFEST);
    await exportManifest({ url: 'http://plato.test', namespace: 'my-blog', apiKey: 'k' });

    expect(fetch).toHaveBeenCalledWith(
      'http://plato.test/api/namespaces/my-blog/sync',
      expect.objectContaining({ headers: expect.objectContaining({ Authorization: 'Bearer k' }) })
    );
    // no method override → defaults to GET
    const [, init] = fetch.mock.calls[0] as [string, RequestInit];
    expect(init.method).toBeUndefined();
  });

  test('returns the parsed manifest', async () => {
    mockFetch(MANIFEST);
    const result = await exportManifest({ url: 'http://plato.test', namespace: 'ns', apiKey: 'k' });
    expect(result).toEqual(MANIFEST);
  });

  test('throws on non-2xx response', async () => {
    mockFetch('Unauthorized', 401);
    await expect(
      exportManifest({ url: 'http://plato.test', namespace: 'ns', apiKey: 'k' })
    ).rejects.toThrow('401');
  });

  test('derives key from secret', async () => {
    const fetch = mockFetch(MANIFEST);
    const expected = crypto.createHmac('sha256', 'sec').update('ns').digest('hex');
    await exportManifest({ url: 'http://plato.test', namespace: 'ns', secret: 'sec' });
    expect(fetch).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({
        headers: expect.objectContaining({ Authorization: `Bearer ${expected}` }),
      })
    );
  });
});
