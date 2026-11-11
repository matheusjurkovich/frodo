#!/bin/sh
set -eu
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
HEADLESS_LIB="$ROOT/tools/headless.sh"
. "$HEADLESS_LIB"
headless_prepare "$ROOT"
cat > "$TMP/inner.sh" << 'INNER'
. "$HEADLESS_LIB"
headless_start_shell --devkit
gnome-extensions enable "$EXTENSION_ID"
echo "barramento: $DBUS_SESSION_BUS_ADDRESS"
wait "$SHELL_PID" 2> /dev/null || true
INNER
headless_run "$TMP/inner.sh"
echo "log: $TMP/shell.log"
headless_errors
