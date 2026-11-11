#!/bin/sh
set -eu
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
HEADLESS_LIB="$ROOT/tools/headless.sh"
. "$HEADLESS_LIB"
headless_prepare "$ROOT"
cat > "$TMP/inner.sh" << 'INNER'
. "$HEADLESS_LIB"
headless_start_shell --headless --virtual-monitor 1440x900
gnome-extensions enable "$EXTENSION_ID"
headless_wait_active
sleep 2
gnome-extensions disable "$EXTENSION_ID"
sleep 1
gnome-extensions enable "$EXTENSION_ID"
headless_wait_active
sleep 1
LC_ALL=C gnome-extensions info "$EXTENSION_ID" > "$TMP/info.txt" 2>&1
kill "$SHELL_PID"
wait "$SHELL_PID" 2> /dev/null || true
INNER
headless_run "$TMP/inner.sh" > /dev/null 2>&1
STATE="$(sed -n 's/^ *State: //p' "$TMP/info.txt")"
ERRORS="$(headless_errors | wc -l)"
echo "estado: $STATE"
echo "erros do frodo: $ERRORS"
if [ "$STATE" = "ACTIVE" ] && [ "$ERRORS" = "0" ]; then
    rm -rf "$TMP"
else
    echo "log: $TMP/shell.log"
    exit 1
fi
