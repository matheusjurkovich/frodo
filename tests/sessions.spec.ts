import GLib from 'gi://GLib';

import {countByStatus, displayStatus, nextState, parentPid, parseHookEvent, parseShortstat, stepFor} from '../src/core/claude-sessions.js';
import type {HookEvent, SessionState, SessionStatus} from '../src/core/claude-sessions.js';
import {ClaudeSessions} from '../src/services/claude-sessions.js';
import {Timer} from '../src/util/timer.js';
import {createSettings} from './fixtures.js';

const at = Date.UTC(2026, 9, 27, 12);

function event(name: string, extra: Record<string, unknown> = {}): HookEvent {
    const parsed = parseHookEvent(
        JSON.stringify({
            pid: 42,
            event: {session_id: 's1', cwd: '/home/u/loja-api', transcript_path: '/t/s1.jsonl', hook_event_name: name, ...extra},
        }),
    );
    if (!parsed) throw new Error('evento inválido');
    return parsed;
}

function changed(sessions: ClaudeSessions): Promise<void> {
    return new Promise((resolve, reject) => {
        const timer = new Timer();
        const off = sessions.on('changed', () => {
            timer.stop();
            off();
            resolve();
        });
        timer.once(2000, () => {
            off();
            reject(new Error('sem changed em 2 s'));
        });
    });
}

describe('sessões do Claude', () => {
    it('trabalhando com o passo da ferramenta', () => {
        const state = nextState(null, event('PreToolUse', {tool_name: 'Bash', tool_input: {command: 'npm test\nmais'}}), at);
        expect(state).toEqual(
            jasmine.objectContaining({status: 'working', repo: 'loja-api', tool: 'Bash', step: 'Bash npm test', pid: 42}),
        );
    });

    it('pedido de permissão mantém o comando', () => {
        const working = nextState(null, event('PreToolUse', {tool_name: 'Bash', tool_input: {command: 'npm test'}}), at);
        const waiting = nextState(working, event('Notification', {notification_type: 'permission_prompt', message: 'x'}), at + 1000);
        expect([waiting?.status, waiting?.step]).toEqual(['waiting', 'Bash npm test']);
    });

    it('para, fica ociosa e encerra', () => {
        const done = nextState(null, event('Stop'), at);
        if (!done) throw new Error('sem estado');
        expect(displayStatus(done, at + 29 * 60e3)).toBe('done');
        expect(displayStatus(done, at + 31 * 60e3)).toBe('idle');
        expect(nextState(done, event('SessionEnd'), at)).toBeNull();
    });

    it('mapeia cada evento', () => {
        const working = nextState(null, event('PreToolUse', {tool_name: 'Bash', tool_input: {command: 'npm test'}}), at);
        const waiting = nextState(working, event('PermissionRequest', {tool_name: 'Bash', tool_input: {command: 'rm -rf x'}}), at);
        const done = nextState(working, event('Stop'), at);
        const bash = {tool_name: 'Bash', tool_input: {command: 'npm run lint'}};
        const cases: [string, SessionState | null, string, Record<string, unknown>, [SessionStatus, string | null, string]][] = [
            ['SessionStart', null, 'SessionStart', {source: 'startup'}, ['idle', null, '']],
            ['UserPromptSubmit', null, 'UserPromptSubmit', {prompt: 'oi'}, ['working', null, 'Pensando']],
            [
                'PermissionRequest',
                working,
                'PermissionRequest',
                {tool_name: 'Bash', tool_input: {command: 'rm -rf x'}},
                ['waiting', 'Bash', 'Bash rm -rf x'],
            ],
            ['PreCompact', working, 'PreCompact', {}, ['working', null, 'Compactando contexto']],
            ['idle_prompt trabalhando', working, 'Notification', {notification_type: 'idle_prompt'}, ['idle', 'Bash', 'Bash npm test']],
            ['idle_prompt concluída', done, 'Notification', {notification_type: 'idle_prompt'}, ['done', 'Bash', 'Bash npm test']],
            ['outra notificação', working, 'Notification', {notification_type: 'auth_success'}, ['working', 'Bash', 'Bash npm test']],
            ['PostToolUseFailure', waiting, 'PostToolUseFailure', bash, ['working', 'Bash', 'Bash npm run lint']],
            ['evento desconhecido', working, 'SubagentStop', {}, ['working', 'Bash', 'Bash npm test']],
        ];
        for (const [label, previous, name, extra, expected] of cases) {
            const state = nextState(previous, event(name, extra), at + 1000);
            expect([state?.status, state?.tool, state?.step]).withContext(label).toEqual(expected);
        }
        expect(nextState(done, event('Notification', {notification_type: 'idle_prompt'}), at + 60e3)?.updatedAt).toBe(at);
    });

    it('descreve o passo por ferramenta', () => {
        expect(stepFor('Edit', {file_path: '/r/src/Main.ts'})).toBe('Edit Main.ts');
        expect(stepFor('Grep', {pattern: 'TODO'})).toBe('Grep TODO');
        expect(stepFor('Agent', {description: 'Revisar PR'})).toBe('Agent Revisar PR');
        expect(stepFor('Mystery', {})).toBe('Mystery');
    });

    it('ignora arquivos inválidos', () => {
        expect(parseHookEvent('{')).toBeNull();
        expect(parseHookEvent(JSON.stringify({pid: 1, event: {hook_event_name: 'Stop'}}))).toBeNull();
    });

    it('conta por status', () => {
        const working = nextState(null, event('PreToolUse', {tool_name: 'Read', tool_input: {file_path: '/a'}}), at);
        const done = nextState(null, event('Stop'), at);
        if (!working || !done) throw new Error('sem estado');
        expect(countByStatus([working, done], at)).toEqual({all: 2, working: 1, waiting: 0, done: 1, idle: 0});
    });

    it('lê o pai do processo e o diff', () => {
        expect(parentPid('1234 (meu (estranho) proc) S 987 1 1 0')).toBe(987);
        expect(parentPid('lixo')).toBeNull();
        expect(parseShortstat(' 3 files changed, 214 insertions(+), 38 deletions(-)\n')).toEqual({files: 3, added: 214, removed: 38});
        expect(parseShortstat(' 1 file changed, 2 insertions(+)\n')).toEqual({files: 1, added: 2, removed: 0});
        expect(parseShortstat('')).toBeNull();
    });
});

