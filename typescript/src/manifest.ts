export type FieldType =
  | 'string'
  | 'text'
  | 'number'
  | 'boolean'
  | 'date'
  | 'media'
  | 'richtext'
  | 'relation_one'
  | 'relation_many';

export type SchemaType = 'singleton' | 'collection';

export interface ManifestField {
  name: string;
  type: FieldType;
  required?: boolean;
  is_title?: boolean;
  /**
   * Mark a string/text field as translated. Values are stored as a
   * per-locale map `{en: "...", de: "..."}` on the server. Reads with
   * `?locale=<code>` (or the namespace's default) flatten to a scalar;
   * reads with `?locale=*` return the raw map. Writes accept either a
   * scalar (writes to the active locale) or a full map.
   */
  localized?: boolean;
}

export interface ManifestSuperset {
  name: string;
  description?: string;
  fields: ManifestField[];
}

export interface ManifestSchema {
  name: string;
  slug?: string;
  type?: SchemaType;
  singleton?: boolean;  // alternative to type: 'singleton'
  managed?: boolean;    // organisational-only; excluded from codegen
  fields: ManifestField[];
  extends?: string[];
}

export interface Manifest {
  namespace?: string;
  public?: boolean;
  /**
   * ISO 639-1 codes the namespace supports. When set, every field
   * marked `localized: true` validates against this list and reads
   * gain a `?locale=<code>` parameter. Empty / undefined = no
   * localization for this namespace.
   */
  supported_languages?: string[];
  /**
   * Locale used when reads omit `?locale=` and the fallback target
   * when a requested locale has no value. Must be one of
   * `supported_languages`.
   */
  default_language?: string;
  schemas: ManifestSchema[];
  supersets?: ManifestSuperset[];
}
