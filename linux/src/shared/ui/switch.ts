import Clutter from 'gi://Clutter';
import St from 'gi://St';

import {Emitter} from '../emitter.js';

export class Switch extends Emitter<{toggled: [boolean]}> {
    readonly actor: St.Button;
    readonly #knob = new St.Widget({style_class: 'frodo-switch-knob', x_expand: true, y_align: Clutter.ActorAlign.CENTER});

    constructor(accessibleName: string) {
        super();
        this.actor = new St.Button({
            style_class: 'frodo-switch',
            toggle_mode: true,
            can_focus: true,
            accessible_name: accessibleName,
            y_align: Clutter.ActorAlign.CENTER,
            child: this.#knob,
        });
        this.actor.connect('notify::checked', () => {
            this.#sync();
            this.emit('toggled', this.actor.checked);
        });
        this.#sync();
    }

    get checked(): boolean {
        return this.actor.checked;
    }

    set checked(value: boolean) {
        if (value !== this.actor.checked) this.actor.checked = value;
    }

    #sync(): void {
        this.#knob.x_align = this.actor.checked ? Clutter.ActorAlign.END : Clutter.ActorAlign.START;
    }

    destroy(): void {
        this.clearListeners();
        this.actor.destroy();
    }
}
