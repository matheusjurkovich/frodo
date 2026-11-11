import Clutter from 'gi://Clutter';
import Pango from 'gi://Pango';
import St from 'gi://St';
import {fixMarkup} from 'resource:///org/gnome/shell/misc/util.js';
import type * as MessageTray from 'resource:///org/gnome/shell/ui/messageTray.js';
import {notificationIcon} from '../../features/notifications/notification-bridge-service.js';
import {formatAgo} from '../../shared/format.js';
import {contentButton, iconButton} from '../../shared/ui/buttons.js';
import {frodoIcon} from '../../shared/ui/icons.js';
import {column, label, row, wrappedLabel} from '../../shared/ui/layout.js';
import type {Component} from '../../shared/ui/lifecycle.types.js';
import type {NotificationRowActions} from './notification-row.types.js';

const oneLine = (text: string): string => text.replace(/\n/g, ' ');

export class NotificationRow implements Component {
    readonly actor: St.Button;
    readonly #icon = new St.Icon({style_class: 'frodo-notification-icon', y_align: Clutter.ActorAlign.START});
    readonly #meta = label('', 'frodo-notification-meta');
    readonly #title = label('', 'frodo-notification-title');
    readonly #body = wrappedLabel('', 'frodo-notification-body', Pango.WrapMode.WORD_CHAR);
    #shown = '';

    constructor({dismiss, open}: NotificationRowActions) {
        this.#body.x_expand = true;
        const text = column('frodo-notification-text');
        for (const child of [this.#meta, this.#title, this.#body]) text.add_child(child);
        const close = iconButton(frodoIcon('close'), 'Dispensar notificação', dismiss, 'ghost', 32);
        close.y_align = Clutter.ActorAlign.START;
        const content = row('frodo-notification-content');
        for (const child of [this.#icon, text, close]) content.add_child(child);
        this.actor = contentButton('frodo-notification', content, open, {x_expand: true});
    }

    update(notification: MessageTray.Notification): void {
        const app = notification.source?.title ?? '';
        const ago = formatAgo(notification.datetime.to_unix() * 1000, Date.now());
        const title = oneLine(notification.title ?? '');
        const body = oneLine(notification.body ?? '');
        const meta = app ? `${app} · ${ago}` : ago;
        const key = JSON.stringify([meta, title, body, notification.useBodyMarkup]);
        if (key === this.#shown) return;
        this.#shown = key;
        this.#icon.gicon = notificationIcon(notification) ?? frodoIcon('bell');
        this.#meta.text = meta;
        this.#title.text = title;
        this.#body.visible = body !== '';
        this.#body.clutter_text.set_markup(fixMarkup(body, notification.useBodyMarkup));
        this.actor.accessible_name = title;
    }

    destroy(): void {
        this.actor.destroy();
    }
}
