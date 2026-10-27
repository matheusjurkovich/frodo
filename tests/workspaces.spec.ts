import {appsSummary, colorSlot, thumbnailRects, workspaceTitle} from '../src/core/workspaces.js';

describe('áreas de trabalho', () => {
    const area = {x: 0, y: 0, width: 1920, height: 1200};

    it('escala janelas para a miniatura', () => {
        expect(thumbnailRects([{x: 0, y: 0, width: 960, height: 1200}], area, 160, 100)).toEqual([{x: 0, y: 0, width: 80, height: 100}]);
    });

    it('corta o que sai da área de trabalho', () => {
        expect(thumbnailRects([{x: 1800, y: 0, width: 400, height: 600}], area, 160, 100)).toEqual([{x: 150, y: 0, width: 10, height: 50}]);
    });

    it('respeita o deslocamento do monitor', () => {
        const right = {x: 1920, y: 0, width: 1920, height: 1200};
        expect(thumbnailRects([{x: 1920, y: 600, width: 960, height: 600}], right, 160, 100)).toEqual([
            {x: 0, y: 50, width: 80, height: 50},
        ]);
    });

    it('descarta janela fora da área de trabalho', () => {
        expect(thumbnailRects([{x: 1920, y: 0, width: 400, height: 600}], area, 160, 100)).toEqual([]);
    });

    it('título e resumo', () => {
        expect(workspaceTitle('Código', ['VS Code'], 0)).toBe('Código');
        expect(workspaceTitle('', ['Firefox', 'Slack'], 1)).toBe('Firefox');
        expect(workspaceTitle('  ', [], 2)).toBe('Área 3');
        expect(workspaceTitle(undefined, [], 2)).toBe('Área 3');
        expect(appsSummary(['VS Code', 'Terminal', 'VS Code'])).toBe('VS Code, Terminal');
        expect(appsSummary(['A', 'B', 'C', 'D'])).toBe('A, B +2');
        expect(appsSummary([])).toBe('Vazia');
    });

    it('cor estável por app', () => {
        expect(colorSlot('firefox.desktop', 6)).toBe(colorSlot('firefox.desktop', 6));
        expect(colorSlot('x', 6)).toBeGreaterThanOrEqual(0);
        expect(colorSlot('x', 6)).toBeLessThan(6);
    });
});
