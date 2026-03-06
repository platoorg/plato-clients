#!/usr/bin/env bash
set -euo pipefail
DIR="$(cd "$(dirname "$0")" && pwd)"
LANG_ROOT="$(cd "$DIR/.." && pwd)"
UPDATE=0
for arg in "$@"; do [[ "$arg" == "--update" ]] && UPDATE=1; done

GENERATED="$(mktemp /tmp/snapshot.XXXXXX.ts)"
trap 'rm -f "$GENERATED"' EXIT

node "$LANG_ROOT/dist/cli.js" "$DIR/fixture.json" "$GENERATED"

if [[ "$UPDATE" -eq 1 ]]; then
  cp "$GENERATED" "$DIR/snapshot.ts"
  echo "UPDATED typescript snapshot"
  exit 0
fi

norm() { grep -iv -e '^# generated' -e '^// generated' -e '^// code generated' "$1" | sed 's/[[:space:]]*$//' || true; }
if diff <(norm "$DIR/snapshot.ts") <(norm "$GENERATED") > /dev/null; then
  echo "PASS  typescript"
else
  echo "FAIL  typescript"
  diff <(norm "$DIR/snapshot.ts") <(norm "$GENERATED") | head -40 || true
  exit 1
fi
