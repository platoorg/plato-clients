#!/usr/bin/env node
/**
 * plato-ts — generate a typed Plato client from a manifest
 *
 * Commands:
 *   plato-ts generate [manifest] [--out-dir=PATH]
 *     Generate client into node_modules/@platoorg/ts-client/generated/ (default)
 *     or a custom directory via --out-dir.
 *     Manifest defaults to plato-manifest.json.
 *
 * Legacy:
 *   plato-ts [manifest] [output]
 *     Write a single .ts file to `output` (old behaviour, still supported).
 *
 * Examples:
 *   npx plato-ts generate
 *   npx plato-ts generate path/to/.plato-manifest
 *   npx plato-ts generate --out-dir=./src/lib/plato
 */
import fs   from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { generateDeclarations, generateRuntime, generateTypeScript } from './generators/typescript.js';
import type { Manifest } from './manifest.js';

// ── Arg parsing ───────────────────────────────────────────────────────────────

const rawArgs = process.argv.slice(2);
const args    = rawArgs.filter(a => !a.startsWith('--'));
const flags   = Object.fromEntries(
  rawArgs
    .filter(a => a.startsWith('--'))
    .map(a => a.slice(2).split('=') as [string, string]),
);

const isGenerate = args[0] === 'generate';

// ── Helpers ───────────────────────────────────────────────────────────────────

function loadManifest(manifestPath: string | undefined): { manifest: Manifest; resolved: string } {
  const candidates = manifestPath
    ? [manifestPath]
    : ['plato-manifest.json'];

  for (const candidate of candidates) {
    const resolved = path.resolve(candidate);
    if (fs.existsSync(resolved)) {
      try {
        const manifest = JSON.parse(fs.readFileSync(resolved, 'utf8')) as Manifest;
        return { manifest, resolved };
      } catch (err) {
        console.error(`✗  failed to parse manifest: ${(err as Error).message}`);
        process.exit(1);
      }
    }
  }

  if (manifestPath) {
    console.error(`✗  manifest not found: ${path.resolve(manifestPath)}`);
  } else {
    console.error('✗  no manifest found: plato-manifest.json');
    console.error('   export one with: plato-sync --export > plato-manifest.json');
  }
  process.exit(1);
}

// ── generate subcommand ───────────────────────────────────────────────────────

if (isGenerate) {
  const manifestArg = args[1]; // optional
  const { manifest, resolved: manifestResolved } = loadManifest(manifestArg);

  // Default output: <package-root>/generated/
  const __filename  = fileURLToPath(import.meta.url);
  const packageRoot = path.resolve(path.dirname(__filename), '..');
  const outDir      = flags['out-dir']
    ? path.resolve(flags['out-dir'])
    : path.join(packageRoot, 'generated');

  fs.mkdirSync(outDir, { recursive: true });

  const dts = generateDeclarations(manifest);
  const js  = generateRuntime(manifest);

  fs.writeFileSync(path.join(outDir, 'index.d.ts'), dts, 'utf8');
  fs.writeFileSync(path.join(outDir, 'index.js'),   js,  'utf8');

  console.log(`✓  plato client generated`);
  console.log(`   manifest  : ${manifestResolved}`);
  console.log(`   output    : ${outDir}`);
  console.log(`   namespace : ${manifest.namespace ?? '(none)'}`);
  console.log(`   schemas   : ${manifest.schemas.map(s => s.name).join(', ')}`);
  process.exit(0);
}

// ── legacy: plato-ts [manifest] [output] ─────────────────────────────────────

const manifestArg  = args[0];
const defaultOut   = 'plato-client.ts';
const outputPath   = args[1] ?? defaultOut;

const { manifest, resolved: manifestResolved } = loadManifest(manifestArg);

const output      = generateTypeScript(manifest);
const outResolved = path.resolve(outputPath);
fs.mkdirSync(path.dirname(outResolved), { recursive: true });
fs.writeFileSync(outResolved, output, 'utf8');

console.log(`✓  typescript client written to ${outResolved}`);
console.log(`   namespace : ${manifest.namespace}`);
console.log(`   schemas   : ${manifest.schemas.map(s => s.name).join(', ')}`);
