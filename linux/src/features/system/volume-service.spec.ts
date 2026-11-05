import {VolumeWatch} from './volume-service.js';
import {FakeStream, mixer} from '../../../tests/shell/volume.js';

describe('VolumeWatch', () => {
    let watch: VolumeWatch | null = null;

    afterEach(() => {
        watch?.destroy();
        watch = null;
        mixer.sink = null;
    });

    function watching(): {watch: VolumeWatch; values: number[]} {
        const values: number[] = [];
        watch = new VolumeWatch();
        watch.on('changed', value => values.push(value));
        return {watch, values};
    }

    it('emite o volume da saída padrão em porcentagem do máximo normal', () => {
        const sink = new FakeStream();
        mixer.sink = sink;
        const {values} = watching();
        sink.set(mixer.maxNorm / 2);
        sink.set(mixer.maxNorm);
        expect(values).toEqual([50, 100]);
    });

    it('vale zero quando a saída está muda', () => {
        const sink = new FakeStream();
        mixer.sink = sink;
        const {values} = watching();
        sink.set(mixer.maxNorm, true);
        expect(values.at(-1)).toBe(0);
    });

    it('segue a nova saída padrão e solta a anterior', () => {
        const first = new FakeStream();
        const second = new FakeStream();
        mixer.sink = first;
        const {values} = watching();
        mixer.setDefaultSink(second);
        expect(first.connections()).toBe(0);
        expect(second.connections()).toBe(2);
        first.set(mixer.maxNorm);
        second.set(mixer.maxNorm / 4);
        expect(values).toEqual([25]);
    });

    it('sem saída padrão não escuta nada até aparecer uma', () => {
        const {values} = watching();
        const sink = new FakeStream();
        mixer.setDefaultSink(sink);
        sink.set(mixer.maxNorm);
        expect(values).toEqual([100]);
    });

    it('desconecta do mixer e da saída ao ser destruído', () => {
        const sink = new FakeStream();
        mixer.sink = sink;
        const before = mixer.connections();
        const {watch: created} = watching();
        created.destroy();
        watch = null;
        expect(sink.connections()).toBe(0);
        expect(mixer.connections()).toBe(before);
    });
});
