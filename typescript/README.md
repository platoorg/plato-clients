# plato-clients / typescript

A TypeScript code generator that reads a Plato `plato-manifest.json` and emits
a fully-typed, framework-agnostic TypeScript client.

## Install

```sh
npm install
npm run build
```

## Usage

```sh
npx plato-codegen [manifest] [output]
```

| Argument   | Default         | Description                        |
|------------|-----------------|------------------------------------|
| `manifest` | `plato-manifest.json` | Path to your Plato manifest file   |
| `output`   | `plato-client.ts`     | Where to write the generated file  |

### Examples

```sh
# Run from your project root — looks for plato-manifest.json by default
npx plato-codegen

# Custom manifest path
npx plato-codegen path/to/plato-manifest.json

# Explicit manifest and output
npx plato-codegen src/schemas/plato-manifest.json src/lib/plato/client.ts
```

## What gets generated

### Interfaces

One TypeScript interface per schema, extending a shared `PlatoItem` base.
Fields marked `required: true` in the manifest are non-optional.

```typescript
export interface PlatoItem {
  id: string;
  created_at: string;
  updated_at: string;
}

/** singleton */
export interface Homepage extends PlatoItem {
  hero_title: string;        // required
  hero_subtitle?: string;
  hero_image?: string;       // media asset URL
}

/** collection */
export interface Post extends PlatoItem {
  title: string;             // required
  body?: string;
  published_at?: string;     // ISO 8601 date string
  cover?: string;            // media asset URL
  author?: string;           // ID of related item
  tags?: string[];           // IDs of related items
}
```

### Filter param interfaces (collections only)

```typescript
export interface PostParams {
  title?: string;
  published_at?: string;
  // ... one key per field
}
```

### PlatoClient class

```typescript
const client = new PlatoClient(
  'http://localhost:6100',  // Plato base URL
  'my-namespace',           // namespace slug
  'your-api-key',           // optional — omit for public namespaces
);

// singletons
const home = await client.getHomepage();
await client.updateHomepage({ hero_title: 'New headline' });

// collections
const posts = await client.listPost({ published: 'true' });
const post  = await client.getPost('1234567890');
const newPost = await client.createPost({ title: 'Hello world', published: false });
await client.updatePost('1234567890', { title: 'Updated' });
await client.deletePost('1234567890');
```

## Field type mapping

| Plato type      | TypeScript type | Notes                    |
|-----------------|-----------------|--------------------------|
| `string`        | `string`        |                          |
| `number`        | `number`        |                          |
| `boolean`       | `boolean`       |                          |
| `date`          | `string`        | ISO 8601 date string     |
| `media`         | `string`        | media asset URL          |
| `relation_one`  | `string`        | ID of related item       |
| `relation_many` | `string[]`      | IDs of related items     |

## Using as a library

```typescript
import { generateTypeScript } from '@plato/client';
import type { Manifest } from '@plato/client';

const manifest: Manifest = JSON.parse(fs.readFileSync('plato-manifest.json', 'utf8'));
const code = generateTypeScript(manifest);
fs.writeFileSync('plato-client.ts', code);
```
