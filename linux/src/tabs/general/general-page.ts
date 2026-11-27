import Clutter from 'gi://Clutter';
import St from 'gi://St';
import {column, row} from '../../shared/ui/layout.js';
import type {Component} from '../../shared/ui/lifecycle.types.js';
import {AppsCard} from './apps-card.js';
import {MediaCard} from './media-card.js';
import {NativeControls} from './native-controls.js';
import {ShortcutsCard} from './shortcuts-card.js';
import {SoundCard} from './sound-card.js';
import type {TabTarget, TargetablePage} from '../../shared/tab-target.types.js';
import type {GeneralDependencies} from './general-page.types.js';

function columns(...sides: Clutter.Actor[]): St.BoxLayout {
    const box = row('frodo-cols');
    box.layout_manager.homogeneous = true;
    for (const side of sides) box.add_child(side);
    return box;
}

export class GeneralPage implements Component, TargetablePage {
    readonly actor = new St.Widget({style_class: 'frodo-general', layout_manager: new Clutter.BinLayout(), x_expand: true});
    readonly #controls: NativeControls;
    readonly #sound: SoundCard;
    readonly #media: MediaCard;
    readonly #shortcuts: ShortcutsCard;
    readonly #apps: AppsCard;

    constructor({island, settings, media, mixer, wifi, scrollToTop}: GeneralDependencies) {
        const content = column('frodo-section');
        const overlayHost = new St.Widget({x_expand: true, y_expand: true});
        this.#controls = new NativeControls(island, wifi, this.actor, overlayHost, content, scrollToTop);
        this.#sound = new SoundCard(this.#controls, mixer);
        this.#media = new MediaCard(media);
        this.#shortcuts = new ShortcutsCard(island, settings, mixer);
        this.#apps = new AppsCard(island, settings);

        content.add_child(columns(this.#controls.tiles, this.#sound.actor));
        for (const child of [this.#media.actor, this.#shortcuts.actor, this.#apps.actor]) content.add_child(child);
        this.actor.add_child(content);
        this.actor.add_child(overlayHost);
    }

    openPanel(target: TabTarget): void {
        this.#controls.openMenu(target);
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
