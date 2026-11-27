import Clutter from 'gi://Clutter';
import type St from 'gi://St';
import {accelerator, claimShortcut, shortcutLabel} from '../../settings/shortcut.js';
import {Disposables} from '../../shared/disposables.js';
import {Timer} from '../../shared/timer.js';
import {textButton} from '../../shared/ui/buttons.js';
import {column, label} from '../../shared/ui/layout.js';
import {Bindings, group, line} from './settings-rows.js';
import {SHOW_SECONDS_KEY} from '../../shared/desktop-interface.const.js';
import type {SettingsSection} from './settings-rows.types.js';
import {MODIFIER_KEYS, NOTICE_MS} from './general-section.const.js';
import type {GeneralSectionDependencies, ShortcutKey} from './general-section.types.js';

export class GeneralSection implements SettingsSection {
    readonly actor = column('frodo-settings-section');
    readonly #deps: GeneralSectionDependencies;
    readonly #disposables = new Disposables();
    readonly #bindings: Bindings;
    readonly #notice = this.#disposables.own(new Timer());
    readonly #kbds = new Map<ShortcutKey, St.Label>();
    #capture: {readonly button: St.Button; readonly ids: readonly number[]} | null = null;

    constructor(deps: GeneralSectionDependencies) {
        this.#deps = deps;
        this.#bindings = new Bindings(this.#disposables, deps.settings);
        this.actor.add_child(this.#behavior());
        this.actor.add_child(this.#shortcuts());
        this.#disposables.add(() => {
            this.#stopCapture();
        });
        this.#disposables.signal(
            this.actor,
            this.actor.connect('notify::mapped', () => {
                if (!this.actor.mapped) this.#cancelCapture();
            }),
        );
    }

    #behavior(): St.BoxLayout {
        const bindings = this.#bindings;
        return group('Comportamento', [
            bindings.toggleLine(
                'Abrir ao passar o mouse',
                'Só abre com o mouse parado 300 ms sobre a pílula, para não abrir quando você mira as abas do navegador.',
                'openOnHover',
            ),
            bindings.toggleLine(
                'Recolher sozinha quando o mouse sai',
                'Espera 5 s depois que o mouse sai. Nunca recolhe com o foco do teclado dentro da ilha.',
                'autoClose',
            ),
            bindings.toggleLine('Mostrar segundos no relógio', null, {settings: this.#deps.interfaceSettings, key: SHOW_SECONDS_KEY}),
        ]);
    }

    #shortcuts(): St.BoxLayout {
        return group(
            'Atalhos',
            [
                this.#shortcutRow('Abrir e fechar a ilha', 'toggle-shortcut'),
                this.#shortcutRow('Abrir na aba IA', 'claude-shortcut'),
                this.#shortcutRow('Permitir o pedido do Claude', 'allow-shortcut'),
                this.#shortcutRow('Negar o pedido do Claude', 'deny-shortcut'),
            ],
            'Clique em Alterar e pressione a nova combinação. Esc cancela.',
        );
    }

    #shortcutRow(text: string, key: ShortcutKey): St.BoxLayout {
        const kbd = label('', 'frodo-kbd frodo-mono');
        const change = textButton('Alterar', () => {
            this.#startCapture(change, kbd, key);
        });
        this.#kbds.set(key, kbd);
        this.#bindings.add(() => {
            this.#showShortcut(key);
        }, [key]);
        return line(text, null, kbd, change);
    }

    #shortcut(key: ShortcutKey): string {
        const settings = this.#deps.settings;
        if (key === 'toggle-shortcut') return settings.toggleShortcut;
        if (key === 'claude-shortcut') return settings.claudeShortcut;
        return key === 'allow-shortcut' ? settings.allowShortcut : settings.denyShortcut;
    }

    #setShortcut(key: ShortcutKey, shortcut: string): void {
        const settings = this.#deps.settings;
        if (key === 'toggle-shortcut') settings.toggleShortcut = shortcut;
        else if (key === 'claude-shortcut') settings.claudeShortcut = shortcut;
        else if (key === 'allow-shortcut') settings.allowShortcut = shortcut;
        else settings.denyShortcut = shortcut;
    }

    #showShortcut(key: ShortcutKey): void {
        const kbd = this.#kbds.get(key);
        if (kbd) kbd.text = shortcutLabel(this.#shortcut(key)) || 'Nenhum';
    }

    #syncShortcuts(): void {
        for (const key of this.#kbds.keys()) this.#showShortcut(key);
    }

    #startCapture(button: St.Button, kbd: St.Label, key: ShortcutKey): void {
        this.#cancelCapture();
        this.#notice.stop();
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
            const others = [...this.#kbds.keys()].filter(other => other !== key).map(other => this.#shortcut(other));
            const claim = shortcut === null ? 'unchanged' : claimShortcut(shortcut, this.#shortcut(key), others);
            if (claim === 'free' && shortcut !== null) {
                this.#setShortcut(key, shortcut);
            } else {
                this.#syncShortcuts();
                if (claim === 'taken') this.#warn(kbd);
            }
            return Clutter.EVENT_STOP;
        });
        const focusOut = button.connect('key-focus-out', () => {
            this.#cancelCapture();
        });
        this.#capture = {button, ids: [id, focusOut]};
    }

    #warn(kbd: St.Label): void {
        kbd.text = 'Já usado em outra ação';
        this.#notice.once(NOTICE_MS, () => {
            this.#syncShortcuts();
        });
    }

    #cancelCapture(): void {
        if (!this.#capture) return;
        this.#stopCapture();
        this.#syncShortcuts();
    }

    #stopCapture(): void {
        if (!this.#capture) return;
        for (const id of this.#capture.ids) this.#capture.button.disconnect(id);
        this.#capture = null;
    }

    destroy(): void {
        this.#disposables.dispose();
        this.actor.destroy();
    }
}
