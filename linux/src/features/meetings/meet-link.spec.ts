import {icalValue, isEnabledCalendar, meetLink, meetLinkFor, rangeQuery} from './meet-link.js';

const EVENT = [
    'BEGIN:VEVENT',
    'DTSTART;TZID=America/Sao_Paulo:20261029T110000',
    'ORGANIZER;CN="Ana: produto":mailto:ana@example.com',
    'X-GOOGLE-CONFERENCE:https://meet.google.com/nep-ynrv-hbb',
    'DESCRIPTION:Entrar com o Google Meet: https:',
    ' //meet.google.com/abc-defg-hij\\nOu disque',
    'SUMMARY:Revisão de design\\, ilha',
    'END:VEVENT',
].join('\r\n');

describe('link do meet', () => {
    it('lê o valor desdobrando linhas e desfazendo escapes', () => {
        expect(icalValue(EVENT, 'SUMMARY')).toBe('Revisão de design, ilha');
        expect(icalValue(EVENT, 'ORGANIZER')).toBe('mailto:ana@example.com');
        expect(icalValue(EVENT, 'LOCATION')).toBeNull();
    });

    it('prefere o X-GOOGLE-CONFERENCE', () => {
        expect(meetLink(EVENT)).toBe('https://meet.google.com/nep-ynrv-hbb');
    });

    it('sem X-GOOGLE-CONFERENCE acha o link na descrição dobrada', () => {
        const event = EVENT.replace('X-GOOGLE-CONFERENCE:https://meet.google.com/nep-ynrv-hbb\r\n', '');
        expect(meetLink(event)).toBe('https://meet.google.com/abc-defg-hij');
    });

    it('sem link do meet não devolve nada', () => {
        expect(meetLink('BEGIN:VEVENT\r\nSUMMARY:Almoço\r\nEND:VEVENT')).toBeNull();
    });

    it('escolhe o evento pelo título', () => {
        const other = 'BEGIN:VEVENT\r\nSUMMARY:Outra\r\nX-GOOGLE-CONFERENCE:https://meet.google.com/aaa-bbbb-ccc\r\nEND:VEVENT';
        expect(meetLinkFor([other, EVENT], 'Revisão de design, ilha')).toBe('https://meet.google.com/nep-ynrv-hbb');
        expect(meetLinkFor([other], 'Revisão de design, ilha')).toBeNull();
    });

    it('só aceita fonte de calendário ligada', () => {
        expect(isEnabledCalendar('[Data Source]\nDisplayName=Trabalho\nEnabled=true\n\n[Calendar]\nColor=#fff')).toBeTrue();
        expect(isEnabledCalendar('[Data Source]\nEnabled=false\n\n[Calendar]\n')).toBeFalse();
        expect(isEnabledCalendar('[Data Source]\nEnabled=true\n\n[Address Book]\n')).toBeFalse();
    });

    it('monta a busca em UTC com margem de um minuto', () => {
        expect(rangeQuery(Date.UTC(2026, 9, 29, 14, 0, 0))).toBe(
            '(occur-in-time-range? (make-time "20261029T135900Z") (make-time "20261029T140100Z"))',
        );
    });
});
