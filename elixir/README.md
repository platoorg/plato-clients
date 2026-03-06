# plato_codegen

An Elixir Mix escript that reads a `plato-manifest.json` file and emits a
fully-typed, idiomatic Elixir client module (`plato_client.ex`).

The generated client uses only Erlang/OTP stdlib (`:httpc`, `:json`) — no
runtime dependencies are added to your project.

---

## Install

```bash
cd elixir/
mix deps.get        # no external deps, this is a no-op but keeps workflow consistent
mix escript.build   # produces ./plato_codegen
```

---

## Usage

```
./plato_codegen [manifest_path] [output_path]
```

| Argument        | Default               | Description                              |
|-----------------|-----------------------|------------------------------------------|
| `manifest_path` | `plato-manifest.json` | Path to the Plato manifest JSON file     |
| `output_path`   | `plato_client.ex`     | Path to write the generated Elixir file  |

---

## Examples

### Example 1 — use all defaults

```bash
./plato_codegen
# Reads  ./plato-manifest.json
# Writes ./plato_client.ex
```

### Example 2 — custom manifest, default output

```bash
./plato_codegen config/my-manifest.json
# Reads  ./config/my-manifest.json
# Writes ./plato_client.ex
```

### Example 3 — fully explicit paths

```bash
./plato_codegen manifests/website.json lib/generated/plato_client.ex
# Reads  ./manifests/website.json
# Writes ./lib/generated/plato_client.ex
```

---

## What gets generated

Given the following manifest:

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
        { "name": "hero_subtitle", "type": "string" }
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

The generator emits a single `plato_client.ex` containing:

### `PlatoClient` — config struct and constructor

```elixir
defmodule PlatoClient do
  @enforce_keys [:base_url, :namespace]

  defstruct [:base_url, :namespace, :api_key]

  @type t :: %__MODULE__{
          base_url:  String.t(),
          namespace: String.t(),
          api_key:   String.t() | nil
        }

  @spec new(String.t(), String.t(), String.t() | nil) :: t()
  def new(base_url, namespace, api_key \\ nil) do
    %__MODULE__{base_url: base_url, namespace: namespace, api_key: api_key}
  end
  ...
end
```

### `PlatoClient.Homepage` — singleton schema struct

```elixir
defmodule PlatoClient.Homepage do
  @enforce_keys [:id, :created_at, :updated_at, :hero_title]

  defstruct [
    :id,
    :created_at,
    :updated_at,
    :hero_title,
    hero_subtitle: nil
  ]

  @type t :: %__MODULE__{
          id:            String.t(),
          created_at:    String.t(),
          updated_at:    String.t(),
          hero_title:    String.t(),
          hero_subtitle: String.t() | nil
        }

  @spec from_map(map()) :: t()
  def from_map(map) do ... end
end
```

### `PlatoClient.Post` — collection schema struct

```elixir
defmodule PlatoClient.Post do
  @type t :: %__MODULE__{
          id:           String.t(),
          created_at:   String.t(),
          updated_at:   String.t(),
          title:        String.t(),
          body:         String.t() | nil,
          published_at: String.t() | nil,
          tags:         list(String.t()) | nil
        }
  ...
end
```

### Function signatures on `PlatoClient`

For the **singleton** `homepage`:

```elixir
@spec get_homepage(t())         :: {:ok, PlatoClient.Homepage.t()} | {:error, term()}
@spec update_homepage(t(), map()) :: {:ok, PlatoClient.Homepage.t()} | {:error, term()}
```

For the **collection** `post`:

```elixir
@spec list_post(t(), keyword())           :: {:ok, list(PlatoClient.Post.t())} | {:error, term()}
@spec get_post(t(), String.t())           :: {:ok, PlatoClient.Post.t()} | {:error, term()}
@spec create_post(t(), map())             :: {:ok, PlatoClient.Post.t()} | {:error, term()}
@spec update_post(t(), String.t(), map()) :: {:ok, PlatoClient.Post.t()} | {:error, term()}
@spec delete_post(t(), String.t())        :: :ok | {:error, term()}
```

### Using the generated client

```elixir
client = PlatoClient.new("https://api.plato.io", "website", "my-api-key")

# Singleton
{:ok, homepage} = PlatoClient.get_homepage(client)
IO.puts(homepage.hero_title)

{:ok, updated} = PlatoClient.update_homepage(client, %{hero_title: "New Title"})

# Collection
{:ok, posts} = PlatoClient.list_post(client, page: 1, per_page: 20)
{:ok, post}  = PlatoClient.get_post(client, "abc-123")
{:ok, new}   = PlatoClient.create_post(client, %{title: "Hello World"})
{:ok, edited} = PlatoClient.update_post(client, "abc-123", %{body: "Updated body"})
:ok           = PlatoClient.delete_post(client, "abc-123")
```

---

## Field type mapping

| Plato type      | Elixir typespec      | Notes                           |
|-----------------|----------------------|---------------------------------|
| `string`        | `String.t()`         |                                 |
| `number`        | `float()`            | Integers from JSON are coerced  |
| `boolean`       | `boolean()`          |                                 |
| `date`          | `String.t()`         | ISO 8601 date string            |
| `media`         | `String.t()`         | Media asset URL                 |
| `relation_one`  | `String.t()`         | ID of the related item          |
| `relation_many` | `list(String.t())`   | List of IDs of related items    |

Optional fields (those without `"required": true`) are typed as `T | nil` and
default to `nil` in the struct.

---

## API path convention

Schema names with underscores are converted to hyphenated slugs in URL paths:

| Schema name    | API path segment |
|----------------|------------------|
| `homepage`     | `/homepage`      |
| `blog_post`    | `/blog-post`     |
| `demo_counter` | `/demo-counter`  |

The full path for a collection item is:
`/{namespace}/{slug}/{id}` — e.g. `/website/blog-post/abc-123`

---

## Requirements

- **Elixir** 1.16 or later
- **OTP** 27 or later (required for the `:json` module used for JSON encoding/decoding)
- No external Hex dependencies — the generated client only uses `:httpc` and `:json` from the standard library
