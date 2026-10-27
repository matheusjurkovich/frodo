import type Gvc from 'gi://Gvc';
import {getMixerControl} from 'resource:///org/gnome/shell/ui/status/volume.js';

import {Disposables} from '../util/disposables.js';
import {Emitter} from '../util/emitter.js';

export class VolumeWatch extends Emitter<{changed: [number]}> {
    readonly #mixer = getMixerControl();
    readonly #disposables = new Disposables();
    #sink = new Disposables();

    constructor() {
        super();
        this.#disposables.signal(
            this.#mixer,
            this.#mixer.connect('default-sink-changed', () => {
                this.#follow();
            }),
        );
        this.#follow();
    }

    #follow(): void {
        this.#sink.dispose();
        const sink = this.#mixer.get_default_sink() as Gvc.MixerStream | null;
        if (!sink) return;
        const notify = (): void => {
            this.emit('changed', sink.is_muted ? 0 : Math.round((sink.volume / this.#mixer.get_vol_max_norm()) * 100));
        };
        this.#sink.signal(sink, sink.connect('notify::volume', notify));
        this.#sink.signal(sink, sink.connect('notify::is-muted', notify));
    }

    destroy(): void {
        this.#sink.dispose();
        this.#disposables.dispose();
        this.clearListeners();
    }
}
