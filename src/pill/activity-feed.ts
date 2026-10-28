import {displayStatus, oldestPending} from '../features/claude/claude-sessions.js';
import type {PendingRequest, SessionState} from '../features/claude/claude-sessions.js';
import {pickActivity} from './activity-priority.js';
import type {ClaudeSessions} from '../features/claude/claude-sessions-service.js';
import type {MediaService, MediaTrack} from '../features/media/media-service.js';
import type {UpcomingMeeting} from '../features/meetings/meetings-service.js';
import type {InterceptedNotification, NotificationBridge} from '../features/notifications/notification-bridge-service.js';
import type {Recording} from '../features/system/recording-service.js';
import type {VolumeWatch} from '../features/system/volume-service.js';
import {Disposables} from '../shared/disposables.js';
import {Emitter} from '../shared/emitter.js';
import {Timer} from '../shared/timer.js';

const FLASH_MS = 3000;
const VOLUME_MS = 1500;
const CLAUDE_STEP_MS = 5000;
const MEDIA_MS = 5000;

export type PillActivity =
    | {kind: 'recording'; startedAt: number}
    | {kind: 'claude-permission'; session: SessionState; request: PendingRequest}
    | {kind: 'claude-waiting'; session: SessionState}
    | {kind: 'meeting'; title: string; startsAt: number}
    | {kind: 'notification'; item: InterceptedNotification}
    | {kind: 'volume'; percent: number}
    | {kind: 'claude-working'; session: SessionState}
    | {kind: 'media'; track: MediaTrack};

export interface FeedSources {
    readonly recording: Pick<Recording, 'startedAt' | 'on'>;
    readonly sessions: Pick<ClaudeSessions, 'sessions' | 'pending' | 'on'>;
    readonly meetings: Pick<UpcomingMeeting, 'next' | 'on'>;
    readonly bridge: Pick<NotificationBridge, 'on'>;
    readonly volume: Pick<VolumeWatch, 'on'>;
    readonly media: Pick<MediaService, 'current' | 'on'>;
}

function identity(activity: PillActivity): readonly unknown[] {
    switch (activity.kind) {
        case 'recording':
            return [activity.kind, activity.startedAt];
        case 'claude-permission':
            return [activity.kind, activity.session.sessionId, activity.request.key];
        case 'claude-waiting':
        case 'claude-working':
            return [activity.kind, activity.session.sessionId, activity.session.status, activity.session.step];
        case 'meeting':
            return [activity.kind, activity.title, activity.startsAt];
        case 'notification':
            return [activity.kind, activity.item];
        case 'volume':
            return [activity.kind, activity.percent];
        case 'media':
            return [activity.kind, activity.track.title, activity.track.artist, activity.track.coverUrl, activity.track.app];
    }
}

function same(a: PillActivity | null, b: PillActivity | null): boolean {
    if (a === null || b === null) return a === b;
    const left = identity(a);
    const right = identity(b);
    return left.length === right.length && left.every((value, index) => value === right[index]);
}

export class ActivityFeed extends Emitter<{changed: []}> {
    readonly #sources: FeedSources;
    readonly #disposables = new Disposables();
    readonly #notificationTimer = new Timer();
    readonly #volumeTimer = new Timer();
    readonly #claudeTimer = new Timer();
    readonly #mediaTimer = new Timer();
    readonly #steps = new Map<string, string>();
    #claude: string | null = null;
    #playing: string | null = null;
    #mediaFlash = false;
    #queue: InterceptedNotification[] = [];
    #notification: InterceptedNotification | null = null;
    #volume: number | null = null;
    #current: PillActivity | null;

