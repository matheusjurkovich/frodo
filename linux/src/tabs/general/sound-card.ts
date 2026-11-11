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
import type {Component} from '../../shared/ui/lifecycle.types.js';
import type {NativeControls} from './native-controls.js';
import type {SliderSlots} from './native-controls.types.js';

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
        let gone = false;
        let slider: Disposables | null = null;
        const release = (): void => {
            slider?.dispose();
            slider = null;
        };
        this.#values.add(release);
        const attach = (): void => {
            release();
            if (gone) return;
            const item = bin.get_first_child();
            if (!(item instanceof QuickSlider)) {
                value.text = '';
                return;
            }
            const target = item.slider;
            const sync = (): void => {
                value.text = `${Math.round(target.value * 100)}%`;
            };
            const id = target.connect('notify::value', sync);
            const destroyId = target.connect('destroy', () => {
                slider = null;
            });
            const current = new Disposables();
            current.add(() => {
                target.disconnect(id);
                target.disconnect(destroyId);
            });
            slider = current;
            sync();
        };
        const valueId = value.connect('destroy', () => {
            gone = true;
            slider = null;
        });
        const binIds = [
            bin.connect('destroy', () => {
                gone = true;
                slider = null;
            }),
            bin.connect('child-added', attach),
            bin.connect('child-removed', attach),
        ];
        this.#values.add(() => {
            if (gone) return;
            value.disconnect(valueId);
            for (const id of binIds) bin.disconnect(id);
        });
        attach();
    }

    destroy(): void {
        this.#disposables.dispose();
        this.actor.destroy();
    }
}
