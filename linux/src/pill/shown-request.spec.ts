import type {DecidedRequest, PendingRequest, SessionState} from '../features/claude/claude-sessions.types.js';
import {shownRequest} from './shown-request.js';

describe('shownRequest', () => {
    const request = {id: 'r1'} as unknown as PendingRequest;
    const session = {} as unknown as SessionState;

    it('devolve o pedido de uma atividade de permissão', () => {
        expect(shownRequest({kind: 'claude-permission', session, request})).toBe(request);
    });

    it('sem atividade não há pedido', () => {
        expect(shownRequest(null)).toBeNull();
    });

    it('gravação não tem pedido', () => {
        expect(shownRequest({kind: 'recording', startedAt: 0})).toBeNull();
    });

    it('confirmação de decisão não tem pedido', () => {
        const decided = {request} as unknown as DecidedRequest;
        expect(shownRequest({kind: 'decision', decided})).toBeNull();
    });
});