    constructor(sources: FeedSources) {
        super();
        this.#sources = sources;
        const refresh = (): void => {
            this.#refresh();
        };
        this.#disposables.add(sources.recording.on('changed', refresh));
        this.#disposables.add(
            sources.sessions.on('changed', () => {
                this.#trackSteps(true);
                this.#refresh();
            }),
        );
        this.#disposables.add(sources.meetings.on('changed', refresh));
        this.#disposables.add(
            sources.media.on('changed', () => {
                this.#trackMedia(true);
                this.#refresh();
            }),
        );
        this.#disposables.add(
            sources.bridge.on('intercepted', item => {
                this.#queue.push(item);
                if (!this.#notificationTimer.active) this.#nextNotification();
            }),
        );
        this.#disposables.add(
            sources.volume.on('changed', percent => {
                this.#volume = percent;
                this.#volumeTimer.once(VOLUME_MS, () => {
                    this.#volume = null;
                    this.#refresh();
                });
                this.#refresh();
            }),
        );
        this.#trackSteps(false);
        this.#trackMedia(false);
        this.#current = pickActivity(this.#candidates());
    }

    get current(): PillActivity | null {
        return this.#current;
    }

    cancelTransient(): void {
        this.#notificationTimer.stop();
        this.#volumeTimer.stop();
        this.#claudeTimer.stop();
        this.#mediaTimer.stop();
        this.#queue = [];
        this.#notification = null;
        this.#volume = null;
        this.#claude = null;
        this.#mediaFlash = false;
        this.#refresh();
    }

    #trackMedia(flash: boolean): void {
        const track = this.#sources.media.current;
        const playing = track?.playing ? `${track.app}\u0000${track.title}\u0000${track.artist}` : null;
        if (playing === this.#playing) return;
        this.#playing = playing;
        if (playing === null || !flash) return;
        this.#mediaFlash = true;
        this.#mediaTimer.once(MEDIA_MS, () => {
            this.#mediaFlash = false;
            this.#refresh();
        });
    }

    #trackSteps(flash: boolean): void {
        const now = Date.now();
        const working = this.#sources.sessions.sessions.filter(
            session => session.tool !== null && displayStatus(session, now) === 'working',
        );
        const ids = new Set(working.map(({sessionId}) => sessionId));
        for (const id of this.#steps.keys()) if (!ids.has(id)) this.#steps.delete(id);
        for (const {sessionId, tool, step} of working) {
            const key = `${tool}\u0000${step}`;
            if (this.#steps.get(sessionId) === key) continue;
            this.#steps.set(sessionId, key);
            if (!flash) continue;
            this.#claude = sessionId;
            this.#claudeTimer.once(CLAUDE_STEP_MS, () => {
                this.#claude = null;
                this.#refresh();
            });
        }
    }

    #nextNotification(): void {
        this.#notification = this.#queue.shift() ?? null;
        if (this.#notification)
            this.#notificationTimer.once(FLASH_MS, () => {
                this.#nextNotification();
            });
        this.#refresh();
    }

    #candidates(): PillActivity[] {
        const {recording, sessions, meetings, media} = this.#sources;
        const now = Date.now();
        const candidates: PillActivity[] = [];
        if (recording.startedAt !== null) candidates.push({kind: 'recording', startedAt: recording.startedAt});
        const known = new Set(sessions.sessions.map(({sessionId}) => sessionId));
        const request = oldestPending(sessions.pending.filter(({sessionId}) => known.has(sessionId)));
        const asking = request ? sessions.sessions.find(({sessionId}) => sessionId === request.sessionId) : undefined;
        if (request && asking) candidates.push({kind: 'claude-permission', session: asking, request});
        for (const session of sessions.sessions) {
            const status = displayStatus(session, now);
            if (session === asking) continue;
            if (status === 'waiting') candidates.push({kind: 'claude-waiting', session});
            else if (status === 'working' && session.sessionId === this.#claude) candidates.push({kind: 'claude-working', session});
        }
        const meeting = meetings.next;
        if (meeting) candidates.push({kind: 'meeting', title: meeting.title, startsAt: meeting.startsAt});
        if (this.#notification) candidates.push({kind: 'notification', item: this.#notification});
        if (this.#volume !== null) candidates.push({kind: 'volume', percent: this.#volume});
        const track = media.current;
        if (track?.playing && this.#mediaFlash) candidates.push({kind: 'media', track});
        return candidates;
    }

    #refresh(): void {
        const previous = this.#current;
        this.#current = pickActivity(this.#candidates());
        if (!same(previous, this.#current)) this.emit('changed');
    }

    destroy(): void {
        this.#notificationTimer.stop();
        this.#volumeTimer.stop();
        this.#claudeTimer.stop();
        this.#mediaTimer.stop();
        this.#disposables.dispose();
        this.clearListeners();
    }
}
