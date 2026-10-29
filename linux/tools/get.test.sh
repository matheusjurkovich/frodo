#!/bin/sh
set -u
HERE="$(cd "$(dirname "$0")" && pwd)"
GET="$HERE/../get.sh"
TMP="$(mktemp -d)"
FAILURES=0
trap 'rm -rf "$TMP"' EXIT

check() {
    if [ "$2" = "$3" ]; then
        printf 'ok   %s\n' "$1"
    else
        printf 'FAIL %s\n  esperado: %s\n  obtido:   %s\n' "$1" "$2" "$3"
        FAILURES=$((FAILURES + 1))
    fi
}

mkdir -p "$TMP/bin" "$TMP/rel/linux-v1.2.0" "$TMP/rel/linux-v1.1.0" "$TMP/rel/macos-v0.3.0"
for version in 1.2.0 1.1.0; do
    (cd "$TMP/rel" && printf '{}' > metadata.json && zip -q "linux-v$version/frodo-linux-$version.zip" metadata.json)
done
cat > "$TMP/bin/gnome-extensions" << 'STUB'
#!/bin/sh
printf 'gnome-extensions %s\n' "$*" >> "$CALLS"
[ "$1" = install ] && mkdir -p "$XDG_DATA_HOME/gnome-shell/extensions/frodo@matheusjurkovich.github.io/schemas"
exit 0
STUB
cat > "$TMP/bin/glib-compile-schemas" << 'STUB'
#!/bin/sh
printf 'glib-compile-schemas %s\n' "$*" >> "$CALLS"
STUB
chmod +x "$TMP/bin/gnome-extensions" "$TMP/bin/glib-compile-schemas"

release() {
    printf '{"tag_name":"%s","assets":[{"name":"%s","browser_download_url": "file://%s/rel/%s/%s"}]}' "$1" "$2" "$TMP" "$1" "$2"
}

run_get() {
    rm -f "$TMP/calls"
    env PATH="$TMP/bin:$PATH" HOME="$TMP/home" XDG_DATA_HOME="$TMP/data" CALLS="$TMP/calls" FRODO_RELEASES_URL="file://$TMP/releases.json" \
        sh "$GET" > "$TMP/out" 2> "$TMP/err"
}

DEST="$TMP/data/gnome-shell/extensions/frodo@matheusjurkovich.github.io"

printf '[%s,%s,%s]' "$(release macos-v0.3.0 frodo-macos-0.3.0.zip)" "$(release linux-v1.2.0 frodo-linux-1.2.0.zip)" \
    "$(release linux-v1.1.0 frodo-linux-1.1.0.zip)" > "$TMP/releases.json"
run_get
check "instala a release linux mais nova" "0" "$?"
check "passa o zip mais novo ao gnome-extensions" "1" "$(grep -c '^gnome-extensions install --force .*/frodo-linux-1.2.0.zip$' "$TMP/calls")"
check "compila o schema que o zip não traz" "glib-compile-schemas $DEST/schemas" "$(grep '^glib-compile-schemas' "$TMP/calls")"
check "liga a extensão" "1" "$(grep -c '^gnome-extensions enable frodo@matheusjurkovich.github.io$' "$TMP/calls")"
check "avisa a versão instalada" "1" "$(grep -c 'Frodo 1.2.0 instalado' "$TMP/out")"

rm -rf "$DEST"
printf '[%s]' "$(release macos-v0.3.0 frodo-macos-0.3.0.zip)" > "$TMP/releases.json"
run_get
check "sem release linux sai com erro" "1" "$([ "$?" -ne 0 ] && echo 1 || echo 0)"
check "explica que não achou release linux" "1" "$(grep -c 'nenhuma release linux encontrada' "$TMP/err")"
check "sem release linux não instala" "0" "$(cat "$TMP/calls" 2> /dev/null | grep -c '^gnome-extensions install')"

mkdir -p "$(dirname "$DEST")" "$TMP/dev-dist"
ln -s "$TMP/dev-dist" "$DEST"
printf '[%s]' "$(release linux-v1.2.0 frodo-linux-1.2.0.zip)" > "$TMP/releases.json"
run_get
check "instalação de desenvolvimento sai com erro" "1" "$([ "$?" -ne 0 ] && echo 1 || echo 0)"
check "aponta para o install.sh" "1" "$(grep -c 'install.sh' "$TMP/err")"
check "não sobrescreve o link" "0" "$(cat "$TMP/calls" 2> /dev/null | grep -c '^gnome-extensions')"

rm -f "$DEST"
rm -f "$TMP/releases.json"
run_get
check "falha de rede sai com erro" "1" "$([ "$?" -ne 0 ] && echo 1 || echo 0)"
check "falha de rede diz que não leu as releases" "1" "$(grep -c 'não consegui ler as releases' "$TMP/err")"

[ "$FAILURES" -eq 0 ] || exit 1
