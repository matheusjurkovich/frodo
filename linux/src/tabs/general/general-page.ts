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
        this.#controls = new NativeControls(island, this.actor, overlayHost, content, scrollToTop);
        this.#sound = new SoundCard(this.#controls);
        this.#media = new MediaCard(media);
        this.#shortcuts = new ShortcutsCard(island, settings);
        this.#apps = new AppsCard(island, settings);

        this.#shortcuts.actor.y_align = Clutter.ActorAlign.START;
        this.#apps.actor.y_align = Clutter.ActorAlign.START;
        const stack = column('frodo-section');
        stack.y_align = Clutter.ActorAlign.START;
        stack.add_child(this.#shortcuts.actor);
        const bottom = columns(stack, this.#media.actor);
        const placeApps = (): void => {
            const target = this.#media.actor.visible ? stack : bottom;
            if (this.#apps.actor.get_parent() === target) return;
            this.#apps.actor.get_parent()?.remove_child(this.#apps.actor);
            target.add_child(this.#apps.actor);
        };
        this.#media.actor.connect('notify::visible', placeApps);
        placeApps();

        content.add_child(columns(this.#controls.tiles, this.#sound.actor));
        content.add_child(bottom);
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
