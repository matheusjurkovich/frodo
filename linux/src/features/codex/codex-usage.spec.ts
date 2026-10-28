import {CODEX_MODELS, codexMeters, latestLimits, parseCodexLine, planLabel, readRollout} from './codex-usage.js';

const at = (minute: number): string => new Date(2026, 9, 27, 10, minute).toISOString();

const meta = JSON.stringify({timestamp: at(0), type: 'session_meta', payload: {id: 'sess-1', cwd: '/home/u/frodo'}});
const context = (model: string, minute: number): string => JSON.stringify({timestamp: at(minute), type: 'turn_context', payload: {model}});

interface Usage {
    input: number;
    cached: number;
    output: number;
    total: number;
    limits?: boolean;
}

function tokens(minute: number, {input, cached, output, total, limits}: Usage): string {
    const last = {
        input_tokens: input,
        cached_input_tokens: cached,
        output_tokens: output,
        reasoning_output_tokens: 1,
        total_tokens: input + output,
    };
    return JSON.stringify({
        timestamp: at(minute),
        type: 'event_msg',
        payload: {
            type: 'token_count',
            info: {total_token_usage: {...last, total_tokens: total}, last_token_usage: last, model_context_window: 258400},
            rate_limits: limits
                ? {
                      primary: {used_percent: 12.5, window_minutes: 300, resets_at: 1791594223},
                      secondary: {used_percent: 40, window_minutes: 10080, resets_at: 1792181023},
                      plan_type: 'plus',
                  }
                : null,
        },
    });
}

const rollout = [
    meta,
    context('gpt-5.6-sol', 1),
    tokens(2, {input: 1000, cached: 800, output: 50, total: 1050}),
    tokens(3, {input: 1000, cached: 800, output: 50, total: 1050, limits: true}),
    context('gpt-5.1-codex-mini', 4),
    tokens(5, {input: 2000, cached: 1500, output: 100, total: 3150}),
    tokens(6, {input: 0, cached: 0, output: 0, total: 3200}),
    'linha quebrada {',
].join('\n');

describe('codex-usage', () => {
    it('ignora linha que não é JSON de rollout', () => {
        expect(parseCodexLine('nada')).toBeNull();
        expect(parseCodexLine(JSON.stringify({type: 'x', payload: {}}))).toBeNull();
        expect(parseCodexLine(meta)?.type).toBe('session_meta');
    });

    it('soma token_count sem repetir evento duplicado e separa o cache da entrada', () => {
        const {id, cells} = readRollout(rollout);
        expect(id).toBe('sess-1');
        expect(cells.map(cell => [cell.model, cell.project, cell.session, cell.input, cell.cacheRead, cell.output])).toEqual([
            ['gpt-5.6-sol', 'frodo', 'sess-1', 200, 800, 50],
            ['gpt-5.1-codex-mini', 'frodo', 'sess-1', 500, 1500, 100],
        ]);
    });

    it('guarda a sessão com o último contexto', () => {
        expect(readRollout(rollout).session).toEqual({
            model: 'gpt-5.1-codex-mini',
            tokens: 850,
            contextTokens: 2100,
            contextWindow: 258400,
            startedAt: new Date(2026, 9, 27, 10, 2).getTime(),
            lastAt: new Date(2026, 9, 27, 10, 5).getTime(),
        });
    });

    it('lê os limites mais recentes em milissegundos', () => {
        const expected = {
            plan: 'plus',
            primary: {usedPercent: 12.5, windowMinutes: 300, resetsAt: 1791594223000},
            secondary: {usedPercent: 40, windowMinutes: 10080, resetsAt: 1792181023000},
            at: new Date(2026, 9, 27, 10, 3).getTime(),
        };
        expect(readRollout(rollout).limits).toEqual(expected);
        expect(latestLimits(rollout.slice(40))).toEqual(expected);
        expect(latestLimits(meta)).toBeNull();
    });

    it('aceita resets_in_seconds de versões antigas', () => {
        const line = JSON.stringify({
            timestamp: at(0),
            type: 'event_msg',
            payload: {
                type: 'token_count',
                info: null,
                rate_limits: {primary: {used_percent: 5, window_minutes: 300, resets_in_seconds: 60}},
            },
        });
        expect(latestLimits(line)?.primary?.resetsAt).toBe(new Date(2026, 9, 27, 10, 1).getTime());
    });

    it('nomeia o plano', () => {
        expect(planLabel('plus')).toBe('Plus');
        expect(planLabel('pro')).toBe('Pro');
        expect(planLabel('self_serve_business')).toBe('Self Serve Business');
        expect(planLabel(null)).toBeNull();
    });

    it('agrupa e rotula os modelos', () => {
        const models = ['gpt-5.6-sol', 'gpt-5-codex', 'gpt-5.1-codex-mini', 'o3'];
        expect(models.map(CODEX_MODELS.family)).toEqual(['codex-gpt', 'codex-codex', 'codex-mini', 'codex-other']);
        expect(models.map(CODEX_MODELS.label)).toEqual(['GPT-5.6 Sol', 'GPT-5 Codex', 'GPT-5.1 Codex Mini', 'o3']);
    });

    it('converte as janelas em medidores e zera a que já reiniciou', () => {
        const now = Date.UTC(2026, 9, 28, 12);
        const meters = codexMeters(
            {
                plan: 'plus',
                primary: {usedPercent: 41, windowMinutes: 300, resetsAt: now + 130 * 60e3},
                secondary: {usedPercent: 58, windowMinutes: 10080, resetsAt: now - 1},
                at: now,
            },
            now,
        );
        expect(meters.map(({key, short, percent}) => [key, short, percent])).toEqual([
            ['session', 'Janela 5 h', 41],
            ['weekly', 'Semana', 0],
        ]);
        expect(meters[0]?.note).toBe('Reinicia em 2 h 10 min');
        expect(codexMeters(null, now)).toEqual([]);
    });
});
