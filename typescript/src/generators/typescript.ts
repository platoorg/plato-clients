import type { Manifest, ManifestField, ManifestSchema } from '../manifest.js';

// ── Helpers ───────────────────────────────────────────────────────────────────

/** "my_schema", "my-schema", or "My Schema" → "MySchema" */
function toPascalCase(s: string): string {
  return s
    .replace(/[-_\s](.)/g, (_, c: string) => c.toUpperCase())
    .replace(/^(.)/, (_, c: string) => c.toUpperCase());
}

function isSingleton(schema: { type?: string; singleton?: boolean }): boolean {
  return schema.type === 'singleton' || schema.singleton === true;
}

/** Derive the URL slug from a schema: use explicit slug if present, else kebab-case the name. */
function toSlug(schema: { name: string; slug?: string }): string {
  if (schema.slug) return schema.slug;
  return schema.name
    .trim()
    .toLowerCase()
    .replace(/[\s_]+/g, '-')
    .replace(/[^a-z0-9-]/g, '');
}

/** Map a Plato field type to its TypeScript counterpart (interface fields). */
const TS_TYPE: Record<string, string> = {
  string:        'string',
  number:        'number',
  boolean:       'boolean',
  date:          'string',           // ISO 8601 date string
  media:         'string',           // media asset URL
  richtext:      'RichTextDocument', // structured rich-text document
  relation_one:  'string',           // ID of related item
  relation_many: 'string[]',         // IDs of related items
};

/** Map a Plato field type to its TypeScript counterpart inside *Params interfaces. */
const PARAMS_TS_TYPE: Record<string, string> = {
  string:        'string',
  number:        'number',
  boolean:       'boolean',
  date:          'string',
  media:         'string',
  richtext:      'string',
  relation_one:  'string',
  relation_many: 'string',
};

/** Inline doc-comment for field types that need clarification. */
const TS_TYPE_COMMENT: Record<string, string> = {
  date:          'ISO 8601 date string',
  media:         'media asset URL',
  richtext:      'structured rich-text document',
  relation_one:  'ID of related item',
  relation_many: 'IDs of related items',
};

/** Returns true if any schema in the manifest uses the richtext field type. */
function hasRichTextField(schemas: ManifestSchema[]): boolean {
  return schemas.some(s => s.fields.some(f => f.type === 'richtext'));
}

