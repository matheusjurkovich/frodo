import Clutter from 'gi://Clutter';
import type St from 'gi://St';
import {accelerator, shortcutLabel} from '../../settings/shortcut.js';
import {Disposables} from '../../shared/disposables.js';
import {textButton} from '../../shared/ui/buttons.js';
import {column, label} from '../../shared/ui/layout.js';
import {Bindings, group, line} from './settings-rows.js';
import {SHOW_SECONDS_KEY} from './settings-rows.const.js';
import type {SettingsSection} from './settings-rows.types.js';
import {MODIFIER_KEYS} from './general-section.const.js';
import type {GeneralSectionDependencies, ShortcutKey} from './general-section.types.js';

export class GeneralSection implements SettingsSection {
    readonly actor = column('frodo-settings-section');
    readonly #deps: GeneralSectionDependencies;
    readonly #disposables = new Disposables();
    readonly #bindings = new Bindings(this.#disposables);
    #capture: {readonly button: St.Button; readonly id: number} | null = null;

    constructor(deps: GeneralSectionDependencies) {
        this.#deps = deps;
        this.actor.add_child(this.#behavior());
        this.actor.add_child(this.#shortcuts());
        this.#disposables.add(() => {
            this.#stopCapture();
        });
    }

    sync(): void {
        this.#bindings.sync();
    }

    #behavior(): St.BoxLayout {
        const {settings, interfaceSettings} = this.#deps;
        return group('Comportamento', [
            line(
                'Abrir ao passar o mouse',
                null,
                this.#bindings.switch(
                    'Abrir ao passar o mouse',
                    () => settings.openOnHover,
                    checked => {
                        settings.openOnHover = checked;
                    },
                ),
            ),
            line(
                'Recolher sozinha após 5 s',
                'Quando aberta por clique ou atalho',
                this.#bindings.switch(
                    'Recolher sozinha após 5 s',
                    () => settings.autoClose,
                    checked => {
                        settings.autoClose = checked;
                    },
                ),
            ),
            line(
                'Mostrar segundos no relógio',
                null,
                this.#bindings.switch(
                    'Mostrar segundos no relógio',
                    () => interfaceSettings.get_boolean(SHOW_SECONDS_KEY),
                    checked => {
                        interfaceSettings.set_boolean(SHOW_SECONDS_KEY, checked);
                    },
                ),
            ),
        ]);
    }

    #shortcuts(): St.BoxLayout {
        return group(
            'Atalhos',
            [this.#shortcutRow('Abrir e fechar a ilha', 'toggle-shortcut'), this.#shortcutRow('Abrir na aba IA', 'claude-shortcut')],
            'Clique em Alterar e pressione a nova combinação. Esc cancela.',
        );
    }

    #shortcutRow(text: string, key: ShortcutKey): St.BoxLayout {
        const kbd = label('', 'frodo-kbd frodo-mono');
        const change = textButton('Alterar', () => {
            this.#startCapture(change, kbd, key);
        });
        this.#bindings.add(() => {
            kbd.text = shortcutLabel(this.#shortcut(key)) || 'Nenhum';
        });
        return line(text, null, kbd, change);
    }

    #shortcut(key: ShortcutKey): string {
        return key === 'toggle-shortcut' ? this.#deps.settings.toggleShortcut : this.#deps.settings.claudeShortcut;
    }

    #startCapture(button: St.Button, kbd: St.Label, key: ShortcutKey): void {
        this.#stopCapture();
        kbd.text = 'Pressione o atalho…';
        this.#deps.grabKeyboard(button);
        const id = button.connect('key-press-event', (_actor, event) => {
            const symbol = event.get_key_symbol();
            if (MODIFIER_KEYS.includes(symbol)) return Clutter.EVENT_STOP;
            this.#stopCapture();
            const state = event.get_state();
            const shortcut =
                symbol === Clutter.KEY_Escape
                    ? null
                    : accelerator(Clutter.keyval_name(symbol) ?? '', {
                          super: (state & (Clutter.ModifierType.SUPER_MASK | Clutter.ModifierType.MOD4_MASK)) !== 0,
                          control: (state & Clutter.ModifierType.CONTROL_MASK) !== 0,
                          alt: (state & Clutter.ModifierType.MOD1_MASK) !== 0,
                          shift: (state & Clutter.ModifierType.SHIFT_MASK) !== 0,
                      });
            if (shortcut === null || shortcut === this.#shortcut(key)) this.sync();
            else if (key === 'toggle-shortcut') this.#deps.settings.toggleShortcut = shortcut;
            else this.#deps.settings.claudeShortcut = shortcut;
            return Clutter.EVENT_STOP;
        });
        this.#capture = {button, id};
    }

    #stopCapture(): void {
        if (!this.#capture) return;
        this.#capture.button.disconnect(this.#capture.id);
        this.#capture = null;
    }

    destroy(): void {
        this.#disposables.dispose();
        this.actor.destroy();
    }
}
