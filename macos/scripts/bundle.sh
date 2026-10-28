#!/bin/sh
set -eu
HERE="$(cd "$(dirname "$0")/.." && pwd)"
ROOT="$(cd "$HERE/.." && pwd)"
VERSION="${FRODO_VERSION:-0.1.0}"
OUT="${FRODO_OUT:-$HERE/dist}"
IDENTITY="${FRODO_SIGN_IDENTITY:--}"
APP="$OUT/Frodo.app"
TRIPLES="${FRODO_TRIPLES:-arm64-apple-macosx14.0 x86_64-apple-macosx14.0}"

cd "$HERE"
rm -rf "$OUT"
mkdir -p "$OUT"
BINARIES=""
for triple in $TRIPLES; do
    swift build -c release --triple "$triple"
    cp "$(swift build -c release --triple "$triple" --show-bin-path)/Frodo" "$OUT/Frodo-$triple"
    BINARIES="$BINARIES $OUT/Frodo-$triple"
done
# shellcheck disable=SC2086
lipo -create $BINARIES -output "$OUT/Frodo-universal"
rm -f $BINARIES

mkdir -p "$APP/Contents/MacOS" "$APP/Contents/Resources/hooks"
mv "$OUT/Frodo-universal" "$APP/Contents/MacOS/Frodo"
cp -R "$ROOT/shared/icons" "$APP/Contents/Resources/icons"
cp "$ROOT/shared/hooks/claude-session.sh" "$APP/Contents/Resources/hooks/claude-session.sh"
chmod +x "$APP/Contents/Resources/hooks/claude-session.sh"
sed "s/__VERSION__/$VERSION/g" "$HERE/Resources/Info.plist" > "$APP/Contents/Info.plist"

"$APP/Contents/MacOS/Frodo" --icon "$OUT/AppIcon.iconset"
iconutil -c icns "$OUT/AppIcon.iconset" -o "$APP/Contents/Resources/AppIcon.icns"
rm -rf "$OUT/AppIcon.iconset"

if [ "$IDENTITY" = "-" ]; then
    codesign --force --deep --options runtime --entitlements "$HERE/Resources/Frodo.entitlements" --sign - "$APP"
else
    codesign --force --deep --options runtime --timestamp --entitlements "$HERE/Resources/Frodo.entitlements" --sign "$IDENTITY" "$APP"
fi
codesign --verify --deep --strict "$APP"

STAGING="$OUT/dmg"
mkdir -p "$STAGING"
cp -R "$APP" "$STAGING/Frodo.app"
ln -s /Applications "$STAGING/Applications"
hdiutil create -volname "Frodo" -srcfolder "$STAGING" -ov -format UDZO "$OUT/Frodo-$VERSION.dmg" > /dev/null
rm -rf "$STAGING"
echo "$OUT/Frodo-$VERSION.dmg"
