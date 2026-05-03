import { describe, test, expect } from 'vitest';
import { generateRuntime } from '../src/generators/typescript.js';
import type { Manifest } from '../src/manifest.js';
import { writeFileSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

// Generate the runtime, write it to disk, and dynamically import mediaSrcset.
// This exercises the same code path real consumers hit (the emitted .js file),
// rather than re-implementing the helper in the test.
async function loadMediaSrcset(): Promise<(value: unknown, sizes?: string) => unknown> {
  const manifest: Manifest = {
    namespace: 'test',
    public: false,
    schemas: [
      {
        name: 'Page',
        type: 'collection',
        fields: [{ name: 'hero', type: 'media' }],
      },
    ],
  };
  const dir = mkdtempSync(join(tmpdir(), 'plato-media-test-'));
  const path = join(dir, 'runtime.js');
  writeFileSync(path, generateRuntime(manifest));
  const mod = await import(path);
  return mod.mediaSrcset;
}

describe('mediaSrcset', () => {
  test('new shape with intrinsic dimensions builds full srcset', async () => {
    const mediaSrcset = await loadMediaSrcset();
    const result = mediaSrcset(
      {
        url: '/media/orig.jpg',
        width: 4032,
        height: 3024,
        variants: {
          thumb:  { url: '/media/orig__thumb.jpg',  width: 200 },
          medium: { url: '/media/orig__medium.jpg', width: 800 },
          large:  { url: '/media/orig__large.jpg',  width: 1600 },
        },
      },
      '100vw',
    );
    expect(result).toEqual({
      src: '/media/orig.jpg',
      srcset:
        '/media/orig__thumb.jpg 200w, /media/orig__medium.jpg 800w, ' +
        '/media/orig__large.jpg 1600w, /media/orig.jpg 4032w',
      sizes: '100vw',
      width: 4032,
      height: 3024,
    });
  });

  test('legacy map-of-string variants are dropped (widths unknown)', async () => {
    const mediaSrcset = await loadMediaSrcset();
    const result = mediaSrcset({
      url: '/media/orig.jpg',
      variants: {
        thumb:  '/media/orig__thumb.jpg',
        medium: '/media/orig__medium.jpg',
      },
    });
    // No usable variant entries → just the original URL, no srcset.
    expect(result).toEqual({ src: '/media/orig.jpg' });
  });

  test('plain string value returns just src', async () => {
    const mediaSrcset = await loadMediaSrcset();
    expect(mediaSrcset('/media/orig.jpg')).toEqual({ src: '/media/orig.jpg' });
  });

  test('null and undefined return null', async () => {
    const mediaSrcset = await loadMediaSrcset();
    expect(mediaSrcset(null)).toBeNull();
    expect(mediaSrcset(undefined)).toBeNull();
  });

  test('empty string returns null', async () => {
    const mediaSrcset = await loadMediaSrcset();
    expect(mediaSrcset('')).toBeNull();
  });

  test('intrinsic width below max variant is bumped above', async () => {
    const mediaSrcset = await loadMediaSrcset();
    const result = mediaSrcset({
      url: '/media/orig.jpg',
      width: 150, // smaller than thumb's 200
      variants: {
        thumb: { url: '/media/orig__thumb.jpg', width: 200 },
      },
    });
    expect(result).toMatchObject({
      src: '/media/orig.jpg',
      srcset: '/media/orig__thumb.jpg 200w, /media/orig.jpg 201w',
      width: 150,
    });
  });

  test('missing original returns variant-only src (largest)', async () => {
    const mediaSrcset = await loadMediaSrcset();
    const result = mediaSrcset({
      url: '',
      variants: {
        thumb:  { url: '/media/orig__thumb.jpg',  width: 200 },
        medium: { url: '/media/orig__medium.jpg', width: 800 },
      },
    } as unknown as Parameters<typeof mediaSrcset>[0]);
    expect(result).toMatchObject({
      src: '/media/orig__medium.jpg',
      srcset: '/media/orig__thumb.jpg 200w, /media/orig__medium.jpg 800w',
    });
  });

  test('value with url but no variants returns just src + intrinsic dims', async () => {
    const mediaSrcset = await loadMediaSrcset();
    const result = mediaSrcset({
      url: '/media/orig.jpg',
      width: 1024,
      height: 768,
    });
    expect(result).toEqual({ src: '/media/orig.jpg', width: 1024, height: 768 });
  });

  test('partial variant (one entry) still produces srcset with original', async () => {
    const mediaSrcset = await loadMediaSrcset();
    const result = mediaSrcset({
      url: '/media/orig.jpg',
      variants: {
        thumb: { url: '/media/orig__thumb.jpg', width: 200 },
      },
    });
    expect(result).toMatchObject({
      src: '/media/orig.jpg',
      srcset: '/media/orig__thumb.jpg 200w, /media/orig.jpg 201w',
    });
  });
});
