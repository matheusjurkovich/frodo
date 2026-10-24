#!/bin/sh
set -e
DIR="$(cd "$(dirname "$0")" && pwd)"
DEST="$HOME/.local/share/gnome-shell/extensions/frodo@matheusjurkovich"
glib-compile-schemas "$DIR/schemas"
mkdir -p "$(dirname "$DEST")"
ln -sfn "$DIR" "$DEST"
echo "Instalado em $DEST"
