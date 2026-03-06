#!/usr/bin/env bash
set -euo pipefail
DIR="$(cd "$(dirname "$0")" && pwd)"
LANG_ROOT="$(cd "$DIR/.." && pwd)"
UPDATE=0
for arg in "$@"; do [[ "$arg" == "--update" ]] && UPDATE=1; done

GENERATED="$(mktemp /tmp/snapshot.XXXXXX.rs)"
trap 'rm -f "$GENERATED"' EXIT

(cd "$LANG_ROOT" && cargo build --release --quiet && "$LANG_ROOT/target/release/plato-codegen" "$DIR/fixture.json" "$GENERATED")

if [[ "$UPDATE" -eq 1 ]]; then
  cp "$GENERATED" "$DIR/snapshot.rs"
  echo "UPDATED rust snapshot"
  exit 0
fi

norm() { grep -iv -e '^# generated' -e '^// generated' -e '^// code generated' "$1" | sed 's/[[:space:]]*$//' || true; }
if diff <(norm "$DIR/snapshot.rs") <(norm "$GENERATED") > /dev/null; then
  echo "PASS  rust"
else
  echo "FAIL  rust"
  diff <(norm "$DIR/snapshot.rs") <(norm "$GENERATED") | head -40 || true
  exit 1
fi
