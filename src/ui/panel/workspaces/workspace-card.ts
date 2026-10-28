import Clutter from 'gi://Clutter';
import St from 'gi://St';

import type {WorkspaceInfo} from '../../../services/workspaces.js';
import {column, label, row} from '../../components/layout.js';
import {setSourceColor} from '../../components/progress-ring.js';
import {frodoIcon} from '../../icons.js';

const THUMB_WIDTH = 145;
const THUMB_HEIGHT = 91;
export const SCREEN_WIDTH = 129;
export const SCREEN_HEIGHT = 81;
const SCREEN_X = (THUMB_WIDTH - SCREEN_WIDTH) / 2;
const SCREEN_Y = (THUMB_HEIGHT - SCREEN_HEIGHT) / 2;

const DASH_RADIUS = 18;
const DASH_WIDTH = 1.5;
const DASH_PATTERN = [4, 4];

function thumbnail(windows: WorkspaceInfo['windows']): St.Widget {
    const thumb = new St.Widget({
        style_class: 'frodo-workspace-thumb',
        width: THUMB_WIDTH,
        height: THUMB_HEIGHT,
        x_align: Clutter.ActorAlign.CENTER,
    });
    for (const {rect, slot} of windows) {
        const window = new St.Widget({style_class: `frodo-win frodo-win-slot-${slot}`});
        window.set_position(SCREEN_X + rect.x, SCREEN_Y + rect.y);
        window.set_size(rect.width, rect.height);
        thumb.add_child(window);
    }
    return thumb;
}

export function workspaceCard(info: WorkspaceInfo, onActivate: () => void): St.Button {
    const number = label(String(info.index + 1), '');
    number.x_align = Clutter.ActorAlign.CENTER;
    const badge = new St.Bin({
        style_class: `frodo-workspace-badge${info.active ? ' frodo-workspace-badge-active' : ''}`,
        child: number,
        y_align: Clutter.ActorAlign.CENTER,
    });
    const title = label(info.title, 'frodo-workspace-title');
    title.x_expand = true;
    const heading = row('frodo-workspace-heading');
    heading.add_child(badge);
    heading.add_child(title);

    const content = column('frodo-workspace-content');
    content.add_child(thumbnail(info.windows));
    content.add_child(heading);
    content.add_child(label(info.apps, 'frodo-workspace-apps'));

    const button = new St.Button({
        style_class: 'frodo-workspace',
        child: content,
        can_focus: true,
        x_expand: true,
        y_expand: true,
        checked: info.active,
        accessible_name: `Área ${info.index + 1}, ${info.title}: ${info.apps}`,
    });
    button.connect('clicked', onActivate);
    return button;
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

    const button = new St.Button({
        style_class: 'frodo-workspace-new',
        child: cell,
        can_focus: true,
        x_expand: true,
        y_expand: true,
        accessible_name: 'Nova área',
    });
    button.connect('clicked', onAdd);
    return button;
}
