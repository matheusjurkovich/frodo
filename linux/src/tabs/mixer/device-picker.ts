import Pango from 'gi://Pango';
import St from 'gi://St';
import * as PopupMenu from 'resource:///org/gnome/shell/ui/popupMenu.js';
import type {AudioDevice} from '../../features/system/mixer-service.types.js';
import {Disposables} from '../../shared/disposables.js';
import type {IslandHandle} from '../../shared/island-handle.types.js';
import {contentButton} from '../../shared/ui/buttons.js';
import {frodoIcon} from '../../shared/ui/icons.js';
import {islandMenu} from '../../shared/ui/island-menu.js';
import {label, row} from '../../shared/ui/layout.js';
import type {Component} from '../../shared/ui/lifecycle.types.js';

export class DevicePicker implements Component {
    readonly actor: St.BoxLayout = row('frodo-mixer-device');
    readonly #button: St.Button;
    readonly #text = label('', 'frodo-mixer-device-name');
    readonly #menu: PopupMenu.PopupMenu;
    readonly #disposables = new Disposables();

    constructor(island: IslandHandle, devices: () => AudioDevice[], current: () => number | null, choose: (id: number) => void) {
        this.#text.clutter_text.ellipsize = Pango.EllipsizeMode.END;
        const content = row('frodo-mixer-device-content');
        this.#text.x_expand = true;
        content.add_child(this.#text);
        content.add_child(new St.Icon({gicon: frodoIcon('expand'), style_class: 'frodo-mixer-device-caret'}));
        this.#button = contentButton(
            'frodo-button frodo-button-control frodo-mixer-device-button',
            content,
            () => {
                this.#menu.removeAll();
                const active = current();
                for (const device of devices()) {
                    const item = new PopupMenu.PopupMenuItem(device.name);
                    item.add_style_class_name('frodo-power-item');
                    item.setOrnament(device.id === active ? PopupMenu.Ornament.CHECK : PopupMenu.Ornament.NONE);
                    item.connect('activate', () => {
                        choose(device.id);
                    });
                    this.#menu.addMenuItem(item);
                }
                this.#menu.toggle();
            },
            {x_expand: true},
        );
        const title = label('Dispositivo', 'frodo-mixer-device-label');
        this.actor.add_child(title);
        this.actor.add_child(this.#button);
        this.#menu = islandMenu(island, this.#button, 0.5, this.#disposables, ['frodo-power-menu', 'frodo-mixer-device-menu']);
    }

    set device(name: string) {
        this.#text.text = name;
        this.#button.accessible_name = `Dispositivo: ${name}`;
    }

    destroy(): void {
        this.#disposables.dispose();
        this.actor.destroy();
    }
}
