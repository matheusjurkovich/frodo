import Meta from 'gi://Meta';
import Shell from 'gi://Shell';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import {Extension} from 'resource:///org/gnome/shell/extensions/extension.js';

import {NotificationBridge} from './services/notification-bridge.js';
import {FrodoSettings} from './services/settings.js';
import {SystemState} from './services/system-state.js';
import {IslandManager} from './ui/island-manager.js';
import {setIconsDirectory} from './ui/icons.js';
import {TopBarVisibility} from './ui/top-bar-visibility.js';
import {Disposables} from './util/disposables.js';

const TOGGLE_KEYBINDING = 'toggle-shortcut';

export default class FrodoExtension extends Extension {
    #disposables: Disposables | null = null;

    override enable(): void {
        const disposables = new Disposables();
        this.#disposables = disposables;
        setIconsDirectory(`${this.path}/icons`);
        disposables.add(() => {
            setIconsDirectory(null);
        });

        const settings = new FrodoSettings(this.getSettings());
        const state = new SystemState(settings);
        disposables.add(() => {
            state.destroy();
        });
        const bridge = new NotificationBridge();
        disposables.add(() => {
            bridge.destroy();
        });
        const topBar = new TopBarVisibility(settings);
        disposables.add(() => {
            topBar.destroy();
        });

        const islands = new IslandManager({
            settings,
            state,
            bridge,
            openPreferences: () => {
                islands.closeAll();
                this.openPreferences();
            },
        });
        disposables.add(() => {
            islands.destroy();
        });
        disposables.add(
            bridge.on('intercepted', notification => {
                islands.flash(notification);
            }),
        );

        Main.wm.addKeybinding(
            TOGGLE_KEYBINDING,
            settings.gsettings,
            Meta.KeyBindingFlags.NONE,
            Shell.ActionMode.NORMAL | Shell.ActionMode.OVERVIEW | Shell.ActionMode.POPUP,
            () => {
                islands.toggle();
            },
        );
        disposables.add(() => {
            Main.wm.removeKeybinding(TOGGLE_KEYBINDING);
        });
    }

    override disable(): void {
        this.#disposables?.dispose();
        this.#disposables = null;
    }
}
