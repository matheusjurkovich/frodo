import {pickActivity} from './activity-priority.js';

describe('prioridade da pílula', () => {
    it('mostra o estado mais alto', () => {
        expect(pickActivity([{kind: 'media'}, {kind: 'recording'}, {kind: 'claude-working'}])?.kind).toBe('recording');
        expect(pickActivity([{kind: 'volume'}, {kind: 'meeting'}])?.kind).toBe('meeting');
        expect(pickActivity([{kind: 'claude-working'}, {kind: 'notification'}])?.kind).toBe('notification');
    });

    it('mantém a ordem de chegada entre iguais', () => {
        expect(
            pickActivity([
                {kind: 'claude-waiting', id: 'a'},
                {kind: 'claude-waiting', id: 'b'},
            ])?.id,
        ).toBe('a');
    });

    it('sem atividade fica no repouso', () => {
        expect(pickActivity([])).toBeNull();
    });
});
