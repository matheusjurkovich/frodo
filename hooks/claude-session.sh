#!/bin/sh
dir="${XDG_RUNTIME_DIR:-/run/user/$(id -u)}/frodo/sessions"
mkdir -p "$dir" || exit 0
input=$(cat)
id=$(printf '%s' "$input" | grep -o '"session_id" *: *"[A-Za-z0-9-]*"' | head -n 1 | sed 's/.*"\([A-Za-z0-9-]*\)"$/\1/')
[ -n "$id" ] || exit 0
case ${CLAUDE_PID:-x} in *[!0-9]*) pid=null ;; *) pid=$CLAUDE_PID ;; esac
tmp="$dir/$id.json.$$"
printf '{"pid":%s,"event":%s}\n' "$pid" "$input" > "$tmp" && mv -f "$tmp" "$dir/$id.json" || rm -f "$tmp"
exit 0
