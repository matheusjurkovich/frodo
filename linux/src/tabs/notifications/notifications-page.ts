import Clutter from 'gi://Clutter';
import St from 'gi://St';
import type * as MessageTray from 'resource:///org/gnome/shell/ui/messageTray.js';

import type {NotificationBridge} from '../../features/notifications/notification-bridge-service.js';
import {Disposables} from '../../shared/disposables.js';
import {textButton} from '../../shared/ui/buttons.js';
import {card} from '../../shared/ui/card.js';
import {column, label, row} from '../../shared/ui/layout.js';
import {whileMapped} from '../../shared/ui/lifecycle.js';
import type {Component} from '../../shared/ui/lifecycle.js';
import {frodoIcon} from '../../shared/ui/icons.js';
import {fadeIn, reveal, slideOut} from '../../shared/ui/motion.js';
import type {IslandHandle} from '../../shared/island-handle.js';
import {notificationRow} from './notification-row.js';

export class NotificationsPage implements Component {
    readonly actor = card('frodo-notifications');
    readonly #bridge: NotificationBridge;
    readonly #island: IslandHandle;
    readonly #list = column('frodo-notification-list');
    readonly #scroll = new St.ScrollView({
        style_class: 'frodo-notification-scroll',
        hscrollbar_policy: St.PolicyType.NEVER,
        vscrollbar_policy: St.PolicyType.EXTERNAL,
        x_expand: true,
        child: this.#list,
    });
    readonly #empty = column('frodo-notifications-empty');
    readonly #doNotDisturb: St.Button;
    readonly #clear: St.Button;
    readonly #disposables = new Disposables();
    readonly #running = new Disposables();
    readonly #rows = new Map<MessageTray.Notification, St.Button>();
    #leaving = 0;

    constructor(bridge: NotificationBridge, island: IslandHandle) {
        this.#bridge = bridge;
        this.#island = island;
        this.#doNotDisturb = textButton(
            'Não perturbe',
            () => {
                bridge.doNotDisturb = !bridge.doNotDisturb;
            },
            'control',
            frodoIcon('bell-off'),
        );
        this.#clear = textButton('Limpar tudo', () => {
            bridge.clear();
        });

        const title = label('Notificações', 'frodo-notifications-title');
        title.x_expand = true;
        const header = row('frodo-notifications-header');
        for (const child of [title, this.#doNotDisturb, this.#clear]) header.add_child(child);
        this.#empty.add_child(new St.Icon({gicon: frodoIcon('bell'), style_class: 'frodo-empty-icon'}));
        this.#empty.add_child(label('Tudo em dia', 'frodo-empty-title'));
        this.#empty.add_child(label('Novas notificações aparecem aqui e na ilha recolhida.', 'frodo-dim frodo-empty-text'));
        for (const child of this.#empty.get_children()) child.x_align = Clutter.ActorAlign.CENTER;
        this.actor.add_child(header);
        this.actor.add_child(this.#scroll);
        this.actor.add_child(this.#empty);

        this.#disposables.add(
            whileMapped(
                this.actor,
                () => {
                    this.#running.add(
                        bridge.on('changed', () => {
                            this.#render(true);
                        }),
                    );
                    this.#render(false);
                },
                () => {
                    this.#running.dispose();
                },
            ),
        );
    }

    #render(animate: boolean): void {
        const notifications = this.#bridge.list();
        for (const [notification, row] of [...this.#rows])
            if (!notifications.includes(notification)) {
                this.#rows.delete(notification);
                if (animate) this.#dismissRow(row);
                else row.destroy();
            }
        let previous: St.Button | null = null;
        for (const notification of notifications) {
            const row = notificationRow(notification, {
                dismiss: () => {
                    this.#bridge.dismiss(notification);
                },
                open: () => {
                    this.#island.close();
                    notification.activate();
                },
            });
            const old = this.#rows.get(notification);
            if (old) {
                this.#list.replace_child(old, row);
                old.destroy();
            } else {
                if (previous) this.#list.insert_child_above(row, previous);
                else this.#list.insert_child_at_index(row, 0);
                if (animate) fadeIn(row);
            }
            this.#rows.set(notification, row);
            previous = row;
        }
        this.#syncEmpty();
    }

    #dismissRow(row: St.Button): void {
        row.reactive = false;
        this.#leaving++;
        slideOut(row, -1, () => {
            reveal(row, false, () => {
                row.destroy();
                this.#leaving--;
                this.#syncEmpty();
            });
        });
    }

    #syncEmpty(): void {
        this.#doNotDisturb.checked = this.#bridge.doNotDisturb;
        if (this.#leaving > 0) return;
        const any = this.#rows.size > 0;
        this.#scroll.visible = any;
        this.#clear.visible = any;
        this.#empty.visible = !any;
    }

    destroy(): void {
        this.#disposables.dispose();
        this.actor.destroy();
    }
}
