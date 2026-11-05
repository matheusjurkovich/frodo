import {DoneAlert} from './done-alert-service.js';
import type {SessionState, SessionStatus} from './claude-sessions.types.js';
import {Changes, createSettings} from '../../../tests/fixtures.js';

function state(sessionId: string, status: SessionStatus, changes: Partial<SessionState> = {}): SessionState {
    return {
        provider: 'claude',
        sessionId,
        cwd: `/r/${sessionId}`,
        repo: sessionId,
        status,
        tool: null,
        step: '',
        pid: 1,
        since: 0,
        updatedAt: 0,
        ...changes,
    };
}

class FakeSessions extends Changes {
    sessions: readonly SessionState[] = [];

    set(sessions: readonly SessionState[]): void {
        this.sessions = sessions;
        this.fire();
    }
}

describe('DoneAlert', () => {
    const settings = createSettings();
    let sessions: FakeSessions;
    let notify: jasmine.Spy;
    let alert: DoneAlert;

    beforeEach(() => {
        settings.notifyDone = true;
        sessions = new FakeSessions();
        notify = jasmine.createSpy('notify');
        sessions.sessions = [state('a', 'working')];
        alert = new DoneAlert(settings, sessions, {notify});
    });

    afterEach(() => {
        alert.destroy();
    });

    it('avisa quando uma sessão que trabalhava termina, com o provedor e o repositório', () => {
        sessions.set([state('a', 'done')]);
        expect(notify).toHaveBeenCalledOnceWith('claude', 'Pronto', 'Claude terminou em a');
    });

    it('não avisa de novo enquanto a sessão segue pronta', () => {
        sessions.set([state('a', 'done')]);
        sessions.set([state('a', 'done')]);
        expect(notify).toHaveBeenCalledTimes(1);
    });

    it('não avisa sessão que já aparece pronta ou que só passa a esperar', () => {
        sessions.set([state('a', 'waiting'), state('b', 'done', {provider: 'codex'})]);
        sessions.set([state('a', 'done'), state('b', 'done', {provider: 'codex'})]);
        expect(notify).not.toHaveBeenCalled();
    });

    it('avisa cada sessão que termina no mesmo lote', () => {
        sessions.set([state('a', 'working'), state('b', 'working', {provider: 'gemini'})]);
        sessions.set([state('a', 'done'), state('b', 'done', {provider: 'gemini'})]);
        expect(notify.calls.allArgs()).toEqual([
            ['claude', 'Pronto', 'Claude terminou em a'],
            ['gemini', 'Pronto', 'Gemini terminou em b'],
        ]);
    });

    it('com o aviso desligado não notifica, mas segue o estado', () => {
        settings.notifyDone = false;
        sessions.set([state('a', 'done')]);
        settings.notifyDone = true;
        sessions.set([state('a', 'done')]);
        expect(notify).not.toHaveBeenCalled();
    });

    it('para de ouvir depois de destruído', () => {
        alert.destroy();
        sessions.set([state('a', 'done')]);
        expect(notify).not.toHaveBeenCalled();
    });
});
