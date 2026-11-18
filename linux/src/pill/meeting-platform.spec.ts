import {meetingPlatform} from './meeting-platform.js';

describe('meetingPlatform', () => {
    it('reconhece o Google Meet pelo domínio', () => {
        expect(meetingPlatform('https://meet.google.com/abc-defg-hij')).toBe('Google Meet');
    });

    it('devolve nulo sem link ou com plataforma desconhecida', () => {
        expect(meetingPlatform(null)).toBeNull();
        expect(meetingPlatform('https://zoom.us/j/1')).toBeNull();
    });

    it('devolve nulo para link malformado', () => {
        expect(meetingPlatform('não é link')).toBeNull();
    });
});
