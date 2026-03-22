#!/usr/bin/env bash
set -euo pipefail
DIR="$(cd "$(dirname "$0")" && pwd)"
LANG_ROOT="$(cd "$DIR/.." && pwd)"
UPDATE=0
for arg in "$@"; do [[ "$arg" == "--update" ]] && UPDATE=1; done

TMPDIR_GEN="$(mktemp -d /tmp/plato-gen.XXXXXX)"
trap 'rm -rf "$TMPDIR_GEN"' EXIT

node "$LANG_ROOT/dist/cli.js" generate "$DIR/fixture.json" --out-dir="$TMPDIR_GEN"

if [[ "$UPDATE" -eq 1 ]]; then
  cp "$TMPDIR_GEN/index.d.ts" "$DIR/snapshot.d.ts"
  cp "$TMPDIR_GEN/index.js"   "$DIR/snapshot.js"
  echo "UPDATED typescript snapshots"
  exit 0
fi

norm() { grep -iv -e '^# generated' -e '^// generated' -e '^// code generated' "$1" | sed 's/[[:space:]]*$//' || true; }

PASS=1

if diff <(norm "$DIR/snapshot.d.ts") <(norm "$TMPDIR_GEN/index.d.ts") > /dev/null; then
  echo "PASS  typescript (.d.ts)"
else
  echo "FAIL  typescript (.d.ts)"
  diff <(norm "$DIR/snapshot.d.ts") <(norm "$TMPDIR_GEN/index.d.ts") | head -40 || true
  PASS=0
fi

if diff <(norm "$DIR/snapshot.js") <(norm "$TMPDIR_GEN/index.js") > /dev/null; then
  echo "PASS  typescript (.js)"
else
  echo "FAIL  typescript (.js)"
  diff <(norm "$DIR/snapshot.js") <(norm "$TMPDIR_GEN/index.js") | head -40 || true
  PASS=0
fi

[[ "$PASS" -eq 1 ]] || exit 1
