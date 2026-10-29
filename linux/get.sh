#!/bin/sh
set -eu
UUID=frodo@matheusjurkovich.github.io
RELEASES="${FRODO_RELEASES_URL:-https://api.github.com/repos/matheusjurkovich/frodo/releases}"
DEST="${XDG_DATA_HOME:-$HOME/.local/share}/gnome-shell/extensions/$UUID"

fail() {
    printf 'frodo: %s\n' "$1" >&2
    exit 1
}

[ -L "$DEST" ] && fail "instalação de desenvolvimento em $DEST; atualize com o install.sh ou apague o link"

JSON="$(curl -fsSL "$RELEASES")" || fail "não consegui ler as releases em $RELEASES"
URL="$(printf '%s' "$JSON" | grep -o '"browser_download_url": *"[^"]*/linux-v[^/"]*/frodo-linux-[^/"]*\.zip"' | head -n 1 | sed 's/.*"\([^"]*\)"$/\1/')"
[ -n "$URL" ] || fail "nenhuma release linux encontrada"
ZIP_NAME="${URL##*/}"
VERSION="${ZIP_NAME#frodo-linux-}"
VERSION="${VERSION%.zip}"

TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT
curl -fsSL -o "$TMP/$ZIP_NAME" "$URL" || fail "não consegui baixar $URL"
gnome-extensions install --force "$TMP/$ZIP_NAME"
[ -f "$DEST/schemas/gschemas.compiled" ] || glib-compile-schemas "$DEST/schemas"
gnome-extensions enable "$UUID" 2> /dev/null || true
printf 'Frodo %s instalado. Saia e entre na sessão para carregar.\n' "$VERSION"
