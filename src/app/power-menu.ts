import St from 'gi://St';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import * as PopupMenu from 'resource:///org/gnome/shell/ui/popupMenu.js';

import {powerActions} from '../shared/shell-internals.js';
import type {PowerActions} from '../shared/shell-internals.js';
import {Disposables} from '../shared/disposables.js';
import {label} from '../shared/ui/layout.js';
import {frodoIcon} from '../shared/ui/icons.js';
import type {FrodoIconName} from '../shared/ui/icons.js';
import type {Island} from './island.js';

interface Entry {
    readonly text: string;
    readonly icon: FrodoIconName;
    readonly danger: boolean;
    available(actions: PowerActions): boolean;
    activate(actions: PowerActions): void;
}

const ENTRIES: readonly Entry[] = [
    {
        text: 'Suspender',
        icon: 'suspend',
        danger: false,
        available: actions => actions.canSuspend,
        activate: actions => {
            actions.activateSuspend();
        },
    },
    {
        text: 'Reiniciar',
        icon: 'restart',
        danger: false,
        available: actions => actions.canRestart,
        activate: actions => {
            actions.activateRestart();
        },
    },
    {
        text: 'Desligar',
        icon: 'power',
        danger: true,
        available: actions => actions.canPowerOff,
        activate: actions => {
            actions.activatePowerOff();
        },
    },
];

export class PowerMenu {
    readonly #menu: PopupMenu.PopupMenu;
    readonly #items: readonly (readonly [Entry, PopupMenu.PopupBaseMenuItem])[];
    readonly #note: PopupMenu.PopupBaseMenuItem;
    readonly #disposables = new Disposables();

    constructor(source: St.Button, island: Island) {
        this.#menu = new PopupMenu.PopupMenu(source, 1, St.Side.TOP);
        this.#menu.box.add_style_class_name('frodo-power-menu');
        new PopupMenu.PopupMenuManager(source).addMenu(this.#menu);
        Main.layoutManager.uiGroup.add_child(this.#menu.actor);
        this.#menu.actor.hide();

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
        const note = label('Programas abertos serão fechados ao reiniciar ou desligar.', 'frodo-power-note-text');
        note.x_expand = true;
        note.clutter_text.line_wrap = true;
        this.#note.add_child(note);
        this.#menu.addMenuItem(this.#note);

        const openId = this.#menu.connect('open-state-changed', (_menu, open) => {
            source.checked = open;
            if (open) this.#syncAvailability();
        });
        this.#disposables.add(() => {
            this.#menu.disconnect(openId);
        });
        this.#disposables.add(island.holdWhileOpen(this.#menu));
        this.#disposables.add(
            island.on('closed', () => {
                this.#menu.close();
            }),
        );
    }

    toggle(): void {
        this.#menu.toggle();
    }

    #syncAvailability(): void {
        const actions = powerActions();
        for (const [entry, item] of this.#items) item.visible = entry.available(actions);
        this.#note.visible = actions.canRestart || actions.canPowerOff;
    }

    destroy(): void {
        this.#disposables.dispose();
        this.#menu.destroy();
    }
}
