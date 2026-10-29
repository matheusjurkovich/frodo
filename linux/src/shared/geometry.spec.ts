import {alignX, anchorCenter, barHeight, centerClamp, segmentWidths, topEdgeSpan} from './geometry.js';

describe('geometry', () => {
    it('centraliza o painel na pílula dentro do monitor', () => {
        expect(centerClamp(900, 120, 600, 0, 1920)).toBe(660);
        expect(centerClamp(10, 120, 600, 0, 1920)).toBe(8);
        expect(centerClamp(1850, 60, 600, 0, 1920)).toBe(1312);
        expect(centerClamp(2800, 120, 600, 1920, 1920)).toBe(2560);
    });

    it('pílula centralizada ancora o painel no centro da faixa, não na largura animada dela', () => {
        const span = {x: 0, width: 1440};
        expect(anchorCenter('center', span, 604, 234.8)).toBe(720);
        expect(anchorCenter('center', span, 584, 272.9)).toBe(720);
        expect(anchorCenter('center', {x: 1920, width: 1920}, 2800, 120)).toBe(2880);
    });

    it('pílula encostada na borda ancora o painel no centro dela', () => {
        expect(anchorCenter('left', {x: 0, width: 1440}, 8, 200)).toBe(108);
        expect(anchorCenter('right', {x: 0, width: 1440}, 1232, 200)).toBe(1332);
    });

    it('acha a faixa do topo onde a ilha abre', () => {
        const main = {x: 0, y: 0, width: 1920, height: 1080};
        expect(topEdgeSpan(main, [main], 900)).toEqual({x1: 510, x2: 1410, y: 0});
        expect(topEdgeSpan({x: 1920, y: 200, width: 800, height: 600}, [], 900)).toEqual({x1: 1920, x2: 2720, y: 200});
    });

    it('alinha no centro ou encosta na borda com margem', () => {
        expect(alignX('center', 200, 0, 1920, 8)).toBe(860);
        expect(alignX('left', 200, 1920, 1920, 8)).toBe(1928);
        expect(alignX('right', 200, 0, 1920, 8)).toBe(1712);
    });

    it('leva a faixa do topo para o lado da pílula', () => {
        const main = {x: 0, y: 0, width: 1920, height: 1080};
        expect(topEdgeSpan(main, [main], 900, 'left')).toEqual({x1: 0, x2: 900, y: 0});
        expect(topEdgeSpan(main, [main], 900, 'right')).toEqual({x1: 1020, x2: 1920, y: 0});
    });

    it('não cria faixa com outro monitor logo acima', () => {
        const below = {x: 0, y: 1080, width: 1920, height: 1080};
        expect(topEdgeSpan(below, [{x: 0, y: 0, width: 1920, height: 1080}, below], 900)).toBeNull();
        expect(topEdgeSpan(below, [{x: 0, y: 0, width: 400, height: 1080}, below], 900)).toEqual({x1: 510, x2: 1410, y: 1080});
    });
});

describe('segmentWidths', () => {
    it('divide a largura pelas frações', () => {
        expect(segmentWidths([0.58, 0.36, 0.06], 200)).toEqual([116, 72, 12]);
    });

    it('não passa da largura total', () => {
        expect(segmentWidths([0.8, 0.5], 100)).toEqual([80, 20]);
        expect(segmentWidths([-1, 2], 50)).toEqual([0, 50]);
    });
});

describe('barHeight', () => {
    it('escala pela maior barra com piso de 3px', () => {
        expect(barHeight(900, 900, false)).toBe(64);
        expect(barHeight(450, 900, false)).toBe(32);
        expect(barHeight(1, 900, false)).toBe(3);
        expect(barHeight(0, 0, false)).toBe(3);
    });

    it('barra futura fica no piso', () => {
        expect(barHeight(900, 900, true)).toBe(3);
    });
});
