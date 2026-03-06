#!/usr/bin/env node
/**
 * plato-codegen -- generate a typed client from a plato-manifest.json
 *
 * Usage:
 *   plato-codegen [manifest] [output] [--lang=typescript]
 *
 * Defaults:
 *   manifest  plato-manifest.json
 *   output    plato-client.ts   (for --lang=typescript)
 *   lang      typescript
 *
 * Examples:
 *   plato-codegen
 *   plato-codegen src/lib/schemas/plato-manifest.json src/lib/plato/generated.ts
 *   plato-codegen path/to/plato-manifest.json --lang=typescript
 */
import fs   from 'node:fs';
import path from 'node:path';
import { generateTypeScript } from './generators/typescript.js';
import type { Manifest } from './manifest.js';

// ── Arg parsing ───────────────────────────────────────────────────────────────

const args    = process.argv.slice(2).filter(a => !a.startsWith('--'));
const flags   = Object.fromEntries(
  process.argv.slice(2)
    .filter(a => a.startsWith('--'))
    .map(a => a.slice(2).split('=') as [string, string])
);

const lang         = flags['lang'] ?? 'typescript';
const manifestPath = args[0] ?? 'plato-manifest.json';
const defaultOut   = lang === 'typescript' ? 'plato-client.ts' : `plato-client.${lang}`;
const outputPath   = args[1] ?? defaultOut;

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

const generators: Record<string, (m: Manifest) => string> = {
  typescript: generateTypeScript,
};

const generate = generators[lang];
if (!generate) {
  console.error(`✗  unsupported language: ${lang}`);
  console.error(`   available: ${Object.keys(generators).join(', ')}`);
  process.exit(1);
}

const output = generate(manifest);

// ── Write output ──────────────────────────────────────────────────────────────

const outResolved = path.resolve(outputPath);
fs.mkdirSync(path.dirname(outResolved), { recursive: true });
fs.writeFileSync(outResolved, output, 'utf8');

console.log(`✓  ${lang} client written to ${outResolved}`);
console.log(`   namespace : ${manifest.namespace}`);
console.log(`   schemas   : ${manifest.schemas.map(s => s.name).join(', ')}`);
