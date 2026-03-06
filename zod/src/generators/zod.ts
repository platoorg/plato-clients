import type { Manifest, ManifestField, ManifestSchema } from '../manifest.js';

// ── Helpers ───────────────────────────────────────────────────────────────────

/** "my_schema" or "my-schema" → "MySchema" */
function toPascalCase(s: string): string {
  return s
    .replace(/[-_](.)/g, (_, c: string) => c.toUpperCase())
    .replace(/^(.)/, (_, c: string) => c.toUpperCase());
}

/**
 * Map a Plato field type to its Zod schema expression.
 * The base expression (without optionality) is returned here;
 * `.optional()` is appended by the caller when `required` is false.
 */
const ZOD_SCHEMA: Record<string, string> = {
  string:        'z.string()',
  number:        'z.number()',
  boolean:       'z.boolean()',
  date:          'z.string()',           // ISO 8601 date string
  media:         'z.string().url()',     // media asset URL
  relation_one:  'z.string()',           // ID of related item
  relation_many: 'z.array(z.string())', // IDs of related items
};

/** Inline comment for field types that benefit from clarification. */
const ZOD_FIELD_COMMENT: Record<string, string> = {
  date:          'ISO 8601 date string',
  media:         'media asset URL',
  relation_one:  'ID of related item',
  relation_many: 'IDs of related items',
};

function schemaFieldLine(field: ManifestField): string {
  const base    = ZOD_SCHEMA[field.type] ?? 'z.unknown()';
  const expr    = field.required ? base : `${base}.optional()`;
  const comment = ZOD_FIELD_COMMENT[field.type]
    ? ` // ${ZOD_FIELD_COMMENT[field.type]}`
    : '';
  return `  ${field.name}: ${expr},${comment}`;
}

// ── Section: base schema ──────────────────────────────────────────────────────

function generateBaseSchema(): string {
  return [
    '// ── Base ─────────────────────────────────────────────────────',
    'export const PlatoItemSchema = z.object({',
    '  id: z.string(),',
    '  created_at: z.string(),',
    '  updated_at: z.string(),',
    '});',
    'export type PlatoItem = z.infer<typeof PlatoItemSchema>;',
  ].join('\n');
}

// ── Section: per-schema Zod schemas ──────────────────────────────────────────

function generateSchemaBlock(schema: ManifestSchema): string {
  const name  = toPascalCase(schema.name);
  const lines: string[] = [];

  lines.push(`/** ${schema.type} */`);
  lines.push(`export const ${name}Schema = PlatoItemSchema.extend({`);
  for (const field of schema.fields) {
    lines.push(schemaFieldLine(field));
  }
  lines.push('});');
  lines.push(`export type ${name} = z.infer<typeof ${name}Schema>;`);

  return lines.join('\n');
}

// ── Section: filter params for collections ────────────────────────────────────

function generateParams(schema: ManifestSchema): string {
  const name  = toPascalCase(schema.name);
  const lines = [`export interface ${name}Params {`];
  for (const field of schema.fields) {
    lines.push(`  ${field.name}?: string;`);
  }
  lines.push('}');
  return lines.join('\n');
}

// ── Section: client methods ───────────────────────────────────────────────────

function generateSingletonMethods(schema: ManifestSchema): string[] {
  const name  = toPascalCase(schema.name);
  const slug  = schema.name.replace(/_/g, '-');
  const lines: string[] = [];

  // get
  lines.push(`  /** Fetch the ${schema.name} singleton. */`);
  lines.push(`  async get${name}(): Promise<${name} | null> {`);
  lines.push(`    const data = await this.request<unknown>('${slug}');`);
  lines.push(`    const items = z.array(${name}Schema).parse(data);`);
  lines.push(`    return items[0] ?? null;`);
  lines.push(`  }`);

  // update
  lines.push('');
  lines.push(`  /** Update the ${schema.name} singleton. */`);
  lines.push(`  async update${name}(data: Partial<Omit<${name}, keyof PlatoItem>>): Promise<${name}> {`);
  lines.push(`    const item = await this.get${name}();`);
  lines.push(`    if (!item) throw new Error('${schema.name} singleton not found');`);
  lines.push(`    const result = await this.request<unknown>(\`${slug}/\${item.id}\`, {`);
  lines.push(`      method: 'PUT',`);
  lines.push(`      body: JSON.stringify(data),`);
  lines.push(`    });`);
  lines.push(`    return ${name}Schema.parse(result);`);
  lines.push(`  }`);

  return lines;
}

