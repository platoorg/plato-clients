import { describe, it, expect } from 'vitest';
import { generateZod } from '../src/generators/zod';
import type { Manifest } from '../src/manifest';

describe('localized field codegen (Zod)', () => {
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

  const out = generateZod(manifest);

  it('wraps localized fields in a union with z.record(z.string(), …)', () => {
    expect(out).toMatch(/title:\s*z\.union\(\[z\.string\(\),\s*z\.record\(z\.string\(\),\s*z\.string\(\)\)\]\)/);
  });

  it('handles text type (no z.unknown for long text)', () => {
    expect(out).toMatch(/description:\s*z\.union\(\[z\.string\(\),\s*z\.record\(z\.string\(\),\s*z\.string\(\)\)\]\)/);
    expect(out).not.toMatch(/description:\s*z\.unknown/);
  });

  it('leaves non-localized fields as bare scalars', () => {
    expect(out).toMatch(/category:\s*z\.string\(\),/);
  });
});
