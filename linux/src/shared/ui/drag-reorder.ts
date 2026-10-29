import Clutter from 'gi://Clutter';
import type St from 'gi://St';

import {Disposables} from '../disposables.js';
import type {Disposer} from '../disposables.js';
import {dropIndex} from '../reorder.js';

const DRAGGING = 'frodo-dragging';
const BEFORE = 'frodo-drop-before';
const AFTER = 'frodo-drop-after';
const DRAG_OPACITY = 100;

export interface DragReorderOptions {
    readonly axis: 'x' | 'y';
    readonly items: readonly St.Widget[];
    readonly handles: readonly Clutter.Actor[];
    readonly onMove: (from: number, to: number) => void;
}

interface Drop {
    readonly target: number;
    readonly after: boolean;
}

function dropAt({axis, items}: DragReorderOptions, x: number, y: number): Drop | null {
    let best: Drop | null = null;
    let bestDistance = Infinity;
    items.forEach((item, target) => {
        const [left, top] = item.get_transformed_position();
        const [width, height] = item.get_transformed_size();
        const inRow = y >= top && y <= top + height;
        if (axis === 'x' && !inRow) return;
        const start = axis === 'x' ? left : top;
        const size = axis === 'x' ? width : height;
        const point = axis === 'x' ? x : y;
        const distance = Math.max(0, start - point, point - (start + size));
        if (distance >= bestDistance) return;
        bestDistance = distance;
        best = {target, after: point > start + size / 2};
    });
    return best;
}

export function dragReorder(options: DragReorderOptions): Disposer {
    const {axis, items, handles, onMove} = options;
    const disposables = new Disposables();
    const backKey = axis === 'x' ? Clutter.KEY_Left : Clutter.KEY_Up;
    const forwardKey = axis === 'x' ? Clutter.KEY_Right : Clutter.KEY_Down;
    let grab: Clutter.Grab | null = null;
    let drop: Drop | null = null;

    const mark = (next: Drop | null): void => {
        for (const item of items) {
            item.remove_style_class_name(BEFORE);
            item.remove_style_class_name(AFTER);
        }
        drop = next;
        if (next) items[next.target]?.add_style_class_name(next.after ? AFTER : BEFORE);
    };

    const finish = (from: number, commit: boolean): void => {
        grab?.dismiss();
        grab = null;
        const item = items[from];
        item?.remove_style_class_name(DRAGGING);
        if (item) item.opacity = 255;
        const last = drop;
        mark(null);
        if (!commit || !last) return;
        const to = dropIndex(from, last.target, last.after);
        if (to !== from) onMove(from, to);
    };

    handles.forEach((handle, from) => {
        const item = items[from];
        if (!item) return;
        disposables.signal(
            handle,
            handle.connect('button-press-event', (_actor, event: Clutter.Event) => {
                if (event.get_button() !== Clutter.BUTTON_PRIMARY || grab) return Clutter.EVENT_PROPAGATE;
                grab = global.stage.grab(handle);
                item.add_style_class_name(DRAGGING);
                item.opacity = DRAG_OPACITY;
                return Clutter.EVENT_STOP;
            }),
        );
        disposables.signal(
            handle,
            handle.connect('motion-event', (_actor, event: Clutter.Event) => {
                if (!grab) return Clutter.EVENT_PROPAGATE;
                const [x, y] = event.get_coords();
                const next = dropAt(options, x, y);
                if (next?.target !== drop?.target || next?.after !== drop?.after) mark(next);
                return Clutter.EVENT_STOP;
            }),
        );
        disposables.signal(
            handle,
            handle.connect('button-release-event', () => {
                if (!grab) return Clutter.EVENT_PROPAGATE;
                finish(from, true);
                return Clutter.EVENT_STOP;
            }),
        );
        disposables.signal(
            handle,
            handle.connect('key-press-event', (_actor, event: Clutter.Event) => {
                const key = event.get_key_symbol();
                if (key === Clutter.KEY_Escape && grab) {
                    finish(from, false);
                    return Clutter.EVENT_STOP;
                }
                const delta = key === backKey ? -1 : key === forwardKey ? 1 : 0;
                const to = from + delta;
                if (delta === 0 || to < 0 || to >= items.length) return Clutter.EVENT_PROPAGATE;
                onMove(from, to);
                return Clutter.EVENT_STOP;
            }),
        );
    });
    disposables.add(() => {
        grab?.dismiss();
        grab = null;
    });
    return () => {
        disposables.dispose();
    };
}
