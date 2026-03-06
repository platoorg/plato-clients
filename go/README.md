# plato-codegen (Go)

A single-file CLI tool that reads a `plato-manifest.json` and emits an idiomatic Go client
package (`package plato`) ready to drop into any project.

Uses only the Go standard library. No external dependencies.

---

## Install

```bash
cd /platoHub/plato-clients/go
go build -o plato-codegen .
```

---

## Usage

```
./plato-codegen [manifest] [output]
```

| Argument   | Default               | Description                        |
|------------|-----------------------|------------------------------------|
| `manifest` | `plato-manifest.json` | Path to the Plato manifest file    |
| `output`   | `plato-client.go`     | Path for the generated Go file     |

---

## Examples

**Use defaults (manifest and output in current directory):**
```bash
./plato-codegen
```

**Custom manifest path, default output:**
```bash
./plato-codegen ./config/my-manifest.json
```

**Both custom manifest and output path:**
```bash
./plato-codegen ./config/my-manifest.json ./pkg/plato/plato-client.go
```

---

## What gets generated

Given the following `plato-manifest.json`:

```json
{
  "namespace": "website",
  "public": true,
  "schemas": [
    {
      "name": "homepage",
      "type": "singleton",
      "fields": [
        { "name": "hero_title",    "type": "string", "required": true },
        { "name": "hero_subtitle", "type": "string" },
        { "name": "hero_image",    "type": "media" }
      ]
    },
    {
      "name": "post",
      "type": "collection",
      "fields": [
        { "name": "title",        "type": "string", "required": true },
        { "name": "body",         "type": "string" },
        { "name": "published_at", "type": "date" },
        { "name": "cover",        "type": "media" },
        { "name": "tags",         "type": "relation_many" }
      ]
    }
  ]
}
```

The generator produces `plato-client.go` containing:

### Base struct (embedded in every content type)

```go
type PlatoItem struct {
    ID        string `json:"id"`
    CreatedAt string `json:"created_at"`
    UpdatedAt string `json:"updated_at"`
}
```

### Content structs

```go
// Homepage is a singleton.
type Homepage struct {
    PlatoItem
    HeroTitle    string  `json:"hero_title"`
    HeroSubtitle *string `json:"hero_subtitle,omitempty"`
    HeroImage    *string `json:"hero_image,omitempty"` // media asset URL
}

// Post is a collection item.
type Post struct {
    PlatoItem
    Title       string   `json:"title"`
    Body        *string  `json:"body,omitempty"`
    PublishedAt *string  `json:"published_at,omitempty"` // ISO 8601
    Cover       *string  `json:"cover,omitempty"`        // media asset URL
    Tags        []string `json:"tags"`                   // IDs of related items
}
```

### Params struct (collections only)

```go
type PostParams struct {
    Title       *string
    Body        *string
    PublishedAt *string
    Cover       *string
    Tags        *string
}
```

### Client constructor

```go
client := plato.NewPlatoClient("https://api.plato.io", "website", "your-api-key")
```

### Singleton method signatures

```go
func (c *PlatoClient) GetHomepage() (*Homepage, error)
func (c *PlatoClient) UpdateHomepage(update map[string]any) (*Homepage, error)
```

### Collection method signatures

```go
func (c *PlatoClient) ListPost(params *PostParams) ([]Post, error)
func (c *PlatoClient) GetPost(id string) (*Post, error)
func (c *PlatoClient) CreatePost(data map[string]any) (*Post, error)
func (c *PlatoClient) UpdatePost(id string, data map[string]any) (*Post, error)
func (c *PlatoClient) DeletePost(id string) error
```

---

## Field type mapping

| Plato type      | Go type (required) | Go type (optional) | Notes                    |
|-----------------|--------------------|--------------------|--------------------------|
| `string`        | `string`           | `*string`          |                          |
| `number`        | `float64`          | `*float64`         |                          |
| `boolean`       | `bool`             | `*bool`            |                          |
| `date`          | `string`           | `*string`          | ISO 8601 formatted       |
| `media`         | `string`           | `*string`          | Media asset URL          |
| `relation_one`  | `string`           | `*string`          | ID of related item       |
| `relation_many` | `[]string`         | `[]string`         | IDs (slice, never pointer)|

---

## API path slugs

Schema names with underscores are converted to hyphenated slugs for API paths:

| Schema name    | API path segment |
|----------------|-----------------|
| `post`         | `post`          |
| `demo_counter` | `demo-counter`  |
| `blog_post`    | `blog-post`     |
