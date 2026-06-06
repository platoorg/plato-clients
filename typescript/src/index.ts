export { generateTypeScript, generateDeclarations, generateRuntime } from './generators/typescript.js';
export type { Manifest, ManifestSchema, ManifestField, ManifestSuperset, FieldType, SchemaType } from './manifest.js';
export { expandManifest } from './expand.js';
export { syncManifest, exportManifest } from './sync.js';
export type { SyncManifest, SyncSchema, SyncField, SyncChange, SyncResult, SyncOptions, ExportOptions } from './sync.js';
// Preview-mode middleware. Re-exported from the root for ergonomics;
// importers preferring the side-loaded path can use
// `@platoorg/ts-client/preview`.
export {
  verifyPreviewToken,
  resolvePreview,
  withSnapshotSha,
  previewCookieName,
  PREVIEW_QUERY_PARAM,
} from './preview.js';
export type { PreviewClaims, VerifyResult, ResolvePreviewInput, ResolvePreviewResult } from './preview.js';

// Re-exported from generated output — run `npx plato-ts generate` to populate
export { PlatoClient } from '../generated/index.js';
