import { describe, it, expect } from 'vitest';
import { generateTypeScript as generateClient } from '../src/generators/typescript';
import type { Manifest } from '../src/manifest';

describe('localized field codegen', () => {
  const manifest: Manifest = {
    namespace: 'i18n',
    public: true,
    supported_languages: ['en', 'de'],
    default_language: 'en',
    schemas: [
      {
        name: 'capability',
        type: 'collection',
        fields: [
          { name: 'title',       type: 'string', localized: true, required: true, is_title: true },
          { name: 'description', type: 'text',   localized: true, required: true },
          { name: 'category',    type: 'string', required: true },
        ],
      },
    ],
  };

  const output = generateClient(manifest);

  it('emits the LocalizedValue type alias when any field is localized', () => {
    expect(output).toContain('export type LocalizedValue<T> = T | { [lang: string]: T };');
  });

  it('wraps localized string fields in LocalizedValue<string>', () => {
    expect(output).toMatch(/title:\s*LocalizedValue<string>/);
  });

  it('wraps localized text fields in LocalizedValue<string> (text → string TS type)', () => {
    expect(output).toMatch(/description:\s*LocalizedValue<string>/);
  });

  it('leaves non-localized fields as bare scalars', () => {
    expect(output).toMatch(/category:\s*string;/);
    expect(output).not.toMatch(/category:\s*LocalizedValue/);
  });

  it('skips LocalizedValue when no field is localized', () => {
    const plain: Manifest = {
      namespace: 'plain',
      public: true,
      schemas: [
        {
          name: 'page',
          type: 'collection',
          fields: [{ name: 'title', type: 'string', required: true }],
        },
      ],
    };
    const plainOut = generateClient(plain);
    expect(plainOut).not.toContain('LocalizedValue');
  });
});
