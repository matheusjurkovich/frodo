import {latest, shouldIntercept} from './notifications.js';

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
