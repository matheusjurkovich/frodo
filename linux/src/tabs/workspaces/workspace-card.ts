import Clutter from 'gi://Clutter';
import St from 'gi://St';
import type {WorkspaceInfo} from '../../features/workspaces/workspaces-service.types.js';
import {contentButton} from '../../shared/ui/buttons.js';
import {column, label, row} from '../../shared/ui/layout.js';
import {setSourceColor} from '../../shared/ui/cairo.js';
import {frodoIcon} from '../../shared/ui/icons.js';
import type {Component} from '../../shared/ui/lifecycle.types.js';
import {THUMB_WIDTH, THUMB_HEIGHT, SCREEN_X, SCREEN_Y, DASH_WIDTH, DASH_RADIUS, DASH_PATTERN} from './workspace-card.const.js';

export class WorkspaceCard implements Component {
    readonly actor: St.Button;
    readonly #number = label('', '');
    readonly #badge: St.Bin;
    readonly #title = label('', 'frodo-workspace-title');
    readonly #apps = label('', 'frodo-workspace-apps');
    readonly #thumb = new St.Widget({
        style_class: 'frodo-workspace-thumb',
        width: THUMB_WIDTH,
        height: THUMB_HEIGHT,
        x_align: Clutter.ActorAlign.CENTER,
    });
    #index = 0;
    #shown = '';
    #shownWindows = '';

    constructor(onActivate: (index: number) => void) {
        this.#number.x_align = Clutter.ActorAlign.CENTER;
        this.#badge = new St.Bin({style_class: 'frodo-workspace-badge', child: this.#number, y_align: Clutter.ActorAlign.CENTER});
        this.#title.x_expand = true;
        const heading = row('frodo-workspace-heading');
        heading.add_child(this.#badge);
        heading.add_child(this.#title);
        const content = column('frodo-workspace-content');
        content.add_child(this.#thumb);
        content.add_child(heading);
        content.add_child(this.#apps);
        this.actor = contentButton(
            'frodo-workspace',
            content,
            () => {
                onActivate(this.#index);
            },
            {x_expand: true, y_expand: true},
        );
    }

    update(info: WorkspaceInfo): void {
        this.#index = info.index;
        const key = JSON.stringify([info.index, info.title, info.apps, info.active]);
        if (key !== this.#shown) {
            this.#shown = key;
            this.#number.text = String(info.index + 1);
            this.#title.text = info.title;
            this.#apps.text = info.apps;
            this.actor.checked = info.active;
            this.actor.accessible_name = `Área ${info.index + 1}, ${info.title}: ${info.apps}`;
            if (info.active) this.#badge.add_style_class_name('frodo-workspace-badge-active');
            else this.#badge.remove_style_class_name('frodo-workspace-badge-active');
        }
        const windows = JSON.stringify(info.windows);
        if (windows === this.#shownWindows) return;
        this.#shownWindows = windows;
        this.#thumb.destroy_all_children();
        for (const {rect, slot} of info.windows) {
            const window = new St.Widget({style_class: `frodo-win frodo-win-slot-${slot}`});
            window.set_position(SCREEN_X + rect.x, SCREEN_Y + rect.y);
            window.set_size(rect.width, rect.height);
            this.#thumb.add_child(window);
        }
    }

    destroy(): void {
        this.actor.destroy();
    }
}

function dashedOutline(): St.DrawingArea {
    const area = new St.DrawingArea({style_class: 'frodo-workspace-dash', x_expand: true, y_expand: true});
    area.connect('repaint', () => {
        const cr = area.get_context();
        const [width, height] = area.get_surface_size();
        const inset = DASH_WIDTH / 2;
        const left = inset + DASH_RADIUS;
        const top = inset + DASH_RADIUS;
        const right = width - inset - DASH_RADIUS;
        const bottom = height - inset - DASH_RADIUS;
        cr.newSubPath();
        cr.arc(right, top, DASH_RADIUS, -Math.PI / 2, 0);
        cr.arc(right, bottom, DASH_RADIUS, 0, Math.PI / 2);
        cr.arc(left, bottom, DASH_RADIUS, Math.PI / 2, Math.PI);
        cr.arc(left, top, DASH_RADIUS, Math.PI, (3 * Math.PI) / 2);
        cr.closePath();
        cr.setLineWidth(DASH_WIDTH);
        cr.setDash(DASH_PATTERN, 0);
        setSourceColor(cr, area.get_theme_node().get_foreground_color());
        cr.stroke();
        cr.$dispose();
    });
    area.connect('style-changed', () => {
        area.queue_repaint();
    });
    return area;
}

export function newWorkspaceCard(onAdd: () => void): St.Button {
    const caption = label('Nova área', 'frodo-workspace-new-label');
    caption.x_align = Clutter.ActorAlign.CENTER;
    const content = column('frodo-workspace-new-content');
    content.set({x_align: Clutter.ActorAlign.CENTER, y_align: Clutter.ActorAlign.CENTER});
    content.add_child(new St.Icon({gicon: frodoIcon('plus'), style_class: 'frodo-workspace-new-icon', x_align: Clutter.ActorAlign.CENTER}));
    content.add_child(caption);

    const cell = new St.Widget({layout_manager: new Clutter.BinLayout(), x_expand: true, y_expand: true});
    cell.add_child(dashedOutline());
    cell.add_child(content);

    return contentButton('frodo-workspace-new', cell, onAdd, {x_expand: true, y_expand: true, accessible_name: 'Nova área'});
}
