import GObject from 'gi://GObject';
import type Gvc from 'gi://Gvc';
import type St from 'gi://St';
import {QuickSlider} from 'resource:///org/gnome/shell/ui/quickSettings.js';
import {getMixerControl} from 'resource:///org/gnome/shell/ui/status/volume.js';

import {Disposables} from '../../shared/disposables.js';
import {card} from '../../shared/ui/card.js';
import {column, label, row} from '../../shared/ui/layout.js';
import {whileMapped} from '../../shared/ui/lifecycle.js';
import type {Component} from '../../shared/ui/lifecycle.js';
import type {NativeControls, SliderSlots} from './native-controls.js';

function header(slots: SliderSlots, title: string, value: St.Label): St.BoxLayout {
    const line = row('frodo-sound-header');
    const text = label(title, 'frodo-sound-title');
    text.x_expand = true;
    for (const child of [slots.icon, text, value, slots.menu]) line.add_child(child);
    return line;
}

function group(...children: St.Widget[]): St.BoxLayout {
    const box = column('frodo-sound-group');
    for (const child of children) box.add_child(child);
    return box;
}

export class SoundCard implements Component {
    readonly actor = card('frodo-sound');
    readonly #mixer = getMixerControl();
    readonly #volume = label('', 'frodo-sound-value frodo-mono');
    readonly #microphone = label('', 'frodo-sound-value frodo-mono');
    readonly #brightness = label('', 'frodo-sound-value frodo-mono');
    readonly #sink = label('', 'frodo-sound-sink');
    readonly #disposables = new Disposables();
    readonly #values = new Disposables();

    constructor(controls: NativeControls) {
        const microphone = group(header(controls.input, 'Microfone', this.#microphone), controls.input.slider);
        const brightness = group(header(controls.brightness, 'Brilho', this.#brightness), controls.brightness.slider);
        controls.input.slider.bind_property('visible', microphone, 'visible', GObject.BindingFlags.SYNC_CREATE);
        controls.brightness.slider.bind_property('visible', brightness, 'visible', GObject.BindingFlags.SYNC_CREATE);
        this.actor.add_child(group(header(controls.output, 'Volume', this.#volume), controls.output.slider, this.#sink));
        this.actor.add_child(microphone);
        this.actor.add_child(brightness);

        this.#disposables.signal(
            this.#mixer,
            this.#mixer.connect('default-sink-changed', () => {
                this.#syncSink();
            }),
        );
        this.#syncSink();
        this.#disposables.add(
            whileMapped(
                this.actor,
                () => {
                    this.#follow(controls.output.slider, this.#volume);
                    this.#follow(controls.input.slider, this.#microphone);
                    this.#follow(controls.brightness.slider, this.#brightness);
                },
                () => {
                    this.#values.dispose();
                },
            ),
        );
    }

    #syncSink(): void {
        const description = (this.#mixer.get_default_sink() as Gvc.MixerStream | null)?.get_description();
        this.#sink.text = `Saída: ${description ?? ''}`;
        this.#sink.visible = Boolean(description);
    }

    #follow(bin: St.Bin, value: St.Label): void {
        const item = bin.get_first_child();
        if (!(item instanceof QuickSlider)) return;
        const {slider} = item;
        const sync = (): void => {
            value.text = `${Math.round(slider.value * 100)}%`;
        };
        this.#values.signal(slider, slider.connect('notify::value', sync));
        sync();
    }

    destroy(): void {
        this.#disposables.dispose();
        this.actor.destroy();
    }
}
