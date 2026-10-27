import {
    batteryLevel,
    ellipsize,
    formatAgo,
    formatDate,
    formatReset,
    formatSpan,
    formatTimer,
    formatTokens,
    formatUntil,
} from '../src/core/format.js';
import {barHeight, centerClamp, segmentWidths} from '../src/core/geometry.js';
import {formatGb, parseMeminfo} from '../src/core/memory.js';
import {latest, shouldIntercept} from '../src/core/notifications.js';
import {parseMetadata, trackFraction} from '../src/core/media.js';
import {isValidShortcut, shortcutLabel} from '../src/core/shortcut.js';
import {tabToOpen, visibleTabs} from '../src/core/tabs.js';
import {itemsForPreferences, moveItem} from '../src/core/items.js';
import {targetMonitors} from '../src/core/monitors.js';
import {CLOSED_MODES, TAB_IDS, isOneOf} from '../src/core/types.js';

describe('memory', () => {
    it('calcula usado a partir de MemAvailable', () => {
        expect(parseMeminfo('MemTotal:       14680064 kB\nMemFree: 1 kB\nMemAvailable:    8178893 kB\n')).toEqual({
            totalKb: 14680064,
            usedKb: 6501171,
        });
    });

    it('retorna null para texto inválido', () => {
        expect(parseMeminfo('lixo')).toBeNull();
    });

    it('formata em GB com uma casa', () => {
        expect(formatGb(6501171)).toBe('6.2G');
    });
});

describe('format', () => {
    const now = Date.UTC(2026, 9, 24, 12, 0);

    it('formata tempo até o reset', () => {
        expect(formatReset(new Date(now + 130 * 60e3).toISOString(), now)).toBe('em 2h 10m');
        expect(formatReset(new Date(now + 45 * 60e3).toISOString(), now)).toBe('em 45m');
        expect(formatReset(null, now)).toBe('');
    });

    it('usa dia e hora para resets distantes', () => {
        const far = new Date(now + 3 * 86400e3);
        const day = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sáb'][far.getDay()] ?? '';
        const time = `${String(far.getHours()).padStart(2, '0')}:${String(far.getMinutes()).padStart(2, '0')}`;
        expect(formatReset(far.toISOString(), now)).toBe(`${day} ${time}`);
    });

    it('formata data curta', () => {
        expect(formatDate(new Date(2026, 9, 24))).toBe('Sáb, 24 out');
    });

    it('escolhe o nível de bateria para o ícone', () => {
        expect(batteryLevel({percent: 95, charging: false})).toBe('full');
        expect(batteryLevel({percent: 72, charging: false})).toBe('high');
        expect(batteryLevel({percent: 40, charging: false})).toBe('medium');
        expect(batteryLevel({percent: 15, charging: false})).toBe('low');
        expect(batteryLevel({percent: 4, charging: false})).toBe('empty');
        expect(batteryLevel({percent: 50, charging: true})).toBe('charging');
    });

    it('corta textos longos', () => {
        expect(ellipsize('abc', 40)).toBe('abc');
        expect(ellipsize('a'.repeat(45), 40)).toBe(`${'a'.repeat(39)}…`);
    });
});

describe('geometry', () => {
    it('centraliza o painel na pílula dentro do monitor', () => {
        expect(centerClamp(900, 120, 600, 0, 1920)).toBe(660);
        expect(centerClamp(10, 120, 600, 0, 1920)).toBe(8);
        expect(centerClamp(1850, 60, 600, 0, 1920)).toBe(1312);
        expect(centerClamp(2800, 120, 600, 1920, 1920)).toBe(2560);
    });
});

describe('segmentWidths', () => {
    it('divide a largura pelas frações', () => {
        expect(segmentWidths([0.58, 0.36, 0.06], 200)).toEqual([116, 72, 12]);
    });

    it('não passa da largura total', () => {
        expect(segmentWidths([0.8, 0.5], 100)).toEqual([80, 20]);
        expect(segmentWidths([-1, 2], 50)).toEqual([0, 50]);
    });
});

describe('barHeight', () => {
    it('escala pela maior barra com piso de 3px', () => {
        expect(barHeight(900, 900, false)).toBe(64);
        expect(barHeight(450, 900, false)).toBe(32);
        expect(barHeight(1, 900, false)).toBe(3);
        expect(barHeight(0, 0, false)).toBe(3);
    });

    it('barra futura fica no piso', () => {
        expect(barHeight(900, 900, true)).toBe(3);
    });
});

describe('notifications', () => {
    it('intercepta só notificações normais sem ações', () => {
        expect(shouldIntercept({urgency: 1, actions: []})).toBeTrue();
        expect(shouldIntercept({urgency: 3, actions: []})).toBeFalse();
        expect(shouldIntercept({urgency: 1, actions: [{}]})).toBeFalse();
        expect(shouldIntercept(null)).toBeFalse();
    });

    it('ordena as mais recentes primeiro', () => {
        expect(latest([{t: 1}, {t: 5}, {t: 3}], n => n.t, 2).map(n => n.t)).toEqual([5, 3]);
    });
});

describe('shortcut', () => {
    it('exige tecla e modificador', () => {
        expect(isValidShortcut(true, 122, 64)).toBeTrue();
        expect(isValidShortcut(true, 122, 0)).toBeFalse();
        expect(isValidShortcut(false, 0, 0)).toBeFalse();
    });
});

