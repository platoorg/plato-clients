export { generateTypeScript, generateDeclarations, generateRuntime } from './generators/typescript.js';
export type { Manifest, ManifestSchema, ManifestField, ManifestSuperset, FieldType, SchemaType } from './manifest.js';
export { expandManifest } from './expand.js';
export { syncManifest, exportManifest } from './sync.js';
export type { SyncManifest, SyncSchema, SyncField, SyncChange, SyncResult, SyncOptions, ExportOptions } from './sync.js';
// Re-exported from generated output — run `npx plato-ts generate` to populate
export { PlatoClient } from '../generated/index.js';
