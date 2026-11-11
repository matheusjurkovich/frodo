import {pillCover, tongueVisible} from './island-cover.js';
import type {CoverInput} from './island-cover.types.js';

const FREE: CoverInput = {fullscreen: false, maximized: false, alwaysShowPill: false, kind: undefined, peeking: false};

describe('pillCover', () => {
    it('mostra a pílula quando nada cobre a tela', () => {
        expect(pillCover(FREE)).toEqual({covered: false, pillWanted: true});
    });

    it('esconde a pílula sobre janela maximizada', () => {
        expect(pillCover({...FREE, maximized: true})).toEqual({covered: true, pillWanted: false});
    });

    it('mantém a pílula sobre janela maximizada quando sempre visível', () => {
        expect(pillCover({...FREE, maximized: true, alwaysShowPill: true})).toEqual({covered: false, pillWanted: true});
    });

    it('esconde a pílula em tela cheia mesmo quando sempre visível', () => {
        expect(pillCover({...FREE, fullscreen: true, alwaysShowPill: true})).toEqual({covered: true, pillWanted: false});
    });

    it('mostra pedido de permissão e espera do Claude sobre tela cheia', () => {
        expect(pillCover({...FREE, fullscreen: true, kind: 'claude-permission'}).pillWanted).toBeTrue();
        expect(pillCover({...FREE, fullscreen: true, kind: 'claude-waiting'}).pillWanted).toBeTrue();
    });

    it('mostra notificação sobre janela maximizada, mas não sobre tela cheia', () => {
        expect(pillCover({...FREE, maximized: true, kind: 'notification'}).pillWanted).toBeTrue();
        expect(pillCover({...FREE, fullscreen: true, kind: 'notification'}).pillWanted).toBeFalse();
    });

    it('não trata outras atividades como alerta', () => {
        expect(pillCover({...FREE, fullscreen: true, kind: 'media'}).pillWanted).toBeFalse();
    });

    it('mostra a pílula durante a espiada da hora em tela cheia', () => {
        expect(pillCover({...FREE, fullscreen: true, peeking: true})).toEqual({covered: true, pillWanted: true});
    });
});

describe('tongueVisible', () => {
    const covered = {covered: true, fullscreen: false, open: false, pillVisible: false};

    it('aparece quando a pílula some sob janela maximizada', () => {
        expect(tongueVisible(covered)).toBeTrue();
    });

    it('some em tela cheia, com a ilha aberta, com a pílula visível ou sem cobertura', () => {
        expect(tongueVisible({...covered, fullscreen: true})).toBeFalse();
        expect(tongueVisible({...covered, open: true})).toBeFalse();
        expect(tongueVisible({...covered, pillVisible: true})).toBeFalse();
        expect(tongueVisible({...covered, covered: false})).toBeFalse();
    });
});
