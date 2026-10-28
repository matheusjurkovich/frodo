import type {PendingRequest, SessionState, SessionStatus} from '../features/claude/claude-sessions.js';
import type {MediaTrack} from '../features/media/media-service.js';
import type {NotificationBridgeEvents} from '../features/notifications/notification-bridge-service.js';
import {ActivityFeed} from './activity-feed.js';
import type {FeedSources} from './activity-feed.js';
import {Emitter} from '../shared/emitter.js';
import {Timer} from '../shared/timer.js';

class FakeRecording extends Emitter<{changed: []}> {
    startedAt: number | null = null;

    set(startedAt: number | null): void {
        this.startedAt = startedAt;
        this.emit('changed');
    }
}

class FakeSessions extends Emitter<{changed: []}> {
    sessions: readonly SessionState[] = [];
    pending: readonly PendingRequest[] = [];

    set(sessions: readonly SessionState[], pending: readonly PendingRequest[] = []): void {
        this.sessions = sessions;
        this.pending = pending;
        this.emit('changed');
    }
}

class FakeMeetings extends Emitter<{changed: []}> {
    next: {title: string; startsAt: number} | null = null;

    set(next: {title: string; startsAt: number} | null): void {
        this.next = next;
        this.emit('changed');
    }
}

class FakeBridge extends Emitter<NotificationBridgeEvents> {
    push(title: string): void {
        this.emit('intercepted', {gicon: null, app: 'app', title, body: ''});
    }
}

class FakeVolume extends Emitter<{changed: [number]}> {
    set(percent: number): void {
        this.emit('changed', percent);
    }
}

class FakeMedia extends Emitter<{changed: []}> {
    current: MediaTrack | null = null;

    set(current: MediaTrack | null): void {
        this.current = current;
        this.emit('changed');
    }
}

function session(id: string, status: SessionStatus, step = '', tool: string | null = null): SessionState {
    return {
        sessionId: id,
        cwd: '/r',
        repo: 'r',
        status,
        tool,
        step,
        pid: null,
        since: Date.now(),
        updatedAt: Date.now(),
    };
}

function request(sessionId: string, name: string, since: number): PendingRequest {
    return {key: `${sessionId}.${name}`, sessionId, request: name, pid: 1, tool: 'Bash', since};
}

function track(playing: boolean, title = 't'): MediaTrack {
    return {title, artist: 'a', coverUrl: '', lengthUs: null, app: 'p', playing, canPrevious: false, canNext: false};
}

interface Armed {
    readonly ms: number;
    readonly callback: () => void;
}

interface FakeTimers {
    readonly armed: Map<Timer, Armed>;
    onceMs(): number[];
    fire(ms: number): void;
}

function fakeTimers(): FakeTimers {
    const armed = new Map<Timer, Armed>();
    const once = spyOn(Timer.prototype, 'once').and.callFake(function (this: Timer, ms: number, callback: () => void): void {
        armed.set(this, {ms, callback});
    });
    spyOnProperty(Timer.prototype, 'active', 'get').and.callFake(function (this: Timer): boolean {
        return armed.has(this);
    });
    spyOn(Timer.prototype, 'stop').and.callFake(function (this: Timer): void {
        armed.delete(this);
    });
    return {
        armed,
        onceMs: (): number[] => once.calls.allArgs().map(([ms]) => ms),
        fire: (ms: number): void => {
            const entry = [...armed].find(([, candidate]) => candidate.ms === ms);
            if (!entry) throw new Error(`nenhum timer de ${ms} ms armado`);
            armed.delete(entry[0]);
            entry[1].callback();
        },
    };
}

