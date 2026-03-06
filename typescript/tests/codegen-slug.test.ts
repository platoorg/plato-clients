import { describe, test, expect } from 'vitest';
import { generateTypeScript } from '../src/generators/typescript.js';
import type { Manifest } from '../src/manifest.js';

function makeManifest(overrides: Partial<Parameters<typeof generateTypeScript>[0]['schemas'][number]>): Manifest {
  return {
    namespace: 'test',
    public: false,
    schemas: [
      {
        name: 'Website Headline',
        type: 'collection',
        fields: [{ name: 'title', type: 'string', required: true }],
        ...overrides,
      },
    ],
  };
}

describe('slug handling in codegen', () => {
  test('explicit slug with hyphen is used verbatim in API paths', () => {
    const out = generateTypeScript(makeManifest({ name: 'Website Headline', slug: 'website-headline' }));
    expect(out).toContain("'website-headline'");
    expect(out).toContain('`website-headline/${');
  });

  test('explicit slug takes precedence over name-derived slug', () => {
    const out = generateTypeScript(makeManifest({ name: 'Foo', slug: 'website-headline' }));
    expect(out).toContain("'website-headline'");
    expect(out).not.toContain("'foo'");
  });

  test('name with hyphen derives correct slug when no explicit slug', () => {
    const out = generateTypeScript(makeManifest({ name: 'website-headline' }));
    expect(out).toContain("'website-headline'");
  });

  test('name with spaces derives kebab-case slug when no explicit slug', () => {
    const out = generateTypeScript(makeManifest({ name: 'Website Headline' }));
    expect(out).toContain("'website-headline'");
  });

  test('name with underscores derives kebab-case slug when no explicit slug', () => {
    const out = generateTypeScript(makeManifest({ name: 'website_headline' }));
    expect(out).toContain("'website-headline'");
  });

  test('hyphenated name produces correct PascalCase TypeScript interface', () => {
    const out = generateTypeScript(makeManifest({ name: 'website-headline', slug: 'website-headline' }));
    expect(out).toContain('interface WebsiteHeadline');
    expect(out).toContain('listWebsiteHeadline');
    expect(out).toContain('createWebsiteHeadline');
  });

  test('spaced name with explicit slug produces correct PascalCase interface', () => {
    const out = generateTypeScript(makeManifest({ name: 'Website Headline', slug: 'website-headline' }));
    expect(out).toContain('interface WebsiteHeadline');
  });
});
