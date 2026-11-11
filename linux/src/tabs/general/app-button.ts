import Clutter from 'gi://Clutter';
import type Shell from 'gi://Shell';
import St from 'gi://St';
import {chip, contentButton} from '../../shared/ui/buttons.js';
import {column, label} from '../../shared/ui/layout.js';
import type {Component} from '../../shared/ui/lifecycle.types.js';
import {ICON_SIZE, BADGE_OFFSET_X, BADGE_OFFSET_Y} from './apps-card.const.js';

export class AppButton implements Component {
    readonly actor: St.Button;
    readonly #app: Shell.App;
    readonly #badge = chip('', 'counter');
    readonly #windowsId: number;

    constructor(app: Shell.App, onActivate: () => void) {
        this.#app = app;
        const icon = new St.Widget({
            style_class: 'frodo-app-icon',
            layout_manager: new Clutter.BinLayout(),
            x_align: Clutter.ActorAlign.CENTER,
        });
        const texture = app.create_icon_texture(ICON_SIZE);
        texture.set({x_align: Clutter.ActorAlign.CENTER, y_align: Clutter.ActorAlign.CENTER});
        icon.add_child(texture);
        this.#badge.set({
            x_align: Clutter.ActorAlign.END,
            y_align: Clutter.ActorAlign.START,
            translation_x: BADGE_OFFSET_X,
            translation_y: BADGE_OFFSET_Y,
        });
        icon.add_child(this.#badge);

        const content = column('frodo-app-content');
        content.y_align = Clutter.ActorAlign.CENTER;
        content.add_child(icon);
        const caption = label(app.get_name(), 'frodo-app-label');
        caption.x_align = Clutter.ActorAlign.CENTER;
        content.add_child(caption);
        this.actor = contentButton(
            'frodo-app',
            content,
            () => {
                onActivate();
                app.activate();
            },
            {x_expand: true},
        );
        this.#windowsId = app.connect('windows-changed', () => {
            this.#sync();
        });
        this.#sync();
    }

    #sync(): void {
        const windows = this.#app.get_n_windows();
        const name = this.#app.get_name();
        this.#badge.text = String(windows);
        this.#badge.visible = windows > 1;
        this.actor.accessible_name = windows > 1 ? `${name}, ${windows} janelas` : name;
    }

    destroy(): void {
        this.#app.disconnect(this.#windowsId);
        this.actor.destroy();
    }
}
