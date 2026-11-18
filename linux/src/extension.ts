import Meta from 'gi://Meta';
import Shell from 'gi://Shell';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import {Extension} from 'resource:///org/gnome/shell/extensions/extension.js';
import {IslandManager} from './app/island-manager.js';
import {createServices} from './app/services.js';
import type {FrodoServices} from './app/services.types.js';
import {TopBarVisibility} from './app/top-bar-visibility.js';
import {Disposables} from './shared/disposables.js';
import {isScreenLocked, onSessionModeChanged} from './shared/shell-internals.js';
import {setIconsDirectory} from './shared/ui/icons.js';
import {shownRequest} from './pill/shown-request.js';
import {TOGGLE_KEYBINDING, CLAUDE_KEYBINDING, ALLOW_KEYBINDING, DENY_KEYBINDING} from './extension.const.js';

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

        const decideShown = (decision: 'allow' | 'deny'): void => {
            const request = shownRequest(services.feed.current);
            if (request) services.sessions.decide(request, decision);
        };

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
            [
                ALLOW_KEYBINDING,
                (): void => {
                    decideShown('allow');
                },
            ],
            [
                DENY_KEYBINDING,
                (): void => {
                    decideShown('deny');
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
