import Clutter from 'gi://Clutter';
import St from 'gi://St';
import * as MessageTray from 'resource:///org/gnome/shell/ui/messageTray.js';

import {ellipsize} from '../core/format.js';
import {notificationIcon} from '../services/notification-bridge.js';
import type {NotificationBridge} from '../services/notification-bridge.js';
import type {Unsubscribe} from '../util/emitter.js';
import type {Island} from './island.js';

const TITLE_CHARS = 50;
const BODY_CHARS = 60;

export class NotificationList {
    readonly actor = new St.BoxLayout({orientation: Clutter.Orientation.VERTICAL, style_class: 'frodo-notifs', x_expand: true});
    readonly #bridge: NotificationBridge;
    readonly #island: Island;
    readonly #unsubscribe: Unsubscribe;

    constructor(bridge: NotificationBridge, island: Island) {
        this.#bridge = bridge;
        this.#island = island;
        this.#unsubscribe = bridge.on('changed', () => {
            this.#render();
        });
        this.#render();
    }

    #render(): void {
        this.actor.destroy_all_children();
        const notifications = this.#bridge.list();
        if (notifications.length === 0) {
            this.actor.add_child(new St.Label({text: 'Sem notificações', style_class: 'frodo-dim frodo-empty'}));
            return;
        }
        for (const notification of notifications) this.actor.add_child(this.#row(notification));
    }

    #row(notification: MessageTray.Notification): St.BoxLayout {
        const icon = notificationIcon(notification);
        const content = new St.BoxLayout({style_class: 'frodo-notif-content', x_expand: true, x_align: Clutter.ActorAlign.START});
        content.add_child(
            new St.Icon({gicon: icon, icon_name: icon ? null : 'dialog-information-symbolic', style_class: 'frodo-notif-icon'}),
        );

        const texts = new St.BoxLayout({orientation: Clutter.Orientation.VERTICAL, y_align: Clutter.ActorAlign.CENTER, x_expand: true});
        const app = notification.source?.title ? `${notification.source.title} · ` : '';
        texts.add_child(
            new St.Label({text: ellipsize(`${app}${notification.title ?? ''}`, TITLE_CHARS), style_class: 'frodo-notif-title'}),
        );
        if (notification.body)
            texts.add_child(new St.Label({text: ellipsize(notification.body.replace(/\s+/g, ' '), BODY_CHARS), style_class: 'frodo-dim'}));
        content.add_child(texts);

        const open = new St.Button({style_class: 'frodo-notif-main', x_expand: true, can_focus: true, child: content});
        open.connect('clicked', () => {
            this.#island.close();
            notification.activate();
        });

        const dismiss = new St.Button({
            style_class: 'frodo-notif-close',
            child: new St.Icon({icon_name: 'window-close-symbolic', icon_size: 12}),
            y_align: Clutter.ActorAlign.CENTER,
            accessible_name: 'Dispensar',
        });
        dismiss.connect('clicked', () => {
            notification.destroy(MessageTray.NotificationDestroyedReason.DISMISSED);
        });

        const row = new St.BoxLayout({style_class: 'frodo-notif', x_expand: true});
        row.add_child(open);
        row.add_child(dismiss);
        return row;
    }

    destroy(): void {
        this.#unsubscribe();
        this.actor.destroy();
    }
}
