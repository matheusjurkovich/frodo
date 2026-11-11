import type Gio from 'gi://Gio';
import Clutter from 'gi://Clutter';
import St from 'gi://St';
import {Slider} from 'resource:///org/gnome/shell/ui/slider.js';
import {volumeLabel} from '../../features/system/mixer.js';
import type {AudioStream} from '../../features/system/mixer.types.js';
import type {Mixer} from '../../features/system/mixer-service.js';
import {iconButton} from '../../shared/ui/buttons.js';
import {frodoIcon} from '../../shared/ui/icons.js';
import {label, row} from '../../shared/ui/layout.js';
import type {Component} from '../../shared/ui/lifecycle.types.js';
import type {Icons} from './mixer-page.types.js';

export class VolumeControl implements Component {
    readonly actor = row('frodo-mixer-control');
    readonly #slider = new Slider(0);
    readonly #value = label('', 'frodo-mixer-value frodo-mono');
    readonly #mute: St.Button;
    readonly #sliderId: number;
    readonly #gicons: {readonly on: Gio.Icon; readonly off: Gio.Icon};
    #stream: AudioStream | null = null;
    #shownMuted: boolean | null = null;

    constructor(mixer: Mixer, icons: Icons, size: 32 | 36) {
        this.#gicons = {on: frodoIcon(icons.on), off: frodoIcon(icons.off)};
        this.#mute = iconButton(
            this.#gicons.on,
            'Silenciar',
            () => {
                if (this.#stream) mixer.setMuted(this.#stream.id, !this.#stream.muted);
            },
            'control',
            size,
        );
        this.#mute.add_style_class_name('frodo-mixer-mute');
        this.#slider.x_expand = true;
        this.#slider.y_align = Clutter.ActorAlign.CENTER;
        this.#sliderId = this.#slider.connect('notify::value', () => {
            if (this.#stream) mixer.setLevel(this.#stream.id, this.#slider.value);
        });
        for (const child of [this.#mute, this.#slider, this.#value]) this.actor.add_child(child);
    }

    update(stream: AudioStream, name: string): void {
        this.#stream = stream;
        this.#slider.block_signal_handler(this.#sliderId);
        this.#slider.value = stream.muted ? 0 : stream.level;
        this.#slider.unblock_signal_handler(this.#sliderId);
        this.#slider.accessible_name = `Volume de ${name}`;
        this.#slider.opacity = stream.muted ? 102 : 255;
        this.#value.text = volumeLabel(stream);
        this.#mute.accessible_name = stream.muted ? `Ativar o som de ${name}` : `Silenciar ${name}`;
        if (this.#shownMuted === stream.muted) return;
        this.#shownMuted = stream.muted;
        const icon = this.#mute.child;
        if (icon instanceof St.Icon) icon.gicon = stream.muted ? this.#gicons.off : this.#gicons.on;
        if (stream.muted) this.#mute.add_style_class_name('frodo-mixer-muted');
        else this.#mute.remove_style_class_name('frodo-mixer-muted');
    }

    destroy(): void {
        this.actor.destroy();
    }
}
