#!/bin/sh
if [ -n "${FRODO_RUNTIME_DIR:-}" ]; then
    root=$FRODO_RUNTIME_DIR
elif [ -n "${XDG_RUNTIME_DIR:-}" ]; then
    root="$XDG_RUNTIME_DIR/frodo"
elif [ "$(uname)" = Darwin ]; then
    root="$HOME/Library/Application Support/Frodo/run"
else
    root="/run/user/$(id -u)/frodo"
fi
dir="$root/sessions"
mkdir -p "$dir" || exit 0
input=$(cat)
id=$(printf '%s' "$input" | grep -o '"session_id" *: *"[A-Za-z0-9-]*"' | head -n 1 | sed 's/.*"\([A-Za-z0-9-]*\)"$/\1/')
[ -n "$id" ] || exit 0
case ${CLAUDE_PID:-x} in *[!0-9]*) pid=null ;; *) pid=$CLAUDE_PID ;; esac
session="$dir/$id.json"
tmp="$session.$$"
printf '{"pid":%s,"event":%s}\n' "$pid" "$input" > "$tmp" && mv -f "$tmp" "$session" || rm -f "$tmp"

printf '%s' "$input" | grep -q '"hook_event_name" *: *"PermissionRequest"' || exit 0
tool=$(printf '%s' "$input" | grep -o '"tool_name" *: *"[A-Za-z0-9_.:-]*"' | head -n 1 | sed 's/.*"\([A-Za-z0-9_.:-]*\)"$/\1/')
[ -n "$tool" ] || exit 0

[ -f "$root/alive" ] || exit 0
read -r alive_pid alive_name < "$root/alive"
case $alive_pid in '' | *[!0-9]*) exit 0 ;; esac
kill -0 "$alive_pid" 2> /dev/null || exit 0
if [ -n "${alive_name:-}" ]; then
    running=$(ps -p "$alive_pid" -o comm= 2> /dev/null)
    [ "${running##*/}" = "$alive_name" ] || exit 0
fi

now_ms() {
    value=$(date +%s%3N)
    case $value in *[!0-9]*) value="$(date +%s)000" ;; esac
    printf '%s' "$value"
}

mkdir -p "$root/pending" "$root/decisions" || exit 0
request="$$-$(date +%s)"
pending="$root/pending/$id.$request.json"
decision="$root/decisions/$id.$request.json"
trap 'rm -f "$pending" "$decision"' EXIT
trap 'exit 0' INT TERM HUP
printf '{"pid":%s,"tool":"%s","since":%s}\n' "$$" "$tool" "$(now_ms)" > "$pending.tmp" && mv -f "$pending.tmp" "$pending" || exit 0

if [ "${CLAUDE_CODE_ENTRYPOINT:-}" = claude-desktop ]; then wait=${FRODO_WAIT_SECONDS:-590}; else wait=${FRODO_TERMINAL_WAIT_SECONDS:-15}; fi
ticks=$((wait * 4))
while [ "$ticks" -gt 0 ]; do
    sleep 0.25
    ticks=$((ticks - 1))
    [ -f "$pending" ] || exit 0
    if [ -f "$decision" ]; then
        answer=$(cat "$decision")
        rm -f "$decision"
        case $answer in
            '{"behavior":"allow"}')
                printf '%s\n' '{"hookSpecificOutput":{"hookEventName":"PermissionRequest","decision":{"behavior":"allow"}}}'
                exit 0
                ;;
            '{"behavior":"deny"}')
                printf '%s\n' '{"hookSpecificOutput":{"hookEventName":"PermissionRequest","decision":{"behavior":"deny","message":"Negado pela ilha do Frodo."}}}'
                exit 0
                ;;
        esac
    fi
    if [ "$session" -nt "$pending" ] && ! grep -q '"hook_event_name" *: *"\(PermissionRequest\|Notification\)"' "$session"; then exit 0; fi
done
exit 0
