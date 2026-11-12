import Clutter from 'gi://Clutter';
import GLib from 'gi://GLib';
import Meta from 'gi://Meta';
import Shell from 'gi://Shell';
import St from 'gi://St';
import {showScreenRecordingUI, showScreenshotUI} from 'resource:///org/gnome/shell/ui/screenshot.js';
import type {Mixer} from '../../features/system/mixer-service.js';
import type {FrodoSettings} from '../../settings/frodo-settings.js';
import {powerActions} from '../../shared/shell-internals.js';
import {Disposables} from '../../shared/disposables.js';
import {CollapsibleCard} from './collapsible-card.js';
import {contentButton} from '../../shared/ui/buttons.js';
import {column, grid, label, packGrid} from '../../shared/ui/layout.js';
import type {Component} from '../../shared/ui/lifecycle.types.js';
import {frodoIcon} from '../../shared/ui/icons.js';
import type {FrodoIconName} from '../../shared/ui/icons.types.js';
import type {IslandHandle} from '../../shared/island-handle.types.js';
import {TERMINALS, FILES, SPACING, COLUMNS} from './shortcuts-card.const.js';

function shortcutButton(icon: FrodoIconName, text: string, onClick: () => void): St.Button {
    const content = column('frodo-shortcut-content');
    content.x_expand = true;
    content.y_align = Clutter.ActorAlign.CENTER;
    content.add_child(new St.Icon({gicon: frodoIcon(icon), style_class: 'frodo-shortcut-icon', x_align: Clutter.ActorAlign.CENTER}));
    const caption = label(text, 'frodo-shortcut-label');
    caption.x_align = Clutter.ActorAlign.CENTER;
    content.add_child(caption);
    return contentButton('frodo-button frodo-button-control frodo-shortcut', content, onClick, {
        x_expand: true,
        y_expand: true,
        accessible_name: text,
    });
}

function openNewWindow(desktopIds: readonly string[]): void {
    const apps = Shell.AppSystem.get_default();
    for (const id of desktopIds) {
        const app = apps.lookup_app(id) as Shell.App | null;
        if (!app) continue;
        app.open_new_window(-1);
        return;
    }
}

export class ShortcutsCard implements Component {
    readonly #card: CollapsibleCard;
    readonly #mixer: Mixer;
    readonly #microphone: St.Button;
    readonly #disposables = new Disposables();

    constructor(island: IslandHandle, settings: FrodoSettings, mixer: Mixer) {
        this.#mixer = mixer;
        const closeThen = (action: () => void) => () => {
            island.close();
            action();
        };
        const closeThenCapture = (action: () => void) => () => {
            island.close(false);
            global.compositor.get_laters().add(Meta.LaterType.BEFORE_REDRAW, () => {
                action();
                return GLib.SOURCE_REMOVE;
            });
        };

        const actions = powerActions();
        const lock = shortcutButton(
            'lock',
            'Bloquear tela',
            closeThen(() => {
                actions.activateLockScreen();
            }),
        );
        this.#microphone = shortcutButton('mic-off', 'Silenciar microfone', () => {
            const source = this.#mixer.input;
            if (source) this.#mixer.setMuted(source.id, !source.muted);
        });
        const buttons = [
            shortcutButton('screenshot', 'Captura de tela', closeThenCapture(showScreenshotUI)),
            shortcutButton('record', 'Gravar tela', closeThenCapture(showScreenRecordingUI)),
            this.#microphone,
            shortcutButton(
                'terminal',
                'Terminal',
                closeThen(() => {
                    openNewWindow(TERMINALS);
                }),
            ),
            shortcutButton(
                'folder',
                'Arquivos',
                closeThen(() => {
                    openNewWindow(FILES);
                }),
            ),
            lock,
        ];

        const container = grid(SPACING);
        container.y_expand = true;
        if (container.layout_manager instanceof Clutter.GridLayout) container.layout_manager.row_homogeneous = true;
        this.#disposables.add(packGrid(container, buttons, COLUMNS));
        this.#card = new CollapsibleCard('shortcuts', 'Atalhos', settings);
        this.#card.body.add_child(container);

        const syncLock = (): void => {
            lock.visible = actions.canLockScreen;
            this.#card.setCount(buttons.filter(button => button.visible).length);
        };
        this.#disposables.signal(actions, actions.connect('notify::can-lock-screen', syncLock));
        syncLock();

        this.#disposables.add(
            this.#mixer.on('changed', () => {
                this.#syncMuted();
            }),
        );
        this.#syncMuted();
    }

    get actor(): St.BoxLayout {
        return this.#card.actor;
    }

    #syncMuted(): void {
        this.#microphone.checked = this.#mixer.input?.muted ?? false;
    }

    destroy(): void {
        this.#disposables.dispose();
        this.#card.destroy();
    }
}
