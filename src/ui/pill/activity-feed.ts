import {displayStatus} from '../../core/claude-sessions.js';
import type {SessionState} from '../../core/claude-sessions.js';
import {pickActivity} from '../../core/pill-activity.js';
import type {ClaudeSessions} from '../../services/claude-sessions.js';
import type {MediaService, MediaTrack} from '../../services/media.js';
import type {UpcomingMeeting} from '../../services/meetings.js';
import type {InterceptedNotification, NotificationBridge} from '../../services/notification-bridge.js';
import type {Recording} from '../../services/recording.js';
import type {VolumeWatch} from '../../services/volume.js';
import {Disposables} from '../../util/disposables.js';
import {Emitter} from '../../util/emitter.js';
import {Timer} from '../../util/timer.js';

const FLASH_MS = 3000;
const VOLUME_MS = 1500;

export type PillActivity =
    | {kind: 'recording'; startedAt: number}
    | {kind: 'claude-waiting'; session: SessionState}
    | {kind: 'meeting'; title: string; startsAt: number}
    | {kind: 'notification'; item: InterceptedNotification}
    | {kind: 'volume'; percent: number}
    | {kind: 'claude-working'; session: SessionState}
    | {kind: 'media'; track: MediaTrack};

export interface FeedSources {
    readonly recording: Pick<Recording, 'startedAt' | 'on'>;
    readonly sessions: Pick<ClaudeSessions, 'sessions' | 'on'>;
    readonly meetings: Pick<UpcomingMeeting, 'next' | 'on'>;
    readonly bridge: Pick<NotificationBridge, 'on'>;
    readonly volume: Pick<VolumeWatch, 'on'>;
    readonly media: Pick<MediaService, 'current' | 'on'>;
}

function identity(activity: PillActivity): readonly unknown[] {
    switch (activity.kind) {
        case 'recording':
            return [activity.kind, activity.startedAt];
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
        this.#disposables.add(sources.sessions.on('changed', refresh));
        this.#disposables.add(sources.meetings.on('changed', refresh));
        this.#disposables.add(sources.media.on('changed', refresh));
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
        this.#current = pickActivity(this.#candidates());
    }

    get current(): PillActivity | null {
        return this.#current;
    }

    cancelTransient(): void {
        this.#notificationTimer.stop();
        this.#volumeTimer.stop();
        this.#queue = [];
        this.#notification = null;
        this.#volume = null;
        this.#refresh();
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
        for (const session of sessions.sessions) {
            const status = displayStatus(session, now);
            if (status === 'waiting') candidates.push({kind: 'claude-waiting', session});
            else if (status === 'working') candidates.push({kind: 'claude-working', session});
        }
        const meeting = meetings.next;
        if (meeting) candidates.push({kind: 'meeting', title: meeting.title, startsAt: meeting.startsAt});
        if (this.#notification) candidates.push({kind: 'notification', item: this.#notification});
        if (this.#volume !== null) candidates.push({kind: 'volume', percent: this.#volume});
        const track = media.current;
        if (track?.playing) candidates.push({kind: 'media', track});
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
        this.#disposables.dispose();
        this.clearListeners();
    }
}
