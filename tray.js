import St from 'gi://St';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';

const PREFIX = 'appindicator-';

export class TrayRow {
    constructor(island) {
        this._island = island;
        this._borrowed = [];
        this.actor = new St.BoxLayout({style_class: 'frodo-tray', visible: false});
        this._ids = [
            island.connect('opening', () => this.borrow()),
            island.connect('closed', () => this.giveBack()),
        ];
    }

    borrow() {
        this.giveBack();
        for (const [key, indicator] of Object.entries(Main.panel.statusArea)) {
            const container = indicator?.container;
            const parent = container?.get_parent();
            if (!key.startsWith(PREFIX) || !parent)
                continue;
            const entry = {container, parent, index: parent.get_children().indexOf(container)};
            entry.destroyId = container.connect('destroy', () => {
                this._borrowed = this._borrowed.filter(e => e !== entry);
                this.actor.visible = this._borrowed.length > 0;
            });
            entry.release = indicator.menu ? this._island.holdWhileOpen(indicator.menu) : null;
            parent.remove_child(container);
            this.actor.add_child(container);
            this._borrowed.push(entry);
        }
        this.actor.visible = this._borrowed.length > 0;
    }

    giveBack() {
        for (const {container, parent, index, destroyId, release} of [...this._borrowed].reverse()) {
            container.disconnect(destroyId);
            release?.();
            this.actor.remove_child(container);
            parent.insert_child_at_index(container, Math.min(index, parent.get_n_children()));
        }
        this._borrowed = [];
        this.actor.visible = false;
    }

    destroy() {
        this._ids.forEach(id => this._island.disconnect(id));
        this.giveBack();
        this.actor.destroy();
    }
}