function generateCollectionMethods(schema: ManifestSchema): string[] {
  const name  = toPascalCase(schema.name);
  const slug  = schema.name.replace(/_/g, '-');
  const lines: string[] = [];

  // list
  lines.push(`  /** List ${schema.name} items. Pass filter params as \`{ field: value }\`. */`);
  lines.push(`  async list${name}(params?: ${name}Params): Promise<${name}[]> {`);
  lines.push(`    const qs = params ? '?' + new URLSearchParams(params as Record<string, string>) : '';`);
  lines.push(`    const data = await this.request<unknown>(\`${slug}\${qs}\`);`);
  lines.push(`    return z.array(${name}Schema).parse(data);`);
  lines.push(`  }`);

  // get by id
  lines.push('');
  lines.push(`  /** Fetch a single ${schema.name} item by ID. */`);
  lines.push(`  async get${name}(id: string): Promise<${name}> {`);
  lines.push(`    const data = await this.request<unknown>(\`${slug}/\${id}\`);`);
  lines.push(`    return ${name}Schema.parse(data);`);
  lines.push(`  }`);

  // create
  lines.push('');
  lines.push(`  /** Create a new ${schema.name} item. */`);
  lines.push(`  async create${name}(data: Omit<${name}, keyof PlatoItem>): Promise<${name}> {`);
  lines.push(`    const result = await this.request<unknown>('${slug}', {`);
  lines.push(`      method: 'POST',`);
  lines.push(`      body: JSON.stringify(data),`);
  lines.push(`    });`);
  lines.push(`    return ${name}Schema.parse(result);`);
  lines.push(`  }`);

  // update
  lines.push('');
  lines.push(`  /** Update an existing ${schema.name} item. */`);
  lines.push(`  async update${name}(id: string, data: Partial<Omit<${name}, keyof PlatoItem>>): Promise<${name}> {`);
  lines.push(`    const result = await this.request<unknown>(\`${slug}/\${id}\`, {`);
  lines.push(`      method: 'PUT',`);
  lines.push(`      body: JSON.stringify(data),`);
  lines.push(`    });`);
  lines.push(`    return ${name}Schema.parse(result);`);
  lines.push(`  }`);

  // delete
  lines.push('');
  lines.push(`  /** Delete a ${schema.name} item. */`);
  lines.push(`  async delete${name}(id: string): Promise<void> {`);
  lines.push(`    await this.request(\`${slug}/\${id}\`, { method: 'DELETE' });`);
  lines.push(`  }`);

  return lines;
}

function generateClient(schemas: ManifestSchema[]): string {
  const lines: string[] = [];

  // Params interfaces (one per collection)
  for (const schema of schemas.filter(s => s.type === 'collection')) {
    lines.push(generateParams(schema));
    lines.push('');
  }

  // Class
  lines.push('// ── Client ──────────────────────────────────────────────────');
  lines.push('export class PlatoClient {');
  lines.push('  constructor(');
  lines.push('    private readonly baseUrl: string,');
  lines.push('    private readonly namespace: string,');
  lines.push('    private readonly apiKey?: string,');
  lines.push('  ) {}');
  lines.push('');
  lines.push('  private headers(): Record<string, string> {');
  lines.push("    const h: Record<string, string> = { 'Content-Type': 'application/json' };");
  lines.push('    if (this.apiKey) h[\'Authorization\'] = `Bearer ${this.apiKey}`;');
  lines.push('    return h;');
  lines.push('  }');
  lines.push('');
  lines.push('  private async request<T>(path: string, init?: RequestInit): Promise<T> {');
  lines.push('    const url = `${this.baseUrl}/api/namespaces/${this.namespace}/content/${path}`;');
  lines.push('    const res  = await fetch(url, { ...init, headers: this.headers() });');
  lines.push('    if (!res.ok) {');
  lines.push("      throw new Error(`Plato ${init?.method ?? 'GET'} ${url}: ${res.status} ${res.statusText}`);");
  lines.push('    }');
  lines.push('    return res.json() as Promise<T>;');
  lines.push('  }');

  for (const schema of schemas) {
    lines.push('');
    lines.push(`  // ── ${schema.name} (${schema.type}) ${'─'.repeat(Math.max(0, 44 - schema.name.length))}`);
    const methods = schema.type === 'singleton'
      ? generateSingletonMethods(schema)
      : generateCollectionMethods(schema);
    lines.push(...methods);
  }

  lines.push('}');
  return lines.join('\n');
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Generate a self-contained TypeScript file from a Plato manifest.
 *
 * The output includes:
 *   - A `PlatoItemSchema` base Zod object and inferred `PlatoItem` type
 *   - One Zod schema + inferred TypeScript type per manifest schema
 *   - Filter param interfaces for every collection
 *   - A `PlatoClient` class with fully-typed, runtime-validated CRUD methods
 */
export function generateZod(manifest: Manifest): string {
  const header = [
    `// Generated by plato-codegen-zod — do not edit manually`,
    `// Namespace: ${manifest.namespace} · public: ${manifest.public}`,
    `// Schema count: ${manifest.schemas.length}`,
    '',
    "import { z } from 'zod';",
  ].join('\n');

  const base = generateBaseSchema();

  const schemaBlocks = manifest.schemas
    .map(generateSchemaBlock)
    .join('\n\n');

  const client = generateClient(manifest.schemas);

  return [header, '', base, '', schemaBlocks, '', client, ''].join('\n');
}
