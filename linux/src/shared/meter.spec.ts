import {meterLevel, quotaNotices, resetNote, shownMeterPercent} from './meter.js';
import type {QuotaReading} from './meter.js';

describe('medidores de cota', () => {
    const now = new Date(2026, 9, 28, 10, 0).getTime();

    it('classifica o nível pelo uso', () => {
        expect(meterLevel(10)).toBe('ok');
        expect(meterLevel(80)).toBe('warn');
        expect(meterLevel(97)).toBe('crit');
    });

    it('descreve quando a cota reinicia', () => {
        expect(resetNote(now - 1, now)).toBe('Reiniciada');
        expect(resetNote(now + 20 * 60e3, now)).toBe('Reinicia em 20 min');
        expect(resetNote(now + 130 * 60e3, now)).toBe('Reinicia em 2 h 10 min');
        expect(resetNote(now + 3 * 3600e3, now)).toBe('Reinicia em 3 h');
        expect(resetNote(new Date(2026, 9, 31, 14, 0).getTime(), now)).toBe('Reinicia sábado, 14:00');
    });

    it('mostra o restante quando pedido', () => {
        expect(shownMeterPercent(30, false)).toBe(30);
        expect(shownMeterPercent(30, true)).toBe(70);
        expect(shownMeterPercent(140, false)).toBe(100);
    });
});

describe('avisos de cota', () => {
    const claude = (percent: number): QuotaReading => ({id: 'claude:/c:session', name: 'Claude', window: '5 h', percent});

    it('primeira leitura só registra, sem aviso', () => {
        const {states, notices} = quotaNotices(new Map(), [claude(90)]);
        expect(notices).toEqual([]);
        expect(states.get('claude:/c:session')).toBe('warn');
    });

    it('cruzar 80% avisa uma vez', () => {
        const first = quotaNotices(new Map([['claude:/c:session', 'ok']]), [claude(82)]);
        expect(first.notices).toEqual([{title: 'Cota em 80%', body: 'Claude: 80% da cota de 5 h'}]);
        expect(quotaNotices(first.states, [claude(85)]).notices).toEqual([]);
    });

    it('pular de 70% para 97% avisa só o de 95%', () => {
        expect(quotaNotices(new Map([['claude:/c:session', 'ok']]), [claude(97)]).notices).toEqual([
            {title: 'Cota em 95%', body: 'Claude: 95% da cota de 5 h'},
        ]);
    });

    it('cair de 96% para 90% não repete aviso', () => {
        const fell = quotaNotices(new Map([['claude:/c:session', 'crit']]), [claude(90)]);
        expect(fell.notices).toEqual([]);
        expect(quotaNotices(fell.states, [claude(96)]).notices).toEqual([]);
    });

    it('voltar abaixo de 80% depois de alerta avisa cota renovada', () => {
        const codex: QuotaReading = {id: 'codex:weekly', name: 'Codex', window: 'semana', percent: 12};
        const {states, notices} = quotaNotices(new Map([['codex:weekly', 'warn']]), [codex]);
        expect(notices).toEqual([{title: 'Cota renovada', body: 'Codex: cota de semana renovada'}]);
        expect(states.get('codex:weekly')).toBe('ok');
    });

    it('janela do codex expirada (0%) depois de alerta vira renovada', () => {
        const expired: QuotaReading = {id: 'codex:session', name: 'Codex', window: '5 h', percent: 0};
        expect(quotaNotices(new Map([['codex:session', 'crit']]), [expired]).notices).toEqual([
            {title: 'Cota renovada', body: 'Codex: cota de 5 h renovada'},
        ]);
    });

    it('medidor que some é esquecido e volta como primeira leitura', () => {
        const other: QuotaReading = {id: 'claude:/outro:session', name: 'Claude', window: '5 h', percent: 10};
        const switched = quotaNotices(new Map([['claude:/c:session', 'crit']]), [other]);
        expect(switched.notices).toEqual([]);
        expect(switched.states.has('claude:/c:session')).toBeFalse();
        expect(quotaNotices(switched.states, [claude(96)]).notices).toEqual([]);
    });
});
