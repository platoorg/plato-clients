import type { Manifest, ManifestField, ManifestSuperset } from './manifest.js';

const BUILTIN_SUPERSETS: ManifestSuperset[] = [
  {
    name: 'page',
    description: 'Canonical website page: titled, slugged, markdown body, SEO meta description, hero image with responsive variants.',
    fields: [
      { name: 'title', type: 'string', required: true, is_title: true },
      { name: 'body', type: 'string' },
      { name: 'meta_description', type: 'string' },
      { name: 'cover_image', type: 'media' },
    ],
  },
];

export function expandManifest(manifest: Manifest): Manifest {
  const supersetMap = new Map<string, ManifestSuperset>();
  for (const s of BUILTIN_SUPERSETS) {
    supersetMap.set(s.name, s);
  }
  for (const s of manifest.supersets ?? []) {
    supersetMap.set(s.name, s);
  }

  const schemas = manifest.schemas.map(schema => {
    const merged: ManifestField[] = [];
    const indexByName = new Map<string, number>();

    const apply = (fields: ManifestField[]) => {
      for (const field of fields) {
        if (indexByName.has(field.name)) {
          merged[indexByName.get(field.name)!] = field;
        } else {
          indexByName.set(field.name, merged.length);
          merged.push(field);
        }
      }
    };

    for (const name of schema.extends ?? []) {
      const superset = supersetMap.get(name);
      if (!superset) {
        console.warn(`plato: unknown superset "${name}" referenced by schema "${schema.name}" — skipping`);
        continue;
      }
      apply(superset.fields);
    }
    apply(schema.fields);

    return { ...schema, fields: merged, extends: [] };
  });

  return { ...manifest, schemas };
}
