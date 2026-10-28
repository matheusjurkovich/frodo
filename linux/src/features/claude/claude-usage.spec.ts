import {
    accountSummary,
    claudeErrorMessage,
    displayLevel,
    effectiveLevel,
    humanDuration,
    normalizeSpend,
    normalizeWindows,
    pacePercent,
    projectionNote,
    relativeReset,
    shownPace,
    shownPercent,
    tierIcon,
    tierLabel,
    claudeMeters,
} from './claude-usage.js';
import type {LevelInput} from './claude-usage.js';

const NOW = Date.UTC(2026, 9, 24, 12, 0);

const iso = (offsetSeconds: number): string => new Date(NOW + offsetSeconds * 1000).toISOString();

describe('normalizeWindows', () => {
    it('lê limits[] em ordem: sessão, semana e por modelo', () => {
        const windows = normalizeWindows({
            limits: [
                {
                    kind: 'weekly_scoped',
                    group: 'weekly',
                    percent: 80,
                    severity: 'warning',
                    resets_at: 'b',
                    scope: {model: {display_name: 'Opus'}},
                },
                {kind: 'session', group: 'session', percent: 62, resets_at: 'a', is_active: true},
                {kind: 'weekly_all', group: 'weekly', percent: 31, resets_at: 'b'},
            ],
        });
        expect(windows.map(w => [w.role, w.label, w.utilization, w.totalSeconds, w.apiLevel])).toEqual([
            ['session', '5 horas', 62, 18000, 'ok'],
            ['weekly', '7 dias', 31, 604800, 'ok'],
            ['scoped', '7 dias Opus', 80, 604800, 'warn'],
        ]);
        expect(windows[0]?.isActive).toBeTrue();
    });

    it('lê o formato legado com janelas por modelo', () => {
        const windows = normalizeWindows({
            five_hour: {utilization: 10, resets_at: 'a'},
            seven_day: {utilization: 20, resets_at: 'b'},
            seven_day_opus: {utilization: 5, resets_at: 'b'},
        });
        expect(windows.map(w => [w.role, w.label, w.utilization])).toEqual([
            ['session', '5 horas', 10],
            ['weekly', '7 dias', 20],
            ['scoped', '7 dias Opus', 5],
        ]);
    });

    it('descarta entradas sem porcentagem numérica', () => {
        expect(normalizeWindows({limits: [{kind: 'session', percent: 'x'}]})).toEqual([]);
        expect(normalizeWindows(null)).toEqual([]);
    });
});

describe('normalizeSpend', () => {
    it('lê o bloco spend estruturado', () => {
        expect(
            normalizeSpend({
                spend: {
                    enabled: true,
                    used: {amount_minor: 41654, currency: 'USD', exponent: 2},
                    limit: {amount_minor: 100000, currency: 'USD', exponent: 2},
                    percent: 41.6,
                    severity: 'warning',
                },
            }),
        ).toEqual({used: 'USD 416.54', limit: 'USD 1000.00', percent: 41.6, level: 'warn'});
    });

    it('cai para extra_usage', () => {
        expect(
            normalizeSpend({
                extra_usage: {
                    is_enabled: true,
                    used_credits: 1234,
                    monthly_limit: 5000,
                    decimal_places: 2,
                    currency: 'USD',
                    utilization: 24.68,
                },
            }),
        ).toEqual({used: 'USD 12.34', limit: 'USD 50.00', percent: 25, level: 'ok'});
    });

    it('retorna null sem uso extra', () => {
        expect(normalizeSpend({spend: {enabled: false}, extra_usage: {is_enabled: false}})).toBeNull();
    });
});

describe('ritmo e porcentagem', () => {
    it('calcula o ritmo esperado da janela', () => {
        expect(pacePercent(iso(9000), 18000, NOW)).toBe(50);
        expect(pacePercent(iso(-10), 18000, NOW)).toBeNull();
        expect(pacePercent(null, 18000, NOW)).toBeNull();
    });

    it('mostra usado ou restante', () => {
        expect(shownPercent(62.4, false)).toBe(62.4);
        expect(shownPercent(62.4, true)).toBe(38);
        expect(shownPercent(120, true)).toBe(0);
        expect(shownPace(30, true)).toBe(70);
        expect(shownPace(null, true)).toBeNull();
    });
});

describe('plano da assinatura', () => {
    it('monta o rótulo com multiplicador', () => {
        expect(tierLabel('claude_max', 'default_claude_max_20x')).toBe('MAX 20x');
        expect(tierLabel('pro', null)).toBe('PRO');
        expect(tierLabel(null, null)).toBe('CLAUDE');
    });

    it('escolhe o ícone do plano', () => {
        expect(tierIcon('MAX 20x')).toBe('max');
        expect(tierIcon('ENTERPRISE')).toBe('enterprise');
        expect(tierIcon('CLAUDE')).toBeNull();
    });
});

