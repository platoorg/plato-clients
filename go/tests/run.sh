#!/usr/bin/env bash
set -euo pipefail
DIR="$(cd "$(dirname "$0")" && pwd)"
LANG_ROOT="$(cd "$DIR/.." && pwd)"
UPDATE=0
for arg in "$@"; do [[ "$arg" == "--update" ]] && UPDATE=1; done

GENERATED="$(mktemp /tmp/snapshot.XXXXXX.go)"
trap 'rm -f "$GENERATED"' EXIT

(cd "$LANG_ROOT" && go build -buildvcs=false -o /tmp/plato-client-go . && /tmp/plato-client-go "$DIR/fixture.json" "$GENERATED")

if [[ "$UPDATE" -eq 1 ]]; then
  cp "$GENERATED" "$DIR/snapshot.go"
  echo "UPDATED go snapshot"
  exit 0
fi

norm() { grep -iv -e '^# generated' -e '^// generated' -e '^// code generated' "$1" | sed 's/[[:space:]]*$//' || true; }
if diff <(norm "$DIR/snapshot.go") <(norm "$GENERATED") > /dev/null; then
  echo "PASS  go"
else
  echo "FAIL  go"
  diff <(norm "$DIR/snapshot.go") <(norm "$GENERATED") | head -40 || true
  exit 1
fi
