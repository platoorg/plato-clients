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

function makeSingletonManifest(): Manifest {
  return {
    namespace: 'test',
    public: false,
    schemas: [
      {
        name: 'Homepage',
        type: 'singleton',
        fields: [{ name: 'title', type: 'string', required: true }],
      },
    ],
  };
}

describe('singleton codegen', () => {
  test('getter returns Promise<T>, not Promise<T | null>', () => {
    const out = generateTypeScript(makeSingletonManifest());
    expect(out).toContain('Promise<Homepage>');
    expect(out).not.toContain('Promise<Homepage | null>');
  });

  test('getter calls get<T> directly, not get<T[]>', () => {
    const out = generateTypeScript(makeSingletonManifest());
    expect(out).toContain("return this.get<Homepage>('homepage');");
    expect(out).not.toContain('get<Homepage[]>');
  });

  test('no array index fallback in getter', () => {
    const out = generateTypeScript(makeSingletonManifest());
    expect(out).not.toContain('data[0]');
  });
});

describe('generated file header', () => {
  test('includes namespace and public when both are present', () => {
    const out = generateTypeScript({ namespace: 'my-ns', public: true, schemas: [] });
    expect(out).toContain('// Namespace: my-ns · public: true');
  });

  test('omits namespace/public line entirely when both are absent', () => {
    const out = generateTypeScript({ schemas: [] });
    expect(out).not.toContain('undefined');
    expect(out).not.toContain('Namespace:');
    expect(out).not.toContain('public:');
  });

  test('omits only the missing field when just one is absent', () => {
    const out = generateTypeScript({ namespace: 'my-ns', schemas: [] });
    expect(out).toContain('Namespace: my-ns');
    expect(out).not.toContain('public:');
    expect(out).not.toContain('undefined');
  });
});

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
