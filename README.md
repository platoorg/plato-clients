# plato-clients

Language-specific clients for Plato CMS. Each folder is a self-contained
tool written in and for that language — pick your folder, follow its README.

## Available clients

| Language     | Folder         | Install / run                              |
|--------------|----------------|--------------------------------------------|
| TypeScript   | `typescript/`  | `npm install` · `npx plato-codegen`        |
| Zod          | `zod/`         | `npm install` · `npx plato-codegen-zod`   |
| Go           | `go/`          | `go build` · `./plato-codegen`             |
| Rust         | `rust/`        | `cargo build --release` · `./target/release/plato-codegen` |
| Ruby         | `ruby/`        | `gem build` · `ruby exe/plato-codegen`     |
| Elixir       | `elixir/`      | `mix escript.build` · `./plato_codegen`    |

## How they work

Every client is a **code generator**: point it at your `plato-manifest.json` and
it writes an idiomatic, fully-typed client in the target language.

```
plato-manifest.json  ──▶  plato-codegen  ──▶  plato-client.ts   (typescript)
plato-manifest.json  ──▶  plato-codegen  ──▶  plato-client.ts   (zod)
plato-manifest.json  ──▶  plato-codegen  ──▶  plato-client.go   (go)
plato-manifest.json  ──▶  plato-codegen  ──▶  plato_client.rs   (rust)
plato-manifest.json  ──▶  plato-codegen  ──▶  plato_client.rb   (ruby)
plato-manifest.json  ──▶  plato-codegen  ──▶  plato_client.ex   (elixir)
```

Each generator is written **in its own language** — the TypeScript generator
is a TypeScript program, the Go generator is a Go program, and so on.
No cross-language tooling required.

## Adding a new language

1. Create a folder named after the language: `<language>/`
2. Write the generator in that language
3. Add a `README.md` to the folder documenting install, usage, and output
4. Add a row to the table above
