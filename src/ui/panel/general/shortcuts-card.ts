import Clutter from 'gi://Clutter';
import type Gvc from 'gi://Gvc';
import Shell from 'gi://Shell';
import St from 'gi://St';
import {showScreenRecordingUI, showScreenshotUI} from 'resource:///org/gnome/shell/ui/screenshot.js';
import {getMixerControl} from 'resource:///org/gnome/shell/ui/status/volume.js';

import type {FrodoSettings} from '../../../services/settings.js';
import {powerActions} from '../../../shell/internals.js';
import {Disposables} from '../../../util/disposables.js';
import {CollapsibleCard} from '../../components/collapsible-card.js';
import {column, grid, label, packGrid} from '../../components/layout.js';
import type {Component} from '../../components/lifecycle.js';
import {frodoIcon} from '../../icons.js';
import type {FrodoIconName} from '../../icons.js';
import type {Island} from '../../island.js';

const COLUMNS = 3;
const SPACING = 6;
const TERMINALS = ['org.gnome.Ptyxis.desktop', 'org.gnome.Terminal.desktop', 'org.gnome.Console.desktop'];
const FILES = ['org.gnome.Nautilus.desktop'];

function shortcutButton(icon: FrodoIconName, text: string, onClick: () => void): St.Button {
    const content = column('frodo-shortcut-content');
    content.x_expand = true;
    content.y_align = Clutter.ActorAlign.CENTER;
    content.add_child(new St.Icon({gicon: frodoIcon(icon), style_class: 'frodo-shortcut-icon', x_align: Clutter.ActorAlign.CENTER}));
    const caption = label(text, 'frodo-shortcut-label');
    caption.x_align = Clutter.ActorAlign.CENTER;
    content.add_child(caption);
    const button = new St.Button({
        style_class: 'frodo-button frodo-button-control frodo-shortcut',
        child: content,
        can_focus: true,
        x_expand: true,
        accessible_name: text,
    });
    button.connect('clicked', onClick);
    return button;
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
    readonly #mixer = getMixerControl();
    readonly #microphone: St.Button;
    readonly #disposables = new Disposables();
    #source: Gvc.MixerStream | null = null;
    #sourceId = 0;

    constructor(island: Island, settings: FrodoSettings) {
        const closeThen = (action: () => void) => () => {
            island.close();
            action();
        };

        this.#microphone = shortcutButton('mic-off', 'Silenciar microfone', () => {
            const source = this.#source;
            source?.change_is_muted(!source.is_muted);
        });
        const buttons = [
            shortcutButton('screenshot', 'Captura de tela', closeThen(showScreenshotUI)),
            shortcutButton('record', 'Gravar tela', closeThen(showScreenRecordingUI)),
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
            shortcutButton(
                'lock',
                'Bloquear tela',
                closeThen(() => {
                    powerActions().activateLockScreen();
                }),
            ),
        ];

        const container = grid(SPACING);
        this.#disposables.add(packGrid(container, buttons, COLUMNS));
        this.#card = new CollapsibleCard('shortcuts', 'Atalhos', settings);
        this.#card.setCount(buttons.length);
        this.#card.body.add_child(container);

        this.#disposables.signal(
            this.#mixer,
            this.#mixer.connect('default-source-changed', () => {
                this.#watchSource();
            }),
        );
        this.#disposables.add(() => {
            this.#unwatchSource();
        });
        this.#watchSource();
    }

    get actor(): St.BoxLayout {
        return this.#card.actor;
    }

    #watchSource(): void {
        this.#unwatchSource();
        const source = this.#mixer.get_default_source() as Gvc.MixerStream | null;
        this.#source = source;
        if (source)
            this.#sourceId = source.connect('notify::is-muted', () => {
                this.#syncMuted();
            });
        this.#syncMuted();
    }

    #unwatchSource(): void {
        if (this.#source && this.#sourceId) this.#source.disconnect(this.#sourceId);
        this.#source = null;
        this.#sourceId = 0;
    }

    #syncMuted(): void {
        this.#microphone.checked = this.#source?.is_muted ?? false;
    }

    destroy(): void {
        this.#disposables.dispose();
        this.#card.destroy();
    }
}
