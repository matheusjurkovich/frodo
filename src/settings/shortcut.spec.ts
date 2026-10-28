import {accelerator, shortcutLabel} from './shortcut.js';

const NONE = {super: false, control: false, alt: false, shift: false};

describe('shortcut', () => {
    it('monta o acelerador com os modificadores na ordem do GTK', () => {
        expect(accelerator('z', {...NONE, super: true})).toBe('<Super>z');
        expect(accelerator('z', {...NONE, super: true, shift: true})).toBe('<Super><Shift>z');
        expect(accelerator('Z', {...NONE, super: true, shift: true})).toBe('<Super><Shift>z');
        expect(accelerator('Delete', {super: false, control: true, alt: true, shift: false})).toBe('<Control><Alt>Delete');
    });

    it('recusa tecla sem modificador ou sem nome', () => {
        expect(accelerator('z', NONE)).toBeNull();
        expect(accelerator('', {...NONE, super: true})).toBeNull();
    });

    it('só Shift não basta', () => {
        expect(accelerator('a', {...NONE, shift: true})).toBeNull();
    });

    it('rótulo do atalho', () => {
        expect(shortcutLabel('<Super>z')).toBe('Super + Z');
        expect(shortcutLabel('<Super><Shift>z')).toBe('Super + Shift + Z');
        expect(shortcutLabel('<Control><Alt>Delete')).toBe('Ctrl + Alt + Delete');
        expect(shortcutLabel('')).toBe('');
    });
});
