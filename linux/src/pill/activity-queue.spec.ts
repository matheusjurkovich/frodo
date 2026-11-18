import type {PendingRequest, SessionState} from '../features/claude/claude-sessions.types.js';
import type {AiProvider} from '../shared/ai-provider.types.js';
import type {PillActivity} from './activity-feed.types.js';
import {queued, queueLabel} from './activity-queue.js';

function session(provider: AiProvider): SessionState {
    return {
        provider,
        sessionId: 's',
        cwd: '/r',
        repo: 'r',
        status: 'waiting',
        tool: null,
        step: '',
        pid: null,
        since: 0,
        updatedAt: 0,
    };
}

function permission(provider: AiProvider): PillActivity {
    const request: PendingRequest = {key: 's.r', sessionId: 's', request: 'r', pid: 1, tool: 'Bash', summary: 'Bash', since: 0};
    return {kind: 'claude-permission', session: session(provider), request};
}

const recording: PillActivity = {kind: 'recording', startedAt: 0};
const meeting: PillActivity = {kind: 'meeting', title: 'x', startsAt: 0, url: null};
const notification: PillActivity = {kind: 'notification', item: {gicon: null, app: 'a', title: 't', body: ''}};

describe('fila da pílula', () => {
    it('não conta o atual nem as sobreposições', () => {
        expect(queued([recording, meeting, notification], recording)).toEqual([meeting]);
    });

    it('nomeia os itens da fila', () => {
        expect(queueLabel([permission('claude'), meeting])).toBe('Mais 2 na fila: Claude aguardando você, reunião em breve');
    });

    it('usa o nome do provedor', () => {
        expect(queueLabel([permission('codex')])).toBe('Mais 1 na fila: Codex aguardando você');
    });
});
