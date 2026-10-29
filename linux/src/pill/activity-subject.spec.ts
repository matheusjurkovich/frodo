import type {PendingRequest, SessionState} from '../features/claude/claude-sessions.js';
import type {MediaTrack} from '../features/media/media-service.js';
import type {InterceptedNotification} from '../features/notifications/notification-bridge-service.js';
import type {PillActivity} from './activity-feed.js';
import {sameSubject} from './activity-subject.js';

const session = (sessionId: string, step = ''): SessionState => ({sessionId, step}) as SessionState;
const request = (key: string): PendingRequest => ({key}) as PendingRequest;
const item = (title: string): InterceptedNotification => ({gicon: null, app: 'app', title, body: ''});
const track = (title: string, coverUrl = ''): MediaTrack => ({title, artist: 'a', app: 'p', coverUrl}) as MediaTrack;

const working = (id: string, step = ''): PillActivity => ({kind: 'claude-working', session: session(id, step)});

describe('sameSubject', () => {
    it('ocioso com ocioso é o mesmo assunto', () => {
        expect(sameSubject(null, null)).toBeTrue();
    });

    it('ocioso com atividade muda de assunto', () => {
        expect(sameSubject(null, {kind: 'volume', percent: 30})).toBeFalse();
    });

    it('tipos diferentes da mesma sessão mudam de assunto', () => {
        expect(sameSubject({kind: 'claude-waiting', session: session('a')}, working('a'))).toBeFalse();
    });

    it('volume e gravação mudam no lugar', () => {
        expect(sameSubject({kind: 'volume', percent: 30}, {kind: 'volume', percent: 31})).toBeTrue();
        expect(sameSubject({kind: 'recording', startedAt: 1}, {kind: 'recording', startedAt: 2})).toBeTrue();
    });

    it('passo novo do claude na mesma sessão muda no lugar', () => {
        expect(sameSubject(working('a', 'Read'), working('a', 'Bash'))).toBeTrue();
        expect(sameSubject(working('a'), working('b'))).toBeFalse();
    });

    it('outro pedido de permissão muda de assunto', () => {
        const ask = (key: string): PillActivity => ({kind: 'claude-permission', session: session('a'), request: request(key)});
        expect(sameSubject(ask('a.1'), ask('a.1'))).toBeTrue();
        expect(sameSubject(ask('a.1'), ask('a.2'))).toBeFalse();
    });

    it('reunião compara título e horário', () => {
        expect(
            sameSubject({kind: 'meeting', title: 'x', startsAt: 1, url: null}, {kind: 'meeting', title: 'x', startsAt: 1, url: null}),
        ).toBeTrue();
        expect(
            sameSubject({kind: 'meeting', title: 'x', startsAt: 1, url: null}, {kind: 'meeting', title: 'x', startsAt: 2, url: null}),
        ).toBeFalse();
    });

    it('notificação compara o próprio item', () => {
        const first = item('oi');
        expect(sameSubject({kind: 'notification', item: first}, {kind: 'notification', item: first})).toBeTrue();
        expect(sameSubject({kind: 'notification', item: first}, {kind: 'notification', item: item('oi')})).toBeFalse();
    });

    it('música troca de assunto só com outra faixa', () => {
        expect(sameSubject({kind: 'media', track: track('t', 'a.png')}, {kind: 'media', track: track('t', 'b.png')})).toBeTrue();
        expect(sameSubject({kind: 'media', track: track('t')}, {kind: 'media', track: track('u')})).toBeFalse();
    });
});
