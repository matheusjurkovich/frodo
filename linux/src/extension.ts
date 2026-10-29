import Meta from 'gi://Meta';
import Shell from 'gi://Shell';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import {Extension} from 'resource:///org/gnome/shell/extensions/extension.js';

import {IslandManager} from './app/island-manager.js';
import {createServices} from './app/services.js';
import {TopBarVisibility} from './app/top-bar-visibility.js';
import type {FrodoServices} from './app/services.js';
import {Disposables} from './shared/disposables.js';
import {isScreenLocked, onSessionModeChanged} from './shared/shell-internals.js';
import {setIconsDirectory} from './shared/ui/icons.js';

const TOGGLE_KEYBINDING = 'toggle-shortcut';
const CLAUDE_KEYBINDING = 'claude-shortcut';

export default class FrodoExtension extends Extension {
    #disposables: Disposables | null = null;

    override enable(): void {
        const disposables = new Disposables();
        this.#disposables = disposables;
        try {
            this.#start(disposables);
        } catch (error) {
            disposables.dispose();
            this.#disposables = null;
            throw error;
        }
    }

    #start(disposables: Disposables): void {
        setIconsDirectory(`${this.path}/icons`);
        disposables.add(() => {
            setIconsDirectory(null);
        });

        const services = createServices(this.getSettings(), disposables);
        let ui: Disposables | null = null;
        const sync = (): void => {
            if (isScreenLocked()) {
                ui?.dispose();
                ui = null;
            } else if (!ui) {
                ui = new Disposables();
                this.#startUi(services, ui);
            }
        };
        disposables.add(onSessionModeChanged(sync));
        disposables.add(() => {
            ui?.dispose();
            ui = null;
        });
        sync();
    }

    #startUi(services: FrodoServices, disposables: Disposables): void {
        disposables.own(new TopBarVisibility(services.settings));
        const islands = disposables.own(new IslandManager(services));

        for (const [name, action] of [
            [
                TOGGLE_KEYBINDING,
                (): void => {
                    islands.toggle();
                },
            ],
            [
                CLAUDE_KEYBINDING,
                (): void => {
                    islands.show('claude');
                },
            ],
        ] as const) {
            Main.wm.addKeybinding(
                name,
                services.settings.gsettings,
                Meta.KeyBindingFlags.NONE,
                Shell.ActionMode.NORMAL | Shell.ActionMode.OVERVIEW | Shell.ActionMode.POPUP,
                action,
            );
            disposables.add(() => {
                Main.wm.removeKeybinding(name);
            });
        }
    }

    override disable(): void {
        this.#disposables?.dispose();
        this.#disposables = null;
    }
}
