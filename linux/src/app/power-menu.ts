import St from 'gi://St';
import * as PopupMenu from 'resource:///org/gnome/shell/ui/popupMenu.js';
import {powerActions} from '../shared/shell-internals.js';
import {Disposables} from '../shared/disposables.js';
import {islandMenu} from '../shared/ui/island-menu.js';
import {label, wrappedLabel} from '../shared/ui/layout.js';
import {frodoIcon} from '../shared/ui/icons.js';
import type {IslandHandle} from '../shared/island-handle.types.js';
import {ENTRIES} from './power-menu.const.js';
import type {Entry} from './power-menu.types.js';

export class PowerMenu {
    readonly #menu: PopupMenu.PopupMenu;
    readonly #items: readonly (readonly [Entry, PopupMenu.PopupBaseMenuItem])[];
    readonly #note: PopupMenu.PopupBaseMenuItem;
    readonly #disposables = new Disposables();

    constructor(source: St.Button, island: IslandHandle) {
        this.#menu = islandMenu(island, source, 1, this.#disposables, ['frodo-power-menu']);

        this.#items = ENTRIES.map(entry => {
            const item = new PopupMenu.PopupBaseMenuItem();
            item.add_style_class_name('frodo-power-item');
            if (entry.danger) item.add_style_class_name('frodo-danger');
            const text = label(entry.text, 'frodo-power-text');
            item.add_child(new St.Icon({gicon: frodoIcon(entry.icon), style_class: 'frodo-power-icon'}));
            item.add_child(text);
            item.label_actor = text;
            item.connect('activate', () => {
                island.close();
                entry.activate(powerActions());
            });
            this.#menu.addMenuItem(item);
            return [entry, item] as const;
        });

        this.#note = new PopupMenu.PopupBaseMenuItem({reactive: false, can_focus: false});
        this.#note.add_style_class_name('frodo-power-note');
        const note = wrappedLabel('Programas abertos serão fechados ao encerrar a sessão, reiniciar ou desligar.', 'frodo-power-note-text');
        note.x_expand = true;
        this.#note.add_child(note);
        this.#menu.addMenuItem(this.#note);

        this.#disposables.signal(
            this.#menu,
            this.#menu.connect('open-state-changed', (_menu, open) => {
                source.checked = open;
                if (open) this.#syncAvailability();
            }),
        );
    }

    toggle(): void {
        this.#menu.toggle();
    }

    #syncAvailability(): void {
        const actions = powerActions();
        for (const [entry, item] of this.#items) item.visible = entry.available(actions);
        this.#note.visible = actions.canLogout || actions.canRestart || actions.canPowerOff;
    }

    destroy(): void {
        this.#disposables.dispose();
    }
}
