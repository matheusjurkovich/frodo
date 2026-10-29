import Clutter from 'gi://Clutter';
import GLib from 'gi://GLib';
import St from 'gi://St';

import {column, label} from '../shared/ui/layout.js';
import type {Component} from '../shared/ui/lifecycle.js';

export class PeekView implements Component {
    readonly actor = column('frodo-pill-peek');
    readonly #clock = label('', 'frodo-pill-peek-clock');
    readonly #bar = new St.Widget({style_class: 'frodo-pill-peek-bar', x_expand: true});
    #waiting = 0;

    constructor() {
        this.#clock.x_align = Clutter.ActorAlign.CENTER;
        this.#bar.set_pivot_point(0, 0.5);
        this.actor.y_align = Clutter.ActorAlign.CENTER;
        this.actor.add_child(this.#clock);
        this.actor.add_child(this.#bar);
        this.actor.hide();
    }

    start(seconds: number): void {
        this.stop();
        this.#clock.text = GLib.DateTime.new_now_local().format('%H:%M') ?? '';
        this.#bar.scale_x = 1;
        this.actor.show();
        const run = (): void => {
            this.#bar.ease({scaleX: 0, duration: seconds * 1000, mode: Clutter.AnimationMode.LINEAR});
        };
        if (this.#bar.mapped) {
            run();
            return;
        }
        this.#waiting = this.#bar.connect('notify::mapped', () => {
            if (!this.#bar.mapped) return;
            this.#stopWaiting();
            run();
        });
    }

    stop(): void {
        this.#stopWaiting();
        this.#bar.remove_all_transitions();
        this.actor.hide();
    }

    #stopWaiting(): void {
        if (this.#waiting !== 0) this.#bar.disconnect(this.#waiting);
        this.#waiting = 0;
    }

    destroy(): void {
        this.#stopWaiting();
        this.actor.destroy();
    }
}
