import System from 'system';
import GLib from 'gi://GLib';
import {parseMeminfo, formatGb, readMemory} from '../lib/meminfo.js';
import {batteryIconName, claudeErrorText, formatDate} from '../lib/format.js';
import {parseUsage, readToken, errorForStatus, formatReset, ClaudeUsage} from '../lib/claude.js';

let failures = 0;
let total = 0;

function assertEq(actual, expected, name) {
    total++;
    const a = JSON.stringify(actual);
    const e = JSON.stringify(expected);
    if (a !== e) {
        failures++;
        print(`FAIL ${name}\n  esperado: ${e}\n  obtido:   ${a}`);
    }
}

assertEq(parseMeminfo('MemTotal:       14680064 kB\nMemFree: 1 kB\nMemAvailable:    8178893 kB\n'), {totalKb: 14680064, usedKb: 6501171}, 'meminfo');
assertEq(parseMeminfo('lixo'), null, 'meminfo lixo');
assertEq(formatGb(6501171), '6.2G', 'formatGb');

assertEq(parseUsage({limits: [
    {kind: 'session', group: 'session', percent: 62, resets_at: '2026-10-24T20:00:00Z'},
    {kind: 'weekly_all', group: 'weekly', percent: 31, resets_at: '2026-10-29T12:00:00Z'},
    {kind: 'weekly_scoped', group: 'weekly', percent: 80, scope: {model: {display_name: 'Opus'}}},
]}), {session: {percent: 62, resetsAt: '2026-10-24T20:00:00Z'}, weekly: {percent: 31, resetsAt: '2026-10-29T12:00:00Z'}}, 'usage limits');
assertEq(parseUsage({five_hour: {utilization: 10, resets_at: 'a'}, seven_day: {utilization: 20, resets_at: 'b'}}),
    {session: {percent: 10, resetsAt: 'a'}, weekly: {percent: 20, resetsAt: 'b'}}, 'usage legado');
assertEq(parseUsage(null), {session: null, weekly: null}, 'usage null');
assertEq(parseUsage({limits: [{kind: 'session', percent: 'x'}]}), {session: null, weekly: null}, 'usage percent inválido');

assertEq(readToken(null, 0), {token: null, error: 'no-credentials'}, 'token sem arquivo');
assertEq(readToken('{quebrado', 0), {token: null, error: 'no-credentials'}, 'token json quebrado');
assertEq(readToken('{"claudeAiOauth":{"accessToken":"t","expiresAt":1000}}', 2000), {token: null, error: 'expired'}, 'token expirado');
assertEq(readToken('{"claudeAiOauth":{"accessToken":"t","expiresAt":3000}}', 2000), {token: 't', error: null}, 'token ok');
assertEq(readToken('{"claudeAiOauth":{"accessToken":"t"}}', 2000), {token: 't', error: null}, 'token sem expiresAt');

assertEq(errorForStatus(200), null, 'status 200');
assertEq(errorForStatus(401), 'expired', 'status 401');
assertEq(errorForStatus(503), 'http', 'status 503');

const now = Date.UTC(2026, 9, 24, 12, 0);
assertEq(formatReset(new Date(now + 130 * 60e3).toISOString(), now), 'em 2h 10m', 'reset horas');
assertEq(formatReset(new Date(now + 45 * 60e3).toISOString(), now), 'em 45m', 'reset minutos');
const far = new Date(now + 3 * 86400e3);
assertEq(formatReset(far.toISOString(), now),
    `${['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sáb'][far.getDay()]} ${String(far.getHours()).padStart(2, '0')}:${String(far.getMinutes()).padStart(2, '0')}`, 'reset dias');
assertEq(formatReset(null, now), '', 'reset nulo');

assertEq(batteryIconName({percent: 72, charging: false}), 'battery-level-70-symbolic', 'ícone bateria');
assertEq(batteryIconName({percent: 100, charging: true}), 'battery-level-100-charging-symbolic', 'ícone bateria carregando');
assertEq(batteryIconName({percent: 4, charging: false}), 'battery-level-0-symbolic', 'ícone bateria vazia');
assertEq(claudeErrorText('no-credentials'), 'Faça login no Claude Code', 'erro sem credenciais');
assertEq(claudeErrorText('expired'), 'Faça login no Claude Code', 'erro expirado');
assertEq(claudeErrorText('network'), 'Sem conexão', 'erro rede');
assertEq(claudeErrorText(null), '', 'sem erro');
assertEq(formatDate(new Date(2026, 9, 24)), 'sáb, 24 out', 'data curta');

const mem = await readMemory();
assertEq(mem !== null && mem.totalKb > 0 && mem.usedKb > 0 && mem.usedKb < mem.totalKb, true, 'readMemory real');

const emptyDir = GLib.dir_make_tmp('frodo-XXXXXX');
GLib.setenv('CLAUDE_CONFIG_DIR', emptyDir, true);
const usage = new ClaudeUsage();
assertEq(await usage.fetch(), {session: null, weekly: null, error: 'no-credentials'}, 'fetch sem credenciais');
usage.destroy();
GLib.unsetenv('CLAUDE_CONFIG_DIR');
GLib.rmdir(emptyDir);

print(`${total - failures}/${total} ok`);
if (failures)
    System.exit(1);
