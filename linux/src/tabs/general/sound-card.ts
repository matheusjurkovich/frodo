import GObject from 'gi://GObject';
import Pango from 'gi://Pango';
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

function group(slots: SliderSlots, title: string, device: St.Label, value: St.Label): St.BoxLayout {
    const header = row('frodo-sound-header');
    device.x_expand = true;
    for (const child of [label(title, 'frodo-sound-title'), device, value]) header.add_child(child);
    const body = column('frodo-sound-body');
    body.add_child(header);
    body.add_child(slots.slider);
    const line = row('frodo-sound-group');
    for (const child of [slots.icon, body, slots.menu]) line.add_child(child);
    slots.slider.bind_property('visible', line, 'visible', GObject.BindingFlags.SYNC_CREATE);
    return line;
}

function deviceLabel(): St.Label {
    const device = label('', 'frodo-sound-device');
    device.clutter_text.ellipsize = Pango.EllipsizeMode.END;
    return device;
}

export class SoundCard implements Component {
    readonly actor = card('frodo-sound');
    readonly #mixer = getMixerControl();
    readonly #volume = label('', 'frodo-sound-value frodo-mono');
    readonly #microphone = label('', 'frodo-sound-value frodo-mono');
    readonly #brightness = label('', 'frodo-sound-value frodo-mono');
    readonly #sink = deviceLabel();
    readonly #source = deviceLabel();
    readonly #disposables = new Disposables();
    readonly #values = new Disposables();

    constructor(controls: NativeControls) {
        this.actor.add_child(group(controls.output, 'Volume', this.#sink, this.#volume));
        this.actor.add_child(group(controls.input, 'Microfone', this.#source, this.#microphone));
        this.actor.add_child(group(controls.brightness, 'Brilho', label('', 'frodo-sound-device'), this.#brightness));

        for (const signal of ['default-sink-changed', 'default-source-changed'])
            this.#disposables.signal(
                this.#mixer,
                this.#mixer.connect(signal, () => {
                    this.#syncDevices();
                }),
            );
        this.#syncDevices();
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

    #syncDevices(): void {
        this.#sink.text = (this.#mixer.get_default_sink() as Gvc.MixerStream | null)?.get_description() ?? '';
        this.#source.text = (this.#mixer.get_default_source() as Gvc.MixerStream | null)?.get_description() ?? '';
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
