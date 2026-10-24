import {batteryLevel, ellipsize, formatDate, formatReset} from '../src/core/format.js';
import {centerClamp} from '../src/core/geometry.js';
import {formatGb, parseMeminfo} from '../src/core/memory.js';
import {latest, shouldIntercept} from '../src/core/notifications.js';
import {isValidShortcut} from '../src/core/shortcut.js';
import {itemsForPreferences, moveItem} from '../src/core/items.js';
import {targetMonitors} from '../src/core/monitors.js';
import {CLOSED_MODES, isOneOf} from '../src/core/types.js';

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
        expect(formatDate(new Date(2026, 9, 24))).toBe('sáb, 24 out');
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
