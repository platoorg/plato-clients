# plato-codegen

A Rust CLI tool that reads a `plato-manifest.json` file and emits an idiomatic Rust client (`plato_client.rs`) ready to drop into any project that needs to talk to a Plato API.

---

## Install

```bash
cd /path/to/plato-clients/rust
cargo build --release
# Binary available at: ./target/release/plato-codegen
```

Run the tests:

```bash
cargo test
```

---

## Usage

```
plato-codegen [MANIFEST] [OUTPUT]
```

| Argument   | Default               | Description                              |
|------------|-----------------------|------------------------------------------|
| `MANIFEST` | `plato-manifest.json` | Path to the JSON manifest file to read   |
| `OUTPUT`   | `plato_client.rs`     | Path for the generated Rust source file  |

---

## Examples

**Example 1 — Use all defaults (manifest in current directory):**

```bash
./target/release/plato-codegen
# Reads:  ./plato-manifest.json
# Writes: ./plato_client.rs
```

**Example 2 — Custom manifest path, default output:**

```bash
./target/release/plato-codegen config/my-manifest.json
# Reads:  config/my-manifest.json
# Writes: ./plato_client.rs
```

**Example 3 — Custom manifest and custom output path:**

```bash
./target/release/plato-codegen config/website.json src/generated/plato_client.rs
# Reads:  config/website.json
# Writes: src/generated/plato_client.rs
```

---

## What gets generated

Given this manifest:

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
        { "name": "tags",         "type": "relation_many" }
      ]
    }
  ]
}
```

The generator emits a `plato_client.rs` containing:

### Structs

```rust
/// Homepage is a singleton.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub struct Homepage {
    pub id: String,
    pub created_at: String,
    pub updated_at: String,
    pub hero_title: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub hero_subtitle: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub hero_image: Option<String>, // media asset URL
}

/// Post is a collection item.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub struct Post {
    pub id: String,
    pub created_at: String,
    pub updated_at: String,
    pub title: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub body: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub published_at: Option<String>, // ISO 8601 date string
    pub tags: Vec<String>,            // IDs of related items
}

/// Query parameters for filtering/searching Post.
#[derive(Debug, Default)]
pub struct PostParams {
    pub title:        Option<String>,
    pub body:         Option<String>,
    pub published_at: Option<String>,
    pub tags:         Option<String>,
}
```

### Client and impl signatures

```rust
pub struct PlatoClient { ... }

impl PlatoClient {
    pub fn new(base_url, namespace, api_key) -> Self;

    // Singleton methods
    pub fn get_homepage(&self)                                           -> Result<Option<Homepage>, reqwest::Error>;
    pub fn update_homepage(&self, data: &HashMap<String, Value>)        -> Result<Homepage, Box<dyn Error>>;

    // Collection methods
    pub fn list_post(&self, params: Option<PostParams>)                 -> Result<Vec<Post>, reqwest::Error>;
    pub fn get_post(&self, id: &str)                                    -> Result<Post, reqwest::Error>;
    pub fn create_post(&self, data: &HashMap<String, Value>)            -> Result<Post, reqwest::Error>;
    pub fn update_post(&self, id: &str, data: &HashMap<String, Value>)  -> Result<Post, reqwest::Error>;
    pub fn delete_post(&self, id: &str)                                 -> Result<(), reqwest::Error>;
}
```

---

## Field type mapping

| Plato type      | Rust type (required) | Rust type (optional)    | Notes                       |
|-----------------|----------------------|-------------------------|-----------------------------|
| `string`        | `String`             | `Option<String>`        |                             |
| `number`        | `f64`                | `Option<f64>`           |                             |
| `boolean`       | `bool`               | `Option<bool>`          |                             |
| `date`          | `String`             | `Option<String>`        | ISO 8601 date string        |
| `media`         | `String`             | `Option<String>`        | Media asset URL             |
| `relation_one`  | `String`             | `Option<String>`        | ID of related item          |
| `relation_many` | `Vec<String>`        | `Vec<String>`           | Always Vec, never Option    |

---

## Dependencies needed in the consuming crate

The generated `plato_client.rs` uses `reqwest` (blocking), `serde`, and `serde_json`. Add these to the `Cargo.toml` of whichever project you copy the generated file into:

```toml
[dependencies]
serde     = { version = "1", features = ["derive"] }
serde_json = "1"
reqwest   = { version = "0.12", features = ["blocking", "json"] }
```

The `plato-codegen` binary itself only depends on `serde` and `serde_json` — `reqwest` is not needed to run the generator.
