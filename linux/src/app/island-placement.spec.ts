import {IslandPlacement} from './island-placement.js';
import type {Rect} from '../shared/geometry.types.js';
import type {PillPosition} from '../settings/schema-values.types.js';

const MONITOR: Rect = {x: 0, y: 0, width: 1440, height: 900};
const BAR_VISIBLE: Rect = {x: 0, y: 32, width: 1440, height: 868};
const BAR_HIDDEN: Rect = {x: 0, y: 0, width: 1440, height: 900};

function placement(pillPosition: PillPosition, workArea: Rect = BAR_VISIBLE, monitorIndex = 0): IslandPlacement {
    return new IslandPlacement({
        settings: {pillPosition},
        monitorIndex,
        monitors: () => [MONITOR],
        workArea: () => workArea,
    });
}

describe('IslandPlacement', () => {
    it('centraliza a pílula no monitor com folga abaixo da barra', () => {
        expect(placement('center').floatingOrigin(200, 36)).toEqual({x: 620, y: 38});
    });

    it('encosta a pílula lateral na área de trabalho sem folga', () => {
        const area = {x: 0, y: 32, width: 1400, height: 868};
        expect(placement('right', area).floatingOrigin(200, 36)).toEqual({x: 1200, y: 32});
    });

    it('apoia a pílula de baixo na base da área de trabalho', () => {
        expect(placement('bottom-center').floatingOrigin(200, 36)).toEqual({x: 620, y: 858});
    });

    it('centraliza a pílula do meio na altura da área de trabalho', () => {
        expect(placement('middle-left').floatingOrigin(36, 36)).toEqual({x: 0, y: 448});
    });

    it('posiciona a lingueta colada na borda, sem folga vertical', () => {
        expect(placement('center').tongueOrigin(60, 6)).toEqual({x: 690, y: 32});
    });

    it('nomeia a borda da lingueta pela posição da pílula', () => {
        expect(placement('center').tongueEdge).toBe('top');
        expect(placement('bottom-left').tongueEdge).toBe('bottom');
        expect(placement('middle-right').tongueEdge).toBe('right');
    });

    it('abre o painel para baixo a partir do topo da pílula', () => {
        const top = placement('center');
        top.anchorTo(38, 36);
        expect(top.panelY(400)).toBe(38);
        expect(top.pivotY(38, 400)).toBe(0);
        expect(top.available()).toBe(862);
    });

    it('abre o painel para cima a partir da base da pílula de baixo', () => {
        const bottom = placement('bottom-center');
        bottom.anchorTo(858, 36);
        expect(bottom.panelY(400)).toBe(494);
        expect(bottom.pivotY(494, 400)).toBe(1);
        expect(bottom.available()).toBe(862);
    });

    it('centraliza o painel do meio na pílula sem sair da área de trabalho', () => {
        const middle = placement('middle-left');
        middle.anchorTo(448, 36);
        expect(middle.panelY(400)).toBe(266);
        expect(middle.panelY(900)).toBe(32);
        expect(middle.available()).toBe(868);
    });

    it('centraliza o painel na pílula e o prende dentro da área de trabalho', () => {
        expect(placement('center').panelX(620, 200, 600)).toBe(420);
        expect(placement('right').panelX(1200, 200, 600)).toBe(832);
    });

    it('sem monitor não posiciona pílula nem painel', () => {
        const orphan = placement('center', BAR_VISIBLE, 1);
        expect(orphan.floatingOrigin(200, 36)).toBeNull();
        expect(orphan.tongueOrigin(60, 6)).toBeNull();
        expect(orphan.panelX(620, 200, 600)).toBeNull();
    });

    it('só vigia a borda de cima quando a barra do topo está escondida', () => {
        expect(placement('center').topEdge()).toBeNull();
        expect(placement('center', BAR_HIDDEN).topEdge()).toEqual({x1: 270, x2: 1170, y: 0});
        expect(placement('bottom-center', BAR_HIDDEN).topEdge()).toBeNull();
        expect(placement('middle-left', BAR_HIDDEN).topEdge()).toBeNull();
    });
});
