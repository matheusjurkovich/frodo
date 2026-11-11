import Clutter from 'gi://Clutter';
import Pango from 'gi://Pango';
import St from 'gi://St';
import type {AudioStream} from '../../features/system/mixer.types.js';
import type {Mixer} from '../../features/system/mixer-service.js';
import {column, dimLabel, label, row} from '../../shared/ui/layout.js';
import type {Component} from '../../shared/ui/lifecycle.types.js';
import {BARS, SPEAKER} from './mixer-page.const.js';
import {VolumeControl} from './volume-control.js';

export class AppRow implements Component {
    readonly actor = column('frodo-mixer-app');
    readonly #icon = new St.Icon({style_class: 'frodo-mixer-app-icon', y_align: Clutter.ActorAlign.CENTER});
    readonly #name = label('', 'frodo-mixer-app-name');
    readonly #detail = dimLabel();
    readonly #bars = row('frodo-mixer-bars');
    readonly #muted = label('Silenciado', 'frodo-mixer-muted-label');
    readonly #control: VolumeControl;

    constructor(mixer: Mixer) {
        this.#control = new VolumeControl(mixer, SPEAKER, 32);
        this.#detail.clutter_text.ellipsize = Pango.EllipsizeMode.END;
        const text = column('frodo-mixer-app-text');
        text.y_align = Clutter.ActorAlign.CENTER;
        text.add_child(this.#name);
        text.add_child(this.#detail);
        this.#bars.x_expand = false;
        this.#bars.y_align = Clutter.ActorAlign.CENTER;
        this.#bars.accessible_name = 'Tocando agora';
        for (let index = 0; index < BARS; index++)
            this.#bars.add_child(new St.Widget({style_class: `frodo-mixer-bar frodo-mixer-bar-${index}`, y_align: Clutter.ActorAlign.END}));
        const head = row('frodo-mixer-app-head');
        for (const child of [this.#icon, text, this.#bars, this.#muted]) head.add_child(child);
        this.#control.actor.add_style_class_name('frodo-mixer-app-control');
        this.actor.add_child(head);
        this.actor.add_child(this.#control.actor);
    }

    update(stream: AudioStream, playing: boolean): void {
        this.#icon.icon_name = stream.iconName;
        this.#name.text = stream.name;
        this.#detail.text = stream.detail ?? '';
        this.#detail.visible = stream.detail !== null;
        this.#bars.visible = playing && !stream.muted;
        this.#muted.visible = stream.muted;
        this.#control.update(stream, stream.name);
    }

    destroy(): void {
        this.#control.destroy();
        this.actor.destroy();
    }
}
