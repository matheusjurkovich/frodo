#!/bin/sh
set -eu
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
TMP="$(mktemp -d)"
mkdir -p "$TMP/data/gnome-shell/extensions" "$TMP/config" "$TMP/cache" "$TMP/Desktop"
ln -s "$ROOT/dist" "$TMP/data/gnome-shell/extensions/frodo@matheusjurkovich"
cat > "$TMP/inner.sh" << 'INNER'
#!/bin/sh
gnome-shell --devkit --wayland --no-x11 --mode=ubuntu > "$TMP/shell.log" 2>&1 &
PID=$!
i=0
until gdbus introspect --session --dest org.gnome.Shell --object-path /org/gnome/Shell > /dev/null 2>&1; do
    i=$((i + 1))
    [ "$i" -gt 60 ] && break
    sleep 0.5
done
gnome-extensions enable frodo@matheusjurkovich
echo "barramento: $DBUS_SESSION_BUS_ADDRESS"
wait "$PID" 2> /dev/null || true
INNER
chmod +x "$TMP/inner.sh"
env HOME="$TMP" XDG_DATA_HOME="$TMP/data" XDG_CONFIG_HOME="$TMP/config" XDG_CACHE_HOME="$TMP/cache" GSETTINGS_BACKEND=memory FRODO_RUNTIME_DIR="$TMP/frodo" TMP="$TMP" \
    dbus-run-session -- "$TMP/inner.sh"
echo "log: $TMP/shell.log"
grep -v '^DING' "$TMP/shell.log" | grep -iE 'frodo@matheusjurkovich/|(JS ERROR|JS WARNING|CRITICAL).*frodo' || true
