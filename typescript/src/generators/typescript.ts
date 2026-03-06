import type { Manifest, ManifestField, ManifestSchema } from '../manifest.js';

// ── Helpers ───────────────────────────────────────────────────────────────────

/** "my_schema" or "my-schema" → "MySchema" */
function toPascalCase(s: string): string {
  return s
    .replace(/[-_](.)/g, (_, c: string) => c.toUpperCase())
    .replace(/^(.)/, (_, c: string) => c.toUpperCase());
}

/** Map a Plato field type to its TypeScript counterpart. */
const TS_TYPE: Record<string, string> = {
  string:       'string',
  number:       'number',
  boolean:      'boolean',
  date:         'string',       // ISO 8601 date string
  media:        'string',       // media asset URL
  relation_one: 'string',       // ID of related item
  relation_many: 'string[]',    // IDs of related items
};

/** Inline doc-comment for field types that need clarification. */
const TS_TYPE_COMMENT: Record<string, string> = {
  date:         'ISO 8601 date string',
  media:        'media asset URL',
  relation_one: 'ID of related item',
  relation_many: 'IDs of related items',
};

function fieldLine(field: ManifestField): string {
  const tsType  = TS_TYPE[field.type] ?? 'unknown';
  const opt     = field.required ? '' : '?';
  const comment = TS_TYPE_COMMENT[field.type]
    ? ` // ${TS_TYPE_COMMENT[field.type]}`
    : '';
  return `  ${field.name}${opt}: ${tsType};${comment}`;
}

// ── Section: types ────────────────────────────────────────────────────────────

function generateTypes(schemas: ManifestSchema[]): string {
  const lines: string[] = [];

  lines.push('// ── Base ────────────────────────────────────────────────────');
  lines.push('export interface PlatoItem {');
  lines.push('  id: string;');
  lines.push('  created_at: string;');
  lines.push('  updated_at: string;');
  lines.push('}');

  for (const schema of schemas) {
    const name = toPascalCase(schema.name);
    lines.push('');
    lines.push(`/** ${schema.type} */`);
    lines.push(`export interface ${name} extends PlatoItem {`);
    for (const field of schema.fields) {
      lines.push(fieldLine(field));
    }
    lines.push('}');
  }

  return lines.join('\n');
}

// ── Section: filter params ────────────────────────────────────────────────────

/**
 * Generate a Params interface for list methods.
 * Every field becomes an optional string param (Plato filter query strings).
 */
function generateParams(schema: ManifestSchema): string {
  const name  = toPascalCase(schema.name);
  const lines = [`export interface ${name}Params {`];
  for (const field of schema.fields) {
    lines.push(`  ${field.name}?: string;`);
  }
  lines.push('}');
  return lines.join('\n');
}

// ── Section: client class ─────────────────────────────────────────────────────

function generateSingletonMethods(schema: ManifestSchema): string[] {
  const name  = toPascalCase(schema.name);
  const slug  = schema.name.replace(/_/g, '-');
  const lines: string[] = [];

  // get
  lines.push(`  /** Fetch the ${schema.name} singleton. */`);
  lines.push(`  async get${name}(): Promise<${name} | null> {`);
  lines.push(`    const data = await this.get<${name}[]>('${slug}');`);
  lines.push(`    return data[0] ?? null;`);
  lines.push(`  }`);

  // update
  lines.push('');
  lines.push(`  /** Update the ${schema.name} singleton. */`);
  lines.push(`  async update${name}(data: Partial<Omit<${name}, keyof PlatoItem>>): Promise<${name}> {`);
  lines.push(`    const item = await this.get${name}();`);
  lines.push(`    if (!item) throw new Error('${schema.name} singleton not found');`);
  lines.push(`    return this.put<${name}>(\`${slug}/\${item.id}\`, data);`);
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
  lines.push(`    return this.get<${name}[]>(\`${slug}\${qs}\`);`);
  lines.push(`  }`);

  // get by id
  lines.push('');
  lines.push(`  /** Fetch a single ${schema.name} item by ID. */`);
  lines.push(`  async get${name}(id: string): Promise<${name}> {`);
  lines.push(`    return this.get<${name}>(\`${slug}/\${id}\`);`);
  lines.push(`  }`);

  // create
  lines.push('');
  lines.push(`  /** Create a new ${schema.name} item. */`);
  lines.push(`  async create${name}(data: Omit<${name}, keyof PlatoItem>): Promise<${name}> {`);
  lines.push(`    return this.post<${name}>('${slug}', data);`);
  lines.push(`  }`);

  // update
  lines.push('');
  lines.push(`  /** Update an existing ${schema.name} item. */`);
  lines.push(`  async update${name}(id: string, data: Partial<Omit<${name}, keyof PlatoItem>>): Promise<${name}> {`);
  lines.push(`    return this.put<${name}>(\`${slug}/\${id}\`, data);`);
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
  lines.push('    const h: Record<string, string> = { \'Content-Type\': \'application/json\' };');
  lines.push('    if (this.apiKey) h[\'Authorization\'] = `Bearer ${this.apiKey}`;');
  lines.push('    return h;');
  lines.push('  }');
  lines.push('');
  lines.push('  private async request<T>(path: string, init?: RequestInit): Promise<T> {');
  lines.push('    const url = `${this.baseUrl}/api/namespaces/${this.namespace}/content/${path}`;');
  lines.push('    const res  = await fetch(url, { ...init, headers: this.headers() });');
  lines.push('    if (!res.ok) {');
  lines.push('      throw new Error(`Plato ${init?.method ?? \'GET\'} ${url}: ${res.status} ${res.statusText}`);');
  lines.push('    }');
  lines.push('    return res.json() as Promise<T>;');
  lines.push('  }');
  lines.push('');
  lines.push('  private get<T>(path: string)                         { return this.request<T>(path); }');
  lines.push('  private post<T>(path: string, body: unknown)         { return this.request<T>(path, { method: \'POST\',   body: JSON.stringify(body) }); }');
  lines.push('  private put<T>(path: string, body: unknown)          { return this.request<T>(path, { method: \'PUT\',    body: JSON.stringify(body) }); }');

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
 *   - A `PlatoItem` base interface
 *   - One typed interface per schema
 *   - Filter param interfaces for every collection
 *   - A `PlatoClient` class with fully-typed CRUD methods
 */
export function generateTypeScript(manifest: Manifest): string {
  const header = [
    `// Generated by plato-codegen — do not edit manually`,
    `// Namespace: ${manifest.namespace} · public: ${manifest.public}`,
    `// Schema count: ${manifest.schemas.length}`,
    '',
  ].join('\n');

  const types  = generateTypes(manifest.schemas);
  const client = generateClient(manifest.schemas);

  return [header, types, '', client, ''].join('\n');
}
