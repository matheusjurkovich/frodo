import {FakeSignals} from './fake-signals.js';

export const NotificationDestroyedReason = {EXPIRED: 1, DISMISSED: 2, SOURCE_CLOSED: 3, REPLACED: 4};

export class FakeSource extends FakeSignals {
    readonly notifications: FakeNotification[] = [];

    constructor(
        readonly title: string,
        readonly icon: object | null = null,
    ) {
        super();
    }

    add(notification: FakeNotification): void {
        this.notifications.push(notification);
        this.emit('notification-added', notification);
    }
}

export interface FakeNotificationOptions {
    readonly title?: string;
    readonly body?: string;
    readonly urgency?: number;
    readonly isTransient?: boolean;
    readonly gicon?: object | null;
    readonly usec?: number;
}

export class FakeNotification {
    readonly title: string;
    readonly body: string;
    readonly urgency: number;
    readonly isTransient: boolean;
    readonly gicon: object | null;
    readonly datetime: {to_unix_usec(): number};
    acknowledged = false;
    sounds = 0;
    destroyedWith: number | null = null;

    constructor(
        readonly source: FakeSource | null,
        options: FakeNotificationOptions = {},
    ) {
        this.title = options.title ?? '';
        this.body = options.body ?? '';
        this.urgency = options.urgency ?? 1;
        this.isTransient = options.isTransient ?? false;
        this.gicon = options.gicon ?? null;
        const usec = options.usec ?? 0;
        this.datetime = {to_unix_usec: () => usec};
    }

    playSound(): void {
        this.sounds++;
    }

    destroy(reason: number): void {
        this.destroyedWith = reason;
        const source = this.source;
        const index = source?.notifications.indexOf(this) ?? -1;
        if (!source || index < 0) return;
        source.notifications.splice(index, 1);
        source.emit('notification-removed', this);
    }
}

export class FakeMessageTray extends FakeSignals {
    readonly sources: FakeSource[] = [];
    _notificationQueue: FakeNotification[] = [];
    shownByShell: FakeNotification[] = [];
    stateUpdates = 0;

    getSources(): FakeSource[] {
        return [...this.sources];
    }

    addSource(source: FakeSource): void {
        this.sources.push(source);
        this.emit('source-added', source);
    }

    removeSource(source: FakeSource): void {
        this.sources.splice(this.sources.indexOf(source), 1);
        this.emit('source-removed', source);
    }

    _showNotification(): void {
        const next = this._notificationQueue.shift();
        if (next) this.shownByShell.push(next);
    }

    _updateState(): void {
        this.stateUpdates++;
    }
}
