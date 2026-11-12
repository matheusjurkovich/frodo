import {Mixer} from './mixer-service.js';
import {FakeStream, mixer as control} from '../../../tests/shell/volume.js';

describe('Mixer', () => {
    let mixer: Mixer | null = null;

    function stream(id: number, description: string): FakeStream {
        const fake = new FakeStream();
        fake.id = id;
        fake.name = `name-${id}`;
        fake.description = description;
        return fake;
    }

    afterEach(() => {
        mixer?.destroy();
        mixer = null;
        control.sink = null;
        control.source = null;
    });

    it('expõe a saída e a entrada padrão com o nome do dispositivo', () => {
        control.sink = stream(1, 'Alto-falantes');
        control.source = stream(2, '');
        mixer = new Mixer();
        expect(mixer.output?.name).toBe('Alto-falantes');
        expect(mixer.input?.name).toBe('name-2');
    });

    it('é nulo sem dispositivo padrão', () => {
        mixer = new Mixer();
        expect(mixer.output).toBeNull();
        expect(mixer.input).toBeNull();
    });

    it('emite changed ao trocar o dispositivo padrão e ao mudar o mudo dele', () => {
        mixer = new Mixer();
        const changed = jasmine.createSpy('changed');
        mixer.on('changed', changed);
        const source = stream(2, 'Microfone');
        control.setDefaultSource(source);
        expect(changed).toHaveBeenCalledTimes(1);
        changed.calls.reset();
        source.set(0, true);
        expect(changed).toHaveBeenCalled();
        expect(mixer.input?.muted).toBe(true);
    });

    it('muta o stream pelo id', () => {
        const source = stream(2, 'Microfone');
        control.source = source;
        mixer = new Mixer();
        mixer.setMuted(2, true);
        expect(source.is_muted).toBe(true);
    });

    it('desconecta os sinais ao destruir', () => {
        control.sink = stream(1, 'Saída');
        mixer = new Mixer();
        mixer.destroy();
        expect(control.connections()).toBe(0);
        expect(control.sink.connections()).toBe(0);
        mixer = null;
    });
});
