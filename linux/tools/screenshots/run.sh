#!/bin/sh
set -eu
DIR="$(cd "$(dirname "$0")" && pwd)"
ROOT="$(cd "$DIR/../.." && pwd)"
OUT="$ROOT/docs"
TMP="$(mktemp -d)"
mkdir -p "$TMP/data/gnome-shell/extensions" "$TMP/config" "$TMP/cache" "$TMP/Desktop" "$TMP/frames" "$OUT"
ln -s "$ROOT/dist" "$TMP/data/gnome-shell/extensions/frodo@matheusjurkovich.github.io"
cp -r "$DIR/probe" "$TMP/data/gnome-shell/extensions/probe@frodo"

ROLLOUTS="$TMP/.codex/sessions/$(date +%Y/%m/%d)"
mkdir -p "$ROLLOUTS"
NOW="$(date -u +%Y-%m-%dT%H:%M:%S.000Z)"
cat > "$ROLLOUTS/rollout-demo.jsonl" << JSON
{"timestamp":"$NOW","type":"session_meta","payload":{"id":"demo","cwd":"/home/demo/site"}}
{"timestamp":"$NOW","type":"turn_context","payload":{"model":"gpt-5-codex"}}
{"timestamp":"$NOW","type":"event_msg","payload":{"type":"token_count","info":{"total_token_usage":{"total_tokens":182000},"last_token_usage":{"input_tokens":150000,"cached_input_tokens":90000,"output_tokens":32000},"model_context_window":272000},"rate_limits":{"plan_type":"plus","primary":{"used_percent":42,"window_minutes":300,"resets_at":$(($(date +%s) + 7200))},"secondary":{"used_percent":18,"window_minutes":10080,"resets_at":$(($(date +%s) + 300000))}}}}
JSON

CALENDAR="$TMP/data/evolution/calendar/system"
mkdir -p "$CALENDAR"
at() { date -d "$1" +%Y%m%dT%H%M00; }
cat > "$CALENDAR/calendar.ics" << ICS
BEGIN:VCALENDAR
VERSION:2.0
PRODID:frodo-screenshots
BEGIN:VEVENT
UID:daily
DTSTART:$(at '+4 min')
DTEND:$(at '+34 min')
SUMMARY:Daily do time
DESCRIPTION:https://meet.google.com/abc-defg-hij
END:VEVENT
BEGIN:VEVENT
UID:design
DTSTART:$(at '+2 hour')
DTEND:$(at '+3 hour')
SUMMARY:Revisão de design
END:VEVENT
END:VCALENDAR
ICS

cat > "$TMP/inner.sh" << 'INNER'
#!/bin/sh
gnome-shell --headless --wayland --no-x11 --virtual-monitor 1440x900 --mode=ubuntu > "$TMP/shell.log" 2>&1 &
SHELL_PID=$!
i=0
until gdbus introspect --session --dest org.gnome.Shell --object-path /org/gnome/Shell > /dev/null 2>&1; do
    i=$((i + 1))
    [ "$i" -gt 60 ] && break
    sleep 0.5
done
gnome-extensions enable probe@frodo
gnome-extensions enable frodo@matheusjurkovich.github.io
sleep 4

ev() {
    gdbus call --session --dest org.gnome.Shell --object-path /org/gnome/Shell --method org.gnome.Shell.Eval "$1" | sed -n "s/^(true, '\"\{0,1\}\([^\"']*\)\"\{0,1\}')$/\1/p"
}
shot() {
    set -- "$1" $(ev "probe.box('$2', $3)")
    gdbus call --session --dest org.gnome.Shell --object-path /org/gnome/Shell/Screenshot --method org.gnome.Shell.Screenshot.ScreenshotArea \
        "$2" "$3" "$4" "$5" false "$OUT/$1.png" > /dev/null
}
tab() {
    ev "probe.press('$1')" > /dev/null
    sleep 1.5
}
hook() {
    printf '%s' "$1" | env CLAUDE_PID="$AGENT" sh "$ROOT/dist/hooks/claude-session.sh"
}
working() {
    hook "{\"session_id\":\"frodo\",\"cwd\":\"/home/demo/frodo\",\"hook_event_name\":\"PreToolUse\",\"tool_name\":\"Bash\",\"tool_input\":{\"command\":\"$1\"}}"
}