describe('types', () => {
    it('valida valores de enum de configuração', () => {
        expect(isOneOf(CLOSED_MODES, 'compact')).toBeTrue();
        expect(isOneOf(CLOSED_MODES, 'outro')).toBeFalse();
    });
});

describe('itens da ilha fechada', () => {
    it('lista ativos na ordem salva e depois os inativos na ordem canônica', () => {
        expect(itemsForPreferences(['ram', 'clock'])).toEqual([
            {item: 'ram', enabled: true},
            {item: 'clock', enabled: true},
            {item: 'system', enabled: false},
            {item: 'battery', enabled: false},
            {item: 'claude-session', enabled: false},
            {item: 'claude-weekly', enabled: false},
        ]);
    });

    it('move um item e devolve só os ativos na nova ordem', () => {
        const entries = itemsForPreferences(['clock', 'system', 'ram']);
        expect(moveItem(entries, 2, 0)).toEqual(['ram', 'clock', 'system']);
        expect(moveItem(entries, 0, 4)).toEqual(['system', 'ram', 'clock']);
    });

    it('ignora movimentos fora da lista', () => {
        const entries = itemsForPreferences(['clock', 'ram']);
        expect(moveItem(entries, 9, 0)).toEqual(['clock', 'ram']);
    });
});

describe('monitores', () => {
    it('usa só o principal', () => {
        expect(targetMonitors('primary', 1, 3)).toEqual([1]);
    });

    it('usa o primeiro secundário e cai para o principal sem segundo monitor', () => {
        expect(targetMonitors('secondary', 0, 2)).toEqual([1]);
        expect(targetMonitors('secondary', 1, 3)).toEqual([0]);
        expect(targetMonitors('secondary', 0, 1)).toEqual([0]);
    });

    it('usa todos com o principal primeiro', () => {
        expect(targetMonitors('both', 1, 3)).toEqual([1, 0, 2]);
        expect(targetMonitors('both', 0, 0)).toEqual([]);
    });
});

describe('formatos do redesign', () => {
    const now = Date.UTC(2026, 9, 27, 12);

    it('data do cabeçalho', () => {
        expect(formatDate(new Date(2026, 9, 27))).toBe('Ter, 27 out');
    });

    it('tokens em pt-BR compacto', () => {
        expect([940, 612_000, 148_400, 999_600, 4_100_000, 27_000_000, 1_240_000_000].map(formatTokens)).toEqual([
            '940',
            '612 mil',
            '148 mil',
            '1 mi',
            '4,1 mi',
            '27 mi',
            '1,2 bi',
        ]);
    });

    it('cronômetro de faixa e gravação', () => {
        expect([0, 84, 232, 3725].map(formatTimer)).toEqual(['0:00', '1:24', '3:52', '1:02:05']);
    });

    it('há quanto tempo', () => {
        expect([now - 30e3, now - 9 * 60e3, now - 2 * 3600e3, now - 3 * 86400e3].map(at => formatAgo(at, now))).toEqual([
            'agora',
            '9 min',
            '2 h',
            '3 d',
        ]);
    });

    it('quanto falta', () => {
        expect([now + 5 * 60e3, now + 4 * 60e3 + 10e3, now, now - 60e3].map(at => formatUntil(at, now))).toEqual([
            'Em 5 min',
            'Em 5 min',
            'Agora',
            'Agora',
        ]);
    });

    it('duração de sessão', () => {
        expect([30, 240, 3840].map(formatSpan)).toEqual(['1 min', '4 min', '1 h 04 min']);
    });

    it('rótulo do atalho', () => {
        expect(shortcutLabel('<Super>z')).toBe('Super + Z');
        expect(shortcutLabel('<Super><Shift>z')).toBe('Super + Shift + Z');
        expect(shortcutLabel('<Control><Alt>Delete')).toBe('Ctrl + Alt + Delete');
        expect(shortcutLabel('')).toBe('');
    });
});

describe('abas', () => {
    it('mostra as não ocultas na ordem fixa', () => {
        expect(visibleTabs([])).toEqual(['general', 'calendar', 'workspaces', 'claude', 'notifications']);
        expect(visibleTabs(['calendar', 'claude'])).toEqual(['general', 'workspaces', 'notifications']);
    });

    it('nunca fica sem aba', () => {
        expect(visibleTabs([...TAB_IDS])).toEqual(['general']);
    });

    it('abre a primeira visível quando a pedida está oculta', () => {
        expect(tabToOpen('claude', ['general', 'claude'])).toBe('claude');
        expect(tabToOpen('claude', ['calendar', 'notifications'])).toBe('calendar');
    });
});

describe('mídia', () => {
    it('lê os metadados do MPRIS', () => {
        expect(
            parseMetadata({'xesam:title': 'Faixa', 'xesam:artist': ['A', 'B'], 'mpris:artUrl': 'file:///c.png', 'mpris:length': 232000000}),
        ).toEqual({title: 'Faixa', artist: 'A, B', coverUrl: 'file:///c.png', lengthUs: 232000000});
        expect(parseMetadata({})).toEqual({title: '', artist: '', coverUrl: '', lengthUs: null});
    });

    it('calcula o progresso só com duração conhecida', () => {
        expect(trackFraction(84e6, 232e6)).toBeCloseTo(0.362, 3);
        expect(trackFraction(10, null)).toBeNull();
        expect(trackFraction(null, 100)).toBeNull();
        expect(trackFraction(300, 100)).toBe(1);
    });
});
