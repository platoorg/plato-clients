import { describe, test, expect } from 'vitest';
import { expandManifest } from '../src/expand.js';
import type { Manifest } from '../src/manifest.js';

describe('expandManifest', () => {
  test('inlines superset fields before schema-own fields', () => {
    const manifest: Manifest = {
      namespace: 'test',
      public: false,
      supersets: [
        { name: 'base', fields: [{ name: 'title', type: 'string', required: true }] },
      ],
      schemas: [
        {
          name: 'post',
          type: 'collection',
          fields: [{ name: 'body', type: 'string' }],
          extends: ['base'],
        },
      ],
    };

    const result = expandManifest(manifest);
    expect(result.schemas[0].fields.map(f => f.name)).toEqual(['title', 'body']);
  });

  test('schema-own field overrides superset field of same name in place', () => {
    const manifest: Manifest = {
      namespace: 'test',
      public: false,
      supersets: [
        {
          name: 'base',
          fields: [
            { name: 'title', type: 'string', required: false },
            { name: 'slug', type: 'string' },
          ],
        },
      ],
      schemas: [
        {
          name: 'post',
          type: 'collection',
          fields: [{ name: 'title', type: 'string', required: true }],
          extends: ['base'],
        },
      ],
    };

    const result = expandManifest(manifest);
    const fields = result.schemas[0].fields;
    expect(fields.map(f => f.name)).toEqual(['title', 'slug']);
    expect(fields[0].required).toBe(true);
  });

  test('unknown superset name is skipped with a warning', () => {
    const warns: string[] = [];
    const originalWarn = console.warn;
    console.warn = (...args: unknown[]) => warns.push(String(args[0]));

    try {
      const manifest: Manifest = {
        namespace: 'test',
        public: false,
        schemas: [
          {
            name: 'post',
            type: 'collection',
            fields: [{ name: 'body', type: 'string' }],
            extends: ['nonexistent'],
          },
        ],
      };

      const result = expandManifest(manifest);
      expect(result.schemas[0].fields.map(f => f.name)).toEqual(['body']);
      expect(warns.some(w => w.includes('nonexistent'))).toBe(true);
    } finally {
      console.warn = originalWarn;
    }
  });

  test('built-in page superset works without user declaration', () => {
    const manifest: Manifest = {
      namespace: 'test',
      public: false,
      schemas: [
        {
          name: 'blog_post',
          type: 'collection',
          fields: [{ name: 'author', type: 'string' }],
          extends: ['page'],
        },
      ],
    };

    const result = expandManifest(manifest);
    const names = result.schemas[0].fields.map(f => f.name);
    expect(names).toContain('title');
    expect(names).toContain('body');
    expect(names).toContain('meta_description');
    expect(names).toContain('cover_image');
    expect(names).toContain('author');
    expect(names.indexOf('title')).toBeLessThan(names.indexOf('author'));
  });

  test('user-declared superset with same name as built-in replaces it', () => {
    const manifest: Manifest = {
      namespace: 'test',
      public: false,
      supersets: [
        { name: 'page', fields: [{ name: 'custom_title', type: 'string', required: true }] },
      ],
      schemas: [
        {
          name: 'blog_post',
          type: 'collection',
          fields: [],
          extends: ['page'],
        },
      ],
    };

    const result = expandManifest(manifest);
    const names = result.schemas[0].fields.map(f => f.name);
    expect(names).toEqual(['custom_title']);
    expect(names).not.toContain('body');
  });

  test('extends is cleared after expansion', () => {
    const manifest: Manifest = {
      namespace: 'test',
      public: false,
      supersets: [
        { name: 'base', fields: [{ name: 'title', type: 'string' }] },
      ],
      schemas: [
        {
          name: 'post',
          type: 'collection',
          fields: [],
          extends: ['base'],
        },
      ],
    };

    const result = expandManifest(manifest);
    expect(result.schemas[0].extends).toEqual([]);
  });

  test('schema without extends is left unchanged', () => {
    const manifest: Manifest = {
      namespace: 'test',
      public: false,
      schemas: [
        {
          name: 'post',
          type: 'collection',
          fields: [{ name: 'title', type: 'string' }],
        },
      ],
    };

    const result = expandManifest(manifest);
    expect(result.schemas[0].fields.map(f => f.name)).toEqual(['title']);
  });
});
