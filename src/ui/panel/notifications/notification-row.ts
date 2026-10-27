import Clutter from 'gi://Clutter';
import Pango from 'gi://Pango';
import St from 'gi://St';
import {fixMarkup} from 'resource:///org/gnome/shell/misc/util.js';
import type * as MessageTray from 'resource:///org/gnome/shell/ui/messageTray.js';

import {formatAgo} from '../../../core/format.js';
import {notificationIcon} from '../../../services/notification-bridge.js';
import {iconButton} from '../../components/buttons.js';
import {column, label, row} from '../../components/layout.js';
import {frodoIcon} from '../../icons.js';

export interface NotificationRowActions {
    readonly dismiss: () => void;
    readonly open: () => void;
}

const oneLine = (text: string): string => text.replace(/\n/g, ' ');

export function notificationRow(notification: MessageTray.Notification, {dismiss, open}: NotificationRowActions): St.Button {
    const app = notification.source?.title ?? '';
    const ago = formatAgo(notification.datetime.to_unix() * 1000, Date.now());
    const title = oneLine(notification.title ?? '');
    const body = oneLine(notification.body ?? '');

    const icon = new St.Icon({
        gicon: notificationIcon(notification) ?? frodoIcon('bell'),
        style_class: 'frodo-notification-icon',
        y_align: Clutter.ActorAlign.START,
    });

    const text = column('frodo-notification-text');
    text.add_child(label(app ? `${app} · ${ago}` : ago, 'frodo-notification-meta'));
    text.add_child(label(title, 'frodo-notification-title'));
    if (body) {
        const bodyLabel = new St.Label({style_class: 'frodo-notification-body', x_expand: true});
        bodyLabel.clutter_text.line_wrap = true;
        bodyLabel.clutter_text.line_wrap_mode = Pango.WrapMode.WORD_CHAR;
        bodyLabel.clutter_text.set_markup(fixMarkup(body, notification.useBodyMarkup));
        text.add_child(bodyLabel);
    }

    const close = iconButton(frodoIcon('close'), 'Dispensar notificação', dismiss, 'ghost', 32);
    close.y_align = Clutter.ActorAlign.START;

    const content = row('frodo-notification-content');
    content.add_child(icon);
    content.add_child(text);
    content.add_child(close);

    const button = new St.Button({
        style_class: 'frodo-notification',
        child: content,
        can_focus: true,
        x_expand: true,
        accessible_name: title,
    });
    button.connect('clicked', open);
    return button;
}
