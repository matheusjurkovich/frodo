import Clutter from 'gi://Clutter';
import St from 'gi://St';

import type {MediaService} from '../../features/media/media-service.js';
import type {FrodoSettings} from '../../settings/frodo-settings.js';
import {column, row} from '../../shared/ui/layout.js';
import type {Component} from '../../shared/ui/lifecycle.js';
import type {IslandHandle} from '../../shared/island-handle.js';
import {AppsCard} from './apps-card.js';
import {MediaCard} from './media-card.js';
import {NativeControls} from './native-controls.js';
import {ShortcutsCard} from './shortcuts-card.js';
import {SoundCard} from './sound-card.js';

export interface GeneralDependencies {
    readonly island: IslandHandle;
    readonly settings: FrodoSettings;
    readonly media: MediaService;
    readonly scrollToTop: () => void;
}

function columns(...sides: Clutter.Actor[]): St.BoxLayout {
    const box = row('frodo-cols');
    box.layout_manager.homogeneous = true;
    for (const side of sides) box.add_child(side);
    return box;
}

export class GeneralPage implements Component {
    readonly actor = new St.Widget({style_class: 'frodo-general', layout_manager: new Clutter.BinLayout(), x_expand: true});
    readonly #controls: NativeControls;
    readonly #sound: SoundCard;
    readonly #media: MediaCard;
    readonly #shortcuts: ShortcutsCard;
    readonly #apps: AppsCard;

    constructor({island, settings, media, scrollToTop}: GeneralDependencies) {
        const content = column('frodo-section');
        const overlayHost = new St.Widget({x_expand: true, y_expand: true});
        this.#controls = new NativeControls(island, overlayHost, content, scrollToTop);
        this.#sound = new SoundCard(this.#controls);
        this.#media = new MediaCard(media);
        this.#shortcuts = new ShortcutsCard(island, settings);
        this.#apps = new AppsCard(island, settings);

        const left = column('frodo-section');
        left.add_child(this.#controls.tiles);
        left.add_child(this.#shortcuts.actor);
        const right = column('frodo-section');
        right.add_child(this.#sound.actor);
        right.add_child(this.#media.actor);
        right.add_child(this.#apps.actor);

        content.add_child(columns(left, right));
        this.actor.add_child(content);
        this.actor.add_child(overlayHost);
    }

    destroy(): void {
        this.#controls.destroy();
        this.#shortcuts.destroy();
        this.#apps.destroy();
        this.#sound.destroy();
        this.#media.destroy();
        this.actor.destroy();
    }
}
