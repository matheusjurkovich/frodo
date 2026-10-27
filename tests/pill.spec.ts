import type {SessionState, SessionStatus} from '../src/core/claude-sessions.js';
import {pickActivity} from '../src/core/pill-activity.js';
import type {MediaTrack} from '../src/services/media.js';
import type {NotificationBridgeEvents} from '../src/services/notification-bridge.js';
import {ActivityFeed} from '../src/ui/pill/activity-feed.js';
import type {FeedSources} from '../src/ui/pill/activity-feed.js';
import {Emitter} from '../src/util/emitter.js';

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

class FakeRecording extends Emitter<{changed: []}> {
    startedAt: number | null = null;

    set(startedAt: number | null): void {
        this.startedAt = startedAt;
        this.emit('changed');
    }
}

class FakeSessions extends Emitter<{changed: []}> {
    sessions: readonly SessionState[] = [];

    set(sessions: readonly SessionState[]): void {
        this.sessions = sessions;
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

function session(id: string, status: SessionStatus, step = ''): SessionState {
    return {sessionId: id, cwd: '/r', repo: 'r', transcriptPath: '', status, tool: null, step, pid: null, updatedAt: Date.now()};
}

function track(playing: boolean): MediaTrack {
    return {title: 't', artist: 'a', coverUrl: '', lengthUs: null, app: 'p', playing, canPrevious: false, canNext: false};
}

describe('ActivityFeed', () => {
    let recording: FakeRecording;
    let sessions: FakeSessions;
    let meetings: FakeMeetings;
    let bridge: FakeBridge;
    let volume: FakeVolume;
    let media: FakeMedia;
    let feed: ActivityFeed;
    let changes: number;

    beforeEach(() => {
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
        sessions.set([session('a', 'done'), session('b', 'working')]);
        expect(feed.current?.kind).toBe('claude-working');
        sessions.set([session('a', 'done'), session('b', 'working'), session('c', 'waiting')]);
        expect(feed.current?.kind).toBe('claude-waiting');
        sessions.set([session('a', 'done')]);
        expect(feed.current).toBeNull();
    });

    it('só emite quando o conteúdo muda', () => {
        sessions.set([session('a', 'working', 'Bash ls')]);
        sessions.set([session('a', 'working', 'Bash ls')]);
        expect(changes).toBe(1);
        sessions.set([session('a', 'working', 'Edit x')]);
        expect(changes).toBe(2);
    });

    it('mídia só entra tocando', () => {
        media.set(track(false));
        expect(feed.current).toBeNull();
        media.set(track(true));
        expect(feed.current?.kind).toBe('media');
    });

    it('reunião vence a notificação', () => {
        bridge.push('Oi');
        expect(feed.current?.kind).toBe('notification');
        meetings.set({title: 'Daily', startsAt: 5000});
        expect(feed.current).toEqual({kind: 'meeting', title: 'Daily', startsAt: 5000});
    });

    it('notificações esperam na fila e cancelTransient limpa a fila e o volume', () => {
        bridge.push('a');
        bridge.push('b');
        expect(feed.current).toEqual(jasmine.objectContaining({kind: 'notification', item: jasmine.objectContaining({title: 'a'})}));
        volume.set(40);
        expect(feed.current?.kind).toBe('notification');
        feed.cancelTransient();
        expect(feed.current).toBeNull();
    });

    it('volume mostra a porcentagem e acompanha o deslize', () => {
        volume.set(40);
        volume.set(40);
        volume.set(55);
        expect(feed.current).toEqual({kind: 'volume', percent: 55});
        expect(changes).toBe(2);
    });

    it('destroy cala o feed', () => {
        feed.destroy();
        recording.set(1);
        expect(changes).toBe(0);
    });
});
