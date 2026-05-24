#!/usr/bin/env bash
set -euo pipefail
DIR="$(cd "$(dirname "$0")" && pwd)"
LANG_ROOT="$(cd "$DIR/.." && pwd)"
UPDATE=0
for arg in "$@"; do [[ "$arg" == "--update" ]] && UPDATE=1; done

GENERATED="$(mktemp /tmp/snapshot.XXXXXX.rb)"
trap 'rm -f "$GENERATED"' EXIT

# Unit tests
ruby "$LANG_ROOT/tests/superset_test.rb"

ruby "$LANG_ROOT/exe/plato-client" "$DIR/fixture.json" "$GENERATED"

if [[ "$UPDATE" -eq 1 ]]; then
  cp "$GENERATED" "$DIR/snapshot.rb"
  echo "UPDATED ruby snapshot"
  exit 0
fi

norm() { grep -iv -e '^# generated' -e '^// generated' -e '^// code generated' "$1" | sed 's/[[:space:]]*$//' || true; }
if diff <(norm "$DIR/snapshot.rb") <(norm "$GENERATED") > /dev/null; then
  echo "PASS  ruby"
else
  echo "FAIL  ruby"
  diff <(norm "$DIR/snapshot.rb") <(norm "$GENERATED") | head -40 || true
  exit 1
fi
