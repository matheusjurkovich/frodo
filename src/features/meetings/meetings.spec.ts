import {nextMeeting} from './meetings.js';

const NOW = new Date(2026, 9, 28, 10, 0, 0).getTime();

const LEAD = 10 * 60e3;

function at(offsetMs: number, durationMs = 3600e3): {summary: string; date: Date; end: Date} {
    return {summary: `em ${offsetMs}`, date: new Date(NOW + offsetMs), end: new Date(NOW + offsetMs + durationMs)};
}

describe('próxima reunião', () => {
    it('sem eventos não há reunião', () => {
        expect(nextMeeting([], NOW, LEAD)).toBeNull();
    });

    it('escolhe a que começa primeiro dentro da janela', () => {
        const events = [at(8 * 60e3), at(3 * 60e3), at(5 * 60e3)];
        expect(nextMeeting(events, NOW, LEAD)).toEqual({title: 'em 180000', startsAt: NOW + 3 * 60e3});
    });

    it('ignora a que já começou, inclusive no instante exato', () => {
        expect(nextMeeting([at(-60e3), at(0)], NOW, LEAD)).toBeNull();
        expect(nextMeeting([at(-60e3), at(60e3)], NOW, LEAD)?.startsAt).toBe(NOW + 60e3);
    });

    it('ignora a que começa depois da janela e aceita a do limite', () => {
        expect(nextMeeting([at(LEAD + 1)], NOW, LEAD)).toBeNull();
        expect(nextMeeting([at(LEAD)], NOW, LEAD)?.startsAt).toBe(NOW + LEAD);
    });

    it('ignora evento de dia inteiro e aceita reunião que começa à meia-noite', () => {
        const midnight = new Date(2026, 9, 29, 0, 0, 0).getTime();
        const now = midnight - 5 * 60e3;
        const allDay = {summary: 'Feriado', date: new Date(2026, 9, 29), end: new Date(2026, 9, 30)};
        const late = {summary: 'Plantão', date: new Date(2026, 9, 29, 0, 0), end: new Date(2026, 9, 29, 1, 0)};
        expect(nextMeeting([allDay], now, LEAD)).toBeNull();
        expect(nextMeeting([allDay, late], now, LEAD)).toEqual({title: 'Plantão', startsAt: midnight});
    });
});
