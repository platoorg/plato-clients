# plato-clients — local test runner (Docker, mirrors GitHub Actions exactly)
# Usage:
#   just test              # run all languages
#   just test-typescript   # run one language
#   just update-snapshots  # regenerate all snapshots
#   just clean-cache       # remove all dependency cache volumes

default: test

REPO := justfile_directory()

# ── Images (kept in sync with .github/workflows/test.yml) ────────────────────

IMAGE_TS     := "node:20-slim"
IMAGE_ZOD    := "node:20-slim"
IMAGE_GO     := "golang:1.26-bookworm"
IMAGE_RUBY   := "ruby:3.3-slim"
IMAGE_ELIXIR := "hexpm/elixir:1.19.3-erlang-27.3.4.4-debian-bookworm-20260223-slim"
IMAGE_RUST   := "rust:1-slim-bookworm"

# ── Cache volumes (persist between runs, only exist locally) ──────────────────
#
# Each volume caches the dependency layer that is expensive to rebuild:
#   typescript / zod  →  node_modules    (npm install)
#   go                →  module cache + build cache
#   elixir            →  _build + deps   (mix deps + escript.build)
#   rust              →  cargo registry + target dir  (cargo build --release)
#   ruby              →  no heavy deps, no cache needed

CACHE_TS_MODULES  := "plato-clients-ts-modules"
CACHE_ZOD_MODULES := "plato-clients-zod-modules"
CACHE_GO_MOD      := "plato-clients-go-mod"
CACHE_GO_BUILD    := "plato-clients-go-build"
CACHE_ELIXIR_BUILD := "plato-clients-elixir-build"
CACHE_ELIXIR_DEPS  := "plato-clients-elixir-deps"
CACHE_RUST_CARGO  := "plato-clients-rust-cargo"
CACHE_RUST_TARGET := "plato-clients-rust-target"

# ── Helpers ───────────────────────────────────────────────────────────────────

APT := "apt-get update -qq && apt-get install -y --no-install-recommends git ca-certificates"

# Run all language tests in Docker
test: test-typescript test-zod test-go test-ruby test-elixir test-rust

# Update all snapshots from current generator output
update-snapshots: _update-typescript _update-zod _update-go _update-ruby _update-elixir _update-rust

# Remove all local dependency cache volumes
clean-cache:
    docker volume rm -f \
        {{CACHE_TS_MODULES}} \
        {{CACHE_ZOD_MODULES}} \
        {{CACHE_GO_MOD}} \
        {{CACHE_GO_BUILD}} \
        {{CACHE_ELIXIR_BUILD}} \
        {{CACHE_ELIXIR_DEPS}} \
        {{CACHE_RUST_CARGO}} \
        {{CACHE_RUST_TARGET}}

# ── Per-language test recipes ─────────────────────────────────────────────────

test-typescript:
    docker run --rm \
        -v {{REPO}}:/work \
        -v {{CACHE_TS_MODULES}}:/work/typescript/node_modules \
        -w /work {{IMAGE_TS}} bash -c "\
        {{APT}} && \
        cd typescript && npm install && npm run build && npm test && \
        bash tests/run.sh"

test-zod:
    docker run --rm \
        -v {{REPO}}:/work \
        -v {{CACHE_ZOD_MODULES}}:/work/zod/node_modules \
        -w /work {{IMAGE_ZOD}} bash -c "\
        {{APT}} && \
        cd zod && npm install && npm run build && \
        bash tests/run.sh"

test-go:
    docker run --rm \
        -v {{REPO}}:/work \
        -v {{CACHE_GO_MOD}}:/go/pkg/mod \
        -v {{CACHE_GO_BUILD}}:/root/.cache/go-build \
        -w /work {{IMAGE_GO}} bash -c "\
        {{APT}} && \
        bash go/tests/run.sh"

test-ruby:
    docker run --rm \
        -v {{REPO}}:/work \
        -w /work {{IMAGE_RUBY}} bash -c "\
        {{APT}} && \
        bash ruby/tests/run.sh"

test-elixir:
    docker run --rm \
        -v {{REPO}}:/work \
        -v {{CACHE_ELIXIR_DEPS}}:/work/elixir/deps \
        -v {{CACHE_ELIXIR_BUILD}}:/work/elixir/_build \
        -w /work {{IMAGE_ELIXIR}} bash -c "\
        {{APT}} && \
        bash elixir/tests/run.sh"

test-rust:
    docker run --rm \
        -v {{REPO}}:/work \
        -v {{CACHE_RUST_CARGO}}:/usr/local/cargo/registry \
        -v {{CACHE_RUST_TARGET}}:/work/rust/target \
        -w /work {{IMAGE_RUST}} bash -c "\
        {{APT}} && \
        bash rust/tests/run.sh"

# ── Snapshot update recipes ───────────────────────────────────────────────────

_update-typescript:
    docker run --rm \
        -v {{REPO}}:/work \
        -v {{CACHE_TS_MODULES}}:/work/typescript/node_modules \
        -w /work {{IMAGE_TS}} bash -c "\
        {{APT}} && \
        cd typescript && npm install && npm run build && \
        bash tests/run.sh --update"

_update-zod:
    docker run --rm \
        -v {{REPO}}:/work \
        -v {{CACHE_ZOD_MODULES}}:/work/zod/node_modules \
        -w /work {{IMAGE_ZOD}} bash -c "\
        {{APT}} && \
        cd zod && npm install && npm run build && \
        bash tests/run.sh --update"

_update-go:
    docker run --rm \
        -v {{REPO}}:/work \
        -v {{CACHE_GO_MOD}}:/go/pkg/mod \
        -v {{CACHE_GO_BUILD}}:/root/.cache/go-build \
        -w /work {{IMAGE_GO}} bash -c "\
        {{APT}} && \
        bash go/tests/run.sh --update"

_update-ruby:
    docker run --rm \
        -v {{REPO}}:/work \
        -w /work {{IMAGE_RUBY}} bash -c "\
        {{APT}} && \
        bash ruby/tests/run.sh --update"

_update-elixir:
    docker run --rm \
        -v {{REPO}}:/work \
        -v {{CACHE_ELIXIR_DEPS}}:/work/elixir/deps \
        -v {{CACHE_ELIXIR_BUILD}}:/work/elixir/_build \
        -w /work {{IMAGE_ELIXIR}} bash -c "\
        {{APT}} && \
        bash elixir/tests/run.sh --update"

_update-rust:
    docker run --rm \
        -v {{REPO}}:/work \
        -v {{CACHE_RUST_CARGO}}:/usr/local/cargo/registry \
        -v {{CACHE_RUST_TARGET}}:/work/rust/target \
        -w /work {{IMAGE_RUST}} bash -c "\
        {{APT}} && \
        bash rust/tests/run.sh --update"
