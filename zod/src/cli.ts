#!/usr/bin/env node
/**
 * plato-zod -- generate Zod schemas + typed client from a plato-manifest.json
 *
 * Usage:
 *   plato-zod [manifest] [output]
 *
 * Defaults:
 *   manifest  plato-manifest.json
 *   output    plato-client.ts
 *
 * Examples:
 *   plato-zod
 *   plato-zod src/lib/schemas/plato-manifest.json src/lib/plato/generated.ts
 *   plato-zod path/to/plato-manifest.json
 */
import fs   from 'node:fs';
import path from 'node:path';
import { generateZod } from './generators/zod.js';
import type { Manifest } from './manifest.js';
import { expandManifest } from './expand.js';

// ── Arg parsing ───────────────────────────────────────────────────────────────

const args = process.argv.slice(2).filter(a => !a.startsWith('--'));

const manifestPath = args[0] ?? 'plato-manifest.json';
const outputPath   = args[1] ?? 'plato-client.ts';

// ── Load manifest ─────────────────────────────────────────────────────────────

const resolved = path.resolve(manifestPath);
if (!fs.existsSync(resolved)) {
  console.error(`✗  manifest not found: ${resolved}`);
  process.exit(1);
}

let manifest: Manifest;
try {
  manifest = JSON.parse(fs.readFileSync(resolved, 'utf8')) as Manifest;
} catch (err) {
  console.error(`✗  failed to parse manifest: ${(err as Error).message}`);
  process.exit(1);
}

// ── Generate ──────────────────────────────────────────────────────────────────

const output = generateZod(expandManifest(manifest));

// ── Write output ──────────────────────────────────────────────────────────────

const outResolved = path.resolve(outputPath);
fs.mkdirSync(path.dirname(outResolved), { recursive: true });
fs.writeFileSync(outResolved, output, 'utf8');

console.log(`✓  zod client written to ${outResolved}`);
console.log(`   namespace : ${manifest.namespace}`);
console.log(`   schemas   : ${manifest.schemas.map(s => s.name).join(', ')}`);
