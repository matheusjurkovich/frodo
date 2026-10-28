import {pickActivity} from './activity-priority.js';

describe('prioridade da pílula', () => {
    it('mostra o estado mais alto', () => {
        expect(pickActivity([{kind: 'media'}, {kind: 'recording'}, {kind: 'claude-working'}])?.kind).toBe('recording');
        expect(pickActivity([{kind: 'volume'}, {kind: 'meeting'}])?.kind).toBe('meeting');
        expect(pickActivity([{kind: 'claude-working'}, {kind: 'notification'}])?.kind).toBe('notification');
    });

    it('notificação que chega vence até a gravação', () => {
        expect(pickActivity([{kind: 'recording'}, {kind: 'meeting'}, {kind: 'notification'}])?.kind).toBe('notification');
    });

    it('pedido de permissão vence o Claude esperando e perde da gravação', () => {
        expect(pickActivity([{kind: 'claude-waiting'}, {kind: 'claude-permission'}])?.kind).toBe('claude-permission');
        expect(pickActivity([{kind: 'claude-permission'}, {kind: 'recording'}])?.kind).toBe('recording');
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