sleep 600 &
AGENT=$!
gjs -m "$DIR/mpris.js" "$DIR/cover.png" &
PLAYER=$!
hook '{"session_id":"frodo","cwd":"/home/demo/frodo","hook_event_name":"UserPromptSubmit","prompt":"rode os testes"}'
hook '{"session_id":"api","cwd":"/home/demo/api","hook_event_name":"UserPromptSubmit","prompt":"revise o pr"}'
hook '{"session_id":"api","cwd":"/home/demo/api","hook_event_name":"Stop"}'
sleep 3
ev 'probe.clearNotifications()' > /dev/null
ev 'probe.maskWifi()' > /dev/null
ev 'probe.away()' > /dev/null
sleep 8

gjs -m "$DIR/record.js" "$TMP/demo" 29 240 0 960 620 &
RECORDER=$!
sleep 1.5
notify-send -a Slack -i mail-unread 'Ana Souza' 'Subi a nova versão no staging, pode dar uma olhada?'
sleep 4
working 'npm test'
sleep 5.5
ev "probe.hover('frodo-pill')" > /dev/null
sleep 1.5
for name in Calendário IA Notificações Desempenho Geral; do
    tab "$name"
    sleep 0.9
done
ev 'probe.away()' > /dev/null
ev "probe.press('Recolher ilha')" > /dev/null
wait "$RECORDER"

sleep 2
shot pilula-repouso frodo-pill 14
notify-send -a Thunderbird -i mail-unread 'Fatura de outubro' 'Seu boleto vence na sexta-feira.'
sleep 1.2
shot pilula-notificacao frodo-pill 14
sleep 5
working 'npm run build'
sleep 1.2
shot pilula-claude frodo-pill 14
sleep 5
hook '{"session_id":"frodo","cwd":"/home/demo/frodo","hook_event_name":"PermissionRequest","tool_name":"Bash","tool_input":{"command":"git push"}}' &
sleep 1.5
shot pilula-permissao frodo-pill 14
pkill -f "$ROOT/dist/hooks/claude-session.sh"
hook '{"session_id":"frodo","cwd":"/home/demo/frodo","hook_event_name":"PostToolUse","tool_name":"Bash"}'
sleep 6

ev "probe.hover('frodo-pill')" > /dev/null
sleep 1.5
shot geral frodo-panel 24
for name in Calendário Áreas IA Notificações Desempenho; do
    tab "$name"
    shot "$(printf '%s' "$name" | iconv -f utf-8 -t ascii//TRANSLIT | tr '[:upper:]' '[:lower:]')" frodo-panel 24
done
tab 'Configurações da ilha'
shot configuracoes frodo-panel 24

kill "$AGENT" "$PLAYER" 2> /dev/null
pkill -f "$ROOT/dist/hooks/claude-session.sh" 2> /dev/null
kill "$SHELL_PID"
wait "$SHELL_PID" 2> /dev/null || true
INNER
chmod +x "$TMP/inner.sh"
env HOME="$TMP" XDG_DATA_HOME="$TMP/data" XDG_CONFIG_HOME="$TMP/config" XDG_CACHE_HOME="$TMP/cache" GSETTINGS_BACKEND=memory \
    FRODO_RUNTIME_DIR="$TMP/frodo" TMP="$TMP" DIR="$DIR" ROOT="$ROOT" OUT="$OUT" \
    dbus-run-session -- "$TMP/inner.sh" > /dev/null 2>&1
gst-launch-1.0 -q filesrc location="$TMP/demo.mp4" ! decodebin ! videoconvert ! videorate ! video/x-raw,framerate=15/1 ! pngenc ! \
    multifilesink location="$TMP/frames/%04d.png"
python3 "$DIR/gif.py" "$TMP/frames" "$OUT/demo.gif" 720
ls "$OUT"
echo "log: $TMP/shell.log"
grep -v '^DING' "$TMP/shell.log" | grep -iE 'frodo@matheusjurkovich\.github\.io/|(JS ERROR|JS WARNING|CRITICAL).*frodo' || true
