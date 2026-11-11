import Clutter from 'gi://Clutter';
import St from 'gi://St';
import {SPRING} from '../spring.const.js';
import {springEase} from './motion.js';

export class SlidingIndicator {
    readonly actor: St.Widget;
    readonly #row: St.BoxLayout;
    readonly #current: () => St.Button | null;

    constructor(styleClass: string, row: St.BoxLayout, current: () => St.Button | null) {
        this.#row = row;
        this.#current = current;
        this.actor = new St.Widget({
            style_class: styleClass,
            x_align: Clutter.ActorAlign.START,
            y_align: Clutter.ActorAlign.START,
            visible: false,
        });
        row.connect('notify::allocation', () => {
            if (!this.actor.get_transition('x')) this.place(false);
        });
    }

    place(animate: boolean): void {
        const button = this.#current();
        const indicator = this.actor;
        const box = button?.allocation;
        if (!button?.visible || !box || box.get_width() <= 0) {
            indicator.hide();
            return;
        }
        const row = this.#row.allocation;
        const target = {x: row.x1 + box.x1, y: row.y1 + box.y1, width: box.get_width(), height: box.get_height()};
        if (animate && indicator.visible && indicator.mapped) {
            springEase(indicator, target, SPRING);
            return;
        }
        indicator.remove_all_transitions();
        indicator.set_position(target.x, target.y);
        indicator.set_size(target.width, target.height);
        indicator.show();
    }
}