/** Returns true if the schema should be excluded from codegen. */
function isOrganisational(schema: ManifestSchema): boolean {
  return schema.managed === true || schema.fields.length === 0;
}

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

  if (hasRichTextField(schemas)) {
    lines.push('// ── Rich text ───────────────────────────────────────────────');
    lines.push('export interface RichTextNode {');
    lines.push('  type: string;');
    lines.push('  [key: string]: unknown;');
    lines.push('}');
    lines.push('export interface RichTextDocument {');
    lines.push("  type: 'doc';");
    lines.push('  content: RichTextNode[];');
    lines.push('}');
    lines.push('');
  }

  lines.push('// ── Base ────────────────────────────────────────────────────');
  lines.push('export interface PlatoItem {');
  lines.push('  id: string;');
  lines.push('  created_at: string;');
  lines.push('  updated_at: string;');
  lines.push('}');

  for (const schema of schemas) {
    const name = toPascalCase(schema.name);
    lines.push('');
    lines.push(`/** ${isSingleton(schema) ? 'singleton' : 'collection'} */`);
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
 * Generate a Params interface for list / find methods.
 * Field types are preserved (boolean stays boolean, number stays number).
 * A `populate` field allows requesting relation resolution server-side.
 */
function generateParams(schema: ManifestSchema): string {
  const name  = toPascalCase(schema.name);
  const lines = [`export interface ${name}Params {`];
  for (const field of schema.fields) {
    const tsType = PARAMS_TS_TYPE[field.type] ?? 'string';
    lines.push(`  ${field.name}?: ${tsType};`);
  }
  lines.push('  /** Relation fields to populate server-side (e.g. ["tags", "author"]). */');
  lines.push('  populate?: string[];');
  lines.push('}');
  return lines.join('\n');
}

// ── Section: client class ─────────────────────────────────────────────────────

function generateSingletonMethods(schema: ManifestSchema): string[] {
  const name  = toPascalCase(schema.name);
  const slug  = toSlug(schema);
  const lines: string[] = [];

  // get
  lines.push(`  /** Fetch the ${schema.name} singleton. */`);
  lines.push(`  async get${name}(): Promise<${name}> {`);
  lines.push(`    return this.get<${name}>('${slug}');`);
  lines.push(`  }`);

  // update — direct PUT to /:schema, no prior GET needed
  lines.push('');
  lines.push(`  /** Update the ${schema.name} singleton. */`);
  lines.push(`  async update${name}(data: Partial<Omit<${name}, keyof PlatoItem>>): Promise<${name}> {`);
  lines.push(`    return this.put<${name}>('${slug}', data);`);
  lines.push(`  }`);

  // try* — returns null instead of throwing
  lines.push('');
  lines.push(`  /** Like get${name}() but returns null instead of throwing on error. */`);
  lines.push(`  async tryGet${name}(): Promise<${name} | null> {`);
  lines.push(`    try { return await this.get${name}(); } catch { return null; }`);
  lines.push(`  }`);

  return lines;
}

function generateCollectionMethods(schema: ManifestSchema): string[] {
  const name         = toPascalCase(schema.name);
  const slug         = toSlug(schema);
  const hasSlugField = schema.fields.some(f => f.name === 'slug');
  const lines: string[] = [];

  // list (with populate support)
  lines.push(`  /** List ${schema.name} items. Supports filtering and server-side relation population. */`);
  lines.push(`  async list${name}(params?: ${name}Params): Promise<${name}[]> {`);
  lines.push(`    const { populate, ...filters } = params ?? {};`);
  lines.push(`    return this.get<${name}[]>(\`${slug}\${this.buildQs(filters, populate)}\`);`);
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

  // find — returns first match (server-filtered)
  lines.push('');
  lines.push(`  /** Return the first ${schema.name} matching the given params, or null. */`);
  lines.push(`  async find${name}(params: ${name}Params): Promise<${name} | null> {`);
  lines.push(`    const results = await this.list${name}(params);`);
  lines.push(`    return results[0] ?? null;`);
  lines.push(`  }`);

  // getBySlug — only when schema has a slug field
  if (hasSlugField) {
    lines.push('');
    lines.push(`  /** Fetch the ${schema.name} with the given slug, or null. */`);
    lines.push(`  async get${name}BySlug(slug: string): Promise<${name} | null> {`);
    lines.push(`    return this.find${name}({ slug });`);
    lines.push(`  }`);
  }

  // try* — safe variants that return null / [] instead of throwing
  lines.push('');
  lines.push(`  /** Like list${name}() but returns [] instead of throwing on error. */`);
  lines.push(`  async tryList${name}(params?: ${name}Params): Promise<${name}[]> {`);
  lines.push(`    try { return await this.list${name}(params); } catch { return []; }`);
  lines.push(`  }`);

  lines.push('');
  lines.push(`  /** Like get${name}() but returns null instead of throwing on error. */`);
  lines.push(`  async tryGet${name}(id: string): Promise<${name} | null> {`);
  lines.push(`    try { return await this.get${name}(id); } catch { return null; }`);
  lines.push(`  }`);

  return lines;
}

function generateClient(schemas: ManifestSchema[]): string {
  const lines: string[] = [];

  // Params interfaces (one per collection)
  for (const schema of schemas.filter(s => !isSingleton(s))) {
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

  // fromEnv() static factory
  lines.push('  /** Construct a client from PLATO_URL, PLATO_NAMESPACE, and PLATO_API_KEY env vars. */');
  lines.push('  static fromEnv(): PlatoClient {');
  lines.push("    const url = process.env['PLATO_URL'];");
  lines.push("    const ns  = process.env['PLATO_NAMESPACE'];");
  lines.push("    if (!url) throw new Error('[plato] PLATO_URL env var is not set');");
  lines.push("    if (!ns)  throw new Error('[plato] PLATO_NAMESPACE env var is not set');");
  lines.push("    return new PlatoClient(url, ns, process.env['PLATO_API_KEY']);");
  lines.push('  }');
  lines.push('');

  // Private helpers
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
  lines.push('  private buildQs(filters: Record<string, unknown>, populate?: string[]): string {');
  lines.push('    const pairs = Object.entries(filters).filter(([, v]) => v != null);');
  lines.push('    const qs = new URLSearchParams(pairs.map(([k, v]) => [k, String(v)]));');
  lines.push("    if (populate?.length) qs.set('populate', populate.join(','));");
  lines.push('    const s = qs.toString();');
  lines.push("    return s ? '?' + s : '';");
  lines.push('  }');
  lines.push('');
  lines.push('  private get<T>(path: string)                         { return this.request<T>(path); }');
  lines.push('  private post<T>(path: string, body: unknown)         { return this.request<T>(path, { method: \'POST\',   body: JSON.stringify(body) }); }');
  lines.push('  private put<T>(path: string, body: unknown)          { return this.request<T>(path, { method: \'PUT\',    body: JSON.stringify(body) }); }');
  lines.push('');

  // Generic escape hatches
  lines.push('  // ── Generic ─────────────────────────────────────────────────');
  lines.push('  /** Fetch a singleton by schema slug — typed escape hatch for unlisted schemas. */');
  lines.push('  async getSingleton<T extends PlatoItem>(schema: string): Promise<T> {');
  lines.push('    return this.get<T>(schema);');
  lines.push('  }');
  lines.push('');
  lines.push('  /** Fetch a collection by schema slug — typed escape hatch for unlisted schemas. */');
  lines.push('  async getCollection<T extends PlatoItem>(schema: string, params?: Record<string, string | number | boolean>): Promise<T[]> {');
  lines.push('    return this.get<T[]>(`${schema}${this.buildQs(params ?? {})}`);');
  lines.push('  }');

  for (const schema of schemas) {
    lines.push('');
    const schemaKind = isSingleton(schema) ? 'singleton' : 'collection';
    lines.push(`  // ── ${schema.name} (${schemaKind}) ${'─'.repeat(Math.max(0, 44 - schema.name.length))}`);
    const methods = isSingleton(schema)
      ? generateSingletonMethods(schema)
      : generateCollectionMethods(schema);
    lines.push(...methods);
  }

  lines.push('}');
  return lines.join('\n');
}

// ── Section: declarations (.d.ts) ─────────────────────────────────────────────

function generateSingletonDeclarationMethods(schema: ManifestSchema): string[] {
  const name = toPascalCase(schema.name);
  return [
    `  get${name}(): Promise<${name}>;`,
    `  update${name}(data: Partial<Omit<${name}, keyof PlatoItem>>): Promise<${name}>;`,
    `  tryGet${name}(): Promise<${name} | null>;`,
  ];
}

function generateCollectionDeclarationMethods(schema: ManifestSchema): string[] {
  const name         = toPascalCase(schema.name);
  const hasSlugField = schema.fields.some(f => f.name === 'slug');
  const lines = [
    `  list${name}(params?: ${name}Params): Promise<${name}[]>;`,
    `  get${name}(id: string): Promise<${name}>;`,
    `  create${name}(data: Omit<${name}, keyof PlatoItem>): Promise<${name}>;`,
    `  update${name}(id: string, data: Partial<Omit<${name}, keyof PlatoItem>>): Promise<${name}>;`,
    `  delete${name}(id: string): Promise<void>;`,
    `  find${name}(params: ${name}Params): Promise<${name} | null>;`,
  ];
  if (hasSlugField) lines.push(`  get${name}BySlug(slug: string): Promise<${name} | null>;`);
  lines.push(`  tryList${name}(params?: ${name}Params): Promise<${name}[]>;`);
  lines.push(`  tryGet${name}(id: string): Promise<${name} | null>;`);
  return lines;
}

/**
 * Generate the `.d.ts` declarations file.
 * Emits typed CRUD method signatures for every schema in the manifest.
 */
export function generateDeclarations(manifest: Manifest): string {
  const schemas = manifest.schemas.filter(s => !isOrganisational(s));

  const metaParts: string[] = [];
  if (manifest.namespace !== undefined) metaParts.push(`Namespace: ${manifest.namespace}`);
  if (manifest.public    !== undefined) metaParts.push(`public: ${manifest.public}`);
  const metaLine = metaParts.length ? `\n// ${metaParts.join(' · ')}` : '';

  const lines: string[] = [
    `// Generated by @platoorg/ts-client — run \`npx plato-ts generate\` to regenerate${metaLine}`,
    '',
  ];

  if (hasRichTextField(schemas)) {
    lines.push('export interface RichTextNode { type: string; [key: string]: unknown; }');
    lines.push("export interface RichTextDocument { type: 'doc'; content: RichTextNode[]; }");
    lines.push('');
  }

  lines.push(
    'export interface PlatoItem {',
    '  id: string;',
    '  created_at: string;',
    '  updated_at: string;',
    '}',
  );

  for (const schema of schemas) {
    const name = toPascalCase(schema.name);
    lines.push('');
    lines.push(`/** ${isSingleton(schema) ? 'singleton' : 'collection'} */`);
    lines.push(`export interface ${name} extends PlatoItem {`);
    for (const field of schema.fields) {
      lines.push(fieldLine(field));
    }
    lines.push('}');
  }

  // Params interfaces for collections
  for (const schema of schemas.filter(s => !isSingleton(s))) {
    lines.push('');
    lines.push(generateParams(schema));
  }

  lines.push('');
  lines.push('export declare class PlatoClient {');
  lines.push('  constructor(baseUrl: string, namespace: string, apiKey?: string);');
  lines.push('  static fromEnv(): PlatoClient;');
  lines.push('  /** Fetch a singleton by schema slug — typed escape hatch for unlisted schemas. */');
  lines.push('  getSingleton<T extends PlatoItem>(schema: string): Promise<T>;');
  lines.push('  /** Fetch a collection by schema slug — typed escape hatch for unlisted schemas. */');
  lines.push('  getCollection<T extends PlatoItem>(schema: string, params?: Record<string, string | number | boolean>): Promise<T[]>;');

  for (const schema of schemas) {
    lines.push('');
    const schemaKind = isSingleton(schema) ? 'singleton' : 'collection';
    lines.push(`  // ── ${schema.name} (${schemaKind}) ${'─'.repeat(Math.max(0, 44 - schema.name.length))}`);
    const methods = isSingleton(schema)
      ? generateSingletonDeclarationMethods(schema)
      : generateCollectionDeclarationMethods(schema);
    lines.push(...methods);
  }

  lines.push('}');
  lines.push('');

  return lines.join('\n');
}

// ── Section: runtime (.js) ────────────────────────────────────────────────────

function generateSingletonRuntimeMethods(schema: ManifestSchema): string[] {
  const name = toPascalCase(schema.name);
  const slug = toSlug(schema);
  return [
    `  /** Fetch the ${schema.name} singleton. */`,
    `  async get${name}() {`,
    `    return this.#get('${slug}');`,
    `  }`,
    ``,
    `  /** Update the ${schema.name} singleton. */`,
    `  async update${name}(data) {`,
    `    return this.#put('${slug}', data);`,
    `  }`,
    ``,
    `  /** Like get${name}() but returns null instead of throwing on error. */`,
    `  async tryGet${name}() {`,
    `    try { return await this.get${name}(); } catch { return null; }`,
    `  }`,
  ];
}

function generateCollectionRuntimeMethods(schema: ManifestSchema): string[] {
  const name         = toPascalCase(schema.name);
  const slug         = toSlug(schema);
  const hasSlugField = schema.fields.some(f => f.name === 'slug');
  const lines: string[] = [
    `  /** List ${schema.name} items. Supports filtering and server-side relation population. */`,
    `  async list${name}(params) {`,
    `    const { populate, ...filters } = params ?? {};`,
    `    return this.#get(\`${slug}\${this.#buildQs(filters, populate)}\`);`,
    `  }`,
    ``,
    `  /** Fetch a single ${schema.name} item by ID. */`,
    `  async get${name}(id) {`,
    `    return this.#get(\`${slug}/\${id}\`);`,
    `  }`,
    ``,
    `  /** Create a new ${schema.name} item. */`,
    `  async create${name}(data) {`,
    `    return this.#post('${slug}', data);`,
    `  }`,
    ``,
    `  /** Update an existing ${schema.name} item. */`,
    `  async update${name}(id, data) {`,
    `    return this.#put(\`${slug}/\${id}\`, data);`,
    `  }`,
    ``,
    `  /** Delete a ${schema.name} item. */`,
    `  async delete${name}(id) {`,
    `    await this.#request(\`${slug}/\${id}\`, { method: 'DELETE' });`,
    `  }`,
    ``,
    `  /** Return the first ${schema.name} matching the given params, or null. */`,
    `  async find${name}(params) {`,
    `    const results = await this.list${name}(params);`,
    `    return results[0] ?? null;`,
    `  }`,
  ];
  if (hasSlugField) {
    lines.push(
      ``,
      `  /** Fetch the ${schema.name} with the given slug, or null. */`,
      `  async get${name}BySlug(slug) {`,
      `    return this.find${name}({ slug });`,
      `  }`,
    );
  }
  lines.push(
    ``,
    `  /** Like list${name}() but returns [] instead of throwing on error. */`,
    `  async tryList${name}(params) {`,
    `    try { return await this.list${name}(params); } catch { return []; }`,
    `  }`,
    ``,
    `  /** Like get${name}() but returns null instead of throwing on error. */`,
    `  async tryGet${name}(id) {`,
    `    try { return await this.get${name}(id); } catch { return null; }`,
    `  }`,
  );
  return lines;
}

/**
 * Generate the `.js` runtime file.
 * Emits a full PlatoClient class with typed CRUD methods for every schema.
 */
export function generateRuntime(manifest: Manifest): string {
  const schemas = manifest.schemas.filter(s => !isOrganisational(s));

  const metaParts: string[] = [];
  if (manifest.namespace !== undefined) metaParts.push(`Namespace: ${manifest.namespace}`);
  if (manifest.public    !== undefined) metaParts.push(`public: ${manifest.public}`);
  const metaLine = metaParts.length ? `\n// ${metaParts.join(' · ')}` : '';

  const lines: string[] = [
    `// Generated by @platoorg/ts-client — run \`npx plato-ts generate\` to regenerate${metaLine}`,
    '',
    'export class PlatoClient {',
    '  #baseUrl;',
    '  #namespace;',
    '  #apiKey;',
    '',
    '  constructor(baseUrl, namespace, apiKey) {',
    '    this.#baseUrl    = baseUrl;',
    '    this.#namespace  = namespace;',
    '    this.#apiKey     = apiKey;',
    '  }',
    '',
    '  static fromEnv() {',
    "    const url = process.env['PLATO_URL'];",
    "    const ns  = process.env['PLATO_NAMESPACE'];",
    "    if (!url) throw new Error('[plato] PLATO_URL env var is not set');",
    "    if (!ns)  throw new Error('[plato] PLATO_NAMESPACE env var is not set');",
    "    return new PlatoClient(url, ns, process.env['PLATO_API_KEY']);",
    '  }',
    '',
    "  #headers() {",
    "    const h = { 'Content-Type': 'application/json' };",
    "    if (this.#apiKey) h['Authorization'] = `Bearer ${this.#apiKey}`;",
    '    return h;',
    '  }',
    '',
    '  async #request(path, init) {',
    '    const url = `${this.#baseUrl}/api/namespaces/${this.#namespace}/content/${path}`;',
    '    const res = await fetch(url, { ...init, headers: this.#headers() });',
    "    if (!res.ok) throw new Error(`Plato ${init?.method ?? 'GET'} ${url}: ${res.status} ${res.statusText}`);",
    '    return res.json();',
    '  }',
    '',
    '  #buildQs(filters, populate) {',
    '    const pairs = Object.entries(filters).filter(([, v]) => v != null);',
    '    const qs = new URLSearchParams(pairs.map(([k, v]) => [k, String(v)]));',
    "    if (populate?.length) qs.set('populate', populate.join(','));",
    '    const s = qs.toString();',
    "    return s ? '?' + s : '';",
    '  }',
    '',
    '  #get(path)        { return this.#request(path); }',
    "  #post(path, body) { return this.#request(path, { method: 'POST', body: JSON.stringify(body) }); }",
    "  #put(path, body)  { return this.#request(path, { method: 'PUT',  body: JSON.stringify(body) }); }",
    '',
    '  // ── Generic ─────────────────────────────────────────────────',
    '  /** Fetch a singleton by schema slug — typed escape hatch for unlisted schemas. */',
    '  async getSingleton(schema) {',
    '    return this.#get(schema);',
    '  }',
    '',
    '  /** Fetch a collection by schema slug — typed escape hatch for unlisted schemas. */',
    '  async getCollection(schema, params) {',
    '    return this.#get(`${schema}${this.#buildQs(params ?? {})}`);',
    '  }',
  ];

  for (const schema of schemas) {
    lines.push('');
    const schemaKind = isSingleton(schema) ? 'singleton' : 'collection';
    lines.push(`  // ── ${schema.name} (${schemaKind}) ${'─'.repeat(Math.max(0, 44 - schema.name.length))}`);
    const methods = isSingleton(schema)
      ? generateSingletonRuntimeMethods(schema)
      : generateCollectionRuntimeMethods(schema);
    lines.push(...methods);
  }

  lines.push('}');
  lines.push('');

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
  const schemas = manifest.schemas.filter(s => !isOrganisational(s));

  const metaParts: string[] = [];
  if (manifest.namespace !== undefined) metaParts.push(`Namespace: ${manifest.namespace}`);
  if (manifest.public    !== undefined) metaParts.push(`public: ${manifest.public}`);
  const metaLine = metaParts.length ? `\n// ${metaParts.join(' · ')}` : '';

  const header = [
    `// Generated by @platoorg/ts-client — do not edit manually${metaLine}`,
    `// Schema count: ${schemas.length}`,
    '',
  ].join('\n');

  const types  = generateTypes(schemas);
  const client = generateClient(schemas);

  return [header, types, '', client, ''].join('\n');
}
