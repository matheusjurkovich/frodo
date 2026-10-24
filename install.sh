#!/bin/sh
set -e
DIR="$(cd "$(dirname "$0")" && pwd)"
DEST="$HOME/.local/share/gnome-shell/extensions/frodo@matheusjurkovich"
cd "$DIR"
npm run build
mkdir -p "$(dirname "$DEST")"
ln -sfn "$DIR/dist" "$DEST"
echo "Instalado em $DEST -> $DIR/dist"
