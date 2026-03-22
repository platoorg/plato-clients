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
}

export interface ManifestSchema {
  name: string;
  slug?: string;
  type?: SchemaType;
  singleton?: boolean;  // alternative to type: 'singleton'
  managed?: boolean;    // organisational-only; excluded from codegen
  fields: ManifestField[];
}

export interface Manifest {
  namespace?: string;
  public?: boolean;
  schemas: ManifestSchema[];
}
