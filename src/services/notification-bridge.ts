import GLib from 'gi://GLib';
import type Gio from 'gi://Gio';
import * as MessageTray from 'resource:///org/gnome/shell/ui/messageTray.js';

import {latest, shouldIntercept} from '../core/notifications.js';
import {messageTray} from '../shell/internals.js';
import {Disposables} from '../util/disposables.js';
import {Emitter} from '../util/emitter.js';

const MAX_ITEMS = 6;

export interface InterceptedNotification {
    readonly gicon: Gio.Icon | null;
    readonly title: string;
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
    readonly #disposables = new Disposables();

    constructor() {
        super();
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
        const all = [...this.#sources.keys()].flatMap(source => source.notifications);
        return latest(all, notification => notification.datetime.to_unix(), MAX_ITEMS);
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
            emitIntercepted({gicon: notificationIcon(next), title: next.title ?? ''});
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
            this.emit('changed');
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
        this.emit('changed');
    }

    destroy(): void {
        this.#disposables.dispose();
        for (const signals of this.#sources.values()) signals.dispose();
        this.#sources.clear();
        this.clearListeners();
    }
}
