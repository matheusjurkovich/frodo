import {displayStatus, oldestPending} from '../features/claude/claude-sessions.js';
import type {SessionState} from '../features/claude/claude-sessions.types.js';
import {pickActivity} from './activity-priority.js';
import {StepGate} from './step-gate.js';
import {STEP_SHOWN_MS} from './step-gate.const.js';
import type {InterceptedNotification} from '../features/notifications/notification-bridge-service.types.js';
import {Disposables} from '../shared/disposables.js';
import {Emitter} from '../shared/emitter.js';
import {Timer} from '../shared/timer.js';
import {VOLUME_MS, FLASH_MS, SHOWN_MS, DECISION_MS} from './activity-feed.const.js';
import {queued} from './activity-queue.js';
import {pickFault} from './fault.js';
import type {PillActivity, FeedSources} from './activity-feed.types.js';

function identity(activity: PillActivity): readonly unknown[] {
    switch (activity.kind) {
        case 'recording':
            return [activity.kind, activity.startedAt];
        case 'claude-permission':
            return [activity.kind, activity.session.sessionId, activity.request.key];
        case 'claude-waiting':
        case 'claude-working':
            return [activity.kind, activity.session.sessionId, activity.session.status, activity.session.step];
        case 'decision':
            return [activity.kind, activity.decided.request.key];
        case 'fault':
            return [activity.kind, activity.fault, activity.resting];
        case 'meeting':
            return [activity.kind, activity.title, activity.startsAt, activity.url];
        case 'notification':
            return [activity.kind, activity.item];
        case 'github':
            return [activity.kind, activity.pr.key, activity.pr.kind, activity.more];
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
    readonly #notificationTimer = this.#disposables.own(new Timer());
    readonly #volumeTimer = this.#disposables.own(new Timer());
    readonly #githubTimer = this.#disposables.own(new Timer());
    readonly #decisionTimer = this.#disposables.own(new Timer());
    readonly #shownTimer = this.#disposables.own(new Timer());
    readonly #gate = new StepGate();
    #held: Extract<PillActivity, {kind: 'claude-working'}> | null = null;
    #seen: PillActivity[] = [];
    #queue: InterceptedNotification[] = [];
    #notification: InterceptedNotification | null = null;
    #github: Extract<PillActivity, {kind: 'github'}> | null = null;
    #decision: Extract<PillActivity, {kind: 'decision'}> | null = null;
    #volume: number | null = null;
    #current: PillActivity | null = null;
    #waiting: readonly PillActivity[] = [];

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
        this.#disposables.add(sources.github.on('changed', refresh));
        if (sources.faults.wifi) this.#disposables.add(sources.faults.wifi.on('changed', refresh));
        if (sources.faults.calendar) this.#disposables.add(sources.faults.calendar.on('changed', refresh));
        this.#disposables.add(
            sources.bridge.on('intercepted', item => {
                this.#queue.push(item);
                if (!this.#notificationTimer.active) this.#nextNotification();
            }),
        );
        this.#disposables.add(
            sources.github.on('alert', prs => {
                const [first] = prs;
                if (!first || !sources.settings.githubPill) return;
                this.#github = {kind: 'github', pr: first, more: prs.length - 1};
                this.#githubTimer.once(FLASH_MS, () => {
                    this.#github = null;
                    this.#refresh();
                });
                this.#refresh();
            }),
        );
        this.#disposables.add(
            sources.sessions.on('decided', decided => {
                this.#decision = {kind: 'decision', decided};
                this.#decisionTimer.once(DECISION_MS, () => {
                    this.#decision = null;
                    this.#refresh();
                });
                this.#refresh();
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
        this.#disposables.add(
            sources.settings.onChanged('pill-ai-activity', () => {
                const shown = this.#current !== null;
                this.#shownTimer.stop();
                this.#held = null;
                this.#current = null;
                this.#refresh();
                if (shown && this.current === null) this.emit('changed');
            }),
        );
        this.#seen = this.#transient().filter(({kind}) => kind === 'claude-working' || kind === 'media');
        this.#refresh();
    }

    get current(): PillActivity | null {
        return this.#current;
    }

    get queue(): readonly PillActivity[] {
        return this.#waiting;
    }

    cancelTransient(): void {
        this.#notificationTimer.stop();
        this.#volumeTimer.stop();
        this.#githubTimer.stop();
        this.#decisionTimer.stop();
        this.#decision = null;
        this.#github = null;
        this.#queue = [];
        this.#notification = null;
        this.#volume = null;
        this.#seen = this.#transient();
        this.#refresh();
    }

    #transient(): PillActivity[] {
        const always = this.#sources.settings.pillAiActivity === 'always';
        return this.#candidates().filter(({kind}) => !always || kind !== 'claude-working');
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
        const {recording, sessions, meetings, media, github, settings, faults} = this.#sources;
        const now = Date.now();
        const candidates: PillActivity[] = [];
        if (recording.startedAt !== null) candidates.push({kind: 'recording', startedAt: recording.startedAt});
        const known = new Set(sessions.sessions.map(({sessionId}) => sessionId));
        const request = oldestPending(sessions.pending.filter(({sessionId}) => known.has(sessionId)));
        const asking = request ? sessions.sessions.find(({sessionId}) => sessionId === request.sessionId) : undefined;
        if (request && asking) candidates.push({kind: 'claude-permission', session: asking, request});
        const recent = [...sessions.sessions].sort((a, b) => b.updatedAt - a.updatedAt);
        for (const session of recent) {
            const status = displayStatus(session, now);
            if (session === asking) continue;
            if (status === 'waiting') candidates.push({kind: 'claude-waiting', session});
            else if (status === 'working' && session.tool !== null) {
                const held = this.#held?.session.sessionId === session.sessionId ? this.#held : null;
                if (held) candidates.push(held);
                else if (this.#showsWorking(session, now)) candidates.push({kind: 'claude-working', session});
            }
        }
        const fault = pickFault({
            githubStatus: github.status,
            claudeEnabled: settings.providerEnabled('claude'),
            hookMissing: sessions.hookMissing(),
            wifiFailed: (faults.wifi?.failure ?? null) !== null,
            calendarAttention: (faults.calendar?.attention ?? null) !== null,
        });
        if (fault) candidates.push({kind: 'fault', fault, resting: false});
        const meeting = meetings.next;
        if (meeting) candidates.push({kind: 'meeting', title: meeting.title, startsAt: meeting.startsAt, url: meeting.url ?? null});
        if (this.#notification) candidates.push({kind: 'notification', item: this.#notification});
        if (this.#github) candidates.push(this.#github);
        if (this.#decision) candidates.push(this.#decision);
        if (this.#volume !== null) candidates.push({kind: 'volume', percent: this.#volume});
        const track = media.current;
        if (track?.playing) candidates.push({kind: 'media', track});
        return candidates;
    }

    #showsWorking(session: SessionState, nowMs: number): boolean {
        switch (this.#sources.settings.pillAiActivity) {
            case 'always':
                return true;
            case 'never':
                return false;
            case 'change':
                return this.#gate.admits(session.sessionId, session.step, nowMs);
        }
    }

    #refresh(): void {
        const ids = new Set(this.#sources.sessions.sessions.map(({sessionId}) => sessionId));
        this.#gate.retain(ids);
        if (this.#held && !ids.has(this.#held.session.sessionId)) this.#held = null;
        const candidates = this.#candidates();
        this.#seen = this.#seen.filter(seen => candidates.some(candidate => same(seen, candidate)));
        const previous = this.#current;
        const unseen = candidates.filter(candidate => !this.#seen.some(seen => same(seen, candidate)));
        const fault = candidates.find((candidate): candidate is Extract<PillActivity, {kind: 'fault'}> => candidate.kind === 'fault');
        const current = pickActivity(unseen) ?? (fault ? {...fault, resting: true} : null);
        this.#current = current;
        const waiting = queued(unseen, current);
        const queueChanged =
            waiting.length !== this.#waiting.length || waiting.some((item, index) => item.kind !== this.#waiting[index]?.kind);
        this.#waiting = waiting;
        if (same(previous, current)) {
            if (queueChanged) this.emit('changed');
            return;
        }
        const mode = this.#sources.settings.pillAiActivity;
        if (mode === 'change' && previous?.kind === 'claude-working' && current?.kind === 'claude-working') this.#seen.push(previous);
        if (current?.kind === 'claude-working' && mode === 'change') {
            this.#gate.shown(current.session.sessionId, Date.now());
            this.#held = current;
        }
        if (current?.kind === 'claude-working' && mode === 'always') this.#shownTimer.stop();
        else if (
            current &&
            current.kind !== 'notification' &&
            current.kind !== 'volume' &&
            current.kind !== 'github' &&
            current.kind !== 'decision' &&
            (current.kind !== 'fault' || !current.resting) &&
            current.kind !== 'claude-permission'
        )
            this.#shownTimer.once(current.kind === 'claude-working' ? STEP_SHOWN_MS : SHOWN_MS, () => {
                this.#seen.push(current);
                if (this.#held === current) this.#held = null;
                this.#refresh();
            });
        else this.#shownTimer.stop();
        this.emit('changed');
    }

    destroy(): void {
        this.#disposables.dispose();
        this.clearListeners();
    }
}
