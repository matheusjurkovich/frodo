#!/bin/sh
set -e
DIR="$(cd "$(dirname "$0")" && pwd)"
DEST="$HOME/.local/share/gnome-shell/extensions/frodo@matheusjurkovich.github.io"
cd "$DIR"
npm run build
OLD="$HOME/.local/share/gnome-shell/extensions/frodo@matheusjurkovich"
[ -L "$OLD" ] && rm "$OLD"
mkdir -p "$(dirname "$DEST")"
ln -sfn "$DIR/dist" "$DEST"
echo "Instalado em $DEST -> $DIR/dist"
