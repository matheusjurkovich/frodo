import {FakeSignals} from './fake-signals.js';

export class FakeStream extends FakeSignals {
    volume = 0;
    is_muted = false;
    id = 0;
    name = '';
    description = '';
    is_virtual = false;
    is_event_stream = false;
    pushed = 0;

    get_id(): number {
        return this.id;
    }

    get_name(): string {
        return this.name;
    }

    get_description(): string {
        return this.description;
    }

    get_icon_name(): string {
        return '';
    }

    change_is_muted(muted: boolean): void {
        this.set(this.volume, muted);
    }

    push_volume(): void {
        this.pushed++;
    }

    set(volume: number, muted = this.is_muted): void {
        const mutedChanged = muted !== this.is_muted;
        this.volume = volume;
        this.is_muted = muted;
        this.emit('notify::volume');
        if (mutedChanged) this.emit('notify::is-muted');
    }
}

export class FakeMixer extends FakeSignals {
    sink: FakeStream | null = null;
    source: FakeStream | null = null;
    maxNorm = 65536;

    get_default_sink(): FakeStream | null {
        return this.sink;
    }

    get_default_source(): FakeStream | null {
        return this.source;
    }

    get_sink_inputs(): FakeStream[] {
        return [];
    }

    get_source_outputs(): FakeStream[] {
        return [];
    }

    get_event_sink_input(): FakeStream | null {
        return null;
    }

    lookup_stream_id(id: number): FakeStream | null {
        return [this.sink, this.source].find(stream => stream?.id === id) ?? null;
    }

    get_vol_max_norm(): number {
        return this.maxNorm;
    }

    setDefaultSource(source: FakeStream | null): void {
        this.source = source;
        this.emit('default-source-changed', 0);
    }

    setDefaultSink(sink: FakeStream | null): void {
        this.sink = sink;
        this.emit('default-sink-changed', 0);
    }
}

export const mixer = new FakeMixer();

export function getMixerControl(): FakeMixer {
    return mixer;
}
