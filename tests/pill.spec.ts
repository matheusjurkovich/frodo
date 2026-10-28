import type {SessionState, SessionStatus} from '../src/core/claude-sessions.js';
import {nextMeeting} from '../src/core/meetings.js';
import {pickActivity} from '../src/core/pill-activity.js';
import type {MediaTrack} from '../src/services/media.js';
import type {NotificationBridgeEvents} from '../src/services/notification-bridge.js';
import {ActivityFeed} from '../src/ui/pill/activity-feed.js';
import type {FeedSources} from '../src/ui/pill/activity-feed.js';
import {Emitter} from '../src/util/emitter.js';
import {Timer} from '../src/util/timer.js';

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

const NOW = new Date(2026, 9, 28, 10, 0, 0).getTime();
const LEAD = 10 * 60e3;

function at(offsetMs: number, durationMs = 3600e3): {summary: string; date: Date; end: Date} {
    return {summary: `em ${offsetMs}`, date: new Date(NOW + offsetMs), end: new Date(NOW + offsetMs + durationMs)};
}

describe('próxima reunião', () => {
    it('sem eventos não há reunião', () => {
        expect(nextMeeting([], NOW, LEAD)).toBeNull();
    });

    it('escolhe a que começa primeiro dentro da janela', () => {
        const events = [at(8 * 60e3), at(3 * 60e3), at(5 * 60e3)];
        expect(nextMeeting(events, NOW, LEAD)).toEqual({title: 'em 180000', startsAt: NOW + 3 * 60e3});
    });

    it('ignora a que já começou, inclusive no instante exato', () => {
        expect(nextMeeting([at(-60e3), at(0)], NOW, LEAD)).toBeNull();
        expect(nextMeeting([at(-60e3), at(60e3)], NOW, LEAD)?.startsAt).toBe(NOW + 60e3);
    });

    it('ignora a que começa depois da janela e aceita a do limite', () => {
        expect(nextMeeting([at(LEAD + 1)], NOW, LEAD)).toBeNull();
        expect(nextMeeting([at(LEAD)], NOW, LEAD)?.startsAt).toBe(NOW + LEAD);
    });

    it('ignora evento de dia inteiro e aceita reunião que começa à meia-noite', () => {
        const midnight = new Date(2026, 9, 29, 0, 0, 0).getTime();
        const now = midnight - 5 * 60e3;
        const allDay = {summary: 'Feriado', date: new Date(2026, 9, 29), end: new Date(2026, 9, 30)};
        const late = {summary: 'Plantão', date: new Date(2026, 9, 29, 0, 0), end: new Date(2026, 9, 29, 1, 0)};
        expect(nextMeeting([allDay], now, LEAD)).toBeNull();
        expect(nextMeeting([allDay, late], now, LEAD)).toEqual({title: 'Plantão', startsAt: midnight});
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

function track(playing: boolean): MediaTrack {
    return {title: 't', artist: 'a', coverUrl: '', lengthUs: null, app: 'p', playing, canPrevious: false, canNext: false};
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

    it('reunião vence a notificação', () => {
        bridge.push('Oi');
        expect(feed.current?.kind).toBe('notification');
        meetings.set({title: 'Daily', startsAt: 5000});
        expect(feed.current).toEqual({kind: 'meeting', title: 'Daily', startsAt: 5000});
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
});
