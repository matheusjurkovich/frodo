import {CodexUsage} from './codex-service.js';
import {createSettings, removeDirs, tmpDir, waitFor, writeFile} from '../../../tests/fixtures.js';

const MINUTE = 60e3;

interface Turn {
    readonly minutesAgo: number;
    readonly input: number;
    readonly output: number;
    readonly model?: string;
    readonly limits?: number;
}

function rollout(session: string, turns: readonly Turn[]): string {
    const first = Math.max(...turns.map(turn => turn.minutesAgo));
    const iso = (minutesAgo: number): string => new Date(Date.now() - minutesAgo * MINUTE).toISOString();
    let total = 0;
    const lines = [JSON.stringify({timestamp: iso(first), type: 'session_meta', payload: {id: session, cwd: '/home/u/frodo'}})];
    for (const {minutesAgo, input, output, model, limits} of turns) {
        total += input + output;
        lines.push(JSON.stringify({timestamp: iso(minutesAgo), type: 'turn_context', payload: {model: model ?? 'gpt-5.6-sol'}}));
        const last = {input_tokens: input, cached_input_tokens: 0, output_tokens: output, total_tokens: input + output};
        lines.push(
            JSON.stringify({
                timestamp: iso(minutesAgo),
                type: 'event_msg',
                payload: {
                    type: 'token_count',
                    info: {total_token_usage: {...last, total_tokens: total}, last_token_usage: last, model_context_window: 1000},
                    rate_limits:
                        limits === undefined
                            ? null
                            : {
                                  primary: {used_percent: limits, window_minutes: 300, resets_at: Date.now() / 1000 + 3600},
                                  plan_type: 'plus',
                              },
                },
            }),
        );
    }
    return lines.join('\n');
}

