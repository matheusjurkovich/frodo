#!/bin/sh
set -u
HERE="$(cd "$(dirname "$0")" && pwd)"
HOOK="$HERE/claude-session.sh"
TMP="$(mktemp -d)"
FAILURES=0
SLEEPER=""
cleanup() {
    [ -n "$SLEEPER" ] && kill "$SLEEPER" 2> /dev/null
    rm -rf "$TMP"
}
trap cleanup EXIT

check() {
    if [ "$2" = "$3" ]; then
        printf 'ok   %s\n' "$1"
    else
        printf 'FAIL %s\n  esperado: %s\n  obtido:   %s\n' "$1" "$2" "$3"
        FAILURES=$((FAILURES + 1))
    fi
}

event() {
    printf '{"session_id":"%s","hook_event_name":"%s","tool_name":"Bash"}' "$1" "$2"
}

run_hook() {
    env -u CLAUDE_PID -u CLAUDE_CODE_ENTRYPOINT FRODO_RUNTIME_DIR="$TMP/run dir" FRODO_TERMINAL_WAIT_SECONDS=5 sh "$HOOK" "$@"
}

event abc-123 SessionStart | run_hook
check "grava o estado da sessao" "1" "$(grep -c '"hook_event_name":"SessionStart"' "$TMP/run dir/sessions/abc-123.json")"
check "pid nulo sem CLAUDE_PID" "1" "$(grep -c '^{"pid":null,' "$TMP/run dir/sessions/abc-123.json")"

check "provedor padrao e claude" "1" "$(grep -c '"provider":"claude"' "$TMP/run dir/sessions/abc-123.json")"

event cdx-1 SessionStart | run_hook codex
check "grava o provedor codex" "1" "$(grep -c '"provider":"codex"' "$TMP/run dir/sessions/cdx-1.json")"
check "pid do agente vem da arvore de processos" "0" "$(grep -c '^{"pid":null,' "$TMP/run dir/sessions/cdx-1.json")"

event gmn-1 BeforeAgent | run_hook gemini
check "grava o provedor gemini" "1" "$(grep -c '"provider":"gemini"' "$TMP/run dir/sessions/gmn-1.json")"

event def-456 SessionStart | env CLAUDE_PID=4242 FRODO_RUNTIME_DIR="$TMP/run dir" sh "$HOOK"
check "grava o pid do claude" "1" "$(grep -c '^{"pid":4242,' "$TMP/run dir/sessions/def-456.json")"

output="$(event abc-123 PermissionRequest | run_hook)"
check "sem alive nao espera nem responde" "" "$output"
check "sem alive nao cria pedido" "0" "$(ls "$TMP/run dir/pending" 2> /dev/null | wc -l | tr -d ' ')"

sleep 60 &
SLEEPER=$!
printf '%s sleep\n' "$SLEEPER" > "$TMP/run dir/alive"

wait_for_pending() {
    tries=0
    while [ "$tries" -lt 40 ]; do
        found="$(ls "$TMP/run dir/pending"/*.json 2> /dev/null | head -n 1)"
        [ -n "$found" ] && { printf '%s' "$found"; return 0; }
        sleep 0.1
        tries=$((tries + 1))
    done
    return 1
}

answer_with() {
    rm -rf "$TMP/run dir/pending" "$TMP/run dir/decisions"
    event abc-123 PermissionRequest | run_hook > "$TMP/out" &
    hook_pid=$!
    pending_file="$(wait_for_pending)" || { check "$1: pedido apareceu" "sim" "nao"; return; }
    name="$(basename "$pending_file")"
    printf '%s' "$2" > "$TMP/run dir/decisions/$name"
    wait "$hook_pid"
    cat "$TMP/out"
}

check "allow devolve a decisao" \
    '{"hookSpecificOutput":{"hookEventName":"PermissionRequest","decision":{"behavior":"allow"}}}' \
    "$(answer_with allow '{"behavior":"allow"}')"
check "deny devolve a decisao com mensagem" \
    '{"hookSpecificOutput":{"hookEventName":"PermissionRequest","decision":{"behavior":"deny","message":"Negado pela ilha do Frodo."}}}' \
    "$(answer_with deny '{"behavior":"deny"}')"
check "pedido some depois da resposta" "0" "$(ls "$TMP/run dir/pending" 2> /dev/null | wc -l | tr -d ' ')"

printf '%s wrongname\n' "$SLEEPER" > "$TMP/run dir/alive"
start=$(date +%s)
output="$(event abc-123 PermissionRequest | run_hook)"
check "nome de processo diferente nao espera" "" "$output"
check "nome de processo diferente sai na hora" "1" "$([ $(($(date +%s) - start)) -lt 3 ] && echo 1 || echo 0)"

kill "$SLEEPER" 2> /dev/null
wait "$SLEEPER" 2> /dev/null
printf '%s sleep\n' "$SLEEPER" > "$TMP/run dir/alive"
start=$(date +%s)
output="$(event abc-123 PermissionRequest | run_hook)"
check "pid morto nao espera" "" "$output"
check "pid morto sai na hora" "1" "$([ $(($(date +%s) - start)) -lt 3 ] && echo 1 || echo 0)"
SLEEPER=""

printf '99999999\n' > "$TMP/run dir/alive"
output="$(event abc-123 PermissionRequest | run_hook)"
check "alive so com pid inexistente nao espera" "" "$output"

[ "$FAILURES" = 0 ]
