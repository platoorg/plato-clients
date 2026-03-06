export type FieldType =
  | 'string'
  | 'number'
  | 'boolean'
  | 'date'
  | 'media'
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
  type: SchemaType;
  fields: ManifestField[];
}

export interface Manifest {
  namespace: string;
  public: boolean;
  schemas: ManifestSchema[];
}
