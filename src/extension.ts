import Meta from 'gi://Meta';
import Shell from 'gi://Shell';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import {Extension} from 'resource:///org/gnome/shell/extensions/extension.js';

import {NotificationBridge} from './services/notification-bridge.js';
import {FrodoSettings} from './services/settings.js';
import {SystemState} from './services/system-state.js';
import {Island} from './ui/island.js';
import {PanelContent} from './ui/panel/panel-content.js';
import {TopBar} from './ui/top-bar.js';
import {Disposables} from './util/disposables.js';

const TOGGLE_KEYBINDING = 'toggle-shortcut';

interface Session {
    readonly settings: FrodoSettings;
    readonly state: SystemState;
    readonly island: Island;
    readonly bridge: NotificationBridge;
    readonly topBar: TopBar;
    readonly disposables: Disposables;
    content: PanelContent | null;
}

export default class FrodoExtension extends Extension {
    #session: Session | null = null;

    override enable(): void {
        const settings = new FrodoSettings(this.getSettings());
        const state = new SystemState(settings);
        const island = new Island(settings, state);
        Main.layoutManager.addTopChrome(island.panel, {affectsStruts: false});
        const bridge = new NotificationBridge();
        const disposables = new Disposables();
        const session: Session = {settings, state, island, bridge, topBar: new TopBar(island, settings), disposables, content: null};
        this.#session = session;

        disposables.add(
            bridge.on('intercepted', notification => {
                island.flash(notification);
            }),
        );
        disposables.add(
            settings.onChanged('open-layout', () => {
                island.close();
                this.#rebuildContent(session);
            }),
        );
        Main.wm.addKeybinding(
            TOGGLE_KEYBINDING,
            settings.gsettings,
            Meta.KeyBindingFlags.NONE,
            Shell.ActionMode.NORMAL | Shell.ActionMode.OVERVIEW | Shell.ActionMode.POPUP,
            () => {
                island.toggle();
            },
        );
        disposables.add(() => {
            Main.wm.removeKeybinding(TOGGLE_KEYBINDING);
        });
        this.#rebuildContent(session);
    }

    override disable(): void {
        const session = this.#session;
        if (!session) return;
        this.#session = null;
        session.island.close();
        session.topBar.destroy();
        session.disposables.dispose();
        session.island.setContent(null);
        session.content?.destroy();
        session.bridge.destroy();
        Main.layoutManager.removeChrome(session.island.panel);
        session.island.destroy();
        session.state.destroy();
    }

    #rebuildContent(session: Session): void {
        session.island.setContent(null);
        session.content?.destroy();
        session.content = new PanelContent(session.settings.openLayout, {
            island: session.island,
            state: session.state,
            bridge: session.bridge,
            openPreferences: () => {
                session.island.close();
                this.openPreferences();
            },
        });
        session.island.setContent(session.content.actor);
    }
}
