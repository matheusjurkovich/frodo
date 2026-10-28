import Clutter from 'gi://Clutter';
import St from 'gi://St';

import type {NotificationBridge} from '../../features/notifications/notification-bridge-service.js';
import {Disposables} from '../../shared/disposables.js';
import {textButton} from '../../shared/ui/buttons.js';
import {card} from '../../shared/ui/card.js';
import {column, label, row} from '../../shared/ui/layout.js';
import {whileMapped} from '../../shared/ui/lifecycle.js';
import type {Component} from '../../shared/ui/lifecycle.js';
import {frodoIcon} from '../../shared/ui/icons.js';
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
        vscrollbar_policy: St.PolicyType.AUTOMATIC,
        overlay_scrollbars: true,
        x_expand: true,
        child: this.#list,
    });
    readonly #empty = column('frodo-notifications-empty');
    readonly #doNotDisturb: St.Button;
    readonly #clear: St.Button;
    readonly #disposables = new Disposables();
    readonly #running = new Disposables();

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
                            this.#render();
                        }),
                    );
                    this.#render();
                },
                () => {
                    this.#running.dispose();
                },
            ),
        );
    }

    #render(): void {
        const notifications = this.#bridge.list();
        this.#list.destroy_all_children();
        for (const notification of notifications)
            this.#list.add_child(
                notificationRow(notification, {
                    dismiss: () => {
                        this.#bridge.dismiss(notification);
                    },
                    open: () => {
                        this.#island.close();
                        notification.activate();
                    },
                }),
            );
        const any = notifications.length > 0;
        this.#scroll.visible = any;
        this.#clear.visible = any;
        this.#empty.visible = !any;
        this.#doNotDisturb.checked = this.#bridge.doNotDisturb;
    }

    destroy(): void {
        this.#disposables.dispose();
        this.actor.destroy();
    }
}