describe('CodexUsage', () => {
    const settings = createSettings();
    const dirs: string[] = [];
    const services: CodexUsage[] = [];

    function create(root: string): CodexUsage {
        const service = new CodexUsage(settings, root);
        services.push(service);
        return service;
    }

    beforeEach(() => {
        settings.setProviderEnabled('codex', false);
    });

    afterEach(() => {
        for (const service of services.splice(0)) service.destroy();
        removeDirs(dirs);
    });

    it('sem a pasta de sessões fica indisponível e sem limites', async () => {
        const codex = create(`${tmpDir(dirs)}/nada`);
        await codex.refresh();
        expect(codex.available).toBeFalse();
        expect(codex.limits).toBeNull();
        expect(codex.lastRefresh).toBeGreaterThan(0);
    });

    it('com o provedor ligado atualiza sozinho ao nascer e ao ser religado', async () => {
        const root = tmpDir(dirs);
        writeFile(`${root}/sessions/2026/10/27/rollout-a.jsonl`, rollout('a', [{minutesAgo: 1, input: 10, output: 1, limits: 30}]));
        const off = create(root);
        await new Promise(resolve => setTimeout(resolve, 50));
        expect(off.lastRefresh).toBe(0);
        settings.setProviderEnabled('codex', true);
        await waitFor(off, () => off.limits !== null);
        expect(off.limits?.primary?.usedPercent).toBe(30);
        const on = create(root);
        await waitFor(on, () => on.limits !== null);
        expect(on.available).toBeTrue();
    });

    it('lê os limites do rollout mais novo que tem limites, até três pastas de fundo', async () => {
        const root = tmpDir(dirs);
        const now = Date.now();
        writeFile(
            `${root}/sessions/2026/10/27/rollout-a.jsonl`,
            rollout('a', [{minutesAgo: 5, input: 10, output: 1, limits: 12}]),
            now - 10 * MINUTE,
        );
        writeFile(
            `${root}/sessions/2026/10/27/rollout-b.jsonl`,
            rollout('b', [{minutesAgo: 5, input: 10, output: 1, limits: 44}]),
            now - 5 * MINUTE,
        );
        writeFile(`${root}/sessions/2026/10/27/rollout-c.jsonl`, rollout('c', [{minutesAgo: 1, input: 10, output: 1}]), now);
        writeFile(`${root}/sessions/2026/10/27/notas.jsonl`, rollout('d', [{minutesAgo: 1, input: 10, output: 1, limits: 99}]), now);
        writeFile(`${root}/sessions/2026/10/27/x/rollout-e.jsonl`, rollout('e', [{minutesAgo: 1, input: 1, output: 1, limits: 77}]), now);
        const codex = create(root);
        await codex.refresh();
        expect(codex.available).toBeTrue();
        expect(codex.limits?.primary?.usedPercent).toBe(44);
        expect(codex.limits?.plan).toBe('plus');
    });

    it('não troca os limites por outros mais velhos lidos depois', async () => {
        const root = tmpDir(dirs);
        const now = Date.now();
        writeFile(`${root}/sessions/rollout-a.jsonl`, rollout('a', [{minutesAgo: 1, input: 10, output: 1, limits: 50}]), now - 10 * MINUTE);
        const codex = create(root);
        await codex.refresh();
        writeFile(`${root}/sessions/rollout-b.jsonl`, rollout('b', [{minutesAgo: 30, input: 10, output: 1, limits: 5}]), now);
        await codex.refresh();
        expect(codex.limits?.primary?.usedPercent).toBe(50);
        writeFile(`${root}/sessions/rollout-c.jsonl`, rollout('c', [{minutesAgo: 0, input: 10, output: 1, limits: 70}]), now + MINUTE);
        await codex.refresh();
        expect(codex.limits?.primary?.usedPercent).toBe(70);
    });

    it('refresh em andamento é reaproveitado', () => {
        const codex = create(tmpDir(dirs));
        expect(codex.refresh()).toBe(codex.refresh());
    });

    it('scan soma o consumo dos rollouts dos últimos 30 dias e junta a sessão retomada', async () => {
        const root = tmpDir(dirs);
        const now = Date.now();
        writeFile(`${root}/sessions/rollout-a.jsonl`, rollout('s', [{minutesAgo: 20, input: 100, output: 10}]), now - 10 * MINUTE);
        writeFile(
            `${root}/sessions/rollout-b.jsonl`,
            rollout('s', [{minutesAgo: 5, input: 200, output: 20, model: 'gpt-5.1-codex-mini', limits: 60}]),
            now,
        );
        writeFile(
            `${root}/sessions/rollout-velho.jsonl`,
            rollout('v', [{minutesAgo: 2, input: 5000, output: 0}]),
            now - 40 * 24 * 60 * MINUTE,
        );
        const codex = create(root);
        const scanning = codex.scan();
        expect(codex.scanning).toBeTrue();
        await scanning;
        expect(codex.scanning).toBeFalse();
        const summary = codex.summary('7d', new Date());
        expect([summary.input, summary.output, summary.sessions]).toEqual([300, 30, 1]);
        expect(codex.session('s')).toEqual(
            jasmine.objectContaining({
                model: 'gpt-5.1-codex-mini',
                tokens: 330,
                startedAt: jasmine.any(Number),
            }),
        );
        expect(codex.session('s')?.lastAt).toBeGreaterThan(codex.session('s')?.startedAt ?? Infinity);
        expect(codex.session('v')).toBeNull();
        expect(codex.limits?.primary?.usedPercent).toBe(60);
    });

    it('scan esquece o rollout apagado', async () => {
        const root = tmpDir(dirs);
        writeFile(`${root}/sessions/rollout-a.jsonl`, rollout('a', [{minutesAgo: 5, input: 100, output: 10}]));
        const codex = create(root);
        await codex.scan();
        expect(codex.summary('7d', new Date()).total).toBe(110);
        removeDirs([`${root}/sessions/rollout-a.jsonl`]);
        await codex.scan();
        expect(codex.summary('7d', new Date()).total).toBe(0);
        expect(codex.session('a')).toBeNull();
    });

    it('scan relê o rollout que cresceu', async () => {
        const root = tmpDir(dirs);
        const path = `${root}/sessions/rollout-a.jsonl`;
        writeFile(path, rollout('a', [{minutesAgo: 5, input: 100, output: 10}]), Date.now() - MINUTE);
        const codex = create(root);
        await codex.scan();
        writeFile(
            path,
            rollout('a', [
                {minutesAgo: 5, input: 100, output: 10},
                {minutesAgo: 1, input: 50, output: 5},
            ]),
        );
        await codex.scan();
        expect(codex.summary('7d', new Date()).total).toBe(165);
    });
});
