import * as Main from 'resource:///org/gnome/shell/ui/main.js';

import type {FrodoSettings} from '../services/settings.js';
import type {Disposer} from '../util/disposables.js';

export class TopBarVisibility {
    readonly #settings: FrodoSettings;
    readonly #unsubscribe: Disposer;
    #hidden = false;

    constructor(settings: FrodoSettings) {
        this.#settings = settings;
        this.#unsubscribe = settings.onChanged('hide-top-bar', () => {
            this.#apply();
        });
        this.#apply();
    }

    #apply(): void {
        const hide = this.#settings.hideTopBar;
        if (hide === this.#hidden) return;
        const {panelBox} = Main.layoutManager;
        if (hide) {
            Main.layoutManager.untrackChrome(panelBox);
            panelBox.hide();
        } else {
            Main.layoutManager.trackChrome(panelBox, {affectsStruts: true, trackFullscreen: true});
            panelBox.show();
        }
        this.#hidden = hide;
    }

    destroy(): void {
        this.#unsubscribe();
        if (this.#hidden) {
            Main.layoutManager.trackChrome(Main.layoutManager.panelBox, {affectsStruts: true, trackFullscreen: true});
            Main.layoutManager.panelBox.show();
            this.#hidden = false;
        }
    }
}
