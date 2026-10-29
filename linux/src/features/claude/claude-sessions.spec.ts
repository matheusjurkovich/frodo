import {
    contextUsage,
    countByStatus,
    decisionJson,
    displayStatus,
    doneMessage,
    finishedSessions,
    nextState,
    oldestPending,
    parentPid,
    parseHookEvent,
    parsePending,
    parseShortstat,
    sessionMeta,
    stepFor,
} from './claude-sessions.js';
import type {SessionStats} from './claude-index.js';
import type {HookEvent, PendingRequest, SessionState, SessionStatus} from './claude-sessions.js';

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

    it('since guarda o início do status e só muda quando o status muda', () => {
        const bash = {tool_name: 'Bash', tool_input: {command: 'npm test'}};
        const started = nextState(null, event('UserPromptSubmit', {prompt: 'oi'}), at);
        const working = nextState(started, event('PreToolUse', bash), at + 5000);
        const again = nextState(working, event('PostToolUse', bash), at + 9000);
        const waiting = nextState(again, event('PermissionRequest', bash), at + 12_000);
        const resumed = nextState(waiting, event('PostToolUse', bash), at + 20_000);
        const done = nextState(resumed, event('Stop'), at + 30_000);
        const idlePrompt = nextState(done, event('Notification', {notification_type: 'idle_prompt'}), at + 90_000);
        expect([started, working, again, waiting, resumed, done, idlePrompt].map(state => state?.since)).toEqual([
            at,
            at,
            at,
            at + 12_000,
            at + 20_000,
            at + 30_000,
            at + 30_000,
        ]);
        expect(again?.updatedAt).toBe(at + 9000);
    });

    it('descreve o passo por ferramenta', () => {
        expect(stepFor('Edit', {file_path: '/r/src/Main.ts'})).toBe('Edit Main.ts');
        expect(stepFor('Grep', {pattern: 'TODO'})).toBe('Grep TODO');
        expect(stepFor('Agent', {description: 'Revisar PR'})).toBe('Agent Revisar PR');
        expect(stepFor('Mystery', {})).toBe('Mystery');
    });

    it('lê o provedor e traduz os eventos do Gemini', () => {
        const read = (provider: unknown, name: string, extra: Record<string, unknown> = {}): HookEvent | null =>
            parseHookEvent(JSON.stringify({pid: 7, provider, event: {session_id: 'g1', cwd: '/p/app', hook_event_name: name, ...extra}}));
        expect(read(undefined, 'Stop')?.provider).toBe('claude');
        expect(read('outro', 'Stop')?.provider).toBe('claude');
        expect(read('codex', 'PermissionRequest')?.provider).toBe('codex');
        const prompt = read('gemini', 'BeforeAgent');
        const tool = read('gemini', 'BeforeTool', {tool_name: 'run_shell_command', tool_input: {command: 'ls'}});
        const asking = read('gemini', 'Notification', {notification_type: 'ToolPermission'});
        const finished = read('gemini', 'AfterAgent');
        if (!prompt || !tool || !asking || !finished) throw new Error('evento inválido');
        const working = nextState(nextState(null, prompt, at), tool, at + 1000);
        expect(working).toEqual(jasmine.objectContaining({provider: 'gemini', status: 'working', step: 'run_shell_command ls'}));
        expect(nextState(working, asking, at + 2000)?.status).toBe('waiting');
        expect(nextState(working, finished, at + 3000)?.status).toBe('done');
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

    it('monta a meta sem lacunas', () => {
        const state = nextState(null, event('PreToolUse', {tool_name: 'Read', tool_input: {file_path: '/a'}}), at);
        if (!state) throw new Error('sem estado');
        const stats: SessionStats = {
            tokens: 86_000,
            model: 'claude-opus-4-5',
            contextTokens: 62_000,
            branch: 'main',
            startedAt: at - 4 * 60e3,
            lastAt: at - 60e3,
            todos: null,
        };
        expect(sessionMeta(state, stats, 'working', at)).toBe('Opus 4.5 · main · 4 min');
        expect(sessionMeta(state, {...stats, model: ''}, 'working', at)).toBe('main · 4 min');
        expect(sessionMeta(state, {...stats, branch: null}, 'waiting', at)).toBe('Opus 4.5 · 4 min');
        expect(sessionMeta(state, null, 'working', at)).toBe('');
        expect(sessionMeta(state, stats, 'idle', at + 2 * 3600e3)).toBe('Opus 4.5 · main · parada há 2 h 01 min');
        expect(sessionMeta(state, null, 'idle', at + 30 * 60e3)).toBe('parada há 30 min');
    });

    it('mede o contexto e avisa a partir de 85%', () => {
        expect(contextUsage(0)).toBeNull();
        expect(contextUsage(62_000)).toEqual({fraction: 0.31, warn: false, text: '62 mil de 200 mil tokens'});
        expect(contextUsage(169_000)?.warn).toBeFalse();
        expect(contextUsage(170_000)?.warn).toBeTrue();
        expect(contextUsage(300_000)).toEqual({fraction: 0.3, warn: false, text: '300 mil de 1 mi tokens'});
    });

    it('lê o pai do processo e o diff', () => {
        expect(parentPid('1234 (meu (estranho) proc) S 987 1 1 0')).toBe(987);
        expect(parentPid('lixo')).toBeNull();
        expect(parseShortstat(' 3 files changed, 214 insertions(+), 38 deletions(-)\n')).toEqual({files: 3, added: 214, removed: 38});
        expect(parseShortstat(' 1 file changed, 2 insertions(+)\n')).toEqual({files: 1, added: 2, removed: 0});
        expect(parseShortstat('')).toBeNull();
    });
});