describe('ActivityFeed', () => {
    let timers: FakeTimers;
    let recording: FakeRecording;
    let sessions: FakeSessions;
    let meetings: FakeMeetings;
    let bridge: FakeBridge;
    let volume: FakeVolume;
    let media: FakeMedia;
    let feed: ActivityFeed;
    let changes: number;

    function notificationTitle(): string | null {
        const {current} = feed;
        return current?.kind === 'notification' ? current.item.title : null;
    }

    beforeEach(() => {
        timers = fakeTimers();
        recording = new FakeRecording();
        sessions = new FakeSessions();
        meetings = new FakeMeetings();
        bridge = new FakeBridge();
        volume = new FakeVolume();
        media = new FakeMedia();
        const sources: FeedSources = {recording, sessions, meetings, bridge, volume, media};
        feed = new ActivityFeed(sources);
        changes = 0;
        feed.on('changed', () => {
            changes++;
        });
    });

    afterEach(() => {
        feed.destroy();
    });

    it('sem fontes ativas fica no repouso', () => {
        expect(feed.current).toBeNull();
    });

    it('gravação vence o resto e devolve a vez ao parar', () => {
        media.set(track(true));
        recording.set(1000);
        expect(feed.current).toEqual({kind: 'recording', startedAt: 1000});
        recording.set(null);
        expect(feed.current?.kind).toBe('media');
        expect(changes).toBe(3);
    });

    it('sessões entram pelo status e ignoram as concluídas', () => {
        sessions.set([session('a', 'done'), session('b', 'working', 'Bash ls', 'Bash')]);
        expect(feed.current?.kind).toBe('claude-working');
        sessions.set([session('a', 'done'), session('b', 'working', 'Bash ls', 'Bash'), session('c', 'waiting')]);
        expect(feed.current?.kind).toBe('claude-waiting');
        sessions.set([session('a', 'done')]);
        expect(feed.current).toBeNull();
    });

    it('pedido pendente vira pedido de permissão com botões', () => {
        sessions.set([session('a', 'waiting')], [request('a', 'r1', 10)]);
        const current = feed.current;
        expect(current?.kind).toBe('claude-permission');
        expect(current?.kind === 'claude-permission' ? current.request.key : null).toBe('a.r1');
    });

    it('com vários pedidos vence o mais antigo', () => {
        sessions.set([session('a', 'waiting'), session('b', 'waiting')], [request('a', 'r1', 20), request('b', 'r2', 10)]);
        const current = feed.current;
        expect(current?.kind === 'claude-permission' ? current.request.key : null).toBe('b.r2');
    });

    it('sessão esperando sem pedido continua só com Abrir', () => {
        sessions.set([session('a', 'waiting')]);
        expect(feed.current?.kind).toBe('claude-waiting');
    });

    it('pedido de sessão desconhecida é ignorado', () => {
        sessions.set([], [request('x', 'r1', 10)]);
        expect(feed.current).toBeNull();
    });

    it('só emite quando o conteúdo muda', () => {
        sessions.set([session('a', 'working', 'Bash ls', 'Bash')]);
        sessions.set([session('a', 'working', 'Bash ls', 'Bash')]);
        expect(changes).toBe(1);
        sessions.set([session('a', 'working', 'Edit x', 'Edit')]);
        expect(changes).toBe(2);
    });

    it('Claude trabalhando aparece 5 s a cada ferramenta nova e some', () => {
        sessions.set([session('a', 'working', 'Bash ls', 'Bash')]);
        expect(feed.current?.kind).toBe('claude-working');
        expect(timers.onceMs()).toEqual([5000]);
        timers.fire(5000);
        expect(feed.current).toBeNull();
        sessions.set([session('a', 'working', 'Bash ls', 'Bash')]);
        expect(feed.current).toBeNull();
        sessions.set([session('a', 'working', 'Edit x', 'Edit')]);
        expect(feed.current?.kind).toBe('claude-working');
        expect(timers.onceMs()).toEqual([5000, 5000]);
    });

    it('Claude pensando, sem ferramenta, não aparece', () => {
        sessions.set([session('a', 'working', 'Pensando')]);
        expect(feed.current).toBeNull();
        expect(timers.armed.size).toBe(0);
    });

    it('sessão que já trabalhava ao ligar não pisca', () => {
        sessions.set([session('a', 'working', 'Bash ls', 'Bash')]);
        const later = new ActivityFeed({recording, sessions, meetings, bridge, volume, media});
        expect(later.current).toBeNull();
        later.destroy();
    });

    it('mídia só entra tocando', () => {
        media.set(track(false));
        expect(feed.current).toBeNull();
        media.set(track(true));
        expect(feed.current?.kind).toBe('media');
    });

    it('mídia aparece 5 s ao começar a tocar e some', () => {
        media.set(track(true));
        expect(timers.onceMs()).toEqual([5000]);
        timers.fire(5000);
        expect(feed.current).toBeNull();
        media.set(track(true));
        expect(feed.current).toBeNull();
        expect(timers.armed.size).toBe(0);
    });

    it('mídia volta a aparecer ao retomar ou trocar de faixa', () => {
        media.set(track(true));
        timers.fire(5000);
        media.set(track(false));
        media.set(track(true));
        expect(feed.current?.kind).toBe('media');
        timers.fire(5000);
        media.set(track(true, 'outra'));
        expect(feed.current?.kind).toBe('media');
    });

    it('mídia que já tocava ao ligar não aparece', () => {
        media.set(track(true));
        const later = new ActivityFeed({recording, sessions, meetings, bridge, volume, media});
        expect(later.current).toBeNull();
        later.destroy();
    });

    it('notificação vence a reunião e a gravação', () => {
        meetings.set({title: 'Daily', startsAt: 5000});
        recording.set(1000);
        bridge.push('Oi');
        expect(notificationTitle()).toBe('Oi');
        timers.fire(3000);
        expect(feed.current).toEqual({kind: 'recording', startedAt: 1000});
    });

    it('a fila de notificações avança de 3 s em 3 s e recomeça depois de esvaziar', () => {
        bridge.push('a');
        expect(timers.onceMs()).toEqual([3000]);
        bridge.push('b');
        expect(timers.onceMs()).toEqual([3000]);
        expect(notificationTitle()).toBe('a');
        timers.fire(3000);
        expect(notificationTitle()).toBe('b');
        expect(timers.onceMs()).toEqual([3000, 3000]);
        timers.fire(3000);
        expect(feed.current).toBeNull();
        expect(timers.armed.size).toBe(0);
        bridge.push('c');
        expect(notificationTitle()).toBe('c');
        expect(timers.onceMs()).toEqual([3000, 3000, 3000]);
        expect(changes).toBe(4);
    });

    it('o volume some em 1,5 s e rearma a cada mudança', () => {
        volume.set(40);
        volume.set(55);
        expect(timers.onceMs()).toEqual([1500, 1500]);
        timers.fire(1500);
        expect(feed.current).toBeNull();
        volume.set(55);
        expect(feed.current).toEqual({kind: 'volume', percent: 55});
        expect(timers.onceMs()).toEqual([1500, 1500, 1500]);
    });

    it('notificação e volume têm relógios independentes', () => {
        bridge.push('a');
        volume.set(40);
        expect(timers.onceMs()).toEqual([3000, 1500]);
        expect(feed.current?.kind).toBe('notification');
        timers.fire(3000);
        expect(feed.current).toEqual({kind: 'volume', percent: 40});
        timers.fire(1500);
        expect(feed.current).toBeNull();
    });

    it('cancelTransient para os relógios e descarta a fila', () => {
        bridge.push('a');
        bridge.push('b');
        volume.set(40);
        media.set(track(true));
        expect(feed.current?.kind).toBe('notification');
        feed.cancelTransient();
        expect(feed.current).toBeNull();
        expect(timers.armed.size).toBe(0);
        bridge.push('c');
        expect(notificationTitle()).toBe('c');
        timers.fire(3000);
        expect(feed.current).toBeNull();
    });

    it('volume mostra a porcentagem e acompanha o deslize', () => {
        volume.set(40);
        volume.set(40);
        volume.set(55);
        expect(feed.current).toEqual({kind: 'volume', percent: 55});
        expect(changes).toBe(2);
    });

    it('destroy para os relógios armados', () => {
        bridge.push('a');
        volume.set(40);
        expect(timers.armed.size).toBe(2);
        feed.destroy();
        expect(timers.armed.size).toBe(0);
    });

    it('destroy desfaz as assinaturas de todas as fontes', () => {
        feed.destroy();
        recording.set(1);
        sessions.set([session('a', 'working')]);
        meetings.set({title: 'Daily', startsAt: 5000});
        media.set(track(true));
        bridge.push('b');
        volume.set(10);
        expect(feed.current).toBeNull();
        expect(timers.onceMs()).toEqual([]);
        expect(changes).toBe(0);
    });

    it('gravação aparece por 5 s e some até começar outra', () => {
        recording.set(1000);
        expect(timers.onceMs()).toEqual([5000]);
        timers.fire(5000);
        expect(feed.current).toBeNull();
        recording.set(null);
        recording.set(2000);
        expect(feed.current).toEqual({kind: 'recording', startedAt: 2000});
    });

    it('reunião aparece por 5 s e não volta', () => {
        meetings.set({title: 'Daily', startsAt: 5000});
        timers.fire(5000);
        expect(feed.current).toBeNull();
        meetings.set({title: 'Daily', startsAt: 5000});
        expect(feed.current).toBeNull();
    });

    it('pedido de permissão aparece por 5 s e cede a vez ao próximo', () => {
        const waiting = session('b', 'waiting');
        sessions.set([session('a', 'waiting'), waiting], [request('a', 'r1', 10)]);
        expect(feed.current?.kind).toBe('claude-permission');
        timers.fire(5000);
        expect(feed.current).toEqual({kind: 'claude-waiting', session: waiting});
        timers.fire(5000);
        expect(feed.current).toBeNull();
    });

    it('atividade interrompida volta com 5 s inteiros', () => {
        recording.set(1000);
        bridge.push('Oi');
        timers.fire(3000);
        expect(feed.current?.kind).toBe('recording');
        expect(timers.onceMs()).toEqual([5000, 3000, 5000]);
    });

    it('abrir a ilha dá como vista a gravação em andamento', () => {
        recording.set(1000);
        feed.cancelTransient();
        expect(feed.current).toBeNull();
        expect(timers.armed.size).toBe(0);
    });
});
