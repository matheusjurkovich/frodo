import GObject from 'gi://GObject';
import type Gvc from 'gi://Gvc';
import type St from 'gi://St';
import {QuickSlider} from 'resource:///org/gnome/shell/ui/quickSettings.js';
import {getMixerControl} from 'resource:///org/gnome/shell/ui/status/volume.js';

import {Disposables} from '../../../util/disposables.js';
import {card} from '../../components/card.js';
import {column, label, row} from '../../components/layout.js';
import {whileMapped} from '../../components/lifecycle.js';
import type {Component} from '../../components/lifecycle.js';
import type {NativeControls} from './native-controls.js';

function header(title: string, value: St.Label): St.BoxLayout {
    const line = row('frodo-sound-header');
    const text = label(title, 'frodo-sound-title');
    text.x_expand = true;
    line.add_child(text);
    line.add_child(value);
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
    readonly #brightness = label('', 'frodo-sound-value frodo-mono');
    readonly #sink = label('', 'frodo-sound-sink');
    readonly #disposables = new Disposables();
    readonly #values = new Disposables();

    constructor(controls: NativeControls) {
        const brightness = group(header('Brilho', this.#brightness), controls.brightness);
        controls.brightness.bind_property('visible', brightness, 'visible', GObject.BindingFlags.SYNC_CREATE);
        this.actor.add_child(group(header('Volume', this.#volume), controls.output, this.#sink));
        this.actor.add_child(controls.input);
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
                    this.#follow(controls.output, this.#volume);
                    this.#follow(controls.brightness, this.#brightness);
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
