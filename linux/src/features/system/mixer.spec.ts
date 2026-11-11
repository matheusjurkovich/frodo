import {levelChange, levelOf, playingSummary, streamDetail, volumeLabel} from './mixer.js';

describe('mixer', () => {
    it('esconde descrição genérica do stream', () => {
        expect(streamDetail('Playback')).toBeNull();
        expect(streamDetail('  ')).toBeNull();
        expect(streamDetail(null)).toBeNull();
    });

    it('mantém descrição que diz o que está tocando', () => {
        expect(streamDetail('Revisão de design - Google Meet')).toBe('Revisão de design - Google Meet');
    });

    it('converte volume bruto em nível entre 0 e 1', () => {
        expect(levelOf(32768, 65536)).toBe(0.5);
        expect(levelOf(98304, 65536)).toBe(1);
        expect(levelOf(10, 0)).toBe(0);
    });

    it('mostra porcentagem ou mudo', () => {
        expect(volumeLabel({level: 0.746, muted: false})).toBe('75%');
        expect(volumeLabel({level: 0.746, muted: true})).toBe('Mudo');
    });

    it('resume quantos apps tocam', () => {
        expect(playingSummary([])).toBe('Nenhum app com som');
        expect(playingSummary([{muted: true}])).toBe('Tudo silenciado');
        expect(playingSummary([{muted: false}, {muted: true}, {muted: false}])).toBe('2 tocando agora');
    });

    it('muta ao zerar o volume e desmuta ao subir', () => {
        expect(levelChange(0, 65536, false)).toEqual({volume: 0, mute: true});
        expect(levelChange(0, 65536, true)).toEqual({volume: 0, mute: null});
        expect(levelChange(0.5, 65536, true)).toEqual({volume: 32768, mute: false});
        expect(levelChange(0.5, 65536, false)).toEqual({volume: 32768, mute: null});
    });

    it('limita o nível entre 0 e 1', () => {
        expect(levelChange(2, 65536, false).volume).toBe(65536);
        expect(levelChange(-1, 65536, false).volume).toBe(0);
    });
});
