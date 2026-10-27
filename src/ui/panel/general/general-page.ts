import Clutter from 'gi://Clutter';
import St from 'gi://St';

import type {MediaService} from '../../../services/media.js';
import type {NotificationBridge} from '../../../services/notification-bridge.js';
import type {FrodoSettings} from '../../../services/settings.js';
import {column, row} from '../../components/layout.js';
import type {Component} from '../../components/lifecycle.js';
import type {Island} from '../../island.js';
import {StatusRow} from '../../status-row.js';
import {MediaCard} from './media-card.js';
import {NativeControls} from './native-controls.js';
import {SoundCard} from './sound-card.js';

export interface GeneralDependencies {
    readonly island: Island;
    readonly settings: FrodoSettings;
    readonly bridge: NotificationBridge;
    readonly media: MediaService;
}

export class GeneralPage implements Component {
    readonly actor = new St.Widget({style_class: 'frodo-general', layout_manager: new Clutter.BinLayout(), x_expand: true});
    readonly #controls: NativeControls;
    readonly #sound: SoundCard;
    readonly #media: MediaCard;
    readonly #status: StatusRow;

    constructor({island, media}: GeneralDependencies) {
        const content = column('frodo-section');
        const overlayHost = new St.Widget({x_expand: true, y_expand: true});
        this.#controls = new NativeControls(island, overlayHost, content);
        this.#sound = new SoundCard(this.#controls);
        this.#media = new MediaCard(media);
        this.#status = new StatusRow(island);

        const right = column('frodo-section');
        right.add_child(this.#sound.actor);
        right.add_child(this.#media.actor);

        const columns = row('frodo-cols');
        columns.layout_manager.homogeneous = true;
        for (const side of [this.#controls.tiles, right]) {
            side.y_align = Clutter.ActorAlign.START;
            columns.add_child(side);
        }
        content.add_child(columns);
        content.add_child(this.#status.actor);
        this.actor.add_child(content);
        this.actor.add_child(overlayHost);
    }

    destroy(): void {
        this.#controls.destroy();
        this.#status.destroy();
        this.#sound.destroy();
        this.#media.destroy();
        this.actor.destroy();
    }
}
