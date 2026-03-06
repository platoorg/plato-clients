#!/usr/bin/env bash
# tests/run.sh — run every plato-client generator and validate output against snapshots.
#
# Usage:
#   ./tests/run.sh            # run tests
#   ./tests/run.sh --update   # regenerate snapshots
#
# Exit code: 0 if all tests passed, 1 if any failed.

set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
TESTS="$ROOT/tests"
FIXTURE="$TESTS/fixture.json"
SNAPSHOTS="$TESTS/snapshots"
UPDATE=0
ONLY=""

for arg in "$@"; do
  case "$arg" in
    --update) UPDATE=1 ;;
    --only=*) ONLY="${arg#--only=}" ;;
  esac
done

PASS=0
FAIL=0
SKIP=0

TMPDIR_WORK="$(mktemp -d)"
trap 'rm -rf "$TMPDIR_WORK"' EXIT

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

# normalize <file>  — strips dynamic lines (timestamps) so diffs are stable.
normalize() {
  grep -v \
    -e '^# generated : [0-9]' \
    -e '^# Generated at: ' \
    "$1"
}

# run_test <label> <snapshot_file> <cmd...>
#   Runs <cmd...> with two trailing args: $FIXTURE and $TMPDIR_WORK/<snapshot_file>.
#   On --update, copies the generated file to SNAPSHOTS.
run_test() {
  local label="$1"
  local snapshot_name="$2"
  shift 2

  if [[ -n "$ONLY" && "$label" != "$ONLY" ]]; then
    return
  fi
  local snapshot_file="$SNAPSHOTS/$snapshot_name"
  local generated="$TMPDIR_WORK/$snapshot_name"

  # Run the generator
  if ! "$@" "$FIXTURE" "$generated" >/dev/null 2>&1; then
    echo "FAIL  $label  (generator exited with error)"
    FAIL=$((FAIL + 1))
    return
  fi

  if [[ "$UPDATE" -eq 1 ]]; then
    cp "$generated" "$snapshot_file"
    echo "UPDATED  $label  → $snapshot_file"
    return
  fi

  if [[ ! -f "$snapshot_file" ]]; then
    echo "FAIL  $label  (no snapshot at $snapshot_file — run with --update to create it)"
    FAIL=$((FAIL + 1))
    return
  fi

  # Compare (normalized to strip dynamic content like timestamps)
  local norm_snap norm_gen
  norm_snap="$(normalize "$snapshot_file")"
  norm_gen="$(normalize "$generated")"

  if [[ "$norm_snap" == "$norm_gen" ]]; then
    echo "PASS  $label"
    PASS=$((PASS + 1))
  else
    echo "FAIL  $label"
    diff <(echo "$norm_snap") <(echo "$norm_gen") | head -40
    FAIL=$((FAIL + 1))
  fi
}

# skip_test <label> <reason>
skip_test() {
  [[ -n "$ONLY" && "$1" != "$ONLY" ]] && return
  echo "SKIP  $1  ($2)"
  SKIP=$((SKIP + 1))
}

# ---------------------------------------------------------------------------
# Tests
# ---------------------------------------------------------------------------

echo "plato-clients test run"
echo "  fixture : $FIXTURE"
echo "  mode    : $([ "$UPDATE" -eq 1 ] && echo 'update snapshots' || echo 'verify snapshots')$([ -n "$ONLY" ] && echo " (only: $ONLY)" || true)"
echo ""

# TypeScript
if command -v node >/dev/null 2>&1; then
  run_test "typescript" "typescript.ts" \
    node "$ROOT/typescript/dist/cli.js"
else
  skip_test "typescript" "node not found"
fi

# Zod
if command -v node >/dev/null 2>&1; then
  run_test "zod" "zod.ts" \
    node "$ROOT/zod/dist/cli.js"
else
  skip_test "zod" "node not found"
fi

# Go — always build from source when the toolchain is available so the binary
# matches the current OS/arch.  Fall back to a pre-built binary only when the
# toolchain is absent (e.g. in a stripped CI image that ships the binary).
if command -v go >/dev/null 2>&1; then
  (cd "$ROOT/go" && go build -o plato-codegen . >/dev/null 2>&1)
  run_test "go" "go.go" \
    "$ROOT/go/plato-codegen"
elif [[ -x "$ROOT/go/plato-codegen" ]] && "$ROOT/go/plato-codegen" --help >/dev/null 2>&1; then
  run_test "go" "go.go" \
    "$ROOT/go/plato-codegen"
else
  skip_test "go" "go toolchain not found and pre-built binary is not runnable on this platform"
fi

# Rust — same pattern: build from source when cargo is available.
if command -v cargo >/dev/null 2>&1; then
  (cd "$ROOT/rust" && cargo build --release --quiet 2>/dev/null)
  run_test "rust" "rust.rs" \
    "$ROOT/rust/target/release/plato-codegen"
elif [[ -x "$ROOT/rust/target/release/plato-codegen" ]] && \
     "$ROOT/rust/target/release/plato-codegen" --help >/dev/null 2>&1; then
  run_test "rust" "rust.rs" \
    "$ROOT/rust/target/release/plato-codegen"
else
  skip_test "rust" "cargo not found and no runnable pre-built binary"
fi

# Ruby
if command -v ruby >/dev/null 2>&1; then
  run_test "ruby" "ruby.rb" \
    ruby "$ROOT/ruby/exe/plato-codegen"
else
  skip_test "ruby" "ruby not found"
fi

# Elixir  (build escript on demand if not present)
if [[ -x "$ROOT/elixir/plato_codegen" ]]; then
  run_test "elixir" "elixir.ex" \
    "$ROOT/elixir/plato_codegen"
elif command -v mix >/dev/null 2>&1; then
  (cd "$ROOT/elixir" && mix escript.build --no-color >/dev/null 2>&1)
  run_test "elixir" "elixir.ex" \
    "$ROOT/elixir/plato_codegen"
else
  skip_test "elixir" "mix not found and no pre-built escript"
fi

# ---------------------------------------------------------------------------
# Summary
# ---------------------------------------------------------------------------

echo ""
echo "Results: $PASS passed · $FAIL failed · $SKIP skipped"

if [[ "$FAIL" -gt 0 ]]; then
  exit 1
fi
