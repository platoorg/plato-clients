// @platoorg/ts-client — stub
// Run `npx plato-ts generate` to generate the typed client from your manifest.
export interface PlatoItem {
  id: string;
  created_at: string;
  updated_at: string;
}

export declare class PlatoClient {
  constructor(baseUrl: string, namespace: string, apiKey?: string);
  fetchSchema(schema: string): Promise<PlatoItem | PlatoItem[]>;
  fetchContent(id: string): Promise<PlatoItem>;
}
