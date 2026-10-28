import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import * as MessageTray from 'resource:///org/gnome/shell/ui/messageTray.js';

import {latest, shouldIntercept} from '../core/notifications.js';
import {messageTray} from '../shell/internals.js';
import {Disposables} from '../util/disposables.js';
import {Emitter} from '../util/emitter.js';

const MAX_ITEMS = 50;
const NOTIFICATIONS_SCHEMA = 'org.gnome.desktop.notifications';
const SHOW_BANNERS_KEY = 'show-banners';

export interface InterceptedNotification {
    readonly gicon: Gio.Icon | null;
    readonly app: string;
    readonly title: string;
    readonly body: string;
}

export interface NotificationBridgeEvents {
    changed: [];
    intercepted: [InterceptedNotification];
}

export function notificationIcon(notification: MessageTray.Notification): Gio.Icon | null {
    return notification.gicon ?? notification.source?.icon ?? null;
}

export class NotificationBridge extends Emitter<NotificationBridgeEvents> {
    readonly #sources = new Map<MessageTray.Source, Disposables>();
    readonly #settings = new Gio.Settings({schema_id: NOTIFICATIONS_SCHEMA});
    readonly #disposables = new Disposables();
    #clearing = false;

    constructor() {
        super();
        this.#disposables.signal(
            this.#settings,
            this.#settings.connect(`changed::${SHOW_BANNERS_KEY}`, () => {
                this.#emitChanged();
            }),
        );
        const tray = messageTray();
        this.#disposables.signal(
            tray,
            tray.connect('source-added', (_tray, source) => {
                this.#addSource(source);
            }),
        );
        this.#disposables.signal(
            tray,
            tray.connect('source-removed', (_tray, source) => {
                this.#removeSource(source);
            }),
        );
        for (const source of tray.getSources()) this.#addSource(source);
        this.#interceptBanners();
    }

    list(): MessageTray.Notification[] {
        return latest(this.#all(), notification => notification.datetime.to_unix_usec(), MAX_ITEMS);
    }

    get count(): number {
        return this.#all().length;
    }

    get doNotDisturb(): boolean {
        return !this.#settings.get_boolean(SHOW_BANNERS_KEY);
    }

    set doNotDisturb(value: boolean) {
        this.#settings.set_boolean(SHOW_BANNERS_KEY, !value);
    }

    dismiss(notification: MessageTray.Notification): void {
        notification.destroy(MessageTray.NotificationDestroyedReason.DISMISSED);
    }

    clear(): void {
        this.#clearing = true;
        try {
            for (const notification of this.#all()) this.dismiss(notification);
        } finally {
            this.#clearing = false;
            this.#emitChanged();
        }
    }

    #all(): MessageTray.Notification[] {
        return [...this.#sources.keys()].flatMap(source => source.notifications);
    }

    #emitChanged(): void {
        if (!this.#clearing) this.emit('changed');
    }

    #interceptBanners(): void {
        const tray = messageTray();
        const descriptor = Object.getOwnPropertyDescriptor(tray, '_showNotification');
        const original = tray._showNotification.bind(tray);
        const emitIntercepted = (item: InterceptedNotification): void => {
            this.emit('intercepted', item);
        };

        tray._showNotification = function (this: typeof tray): void {
            const next = this._notificationQueue[0];
            if (!shouldIntercept(next)) {
                original();
                return;
            }
            this._notificationQueue.shift();
            this.emit('queue-changed');
            next.playSound();
            next.acknowledged = true;
            emitIntercepted({
                gicon: notificationIcon(next),
                app: next.source?.title ?? '',
                title: next.title ?? '',
                body: next.body ?? '',
            });
            if (next.isTransient) next.destroy(MessageTray.NotificationDestroyedReason.EXPIRED);
            GLib.idle_add(GLib.PRIORITY_DEFAULT, () => {
                this._updateState();
                return GLib.SOURCE_REMOVE;
            });
        };

        this.#disposables.add(() => {
            if (descriptor) Object.defineProperty(tray, '_showNotification', descriptor);
            else delete (tray as Partial<typeof tray>)._showNotification;
        });
    }

    #addSource(source: MessageTray.Source): void {
        if (this.#sources.has(source)) return;
        const signals = new Disposables();
        const changed = (): void => {
            this.#emitChanged();
        };
        signals.signal(source, source.connect('notification-added', changed));
        signals.signal(source, source.connect('notification-removed', changed));
        this.#sources.set(source, signals);
        changed();
    }

    #removeSource(source: MessageTray.Source): void {
        const signals = this.#sources.get(source);
        if (!signals) return;
        signals.dispose();
        this.#sources.delete(source);
        this.#emitChanged();
    }

    destroy(): void {
        this.#disposables.dispose();
        for (const signals of this.#sources.values()) signals.dispose();
        this.#sources.clear();
        this.clearListeners();
    }
}
