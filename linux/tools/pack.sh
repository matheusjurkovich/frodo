#!/bin/sh
set -eu
VERSION="${1:?uso: pack.sh <versão>}"
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
ZIP="$ROOT/frodo-linux-$VERSION.zip"
STAGE="$(mktemp -d)"
trap 'rm -rf "$STAGE"' EXIT
cp -a "$ROOT/dist/." "$STAGE/"
rm -f "$STAGE/schemas/gschemas.compiled"
jq --arg version "$VERSION" '. + {"version-name": $version}' "$ROOT/dist/metadata.json" > "$STAGE/metadata.json"
rm -f "$ZIP"
(cd "$STAGE" && zip -qr "$ZIP" .)
LIST="$(zipinfo "$ZIP")"
fail() {
    echo "pack: $1" >&2
    rm -f "$ZIP"
    exit 1
}
echo "$LIST" | grep -qE 'gschemas\.compiled|\.map$' && fail "arquivo que não vai no pacote"
echo "$LIST" | grep -qE ' extension\.js$' || fail "falta extension.js"
echo "$LIST" | grep -qE ' schemas/org\.gnome\.shell\.extensions\.frodo\.gschema\.xml$' || fail "falta o schema"
echo "$LIST" | grep -qE '^-rwx.* hooks/claude-session\.sh$' || fail "hooks/claude-session.sh não está executável"
echo "$ZIP"
