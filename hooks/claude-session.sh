#!/bin/sh
dir="${XDG_RUNTIME_DIR:-/run/user/$(id -u)}/frodo/sessions"
mkdir -p "$dir" || exit 0
input=$(cat)
id=$(printf '%s' "$input" | sed -n 's/.*"session_id" *: *"\([A-Za-z0-9-]*\)".*/\1/p' | head -n 1)
[ -n "$id" ] || exit 0
case ${CLAUDE_PID:-x} in *[!0-9]*) pid=null ;; *) pid=$CLAUDE_PID ;; esac
printf '{"pid":%s,"event":%s}\n' "$pid" "$input" > "$dir/$id.json.$$" && mv -f "$dir/$id.json.$$" "$dir/$id.json"
exit 0