describe('nível e projeção', () => {
    const window = (utilization: number, remaining: number, apiLevel: 'ok' | 'warn' | 'crit' = 'ok'): LevelInput => ({
        utilization,
        resetsAt: iso(remaining),
        totalSeconds: 18000,
        apiLevel,
    });

    it('fica crítico quando vai acabar bem antes do reset', () => {
        expect(effectiveLevel(window(60, 9000), NOW)).toBe('crit');
        expect(projectionNote(window(60, 9000), false, NOW)).toBe('ritmo alto: acaba em ~1h 40m');
    });

    it('avisa quando a projeção passa de 75%', () => {
        expect(effectiveLevel(window(50, 9000), NOW)).toBe('warn');
        expect(projectionNote(window(50, 9000), false, NOW)).toBe('tendência de ~100% até o reset');
        expect(projectionNote(window(50, 9000), true, NOW)).toBe('tendência de ~0% restante até o reset');
    });

    it('fica calmo com uso baixo e respeita a severidade da API', () => {
        expect(effectiveLevel(window(20, 9000), NOW)).toBe('ok');
        expect(projectionNote(window(20, 9000), false, NOW)).toBe('');
        expect(effectiveLevel(window(10, 9000, 'warn'), NOW)).toBe('warn');
        expect(effectiveLevel(window(95, 9000), NOW)).toBe('crit');
    });
});

describe('displayLevel', () => {
    const now = Date.UTC(2026, 9, 27, 12);
    const base = {utilization: 0, resetsAt: null, totalSeconds: null, apiLevel: 'ok' as const};

    it('avisa a partir de 80%', () => {
        expect(displayLevel({...base, utilization: 86}, now)).toBe('warn');
        expect(displayLevel({...base, utilization: 62}, now)).toBe('ok');
    });

    it('fica calmo abaixo de 80% e avisa em 80%', () => {
        expect(displayLevel({...base, utilization: 78}, now)).toBe('ok');
        expect(displayLevel({...base, utilization: 79}, now)).toBe('ok');
        expect(displayLevel({...base, utilization: 80}, now)).toBe('warn');
    });

    it('respeita o aviso da API', () => {
        expect(displayLevel({...base, utilization: 50, apiLevel: 'warn'}, now)).toBe('warn');
    });

    it('mantém o crítico da API', () => {
        expect(displayLevel({...base, utilization: 62, apiLevel: 'crit'}, now)).toBe('crit');
    });
});

describe('tempos', () => {
    it('formata durações', () => {
        expect(humanDuration(30)).toBe('30s');
        expect(humanDuration(600)).toBe('10m');
        expect(humanDuration(6000)).toBe('1h 40m');
        expect(humanDuration(200000)).toBe('2d 7h');
    });

    it('descreve o reset', () => {
        expect(relativeReset(iso(0), NOW)).toBe('reiniciando…');
        expect(relativeReset(iso(45), NOW)).toBe('reinicia em 45s');
        expect(relativeReset(iso(1800), NOW)).toBe('reinicia em 30m');
        expect(relativeReset(iso(7800), NOW)).toBe('reinicia em 2h 10m');
        expect(relativeReset(iso(266400), NOW)).toBe('reinicia em 3d 2h');
        expect(relativeReset(null, NOW)).toBe('');
    });
});

describe('conta e erros', () => {
    it('resume a conta a partir do perfil da API', () => {
        expect(
            accountSummary({
                account: {display_name: 'Matheus', has_claude_max: true},
                application: {name: 'Claude Code'},
                organization: {subscription_status: 'active', rate_limit_tier: 'default_claude_max_20x'},
            }),
        ).toEqual({who: 'Matheus', plan: 'max', rateLimitTier: 'default_claude_max_20x', subtitle: 'Matheus · Claude Code · ativo'});
        expect(accountSummary({account: {full_name: 'Ana', has_claude_pro: true}, organization: {organization_type: 'team'}})).toEqual({
            who: 'Ana',
            plan: 'team',
            rateLimitTier: null,
            subtitle: 'Ana · Claude',
        });
        expect(accountSummary(null)).toBeNull();
    });

    it('descreve erros em português', () => {
        expect(claudeErrorMessage(401, null)).toBe('Sessão expirada. Entre de novo no Claude Code.');
        expect(claudeErrorMessage(403, 'Sem plano')).toBe('Sem plano');
        expect(claudeErrorMessage(403, null)).toBe('Sem assinatura ativa do Claude nesta conta.');
        expect(claudeErrorMessage(429, null)).toBe('Limite de requisições do Claude; tentando de novo em breve.');
        expect(claudeErrorMessage(null, null)).toBe('Não foi possível falar com o Claude.');
        expect(claudeErrorMessage(500, null)).toBe('Erro do Claude (HTTP 500).');
    });

    it('resume sessão e semana como medidores', () => {
        const now = Date.UTC(2026, 9, 28, 12);
        const window = {totalSeconds: null, apiLevel: 'ok', isActive: true} as const;
        const meters = claudeMeters(
            [
                {
                    ...window,
                    key: 'five_hour',
                    label: 'Sessão atual',
                    role: 'session',
                    utilization: 62,
                    resetsAt: new Date(now + 3600e3).toISOString(),
                },
                {...window, key: 'opus', label: 'Opus', role: 'scoped', utilization: 90, resetsAt: null},
                {...window, key: 'seven_day', label: 'Semana', role: 'weekly', utilization: 34, resetsAt: null},
            ],
            now,
        );
        expect(meters.map(({short, percent, note}) => [short, percent, note])).toEqual([
            ['Sessão 5 h', 62, 'Reinicia em 1 h'],
            ['Semana', 34, ''],
        ]);
    });
});
