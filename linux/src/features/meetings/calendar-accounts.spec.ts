import {needingAttention} from './calendar-accounts.js';
import type {AccountInfo} from './calendar-accounts.types.js';

const google: AccountInfo = {provider: 'Google', attentionNeeded: true, hasCalendar: true, calendarDisabled: false};

describe('needingAttention', () => {
    it('conta com agenda ligada e atenção pendente aparece', () => {
        expect(needingAttention([google])).toEqual({provider: 'Google'});
    });

    it('agenda desligada não conta', () => {
        expect(needingAttention([{...google, calendarDisabled: true}])).toBeNull();
    });

    it('conta sem agenda não conta', () => {
        expect(needingAttention([{...google, hasCalendar: false}])).toBeNull();
    });

    it('sem atenção pendente não conta', () => {
        expect(needingAttention([{...google, attentionNeeded: false}])).toBeNull();
    });

    it('pega a primeira conta que precisa de atenção', () => {
        const ok = {...google, provider: 'Outra', attentionNeeded: false};
        expect(needingAttention([ok, google])).toEqual({provider: 'Google'});
    });
});
