import Clutter from 'gi://Clutter';
import GLib from 'gi://GLib';
import St from 'gi://St';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import * as MessageTray from 'resource:///org/gnome/shell/ui/messageTray.js';
import {EventEmitter} from 'resource:///org/gnome/shell/misc/signals.js';

import {ellipsize, latest, shouldIntercept} from './lib/format.js';

const MAX_ITEMS = 6;

function iconOf(n) {
    return n.gicon ?? n.source?.icon ?? null;
}

export class NotificationBridge extends EventEmitter {
    constructor(island) {
        super();
        this._island = island;
        this._sources = new Map();
        const tray = Main.messageTray;
        this._trayIds = [
            tray.connect('source-added', (_t, source) => this._addSource(source)),
            tray.connect('source-removed', (_t, source) => this._removeSource(source)),
        ];
        tray.getSources().forEach(s => this._addSource(s));

        const original = tray._showNotification;
        this._hadOwn = Object.hasOwn(tray, '_showNotification');
        this._original = original;
        tray._showNotification = function () {
            const next = this._notificationQueue[0];
            if (!shouldIntercept(next))
                return original.call(this);
            this._notificationQueue.shift();
            this.emit('queue-changed');
            next.playSound();
            next.acknowledged = true;
            island.flash({gicon: iconOf(next), title: next.title ?? ''});
            if (next.isTransient)
                next.destroy(MessageTray.NotificationDestroyedReason.EXPIRED);
            GLib.idle_add(GLib.PRIORITY_DEFAULT, () => {
                this._updateState();
                return GLib.SOURCE_REMOVE;
            });
            return undefined;
        };
    }

    _addSource(source) {
        if (this._sources.has(source))
            return;
        const changed = () => this.emit('changed');
        this._sources.set(source, [
            source.connect('notification-added', changed),
            source.connect('notification-removed', changed),
        ]);
        changed();
    }

    _removeSource(source) {
        const ids = this._sources.get(source);
        if (!ids)
            return;
        ids.forEach(id => source.disconnect(id));
        this._sources.delete(source);
        this.emit('changed');
    }

    list() {
        const all = [...this._sources.keys()].flatMap(s => s.notifications);
        return latest(all, n => n.datetime?.to_unix() ?? 0, MAX_ITEMS);
    }

    destroy() {
        if (this._hadOwn)
            Main.messageTray._showNotification = this._original;
        else
            delete Main.messageTray._showNotification;
        this._trayIds.forEach(id => Main.messageTray.disconnect(id));
        for (const [source, ids] of this._sources)
            ids.forEach(id => source.disconnect(id));
        this._sources.clear();
        this.disconnectAll();
    }
}

export class NotificationList {
    constructor(bridge, island) {
        this._bridge = bridge;
        this._island = island;
        this.actor = new St.BoxLayout({orientation: Clutter.Orientation.VERTICAL, style_class: 'frodo-notifs', x_expand: true});
        this._id = bridge.connect('changed', () => this._sync());
        this._sync();
    }

    _row(n) {
        const row = new St.BoxLayout({style_class: 'frodo-notif', x_expand: true});
        const main = new St.Button({style_class: 'frodo-notif-main', x_expand: true, can_focus: true});
        const content = new St.BoxLayout({style: 'spacing: 8px;', x_expand: true, x_align: Clutter.ActorAlign.START});
        const gicon = iconOf(n);
        content.add_child(new St.Icon({gicon, icon_name: gicon ? null : 'dialog-information-symbolic', style_class: 'frodo-notif-icon'}));
        const texts = new St.BoxLayout({orientation: Clutter.Orientation.VERTICAL, y_align: Clutter.ActorAlign.CENTER, x_expand: true});
        const appName = n.source?.title ? `${n.source.title} · ` : '';
        texts.add_child(new St.Label({text: ellipsize(`${appName}${n.title ?? ''}`, 50), style_class: 'frodo-notif-title'}));
        if (n.body)
            texts.add_child(new St.Label({text: ellipsize(n.body.replace(/\s+/g, ' '), 60), style_class: 'frodo-dim'}));
        content.add_child(texts);
        main.child = content;
        main.connect('clicked', () => {
            this._island.close();
            n.activate();
        });
        const close = new St.Button({
            style_class: 'frodo-notif-close',
            child: new St.Icon({icon_name: 'window-close-symbolic', icon_size: 12}),
            y_align: Clutter.ActorAlign.CENTER,
        });
        close.connect('clicked', () => n.destroy(MessageTray.NotificationDestroyedReason.DISMISSED));
        row.add_child(main);
        row.add_child(close);
        return row;
    }

    _sync() {
        this.actor.destroy_all_children();
        const items = this._bridge.list();
        if (!items.length) {
            this.actor.add_child(new St.Label({text: 'Sem notificações', style_class: 'frodo-dim frodo-empty'}));
            return;
        }
        items.forEach(n => this.actor.add_child(this._row(n)));
    }

    destroy() {
        this._bridge.disconnect(this._id);
        this.actor.destroy();
    }
}
