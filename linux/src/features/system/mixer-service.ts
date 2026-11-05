import type Gvc from 'gi://Gvc';
import {getMixerControl} from 'resource:///org/gnome/shell/ui/status/volume.js';

import {Disposables} from '../../shared/disposables.js';
import {Emitter} from '../../shared/emitter.js';
import {levelOf, streamDetail} from './mixer.js';
import type {AudioStream} from './mixer.js';

const CONTROL_SIGNALS = ['stream-added', 'stream-removed', 'default-sink-changed', 'default-source-changed', 'state-changed'];
const STREAM_SIGNALS = ['notify::volume', 'notify::is-muted', 'notify::description', 'notify::name'];

export interface AudioDevice {
    readonly id: number;
    readonly name: string;
}

function deviceName(stream: Gvc.MixerStream): string {
    return stream.get_description() || stream.get_name();
}

export class Mixer extends Emitter<{changed: []}> {
    readonly #control = getMixerControl();
    readonly #disposables = new Disposables();
    #streams = new Disposables();

    constructor() {
        super();
        for (const signal of CONTROL_SIGNALS)
            this.#disposables.signal(
                this.#control,
                this.#control.connect(signal, () => {
                    this.#watch();
                }),
            );
        this.#watch();
    }

    get apps(): AudioStream[] {
        return this.#control
            .get_sink_inputs()
            .filter(stream => !stream.is_virtual && !stream.is_event_stream)
            .map(stream => this.#describe(stream));
    }

    get system(): AudioStream | null {
        const stream = this.#control.get_event_sink_input() as Gvc.MixerStream | null;
        return stream ? {...this.#describe(stream), name: 'Sons do sistema', detail: 'Alertas e avisos'} : null;
    }

    get recorders(): AudioStream[] {
        return this.#control
            .get_source_outputs()
            .filter(stream => !stream.is_virtual)
            .map(stream => this.#describe(stream));
    }

    get output(): AudioStream | null {
        const sink = this.#control.get_default_sink() as Gvc.MixerStream | null;
        return sink ? {...this.#describe(sink), name: deviceName(sink)} : null;
    }

    get input(): AudioStream | null {
        const source = this.#control.get_default_source() as Gvc.MixerStream | null;
        return source ? {...this.#describe(source), name: deviceName(source)} : null;
    }

    get outputs(): AudioDevice[] {
        return this.#control.get_sinks().map(sink => ({id: sink.get_id(), name: deviceName(sink)}));
    }

    get inputs(): AudioDevice[] {
        return this.#control.get_sources().map(source => ({id: source.get_id(), name: deviceName(source)}));
    }

    setLevel(id: number, level: number): void {
        const stream = this.#stream(id);
        if (!stream) return;
        const volume = Math.round(Math.min(1, Math.max(0, level)) * this.#control.get_vol_max_norm());
        const muted = stream.is_muted;
        stream.volume = volume;
        if (volume < 1 && !muted) stream.change_is_muted(true);
        else if (volume >= 1 && muted) stream.change_is_muted(false);
        stream.push_volume();
    }

    setMuted(id: number, muted: boolean): void {
        this.#stream(id)?.change_is_muted(muted);
    }

    useOutput(id: number): void {
        const sink = this.#stream(id);
        if (sink) this.#control.set_default_sink(sink);
    }

    useInput(id: number): void {
        const source = this.#stream(id);
        if (source) this.#control.set_default_source(source);
    }

    #stream(id: number): Gvc.MixerStream | null {
        const stream: Gvc.MixerStream | null = this.#control.lookup_stream_id(id);
        return stream;
    }

    #describe(stream: Gvc.MixerStream): AudioStream {
        return {
            id: stream.get_id(),
            name: stream.get_name() || '',
            detail: streamDetail(stream.get_description()),
            iconName: stream.get_icon_name() || 'audio-x-generic',
            level: levelOf(stream.volume, this.#control.get_vol_max_norm()),
            muted: stream.is_muted,
        };
    }

    #watch(): void {
        this.#streams.dispose();
        const control = this.#control;
        const streams = [
            ...control.get_sink_inputs(),
            ...control.get_source_outputs(),
            control.get_event_sink_input() as Gvc.MixerStream | null,
            control.get_default_sink() as Gvc.MixerStream | null,
            control.get_default_source() as Gvc.MixerStream | null,
        ].filter(stream => stream !== null);
        for (const stream of streams)
            for (const signal of STREAM_SIGNALS)
                this.#streams.signal(
                    stream,
                    stream.connect(signal, () => {
                        this.emit('changed');
                    }),
                );
        this.emit('changed');
    }

    destroy(): void {
        this.#streams.dispose();
        this.#disposables.dispose();
        this.clearListeners();
    }
}