describe('ClaudeSessions', () => {
    const settings = createSettings();
    settings.claudeProfiles = [{id: 't', label: 'T', configDir: '/nonexistent/frodo-sessions'}];
    const self = Number(GLib.file_read_link('/proc/self'));
    const dead = Number(new TextDecoder().decode(GLib.file_get_contents('/proc/sys/kernel/pid_max')[1]).trim());
    let dirs: string[] = [];

    function tmp(): string {
        const dir = GLib.dir_make_tmp('frodo-sessions-XXXXXX');
        dirs.push(dir);
        return dir;
    }

    afterEach(() => {
        for (const dir of dirs) GLib.spawn_command_line_sync(`rm -rf ${GLib.shell_quote(dir)}`);
        dirs = [];
    });

    it('cria a pasta que não existe', () => {
        const dir = `${tmp()}/nova`;
        const sessions = new ClaudeSessions(settings, dir);
        expect(GLib.file_test(dir, GLib.FileTest.IS_DIR)).toBeTrue();
        sessions.destroy();
    });

    it('lê a pasta, ignora lixo e descarta sessão morta', async () => {
        const dir = tmp();
        GLib.file_set_contents(
            `${dir}/a.json`,
            JSON.stringify({pid: self, event: {session_id: 'a', cwd: '/r/x', transcript_path: '/t', hook_event_name: 'Stop'}}),
        );
        GLib.file_set_contents(`${dir}/b.json`, '{');
        GLib.file_set_contents(
            `${dir}/c.json`,
            JSON.stringify({pid: dead, event: {session_id: 'c', cwd: '/r/y', transcript_path: '/t', hook_event_name: 'Stop'}}),
        );
        const sessions = new ClaudeSessions(settings, dir);
        await changed(sessions);
        expect(sessions.sessions.map(state => state.sessionId)).toEqual(['a']);
        expect(GLib.file_test(`${dir}/c.json`, GLib.FileTest.EXISTS)).toBeFalse();
        sessions.destroy();
    });

    it('segue arquivos novos e o fim da sessão', async () => {
        const dir = tmp();
        const sessions = new ClaudeSessions(settings, dir);
        await changed(sessions);
        const write = (name: string): void => {
            GLib.file_set_contents(
                `${dir}/d.json`,
                JSON.stringify({pid: self, event: {session_id: 'd', cwd: '/r/z', transcript_path: '/t', hook_event_name: name}}),
            );
        };
        write('UserPromptSubmit');
        await changed(sessions);
        expect(sessions.sessions[0]?.status).toBe('working');
        write('SessionEnd');
        await changed(sessions);
        expect(sessions.sessions).toEqual([]);
        sessions.destroy();
    });

    it('listener que falha uma vez não para as atualizações', async () => {
        const dir = tmp();
        const log = spyOn(globalThis, 'logError');
        const sessions = new ClaudeSessions(settings, dir);
        await changed(sessions);
        const first = changed(sessions);
        let failed = false;
        sessions.on('changed', () => {
            if (failed) return;
            failed = true;
            throw new Error('listener quebrado');
        });
        const write = (name: string): void => {
            GLib.file_set_contents(
                `${dir}/e.json`,
                JSON.stringify({pid: self, event: {session_id: 'e', cwd: '/r/e', transcript_path: '/t', hook_event_name: name}}),
            );
        };
        write('UserPromptSubmit');
        await first;
        write('SessionEnd');
        await changed(sessions);
        expect(sessions.sessions).toEqual([]);
        expect(log).toHaveBeenCalledTimes(1);
        sessions.destroy();
    });
});