describe('pedidos de permissão pendentes', () => {
    const text = '{"pid":4242,"tool":"Bash","since":1700000000000}';

    it('lê nome e conteúdo do pedido', () => {
        expect(parsePending('abc-1.r-9.json', text)).toEqual({
            key: 'abc-1.r-9',
            sessionId: 'abc-1',
            request: 'r-9',
            pid: 4242,
            tool: 'Bash',
            since: 1700000000000,
        });
    });

    it('rejeita nome fora do formato', () => {
        for (const name of ['abc.json', '../x.r.json', 'a.b.c.json', 'a.r.txt', '.r.json', 'a..json', 'a b.r.json'])
            expect(parsePending(name, text)).toBeNull();
    });

    it('rejeita conteúdo inválido', () => {
        for (const body of [
            '',
            '{',
            '[]',
            '{"pid":"1","tool":"Bash","since":1}',
            '{"pid":0,"tool":"Bash","since":1}',
            '{"pid":1.5,"tool":"Bash","since":1}',
            '{"pid":1,"tool":"","since":1}',
            '{"pid":1,"since":1}',
            '{"pid":1,"tool":"Bash"}',
        ])
            expect(parsePending('a.r.json', body)).toBeNull();
    });

    it('monta o arquivo de decisão', () => {
        expect(JSON.parse(decisionJson('allow'))).toEqual({behavior: 'allow'});
        expect(JSON.parse(decisionJson('deny'))).toEqual({behavior: 'deny'});
    });

    it('escolhe o pedido mais antigo, opcionalmente da sessão', () => {
        const a: PendingRequest = {key: 'a.1', sessionId: 'a', request: '1', pid: 1, tool: 'Bash', since: 30};
        const b: PendingRequest = {key: 'b.1', sessionId: 'b', request: '1', pid: 1, tool: 'Edit', since: 10};
        const c: PendingRequest = {key: 'a.2', sessionId: 'a', request: '2', pid: 1, tool: 'Write', since: 20};
        expect(oldestPending([a, b, c])).toBe(b);
        expect(oldestPending([a, b, c], 'a')).toBe(c);
        expect(oldestPending([], 'a')).toBeNull();
    });
});

describe('sessões que terminaram', () => {
    function stateOf(id: string, status: SessionStatus): SessionState {
        return {
            provider: 'claude',
            sessionId: id,
            cwd: '/home/u/frodo',
            repo: 'frodo',
            status,
            tool: null,
            step: '',
            pid: null,
            since: at,
            updatedAt: at,
        };
    }

    it('finishedSessions avisa quem passou de trabalhando para concluída', () => {
        expect(
            finishedSessions([stateOf('a', 'working'), stateOf('b', 'working')], [stateOf('a', 'done'), stateOf('b', 'working')]),
        ).toEqual([stateOf('a', 'done')]);
    });

    it('finishedSessions ignora quem já estava concluída ao carregar', () => {
        expect(finishedSessions([], [stateOf('a', 'done')])).toEqual([]);
    });

    it('finishedSessions ignora quem foi para esperando ou parada', () => {
        expect(
            finishedSessions([stateOf('a', 'working'), stateOf('b', 'working')], [stateOf('a', 'waiting'), stateOf('b', 'idle')]),
        ).toEqual([]);
    });

    it('gemini termina pelo AfterAgent e conta como concluída', () => {
        const gemini = (name: string): HookEvent => {
            const parsed = parseHookEvent(
                JSON.stringify({pid: 7, provider: 'gemini', event: {session_id: 'g1', cwd: '/home/u/site', hook_event_name: name}}),
            );
            if (!parsed) throw new Error('evento inválido');
            return parsed;
        };
        const before = nextState(null, gemini('BeforeAgent'), at);
        const after = nextState(before, gemini('AfterAgent'), at + 1000);
        if (!before || !after) throw new Error('estado ausente');
        const finished = finishedSessions([before], [after]);
        expect(finished.map(({sessionId}) => sessionId)).toEqual(['g1']);
        expect(doneMessage(after)).toBe('Gemini terminou em site');
    });

    it('doneMessage usa o nome do provedor e o repo', () => {
        expect(doneMessage(stateOf('a', 'done'))).toBe('Claude terminou em frodo');
    });
});
