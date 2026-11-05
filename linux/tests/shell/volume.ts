import {FakeSignals} from './fake-signals.js';

export class FakeStream extends FakeSignals {
    volume = 0;
    is_muted = false;

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
    maxNorm = 65536;

    get_default_sink(): FakeStream | null {
        return this.sink;
    }

    get_vol_max_norm(): number {
        return this.maxNorm;
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
