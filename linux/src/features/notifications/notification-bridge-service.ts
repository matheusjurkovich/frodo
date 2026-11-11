import Gio from 'gi://Gio';
import * as MessageTray from 'resource:///org/gnome/shell/ui/messageTray.js';
import {latest, shouldIntercept} from './notifications.js';
import {interceptBanners, messageTray} from '../../shared/shell-internals.js';
import {Disposables} from '../../shared/disposables.js';
import {Emitter} from '../../shared/emitter.js';
import {NOTIFICATIONS_SCHEMA, SHOW_BANNERS_KEY, MAX_ITEMS} from './notification-bridge-service.const.js';
import type {NotificationBridgeEvents} from './notification-bridge-service.types.js';

export function notificationIcon(notification: MessageTray.Notification): Gio.Icon | null {
    return notification.gicon ?? notification.source?.icon ?? null;
}

export class NotificationBridge extends Emitter<NotificationBridgeEvents> {
    readonly #sources = new Map<MessageTray.Source, Disposables>();
    readonly #settings: Gio.Settings;
    readonly #disposables = new Disposables();
    #clearing = false;

    constructor(settings = new Gio.Settings({schema_id: NOTIFICATIONS_SCHEMA})) {
        super();
        this.#settings = settings;
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
        this.#disposables.add(
            interceptBanners(shouldIntercept, notification => {
                notification.playSound();
                notification.acknowledged = true;
                this.emit('intercepted', {
                    gicon: notificationIcon(notification),
                    app: notification.source?.title ?? '',
                    title: notification.title ?? '',
                    body: notification.body ?? '',
                });
                if (notification.isTransient) notification.destroy(MessageTray.NotificationDestroyedReason.EXPIRED);
            }),
        );
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
