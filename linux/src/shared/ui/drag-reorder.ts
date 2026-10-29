import Clutter from 'gi://Clutter';
import St from 'gi://St';

import {Disposables} from '../disposables.js';
import type {Disposer} from '../disposables.js';
import {setSourceColor} from './progress-ring.js';

const DASH = [5, 4];
const LINE_WIDTH = 1.5;

export interface DragReorderOptions {
    readonly axis: 'x' | 'y';
    readonly items: readonly St.Widget[];
    readonly handles: readonly Clutter.Actor[];
    readonly arrange: (actors: readonly St.Widget[]) => void;
    readonly onMove: (from: number, to: number) => void;
}

interface Drag {
    readonly from: number;
    readonly item: St.Widget;
    readonly layer: St.Widget;
    readonly placeholder: St.DrawingArea;
    readonly grab: Clutter.Grab;
    readonly offsetX: number;
    readonly offsetY: number;
    index: number;
}

function placeholder(width: number, height: number): St.DrawingArea {
    const area = new St.DrawingArea({style_class: 'frodo-drop-placeholder', width, height});
    area.connect('repaint', () => {
        const cr = area.get_context();
        const node = area.get_theme_node();
        const [w, h] = area.get_surface_size();
        const scale = St.ThemeContext.get_for_stage(global.stage).scale_factor;
        const inset = LINE_WIDTH * scale;
        const radius = Math.min(node.get_border_radius(St.Corner.TOPLEFT) * scale, (h - inset * 2) / 2);
        const [x0, y0, x1, y1] = [inset, inset, w - inset, h - inset];
        cr.newSubPath();
        cr.arc(x1 - radius, y0 + radius, radius, -Math.PI / 2, 0);
        cr.arc(x1 - radius, y1 - radius, radius, 0, Math.PI / 2);
        cr.arc(x0 + radius, y1 - radius, radius, Math.PI / 2, Math.PI);
        cr.arc(x0 + radius, y0 + radius, radius, Math.PI, (3 * Math.PI) / 2);
        cr.closePath();
        setSourceColor(cr, node.get_foreground_color());
        cr.setLineWidth(LINE_WIDTH * scale);
        cr.setDash(
            DASH.map(length => length * scale),
            0,
        );
        cr.stroke();
        cr.$dispose();
    });
    return area;
}

function insertionAt(axis: 'x' | 'y', others: readonly St.Widget[], x: number, y: number): number | null {
    let best: number | null = null;
    let bestDistance = Infinity;
    others.forEach((item, index) => {
        const [left, top] = item.get_transformed_position();
        const [width, height] = item.get_transformed_size();
        if (axis === 'x' && (y < top || y > top + height)) return;
        const start = axis === 'x' ? left : top;
        const size = axis === 'x' ? width : height;
        const point = axis === 'x' ? x : y;
        const distance = Math.max(0, start - point, point - (start + size));
        if (distance >= bestDistance) return;
        bestDistance = distance;
        best = point > start + size / 2 ? index + 1 : index;
    });
    return best;
}

export function dragReorder(options: DragReorderOptions): Disposer {
    const {axis, items, handles, arrange, onMove} = options;
    const disposables = new Disposables();
    const backKey = axis === 'x' ? Clutter.KEY_Left : Clutter.KEY_Up;
    const forwardKey = axis === 'x' ? Clutter.KEY_Right : Clutter.KEY_Down;
    let drag: Drag | null = null;

    const others = (current: Drag): St.Widget[] => items.filter(item => item !== current.item);

    const place = (current: Drag, index: number): void => {
        current.index = index;
        const order = others(current);
        order.splice(index, 0, current.placeholder);
        arrange(order);
    };

    const follow = (current: Drag, x: number, y: number): void => {
        current.item.set_position(Math.round(x - current.offsetX), Math.round(y - current.offsetY));
    };

    const finish = (commit: boolean): void => {
        const current = drag;
        if (!current) return;
        drag = null;
        current.grab.dismiss();
        current.layer.remove_child(current.item);
        current.item.remove_style_class_name('frodo-dragging');
        current.item.set_size(-1, -1);
        current.placeholder.get_parent()?.replace_child(current.placeholder, current.item);
        current.layer.destroy();
        const to = commit ? current.index : current.from;
        const order = others(current);
        order.splice(to, 0, current.item);
        arrange(order);
        current.placeholder.destroy();
        if (to !== current.from) onMove(current.from, to);
    };

    const start = (from: number, item: St.Widget, event: Clutter.Event): void => {
        const [x, y] = event.get_coords();
        const [left, top] = item.get_transformed_position();
        const {width, height} = item;
        const gap = placeholder(width, height);
        const layer = new St.Widget({
            style_class: 'frodo-drag-layer',
            reactive: true,
            width: global.stage.width,
            height: global.stage.height,
        });
        global.stage.add_child(layer);
        const current: Drag = {
            from,
            item,
            layer,
            placeholder: gap,
            grab: global.stage.grab(layer),
            offsetX: x - left,
            offsetY: y - top,
            index: from,
        };
        drag = current;
        item.get_parent()?.remove_child(item);
        layer.add_child(item);
        item.set_size(width, height);
        place(current, from);
        item.add_style_class_name('frodo-dragging');
        follow(current, x, y);
        layer.connect('motion-event', (_actor, motion: Clutter.Event) => {
            if (drag !== current) return Clutter.EVENT_PROPAGATE;
            const [px, py] = motion.get_coords();
            follow(current, px, py);
            const index = insertionAt(axis, others(current), px, py);
            if (index !== null && index !== current.index) place(current, index);
            return Clutter.EVENT_STOP;
        });
        layer.connect('button-release-event', () => {
            finish(true);
            return Clutter.EVENT_STOP;
        });
        layer.connect('key-press-event', (_actor, key: Clutter.Event) => {
            if (key.get_key_symbol() === Clutter.KEY_Escape) finish(false);
            return Clutter.EVENT_STOP;
        });
    };

    handles.forEach((handle, from) => {
        const item = items[from];
        if (!item) return;
        disposables.signal(
            handle,
            handle.connect('button-press-event', (_actor, event: Clutter.Event) => {
                if (event.get_button() !== Clutter.BUTTON_PRIMARY || drag) return Clutter.EVENT_PROPAGATE;
                start(from, item, event);
                return Clutter.EVENT_STOP;
            }),
        );
        disposables.signal(
            handle,
            handle.connect('key-press-event', (_actor, event: Clutter.Event) => {
                const key = event.get_key_symbol();
                const delta = key === backKey ? -1 : key === forwardKey ? 1 : 0;
                const to = from + delta;
                if (delta === 0 || to < 0 || to >= items.length) return Clutter.EVENT_PROPAGATE;
                onMove(from, to);
                return Clutter.EVENT_STOP;
            }),
        );
    });
    disposables.add(() => {
        finish(false);
    });
    return () => {
        disposables.dispose();
    };
}
