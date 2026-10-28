import {parseMetadata, pickPlayer, trackFraction} from './media.js';
import type {PlayerCandidate} from './media.js';

describe('mídia', () => {
    it('lê os metadados do MPRIS', () => {
        expect(
            parseMetadata({'xesam:title': 'Faixa', 'xesam:artist': ['A', 'B'], 'mpris:artUrl': 'file:///c.png', 'mpris:length': 232000000}),
        ).toEqual({title: 'Faixa', artist: 'A, B', coverUrl: 'file:///c.png', lengthUs: 232000000});
        expect(parseMetadata({})).toEqual({title: '', artist: '', coverUrl: '', lengthUs: null});
    });

    it('calcula o progresso só com duração conhecida', () => {
        expect(trackFraction(84e6, 232e6)).toBeCloseTo(0.362, 3);
        expect(trackFraction(10, null)).toBeNull();
        expect(trackFraction(null, 100)).toBeNull();
        expect(trackFraction(300, 100)).toBe(1);
    });

    it('escolhe o player tocando, senão o mais recente com título, e ignora o playerctld', () => {
        const player = (name: string, playing: boolean, title: string): PlayerCandidate => ({
            name: `org.mpris.MediaPlayer2.${name}`,
            playing,
            title,
        });
        const spotify = player('spotify', false, 'Faixa');
        const firefox = player('firefox', true, 'Vídeo');
        const vazio = player('vlc', false, '');
        const ctld = player('playerctld', true, 'Faixa');
        expect(pickPlayer([spotify, firefox, vazio])).toBe(firefox);
        expect(pickPlayer([ctld, spotify, vazio])).toBe(spotify);
        expect(pickPlayer([player('a', false, 'A'), player('b', false, 'B'), vazio])?.title).toBe('B');
        expect(pickPlayer([vazio, ctld])).toBeNull();
        expect(pickPlayer([])).toBeNull();
    });
});
