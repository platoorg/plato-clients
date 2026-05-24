#!/usr/bin/env bash
set -euo pipefail
DIR="$(cd "$(dirname "$0")" && pwd)"
LANG_ROOT="$(cd "$DIR/.." && pwd)"
UPDATE=0
for arg in "$@"; do [[ "$arg" == "--update" ]] && UPDATE=1; done

GENERATED="$(mktemp /tmp/snapshot.XXXXXX.ex)"
trap 'rm -f "$GENERATED"' EXIT

# Unit tests
(cd "$LANG_ROOT" && mix test --no-color)

(cd "$LANG_ROOT" && mix escript.build --no-color >/dev/null 2>&1 && "$LANG_ROOT/plato_client" "$DIR/fixture.json" "$GENERATED")

if [[ "$UPDATE" -eq 1 ]]; then
  cp "$GENERATED" "$DIR/snapshot.ex"
  echo "UPDATED elixir snapshot"
  exit 0
fi

norm() { grep -iv -e '^# generated' -e '^// generated' -e '^// code generated' "$1" | sed 's/[[:space:]]*$//' || true; }
if diff <(norm "$DIR/snapshot.ex") <(norm "$GENERATED") > /dev/null; then
  echo "PASS  elixir"
else
  echo "FAIL  elixir"
  diff <(norm "$DIR/snapshot.ex") <(norm "$GENERATED") | head -40 || true
  exit 1
fi
