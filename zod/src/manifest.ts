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
   * Mark a string/text field as translated. Stored as a per-locale map
   * `{en: "...", de: "..."}` on the server; reads flatten by
   * `?locale=<code>` (or namespace default); `?locale=*` returns the
   * raw map; writes accept either shape.
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
  fields: ManifestField[];
  extends?: string[];
}

export interface Manifest {
  namespace: string;
  public: boolean;
  /** ISO 639-1 codes the namespace supports. Empty/undefined = no localization. */
  supported_languages?: string[];
  /** Locale used when reads omit `?locale=` and as the fallback target. Must be in supported_languages. */
  default_language?: string;
  schemas: ManifestSchema[];
  supersets?: ManifestSuperset[];
}
