EXTENSION_ID=frodo@matheusjurkovich.github.io

headless_prepare() {
    TMP="$(mktemp -d)"
    mkdir -p "$TMP/data/gnome-shell/extensions" "$TMP/config" "$TMP/cache" "$TMP/Desktop"
    ln -s "$1/dist" "$TMP/data/gnome-shell/extensions/$EXTENSION_ID"
}

headless_run() {
    inner=$1
    shift
    env HOME="$TMP" XDG_DATA_HOME="$TMP/data" XDG_CONFIG_HOME="$TMP/config" XDG_CACHE_HOME="$TMP/cache" GSETTINGS_BACKEND=memory \
        FRODO_RUNTIME_DIR="$TMP/frodo" TMP="$TMP" HEADLESS_LIB="$HEADLESS_LIB" "$@" \
        dbus-run-session -- sh "$inner"
}

headless_start_shell() {
    gnome-shell "$@" --wayland --no-x11 --mode=ubuntu > "$TMP/shell.log" 2>&1 &
    SHELL_PID=$!
    i=0
    until gdbus introspect --session --dest org.gnome.Shell --object-path /org/gnome/Shell > /dev/null 2>&1; do
        i=$((i + 1))
        [ "$i" -gt 60 ] && break
        sleep 0.5
    done
}

headless_wait_active() {
    i=0
    until LC_ALL=C gnome-extensions info "$EXTENSION_ID" 2> /dev/null | grep -q '^ *State: ACTIVE$'; do
        i=$((i + 1))
        [ "$i" -gt 40 ] && break
        sleep 0.25
    done
}

headless_errors() {
    grep -v '^DING' "$TMP/shell.log" | grep -iE 'frodo@matheusjurkovich\.github\.io/|(JS ERROR|JS WARNING|CRITICAL).*frodo' || true
}
