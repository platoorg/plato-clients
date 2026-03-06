# plato_codegen

A zero-dependency Ruby code generator that reads a `plato-manifest.json` and
emits a fully-typed, idiomatic Ruby 3+ client file (`plato_client.rb`).

The generated client uses only the Ruby standard library (`json`, `net/http`,
`uri`) — no gems required at runtime.

---

## Install

### From source (recommended during development)

```bash
# Run directly without installing
bundle exec ruby exe/plato-codegen
# or
ruby exe/plato-codegen
```

### As a gem

```bash
gem build plato_codegen.gemspec
gem install plato_codegen-0.1.0.gem
plato-codegen                          # now on PATH
```

---

## Usage

```
ruby exe/plato-codegen [manifest_path] [output_path]
```

| Argument        | Default               | Description                         |
|-----------------|-----------------------|-------------------------------------|
| `manifest_path` | `plato-manifest.json` | Path to the Plato manifest file     |
| `output_path`   | `plato_client.rb`     | Destination for the generated client|

---

## Examples

### Example 1 — use defaults

```bash
# plato-manifest.json present in cwd, writes plato_client.rb
ruby exe/plato-codegen
```

```
done  ruby client written to /your/project/plato_client.rb
      namespace : website
      schemas   : homepage, post
```

### Example 2 — custom manifest path

```bash
ruby exe/plato-codegen config/my-manifest.json
```

### Example 3 — custom manifest and output paths

```bash
ruby exe/plato-codegen config/my-manifest.json app/lib/cms_client.rb
```

---

## What gets generated

Given a manifest with a `homepage` singleton and a `post` collection, the
generator emits a `plato_client.rb` structured as follows.

### Structs (one per schema)

```ruby
module Plato
  # singleton — homepage
  Homepage = Struct.new(:id, :created_at, :updated_at,
                        :hero_title, :hero_subtitle, :hero_image,
                        keyword_init: true) do
    # @return [String] hero_title (required)
    # @return [String, nil] hero_subtitle
    # @return [String, nil] hero_image  media asset URL
  end

  # collection — post
  Post = Struct.new(:id, :created_at, :updated_at,
                    :title, :body, :published_at, :tags,
                    keyword_init: true) do
    # @return [String] title (required)
    # @return [String, nil] body
    # @return [String, nil] published_at  ISO 8601 date string
    # @return [Array<String>] tags  IDs of related items
  end
end
```

### Client method signatures

```ruby
client = Plato::Client.new("http://localhost:6100", "website", "my-api-key")

# Singleton methods
client.get_homepage          # => Plato::Homepage | nil
client.update_homepage(attrs) # => Plato::Homepage

# Collection methods
client.list_post(page: 1)    # => Array<Plato::Post>
client.get_post(id)          # => Plato::Post
client.create_post(attrs)    # => Plato::Post
client.update_post(id, attrs) # => Plato::Post
client.delete_post(id)       # => nil
```

---

## Manifest schema

```json
{
  "namespace": "website",
  "public": true,
  "schemas": [
    {
      "name": "homepage",
      "type": "singleton",
      "fields": [
        { "name": "hero_title", "type": "string", "required": true },
        { "name": "hero_subtitle", "type": "string" },
        { "name": "hero_image", "type": "media" }
      ]
    },
    {
      "name": "post",
      "type": "collection",
      "fields": [
        { "name": "title", "type": "string", "required": true },
        { "name": "body", "type": "string" },
        { "name": "published_at", "type": "date" },
        { "name": "tags", "type": "relation_many" }
      ]
    }
  ]
}
```

---

## Field type mapping

| Plato type      | Ruby type             | Notes                      |
|-----------------|-----------------------|----------------------------|
| `string`        | `String`              |                            |
| `number`        | `Numeric`             |                            |
| `boolean`       | `TrueClass/FalseClass`|                            |
| `date`          | `String`              | ISO 8601 date string       |
| `media`         | `String`              | media asset URL            |
| `relation_one`  | `String`              | ID of related item         |
| `relation_many` | `Array<String>`       | IDs of related items       |

---

## API path convention

Schema names with underscores are converted to hyphens for API path slugs:

| Schema name    | API slug       |
|----------------|----------------|
| `homepage`     | `homepage`     |
| `demo_counter` | `demo-counter` |
| `blog_post`    | `blog-post`    |

Method names always use `snake_case` (matching the schema name as-is).
