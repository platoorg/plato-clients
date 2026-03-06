import crypto from 'node:crypto';

// ── Types ─────────────────────────────────────────────────────────────────────

export interface SyncField {
  name: string;
  type: 'string' | 'number' | 'boolean' | 'date' | 'media' | 'relation_one' | 'relation_many';
  required?: boolean;
  default?: string;
  related_schema?: string;
  options?: Record<string, unknown>;
}

export interface SyncSchema {
  name: string;
  slug?: string;
  description?: string;
  singleton?: boolean;
  fields: SyncField[];
}

export interface SyncManifest {
  $schema?: string;
  schemas: SyncSchema[];
  prune?: boolean;
  prune_content?: boolean;
}

export interface SyncChange {
  type: 'schema' | 'field';
  action: 'create' | 'update' | 'delete';
  schema: string;
  field?: string;
  diff?: Record<string, [unknown, unknown]>;
}

export interface SyncResult {
  valid: boolean;
  errors: string[];
  changes: SyncChange[];
  unchanged: string[];
}

export interface SyncOptions {
  /** Base URL of the Plato instance, e.g. https://plato.example.com */
  url: string;
  /** Namespace slug to sync into */
  namespace: string;
  /**
   * Full-access API key for the namespace.
   * If omitted, apiKey is derived from `secret` + `namespace` via HMAC-SHA256.
   */
  apiKey?: string;
  /**
   * Shared secret for zero-config bootstrap (PLATO_SECRET).
   * Ignored when `apiKey` is provided.
   */
  secret?: string;
  /** The manifest to apply */
  manifest: SyncManifest;
  /**
   * When true, computes the diff without writing anything.
   * Safe to call with a read-only key.
   */
  preview?: boolean;
}

export type ExportOptions = Omit<SyncOptions, 'manifest' | 'preview'>;

// ── Key derivation ────────────────────────────────────────────────────────────

function deriveKey(secret: string, namespace: string): string {
  return crypto.createHmac('sha256', secret).update(namespace).digest('hex');
}

function resolveKey(opts: Pick<SyncOptions, 'apiKey' | 'secret' | 'namespace'>): string {
  if (opts.apiKey) return opts.apiKey;
  if (opts.secret) return deriveKey(opts.secret, opts.namespace);
  throw new Error(
    'No API key available. Set PLATO_API_KEY or PLATO_SECRET in the environment.'
  );
}

// ── Core functions ────────────────────────────────────────────────────────────

/**
 * Apply (or preview) a manifest against a Plato namespace.
 * Equivalent to: POST /api/namespaces/:ns/sync[?preview=true]
 */
export async function syncManifest(opts: SyncOptions): Promise<SyncResult> {
  const key = resolveKey(opts);
  const base = opts.url.replace(/\/$/, '');
  const url = `${base}/api/namespaces/${opts.namespace}/sync${opts.preview ? '?preview=true' : ''}`;

  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${key}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(opts.manifest),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => res.statusText);
    throw new Error(`Plato sync failed (${res.status}): ${text}`);
  }

  return res.json() as Promise<SyncResult>;
}

/**
 * Export the current schema of a namespace as a ready-to-commit manifest.
 * Equivalent to: GET /api/namespaces/:ns/sync
 */
export async function exportManifest(opts: ExportOptions): Promise<SyncManifest> {
  const key = resolveKey(opts);
  const base = opts.url.replace(/\/$/, '');
  const url = `${base}/api/namespaces/${opts.namespace}/sync`;

  const res = await fetch(url, {
    headers: { 'Authorization': `Bearer ${key}` },
  });

  if (!res.ok) {
    const text = await res.text().catch(() => res.statusText);
    throw new Error(`Plato export failed (${res.status}): ${text}`);
  }

  return res.json() as Promise<SyncManifest>;
}
