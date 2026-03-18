#!/usr/bin/env node
/**
 * plato-sync -- apply or preview a Plato schema manifest
 *
 * Usage:
 *   plato-sync [manifest] [--preview] [--export] [--namespace=<ns>]
 *
 * Environment variables:
 *   PLATO_URL        Base URL of the Plato instance (required)
 *   PLATO_NAMESPACE  Namespace slug (required)
 *   PLATO_API_KEY    Full-access API key  (use this OR PLATO_SECRET)
 *   PLATO_SECRET     Shared secret for zero-config bootstrap
 *
 * Examples:
 *   plato-sync
 *   plato-sync plato-manifest.json --preview
 *   plato-sync --export > plato-manifest.json
 *   plato-sync --namespace=my-blog
 */
import fs   from 'node:fs';
import path from 'node:path';
import { syncManifest, exportManifest } from './sync.js';
import type { SyncManifest, SyncResult } from './sync.js';

// ── Arg parsing ───────────────────────────────────────────────────────────────

const args  = process.argv.slice(2).filter(a => !a.startsWith('--'));
const flags = Object.fromEntries(
  process.argv.slice(2)
    .filter(a => a.startsWith('--'))
    .map(a => {
      const [k, ...rest] = a.slice(2).split('=');
      return [k, rest.length ? rest.join('=') : 'true'] as [string, string];
    })
);

const isPreview = flags['preview'] === 'true';
const isExport  = flags['export']  === 'true';
const manifestPath = args[0] ?? 'plato-manifest.json';

// ── Env vars ──────────────────────────────────────────────────────────────────

const url       = process.env['PLATO_URL'];
const namespace = flags['namespace'] ?? process.env['PLATO_NAMESPACE'];
const apiKey    = process.env['PLATO_API_KEY'];
const secret    = process.env['PLATO_SECRET'];

if (!url) {
  console.error('✗  PLATO_URL is not set');
  process.exit(1);
}
if (!namespace) {
  console.error('✗  PLATO_NAMESPACE is not set (or --namespace=<ns> not provided)');
  process.exit(1);
}
const baseOpts = { url, namespace, apiKey, secret };

// ── Export mode ───────────────────────────────────────────────────────────────

if (isExport) {
  exportManifest(baseOpts)
    .then(manifest => {
      process.stdout.write(JSON.stringify(manifest, null, 2) + '\n');
    })
    .catch(err => {
      console.error(`✗  ${(err as Error).message}`);
      process.exit(1);
    });

// ── Sync mode ─────────────────────────────────────────────────────────────────

} else {
  const resolved = path.resolve(manifestPath);
  if (!fs.existsSync(resolved)) {
    console.error(`✗  manifest not found: ${resolved}`);
    process.exit(1);
  }

  let manifest: SyncManifest;
  try {
    manifest = JSON.parse(fs.readFileSync(resolved, 'utf8')) as SyncManifest;
  } catch (err) {
    console.error(`✗  failed to parse manifest: ${(err as Error).message}`);
    process.exit(1);
  }

  syncManifest({ ...baseOpts, manifest, preview: isPreview })
    .then(result => printResult(result, isPreview))
    .catch(err => {
      console.error(`✗  ${(err as Error).message}`);
      process.exit(1);
    });
}

// ── Output formatting ─────────────────────────────────────────────────────────

function printResult(result: SyncResult, preview: boolean): void {
  const label = preview ? '[preview]' : '[applied]';

  if (!result.valid) {
    console.error(`✗  sync validation failed:`);
    for (const e of result.errors) console.error(`   • ${e}`);
    process.exit(1);
  }

  if (result.changes.length === 0) {
    console.log(`✓  ${label} no changes`);
  } else {
    console.log(`✓  ${label} ${result.changes.length} change(s):`);
    for (const c of result.changes) {
      const target = c.field ? `${c.schema}.${c.field}` : c.schema;
      const diff   = c.diff
        ? '  ' + Object.entries(c.diff).map(([k, [a, b]]) => `${k}: ${JSON.stringify(a)} → ${JSON.stringify(b)}`).join(', ')
        : '';
      console.log(`   ${actionIcon(c.action)} [${c.type}] ${target}${diff}`);
    }
  }

  if (result.unchanged.length > 0) {
    console.log(`   unchanged: ${result.unchanged.join(', ')}`);
  }

  if (preview && result.changes.length > 0) {
    console.log(`\n   Run without --preview to apply.`);
  }
}

function actionIcon(action: string): string {
  return action === 'create' ? '+' : action === 'delete' ? '-' : '~';
}
