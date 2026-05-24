export type FieldType =
  | 'string'
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
  schemas: ManifestSchema[];
  supersets?: ManifestSuperset[];
}
