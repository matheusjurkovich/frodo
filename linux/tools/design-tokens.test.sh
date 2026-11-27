#!/bin/sh
set -eu
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
DESIGN="$ROOT/DESIGN.md"
CSS="${1:-$ROOT/linux/stylesheet.css}"
ALLOWED="$(mktemp)"
trap 'rm -f "$ALLOWED"' EXIT

front="$(sed -n '2,/^---$/p' "$DESIGN")"
section() { printf '%s\n' "$front" | sed -n "/^$1:/,/^[a-z]/p"; }
colors() { grep -oiE '#[0-9a-f]{6}\b|rgba?\([^)]*\)' | tr 'A-F' 'a-f' | tr -d ' ' | sort -u; }
pixels() { grep -oE '[0-9]+px|\b0\b' | sed 's/px$//' | sort -un; }

failed=0
check() {
    printf '%s\n' "$3" > "$ALLOWED"
    extra="$(printf '%s\n' "$2" | grep -vxF -f "$ALLOWED" || true)"
    if [ -n "$extra" ]; then
        printf '%s fora do DESIGN.md em %s:\n%s\n' "$1" "$CSS" "$extra" >&2
        failed=1
    fi
}

check "Cor" "$(colors < "$CSS")" "$(section colors | colors)"
check "Tamanho de fonte" "$(grep -oE 'font-size: *[^;]+' "$CSS" | sed 's/font-size: *//' | sort -u)" \
    "$(section typography | grep -oE 'fontSize: "[^"]+"' | sed 's/fontSize: "\(.*\)"/\1/' | sort -u)"
check "Raio (px)" "$(grep -oE 'border-radius: *[^;]+' "$CSS" | sed 's/border-radius: *//' | pixels)" \
    "$(section rounded | grep -oE '"[^"]+"' | tr -d '"' | pixels)"

[ "$failed" = 0 ] && echo "design-tokens: ok"
exit "$failed"
