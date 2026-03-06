# @plato/client-zod

Generate Zod schemas, inferred TypeScript types, and a fully-typed fetch client
from a `plato-manifest.json`.

---

## Install

```bash
npm install
npm run build
```

---

## Usage

```
npx plato-codegen-zod [manifest] [output]
```

| Argument   | Default                | Description                        |
|------------|------------------------|------------------------------------|
| `manifest` | `plato-manifest.json`  | Path to the Plato manifest file    |
| `output`   | `plato-client.ts`      | Path to write the generated client |

> The generated file imports from `zod`, so the consuming project must have
> `zod` listed as a runtime dependency (`npm install zod`).

---

## Examples

**Use all defaults** — reads `plato-manifest.json` in the current directory and
writes `plato-client.ts`:

```bash
npx plato-codegen-zod
```

**Custom manifest path, default output**:

```bash
npx plato-codegen-zod src/lib/schemas/plato-manifest.json
```

**Custom manifest path and custom output path**:

```bash
npx plato-codegen-zod src/lib/schemas/plato-manifest.json src/lib/plato/generated.ts
```

---

## What gets generated

Given a manifest with a `homepage` singleton and a `post` collection, the tool
emits a single `plato-client.ts` file containing:

### Zod schemas + inferred types

```typescript
import { z } from 'zod';

// ── Base ─────────────────────────────────────────────────────
export const PlatoItemSchema = z.object({
  id: z.string(),
  created_at: z.string(),
  updated_at: z.string(),
});
export type PlatoItem = z.infer<typeof PlatoItemSchema>;

/** singleton */
export const HomepageSchema = PlatoItemSchema.extend({
  hero_title: z.string(),
  hero_subtitle: z.string().optional(),
  hero_image: z.string().url().optional(), // media asset URL
});
export type Homepage = z.infer<typeof HomepageSchema>;

/** collection */
export const PostSchema = PlatoItemSchema.extend({
  title: z.string(),
  body: z.string().optional(),
  published_at: z.string().optional(), // ISO 8601 date string
  tags: z.array(z.string()).optional(), // IDs of related items
});
export type Post = z.infer<typeof PostSchema>;
```

### Typed fetch client with runtime validation

Every method calls `Schema.parse()` on the raw API response before returning,
so shape mismatches throw a `ZodError` at runtime instead of silently passing
through as `unknown`.

```typescript
const client = new PlatoClient('https://api.plato.io', 'website', 'API_KEY');

// Singleton — parse validates the response before returning
const homepage = await client.getHomepage();        // Homepage | null
await client.updateHomepage({ hero_title: 'Hello' }); // Homepage

// Collection — list, get, create, update, delete
const posts  = await client.listPost({ title: 'Intro' }); // Post[]
const post   = await client.getPost('abc-123');            // Post
const newPost = await client.createPost({ title: 'Hi', tags: [] });
await client.updatePost('abc-123', { body: 'Updated' });
await client.deletePost('abc-123');
```

---

## Field type mapping

| Plato type      | Zod schema                  | Notes                    |
|-----------------|-----------------------------|--------------------------|
| `string`        | `z.string()`                |                          |
| `number`        | `z.number()`                |                          |
| `boolean`       | `z.boolean()`               |                          |
| `date`          | `z.string()`                | ISO 8601 date string     |
| `media`         | `z.string().url()`          | Media asset URL          |
| `relation_one`  | `z.string()`                | ID of related item       |
| `relation_many` | `z.array(z.string())`       | IDs of related items     |

Optional fields (those without `"required": true`) are wrapped with
`.optional()`, e.g. `z.string().optional()`.

---

## Runtime dependency note

The generated file contains `import { z } from 'zod';`. The project that
**uses** the generated client (not this generator) must install zod:

```bash
npm install zod
```

This generator itself does not bundle or depend on zod at runtime.
